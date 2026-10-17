import { buildApp } from './server.js';
import { createPool } from './db.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const pool = config.databaseUrl ? createPool(config.databaseUrl) : undefined;
const app = pool ? buildApp({ config, pool }) : buildApp({ config });

if (config.nodeEnv !== 'test') {
  await app.listen({ host: '0.0.0.0', port: config.port });
}

export { app, buildApp };
