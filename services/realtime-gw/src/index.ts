import { createServer } from 'node:http';
import { health } from '@licitecomigo/shared';
import { WebSocketServer, type WebSocket } from 'ws';

export function getHealth() {
  return health('realtime-gw');
}

export function getReady() {
  return { ...getHealth(), ready: true, websocket: true };
}

function isAllowedOrigin(origin: string | undefined): boolean {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.length === 0 || (origin !== undefined && allowed.includes(origin));
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.REALTIME_PORT ?? 3003);
  const server = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(getHealth()));
      return;
    }
    if (request.url === '/ready') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(getReady()));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const websocket = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws' || !isAllowedOrigin(request.headers.origin)) {
      socket.destroy();
      return;
    }
    websocket.handleUpgrade(request, socket, head, (client) => {
      websocket.emit('connection', client, request);
    });
  });

  websocket.on('connection', (client: WebSocket) => {
    client.send(JSON.stringify({ type: 'connected', service: 'realtime-gw' }));
    client.on('message', (message) => {
      if (client.readyState === client.OPEN) client.send(message.toString());
    });
  });

  server.listen(port, '0.0.0.0');
}
