import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import { once } from 'node:events';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { startResilientServer } from './resilient-server.mjs';

async function listener() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}
async function waitFor(check) {
  const deadline = Date.now() + 15000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Recovery timed out');
    await delay(25);
  }
}
test('port conflict, crash and hang recover behind the same URL; requests remain intact', { timeout: 45000 }, async (t) => {
  const reservations = await Promise.all(Array.from({ length: 5 }, listener));
  const ports = reservations.map((server) => server.address().port);
  let foreignConnections = 0;
  reservations[0].on('connection', (socket) => { foreignConnections++; socket.destroy(); });
  for (const reservation of reservations.slice(1)) await new Promise((resolve) => reservation.close(resolve));
  t.after(() => reservations[0].close());
  const server = await startResilientServer({
    port: 0, host: '127.0.0.1', ports,
    command: [process.execPath, fileURLToPath(new URL('./fixtures/recovery-app.mjs', import.meta.url))],
    healthInterval: 100, healthTimeout: 100, startupTimeout: 2000, retryDelay: 10, log() {},
  });
  t.after(() => server.close());
  server.done.catch(() => {});
  const url = `http://127.0.0.1:${server.gateway.address().port}`;
  const unavailable = await fetch(url);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('retry-after'), '5');
  await waitFor(() => server.internalPort !== null);
  assert.equal(server.internalPort, ports[1]);
  assert.equal(foreignConnections, 0, 'never trust an unrelated service on an occupied port');
  const response = await new Promise((resolve, reject) => {
    const outgoing = request(`${url}/save?item=one`, {
      method: 'POST',
      headers: { Host: 'manage.safawala.com', Cookie: 'crm_session=existing', Origin: 'https://manage.safawala.com', 'X-Forwarded-Proto': 'https', 'Next-Action': 'action-id' },
    }, (incoming) => {
      let body = '';
      incoming.on('data', (chunk) => { body += chunk; });
      incoming.on('end', () => resolve({ headers: incoming.headers, body }));
      incoming.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end('unchanged payload');
  });
  assert.equal(response.headers['set-cookie'].length, 2);
  const echo = JSON.parse(response.body);
  assert.equal(echo.method, 'POST');
  assert.equal(echo.url, '/save?item=one');
  assert.equal(echo.body, 'unchanged payload');
  assert.equal(echo.headers.host, 'manage.safawala.com');
  assert.equal(echo.headers.cookie, 'crm_session=existing');
  assert.equal(echo.headers.origin, 'https://manage.safawala.com');
  assert.equal(echo.headers['x-forwarded-proto'], 'https');
  assert.equal(echo.headers['next-action'], 'action-id');
  const largeBody = 'upload-content-'.repeat(250000);
  const largeResponse = await fetch(`${url}/upload`, { method: 'POST', body: largeBody });
  assert.equal((await largeResponse.json()).body, largeBody, 'large uploads and responses must not be truncated');

  const socket = connect({ host: '127.0.0.1', port: server.gateway.address().port });
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  socket.write('GET /stream HTTP/1.1\r\nHost: manage.safawala.com\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n');
  const [upgrade] = await once(socket, 'data');
  assert.match(upgrade.toString(), /101 Switching Protocols/);
  socket.write('stream payload');
  const [stream] = await once(socket, 'data');
  assert.equal(stream.toString(), 'stream payload');
  socket.destroy();

  await fetch(`${url}/crash`);
  await waitFor(() => server.internalPort === ports[2]);
  assert.equal((await (await fetch(url)).json()).port, ports[2]);
  await fetch(`${url}/hang`);
  await waitFor(() => server.internalPort === ports[3]);
  assert.equal((await (await fetch(url)).json()).port, ports[3]);
  await server.close();
  assert.equal(server.gateway.listening, false);
});

test('public port conflict fails visibly instead of changing the public URL', async (t) => {
  const occupied = await listener();
  t.after(() => occupied.close());
  await assert.rejects(startResilientServer({ port: occupied.address().port, host: '127.0.0.1', log() {} }), { code: 'EADDRINUSE' });
});

test('repeated startup failures close the public listener for Railway recovery', async () => {
  const server = await startResilientServer({
    port: 0, host: '127.0.0.1', ports: [18020, 18021],
    command: [process.execPath, '--eval', 'process.exit(1)', '--'],
    retryDelay: 10, log() {},
  });
  await assert.rejects(server.done, /Repeated app failures/);
  assert.equal(server.gateway.listening, false);
});
