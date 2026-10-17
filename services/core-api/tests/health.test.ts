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
});
