import { describe, expect, it } from 'vitest';
import { getHealth } from '../src/index.js';

describe('realtime-gw', () => {
  it('reports its service health', () => {
    expect(getHealth()).toMatchObject({ service: 'realtime-gw', status: 'ok' });
  });
});
