import type { PoolClient } from 'pg';

export type MentorGrant = {
  escopo: unknown;
  inicio_em?: string | Date | null;
  fim_em?: string | Date | null;
  revogada_em?: string | Date | null;
};

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function scopeValues(scope: unknown): Set<string> {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return new Set();
  const record = scope as Record<string, unknown>;
  const values = new Set<string>();
  for (const key of ['capabilities', 'capacidades', 'permissions', 'permissoes']) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string') values.add(item);
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (value === true) values.add(key);
  }
  return values;
}

/** A concession is active only inside its time window and while it is not revoked. */
export function isActiveMentorGrant(grant: MentorGrant, now = new Date()): boolean {
  const start = asDate(grant.inicio_em);
  const end = asDate(grant.fim_em);
  const revoked = asDate(grant.revogada_em);
  return !revoked && (!start || start <= now) && (!end || end > now);
}

/** Empty scopes are denied for capability-gated operations. */
export function hasMentorCapability(
  grant: MentorGrant | null | undefined,
  capability: string,
  now = new Date(),
): boolean {
  if (!grant || !isActiveMentorGrant(grant, now)) return false;
  const values = scopeValues(grant.escopo);
  return values.has('*') || values.has(capability);
}

/** Assert a capability using the database as source of truth, never the client. */
export async function assertMentorCapability(
  client: PoolClient,
  tenantId: string,
  mentorId: string,
  empresaId: string,
  capability: string,
): Promise<void> {
  const result = await client.query<MentorGrant>(
    `SELECT escopo, inicio_em, fim_em, revogada_em
       FROM concessoes_mentor
      WHERE tenant_id = $1 AND mentor_id = $2 AND empresa_id = $3
        AND revogada_em IS NULL
        AND (inicio_em IS NULL OR inicio_em <= now())
        AND (fim_em IS NULL OR fim_em > now())
      LIMIT 1`,
    [tenantId, mentorId, empresaId],
  );
  if (!hasMentorCapability(result.rows[0], capability)) {
    throw new Error('mentor_capability_forbidden');
  }
}
