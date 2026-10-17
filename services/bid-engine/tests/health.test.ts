import { describe, expect, it } from 'vitest';
import { getHealth, getReady } from '../src/index.js';

describe('bid-engine', () => {
  it('exposes health and ready payloads', () => {
    expect(getHealth()).toMatchObject({ service: 'bid-engine', status: 'ok' });
    expect(getReady()).toMatchObject({ service: 'bid-engine', ready: true });
  });
});
