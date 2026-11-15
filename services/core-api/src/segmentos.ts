import {
  NICHE_CATALOG,
  SEGMENT_CATALOG,
  normalizeNicheCodes,
  segmentsOfNiches,
  termsExpression,
  type SegmentDefinition,
} from '@licitecomigo/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { isNicheRestricted } from './auth.js';
import { withTenant } from './db.js';
import { readUserNiches } from './niche-scope.js';
import { authContext, sendDatabaseUnavailable } from './request-context.js';

type Deps = { pool: Pool | undefined };

export type SegmentoItemOut = { label: string; abertas: number | null };
export type SegmentoOut = {
  code: string;
  label: string;
  abertas: number | null;
  itens: SegmentoItemOut[];
};
export type NichoSegmentosOut = { nicho: string; label: string; segmentos: SegmentoOut[] };

const TTL_MS = 15 * 60 * 1000;
const MAX_CACHE = 200;
const cache = new Map<string, { at: number; value: NichoSegmentosOut[] }>();

function groupByNiche(
  segments: readonly SegmentDefinition[],
  counts: Map<string, number> | null,
): NichoSegmentosOut[] {
  const out: NichoSegmentosOut[] = [];
  for (const niche of NICHE_CATALOG) {
    const own = segments.filter((segment) => segment.niche === niche.code);
    if (!own.length) continue;
    out.push({
      nicho: niche.code,
      label: niche.label,
      segmentos: own.map((segment) => ({
        code: segment.code,
        label: segment.label,
        abertas: counts?.get(`s:${segment.code}`) ?? null,
        itens: segment.items.map((item) => ({
          label: item.label,
          abertas: counts?.get(`i:${segment.code}:${item.label}`) ?? null,
        })),
      })),
    });
  }
  return out;
}

/** Quantas licitações abertas combinam com cada segmento e item (uma única leitura da tabela). */
async function countOpen(
  pool: Pool,
  request: Parameters<typeof authContext>[0],
  segments: readonly SegmentDefinition[],
): Promise<Map<string, number>> {
  const keys: string[] = [];
  const values: string[] = [];
  for (const segment of segments) {
    keys.push(`s:${segment.code}`);
    values.push(termsExpression(segment.terms));
    for (const item of segment.items) {
      keys.push(`i:${segment.code}:${item.label}`);
      values.push(termsExpression(item.terms));
    }
  }
  const columns = values
    .map(
      (_value, index) =>
        `count(*) FILTER (WHERE search_vector @@ websearch_to_tsquery('portuguese', $${index + 1}))::int AS c${index}`,
    )
    .join(', ');
  const row = await withTenant(pool, authContext(request), async (client) => {
    const result = await client.query<Record<string, number>>(
      `SELECT ${columns}
         FROM editais
        WHERE tenant_id IN (SELECT current_setting('app.tenant_id')::uuid UNION SELECT id FROM plataforma_tenants)
          AND data_encerramento_proposta IS NOT NULL AND data_encerramento_proposta > now()`,
      values,
    );
    return result.rows[0] ?? {};
  });
  return new Map(keys.map((key, index) => [key, Number(row[`c${index}`] ?? 0)]));
}

export function registerSegmentosRoutes(app: FastifyInstance, { pool }: Deps): void {
  /**
   * Catálogo guiado: nicho → segmento → produto/serviço, com quantas licitações abertas há em cada.
   * Sem `nicho`, usa os da conta (ou lista tudo, sem contagem, para quem ainda não escolheu).
   */
  app.get('/catalog/segmentos', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const query = request.query as { nicho?: string | string[] };
    const asked = normalizeNicheCodes(
      (Array.isArray(query.nicho) ? query.nicho : query.nicho ? query.nicho.split(',') : []).map(
        String,
      ),
    );
    const context = authContext(request);
    const preferences = await withTenant(pool, context, (client) =>
      readUserNiches(client, request.user.tenantId, request.user.sub),
    );
    let niches = asked.length ? asked : preferences;
    if (isNicheRestricted(request.user.role)) {
      // Aluno/colaborador só enxerga os próprios nichos, mesmo pedindo outro.
      const own = niches.filter((code) => preferences.includes(code));
      niches = own.length ? own : preferences;
      if (!niches.length) return reply.send({ data: [], contado: false });
    }
    if (!niches.length) {
      // Sem nicho definido: lista tudo (para escolher), sem contar.
      return reply.send({ data: groupByNiche(SEGMENT_CATALOG, null), contado: false });
    }
    const cacheKey = `${request.user.tenantId}|${[...niches].sort().join(',')}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return reply.send({ data: hit.value, contado: true });
    }
    const segments = segmentsOfNiches(niches);
    try {
      const counts = await countOpen(pool, request, segments);
      const value = groupByNiche(segments, counts);
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
      cache.set(cacheKey, { at: Date.now(), value });
      return reply.send({ data: value, contado: true });
    } catch (error) {
      request.log.warn({ err: error }, 'segmentos: contagem indisponível, listando sem números');
      return reply.send({ data: groupByNiche(segments, null), contado: false });
    }
  });
}
