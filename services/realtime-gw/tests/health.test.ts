import { describe, expect, it } from 'vitest';
import { getHealth, getReady } from '../src/index.js';

describe('realtime-gw', () => {
  it('exposes health and websocket readiness payloads', () => {
    expect(getHealth()).toMatchObject({ service: 'realtime-gw', status: 'ok' });
    expect(getReady()).toMatchObject({ service: 'realtime-gw', ready: true, websocket: true });
  });
});
