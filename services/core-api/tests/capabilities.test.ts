import { describe, expect, it } from 'vitest';
import { hasMentorCapability, isActiveMentorGrant } from '../src/capabilities.js';

describe('mentor capabilities', () => {
  const now = new Date('2026-01-10T12:00:00.000Z');

  it('denies an empty scope even when the grant is active', () => {
    expect(
      hasMentorCapability(
        { escopo: {}, inicio_em: '2026-01-01T00:00:00.000Z', fim_em: '2026-02-01T00:00:00.000Z' },
        'opportunity.read',
        now,
      ),
    ).toBe(false);
  });

  it('honors capability, validity window and revocation', () => {
    const grant = {
      escopo: { capabilities: ['opportunity.read'] },
      inicio_em: '2026-01-01T00:00:00.000Z',
      fim_em: '2026-02-01T00:00:00.000Z',
    };
    expect(isActiveMentorGrant(grant, now)).toBe(true);
    expect(hasMentorCapability(grant, 'opportunity.read', now)).toBe(true);
    expect(hasMentorCapability(grant, 'document.read', now)).toBe(false);
    expect(
      hasMentorCapability(
        { ...grant, revogada_em: '2026-01-09T00:00:00.000Z' },
        'opportunity.read',
        now,
      ),
    ).toBe(false);
  });
});
