import { z } from 'zod';
import type { PoolClient } from 'pg';

const booleanish = z.preprocess((value) => {
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return value;
}, z.boolean());

export const savedSearchSchema = z.object({
  nome: z.string().trim().min(1).max(160),
  empresa_id: z.string().uuid().optional(),
  filtros: z.record(z.unknown()).default({}),
  ativa: booleanish.default(true),
});

export const savedSearchPatchSchema = savedSearchSchema.partial();
export type SavedSearchInput = z.infer<typeof savedSearchSchema>;

export const alertQuerySchema = z.object({
  apenas_nao_lidas: booleanish.default(false),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const alertReadSchema = z.object({ lida: z.boolean().default(true) });

/** Keep audit/notification text bounded and free of control characters. */
export function sanitizeMessage(value: string, maxLength = 500): string {
  return value
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function alertDeduplicationKey(
  ruleId: string,
  editalId: string,
  versionId: string | null,
): string {
  return `${ruleId}:${editalId}:${versionId ?? 'current'}`;
}

/**
 * Claim one delivery atomically. The unique key in migration 0013 is the
 * database backstop for concurrent ingest workers.
 */
export async function claimAlertDelivery(
  client: PoolClient,
  input: {
    tenantId: string;
    ruleId: string;
    searchId: string;
    userId: string;
    editalId: string;
    editalVersionId: string | null;
    title: string;
  },
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO alerta_entregas
       (tenant_id, alerta_regra_id, usuario_id, edital_id, canal, status, idempotency_key, payload, entregue_em)
     VALUES ($1, $2, $3, $4, 'in_app', 'pendente', $5, $6::jsonb, now())
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      input.tenantId,
      input.ruleId,
      input.userId,
      input.editalId,
      alertDeduplicationKey(input.ruleId, input.editalId, input.editalVersionId),
      JSON.stringify({
        busca_id: input.searchId,
        usuario_id: input.userId,
        versao_id: input.editalVersionId,
        titulo: sanitizeMessage(input.title, 160),
        mensagem: sanitizeMessage(`Novo resultado para a busca ${input.searchId}`, 500),
      }),
    ],
  );
  return result.rowCount === 1;
}
