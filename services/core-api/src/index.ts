import { buildApp } from './server.js';
import { createPool } from './db.js';
import { loadConfig } from './config.js';
import { startAlertEngine } from './alert-engine.js';
import { startPncpSync } from './pncp-sync.js';
import { sendEmail } from './email.js';
import { startCleanup } from './limpeza.js';

const config = loadConfig();
const pool = config.databaseUrl ? createPool(config.databaseUrl) : undefined;
const app = pool ? buildApp({ config, pool }) : buildApp({ config });

if (config.nodeEnv !== 'test') {
  await app.listen({ host: '0.0.0.0', port: config.port });
  let alertas: { runNow: () => void } | undefined;
  if (pool && config.alertEngineEnabled) {
    alertas = startAlertEngine(
      {
        pool,
        config,
        emailEnabled: config.emailProvider === 'smtp',
        sendMail: (message) => sendEmail(config, message),
      },
      config.alertEngineIntervalSeconds,
      (message) => app.log.info(message),
    );
  }
  if (pool) startCleanup({ pool, config }, (message) => app.log.info(message));
  if (pool && config.pncpSyncEnabled) {
    startPncpSync({ pool, config, onRound: () => alertas?.runNow() }, (message) =>
      app.log.info(message),
    );
  }
}

export { app, buildApp };
