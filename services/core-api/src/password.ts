import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { isAcceptablePassword } from '@licitecomigo/shared';

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

/** Regra de senha: no mínimo 8 caracteres, sem exigência de símbolos. */
export function assertStrongPassword(password: string): void {
  if (!isAcceptablePassword(password)) {
    throw new Error('senha_forte_obrigatoria');
  }
}

export function hashPassword(password: string, salt = randomBytes(16)): string {
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
  });
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export function verifyPassword(password: string, encoded: string | null): boolean {
  if (!encoded) return false;
  const [algorithm, cost, blockSize, parallelization, saltText, hashText] = encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    cost !== String(COST) ||
    blockSize !== String(BLOCK_SIZE) ||
    parallelization !== String(PARALLELIZATION) ||
    !saltText ||
    !hashText
  ) {
    return false;
  }
  try {
    const expected = Buffer.from(hashText, 'base64url');
    const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
