import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server.js';

describe('core-api', () => {
  it('exposes a local health endpoint', async () => {
    const app = buildApp({ jwtSecret: 'test-secret', logger: false });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ service: 'core-api', status: 'ok' });
    await app.close();
  });

  it('keeps login public while reporting missing database', async () => {
    const app = buildApp({ jwtSecret: 'test-secret', logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        tenant_id: '00000000-0000-0000-0000-000000000001',
        email: 'admin@local.test',
        password: 'local-dev-password',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'database_unavailable' });
    await app.close();
  });
});
