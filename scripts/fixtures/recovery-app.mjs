// Test process only; never started by the production command.
import { createServer } from 'node:http';
const port = Number(process.argv[process.argv.indexOf('-p') + 1]);
let hung = false;
const server = createServer((request, response) => {
  if (hung) return;
  if (request.url === '/login') return response.end('Ready');
  if (request.url === '/crash') {
    response.end('Stopping');
    setTimeout(() => process.exit(1), 20);
    return;
  }
  if (request.url === '/hang') { hung = true; return response.end('Hanging'); }
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    response.setHeader('Set-Cookie', ['crm_session=test; HttpOnly; Secure; Path=/', 'other=test; Path=/']);
    response.end(JSON.stringify({ port, method: request.method, url: request.url, headers: request.headers, body }));
  });
});
server.on('upgrade', (_request, socket) => {
  socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n');
  socket.on('data', (chunk) => socket.write(chunk));
});
server.listen(port, '127.0.0.1', () => console.log('Ready in 1ms'));
