import { describe, expect, it } from 'vitest';
import { assertStrongPassword, hashPassword, verifyPassword } from '../src/password.js';

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

  it('aceita senha de 8 caracteres ou mais, sem exigir símbolos, e sem limite prático', () => {
    expect(() => assertStrongPassword('abcdefgh')).not.toThrow();
    expect(() => assertStrongPassword('12345678')).not.toThrow();
    expect(() => assertStrongPassword('a'.repeat(300))).not.toThrow();
  });

  it('recusa senha com menos de 8 caracteres', () => {
    expect(() => assertStrongPassword('Ab1!xyz')).toThrow('senha_forte_obrigatoria');
    expect(() => assertStrongPassword('')).toThrow('senha_forte_obrigatoria');
  });
});
