import { nicheDefinitions, normalizeNicheCodes } from '@licitecomigo/shared';
import type { PoolClient } from 'pg';
import { isNicheRestricted, type UserRole } from './auth.js';

function rawNicheCodes(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

export function validatedNicheCodes(value: unknown): string[] {
  const raw = rawNicheCodes(value);
  const normalized = normalizeNicheCodes(raw);
  if (raw.length !== normalized.length || new Set(raw).size !== raw.length) {
    throw new Error('invalid_niche');
  }
  return normalized;
}

export function nicheTerms(codes: readonly string[]): string[] {
  return [...new Set(nicheDefinitions(codes).flatMap((niche) => niche.terms))];
}

export async function readUserNiches(
  client: PoolClient,
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const result = await client.query<{ nicho_preferencias: unknown }>(
    'SELECT nicho_preferencias FROM usuarios WHERE tenant_id = $1 AND id = $2',
    [tenantId, userId],
  );
  const value = result.rows[0]?.nicho_preferencias;
  return Array.isArray(value) ? normalizeNicheCodes(value.map(String)) : [];
}

export function applyNicheScope(
  filters: Record<string, unknown>,
  preferences: readonly string[],
  role: UserRole,
): Record<string, unknown> {
  const explicit = filters.nicho === undefined ? [] : validatedNicheCodes(filters.nicho);
  const restricted = isNicheRestricted(role);
  if (restricted && preferences.length === 0) throw new Error('niche_preferences_required');
  if (restricted && explicit.some((code) => !preferences.includes(code))) {
    throw new Error('niche_not_allowed');
  }
  const selected = explicit.length > 0 ? explicit : [...preferences];
  return selected.length
    ? { ...filters, nicho: selected, nicho_termos: nicheTerms(selected) }
    : filters;
}
