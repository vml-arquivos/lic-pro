import { createServer } from 'node:http';
import { health } from '@licitecomigo/shared';

export function getHealth() {
  return health('bid-engine');
}

export function getReady() {
  return { ...getHealth(), ready: true };
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.BID_ENGINE_PORT ?? 3002);
  createServer((request, response) => {
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
  }).listen(port, '0.0.0.0');
}
