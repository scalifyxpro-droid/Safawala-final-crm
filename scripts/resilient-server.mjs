import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { get } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

function healthy(port, timeout) {
  return new Promise((resolve) => {
    const request = get({ host: '127.0.0.1', port, path: '/login', agent: false }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    const timer = setTimeout(() => request.destroy(new Error('Health check timed out')), timeout);
    request.on('close', () => clearTimeout(timer));
    request.on('error', () => resolve(false));
  });
}

// Reserve the public Railway port for a transparent TCP gateway. Only the
// private Next.js listener changes ports, so URLs, cookies, uploads, streaming
// and WebSocket headers pass through untouched. Never replay a failed request.
export async function startResilientServer({
  port = Number(process.env.PORT || 8080),
  host = '0.0.0.0',
  ports = Array.from({ length: 10 }, (_, i) => 8000 + i),
  command = [process.execPath, path.join(root, 'node_modules/next/dist/bin/next'), 'start'],
  healthInterval = 15000,
  healthTimeout = 10000,
  startupTimeout = 180000,
  retryDelay = 1000,
  log = console.log,
} = {}) {
  const candidates = ports.filter((value) => value !== port);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || !candidates.length ||
      candidates.some((value) => !Number.isInteger(value) || value < 1 || value > 65535)) {
    throw new Error('Invalid public or internal server ports.');
  }
  let target = null;
  let child = null;
  let stopping = false;
  const abort = new AbortController();
  const sockets = new Set();
  const sleep = (ms) => delay(ms, undefined, { signal: abort.signal }).catch(() => {});
  const track = (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    return socket;
  };
  const gateway = createServer((client) => {
    track(client);
    client.on('error', () => client.destroy());
    if (target === null) {
      client.end('HTTP/1.1 503 Service Unavailable\r\nRetry-After: 5\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    const upstream = track(connect({ host: '127.0.0.1', port: target }));
    upstream.on('error', () => { upstream.destroy(); client.destroy(); });
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.end());
    client.pipe(upstream).pipe(client);
  });
  gateway.listen(port, host);
  await once(gateway, 'listening');
  log(`[recovery] Public listener ready on port ${gateway.address().port}.`);

  async function stopChild() {
    const current = child;
    if (!current?.pid || current.exitCode !== null || current.signalCode !== null) return;
    const exited = once(current, 'exit');
    current.kill('SIGTERM');
    const timer = setTimeout(() => current.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  }

  const done = (async () => {
    let failures = 0;
    let index = 0;
    try {
      while (!stopping) {
        const internalPort = candidates[index++ % candidates.length];
        let exited = false;
        let announcedReady = false;
        let output = '';
        log(`[recovery] Starting app on internal port ${internalPort}.`);
        child = spawn(command[0], [...command.slice(1), '-p', String(internalPort), '-H', '127.0.0.1'], {
          cwd: root,
          env: { ...process.env, PORT: String(internalPort) },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        const childEnded = new Promise((resolve) => {
          const ended = () => { exited = true; target = null; resolve(); };
          child.once('exit', ended);
          child.once('error', ended);
        });
        child.stdout.on('data', (chunk) => {
          output = (output + chunk.toString()).slice(-4096);
          // Next 16 announces readiness after binding. An unrelated process
          // occupying this port must never pass our readiness check.
          if (/Ready in\s/.test(output)) announcedReady = true;
          log(chunk.toString().trimEnd());
        });
        child.stderr.on('data', (chunk) => log(chunk.toString().trimEnd()));
        const started = Date.now();
        let misses = 0;
        let ready = false;
        while (!stopping && !exited) {
          const ok = announcedReady && await healthy(internalPort, healthTimeout);
          if (stopping || exited) break;
          if (ok) {
            misses = 0;
            if (!ready) {
              ready = true;
              target = internalPort;
              log(`[recovery] App ready on ${internalPort}; public address unchanged.`);
            }
            // Reset repeated-failure protection only after a stable minute.
            if (Date.now() - started > 60000) failures = 0;
          } else if (ready ? ++misses >= 3 : Date.now() - started >= startupTimeout) {
            log(`[recovery] App on ${internalPort} stopped responding; switching internal port.`);
            break;
          }
          await Promise.race([sleep(ready ? healthInterval : 1000), childEnded]);
        }
        target = null;
        await stopChild();
        if (stopping) break;
        if (++failures >= candidates.length) {
          throw new Error('Repeated app failures; exiting for Railway container recovery.');
        }
        await sleep(Math.min(retryDelay * failures, 15000));
      }
    } finally {
      target = null;
      for (const socket of sockets) socket.destroy();
      gateway.close();
      await stopChild();
    }
  })();
  const close = async () => {
    stopping = true;
    target = null;
    abort.abort();
    await stopChild();
    await done;
  };
  gateway.on('error', () => { void close().catch(() => {}); });
  return { gateway, done, close, get internalPort() { return target; } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = await startResilientServer();
    for (const signal of ['SIGTERM', 'SIGINT']) {
      process.once(signal, () => { void server.close().catch(() => {}); });
    }
    await server.done;
  } catch (error) {
    console.error('[recovery]', error.message);
    process.exitCode = 1;
  }
}
