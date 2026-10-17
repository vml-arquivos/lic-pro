import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password.js';

describe('passwords', () => {
  it('verifies a scrypt hash without storing plaintext', () => {
    const encoded = hashPassword('local-dev-password', Buffer.from('fixed-local-salt'));
    expect(encoded).toContain('scrypt$16384$8$1$');
    expect(verifyPassword('local-dev-password', encoded)).toBe(true);
    expect(verifyPassword('wrong-password', encoded)).toBe(false);
  });

  it('rejects malformed hashes', () => {
    expect(verifyPassword('anything', 'dev-only-no-login')).toBe(false);
  });
});
