import { describe, expect, it } from 'vitest';
import { getHealth } from '../src/index.js';

describe('bid-engine', () => {
  it('reports its service health', () => {
    expect(getHealth()).toMatchObject({ service: 'bid-engine', status: 'ok' });
  });
});
