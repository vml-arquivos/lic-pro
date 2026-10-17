import Fastify, { type FastifyInstance } from 'fastify';
import { health } from '@licitecomigo/shared';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get('/health', async () => health('core-api'));

  return app;
}

const app = buildApp();
const port = Number(process.env.CORE_API_PORT ?? 3001);

if (process.env.NODE_ENV !== 'test') {
  await app.listen({ host: '0.0.0.0', port });
}
