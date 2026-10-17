import { createClient } from 'redis';
import type { Pool } from 'pg';

export type ReadinessResult = {
  ready: boolean;
  database: boolean;
  redis: boolean;
};

export async function checkReadiness(
  pool: Pool | undefined,
  redisUrl?: string,
): Promise<ReadinessResult> {
  let database = false;
  let redis = false;

  if (pool) {
    try {
      await pool.query('SELECT 1');
      database = true;
    } catch {
      database = false;
    }
  }

  if (redisUrl) {
    const client = createClient({ url: redisUrl });
    try {
      await client.connect();
      redis = (await client.ping()) === 'PONG';
    } catch {
      redis = false;
    } finally {
      if (client.isOpen) await client.quit();
    }
  }

  return { ready: database && redis, database, redis };
}
