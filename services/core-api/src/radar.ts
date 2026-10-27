import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { withTenant } from './db.js';
import { applyNicheScope, readUserNiches } from './niche-scope.js';
import { audit, authContext, requireRoles, sendDatabaseUnavailable } from './request-context.js';
import {
  buildEditalExportQuery,
  buildEditalSearchQuery,
  editalSearchSchema,
  type EditalSearchFilters,
  type RadarProfile,
  type SearchContext,
} from './search.js';
import { buildCsv, buildXlsx, type SheetCell } from './xlsx.js';

type Deps = { pool: Pool | undefined };

const MAX_EXPORT_ROWS = 5000;
const uuid = z.string().uuid();
const editalParams = z.object({ editalId: uuid });
const exportQuery = editalSearchSchema.and(
  z.object({ formato: z.enum(['csv', 'xlsx']).default('xlsx') }),
);

const profileBody = z.object({
  ufs: z
    .array(z.string().trim().length(2).toUpperCase())
    .max(27)
    .default([])
    .transform((list) => [...new Set(list)]),
  palavras_interesse: z
    .array(z.string().trim().min(2).max(60))
    .max(30)
    .default([])
    .transform((list) => [...new Set(list)]),
  valor_min: z.number().nonnegative().nullable().default(null),
  valor_max: z.number().nonnegative().nullable().default(null),
  modalidades: z
    .array(z.string().trim().min(2).max(80))
    .max(20)
    .default([])
    .transform((list) => [...new Set(list)]),
});

const interactionBody = z
  .object({
    favorito: z.boolean().optional(),
    descartado: z.boolean().optional(),
    visto: z.boolean().optional(),
    nota: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo.');

const municipiosQuery = z.object({
  q: z.string().trim().min(2).max(80),
  uf: z.string().trim().length(2).toUpperCase().optional(),
});

async function loadProfile(
  client: PoolClient,
  request: FastifyRequest,
): Promise<RadarProfile | null> {
  const result = await client.query<{
    ufs: string[];
    palavras_interesse: string[];
    valor_min: string | null;
    valor_max: string | null;
    modalidades: string[];
  }>(
    `SELECT ufs, palavras_interesse, valor_min, valor_max, modalidades
       FROM perfis_radar WHERE usuario_id = $1`,
    [request.user.sub],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ufs: row.ufs ?? [],
    palavras: row.palavras_interesse ?? [],
    valorMin: row.valor_min === null ? null : Number(row.valor_min),
    valorMax: row.valor_max === null ? null : Number(row.valor_max),
    modalidades: row.modalidades ?? [],
  };
}

async function searchContext(client: PoolClient, request: FastifyRequest): Promise<SearchContext> {
  return { userId: request.user.sub, profile: await loadProfile(client, request) };
}

async function scopedFilters(
  client: PoolClient,
  request: FastifyRequest,
  raw: unknown,
): Promise<EditalSearchFilters> {
  const filters = editalSearchSchema.parse(raw);
  const scoped = applyNicheScope(
    filters as unknown as Record<string, unknown>,
    await readUserNiches(client, request.user.tenantId, request.user.sub),
    request.user.role,
  );
  return editalSearchSchema.parse(scoped);
}

const BRT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});
function formatDate(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : BRT.format(date);
}

const EXPORT_HEADER = [
  'Número da compra',
  'Objeto',
  'Órgão',
  'CNPJ do órgão',
  'UF',
  'Município',
  'Esfera',
  'Modalidade',
  'Situação',
  'Valor estimado (R$)',
  'Publicação',
  'Abertura das propostas',
  'Encerramento das propostas',
  'Fonte',
  'Link de origem',
  'Compatibilidade (%)',
] as const;

function exportRow(row: Record<string, unknown>): SheetCell[] {
  const text = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value);
  return [
    text(row.numero_compra),
    text(row.titulo),
    text(row.orgao),
    text(row.orgao_cnpj),
    text(row.uf),
    text(row.municipio_nome),
    text(row.esfera),
    text(row.modalidade),
    text(row.situacao),
    row.valor_estimado === null || row.valor_estimado === undefined
      ? null
      : Number(row.valor_estimado),
    formatDate(row.data_publicacao),
    formatDate(row.data_abertura_proposta),
    formatDate(row.data_encerramento_proposta),
    text(row.sistema_origem ?? row.fonte),
    text(row.url_origem),
    row.compat === null || row.compat === undefined ? null : Number(row.compat),
  ];
}

export function registerRadarRoutes(app: FastifyInstance, { pool }: Deps): void {
  app.get('/editais', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const filters = await scopedFilters(client, request, request.query);
      const search = buildEditalSearchQuery(filters, await searchContext(client, request));
      // Consultas em sequência: o cliente do pool não aceita concorrência.
      const rows = await client.query(search.text, search.values);
      const count = await client.query<{ total: number }>(search.countText, search.countValues);
      const facetas: Record<string, { valor: string; total: number }[]> = {};
      if (filters.facetas) {
        for (const facet of search.facets) {
          const found = await client.query<{ valor: string; total: number }>(
            facet.text,
            facet.values,
          );
          facetas[facet.campo] = found.rows;
        }
      }
      return { filters, rows: rows.rows, total: count.rows[0]?.total ?? 0, facetas };
    });
    return reply.send({
      data: result.rows,
      page: result.filters.page,
      page_size: result.filters.page_size,
      total: result.total,
      total_pages: Math.ceil(result.total / result.filters.page_size),
      facetas: result.facetas,
    });
  });

  app.get('/editais/export', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'admin', 'operador'])) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { formato } = exportQuery.parse(request.query);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const filters = await scopedFilters(client, request, request.query);
      const query = buildEditalExportQuery(
        filters,
        await searchContext(client, request),
        MAX_EXPORT_ROWS,
      );
      const rows = await client.query<Record<string, unknown>>(query.text, query.values);
      await audit(client, request, 'radar.exported', 'edital', null, {
        formato,
        linhas: rows.rowCount ?? rows.rows.length,
        filtros: Object.fromEntries(
          Object.entries(request.query as Record<string, unknown>).slice(0, 30),
        ),
      });
      return rows.rows;
    });
    const data = result.map(exportRow);
    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Total-Linhas', String(data.length));
    reply.header('X-Limite-Linhas', String(MAX_EXPORT_ROWS));
    if (formato === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="radar-${stamp}.csv"`);
      return reply.send(buildCsv(EXPORT_HEADER, data));
    }
    reply.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    reply.header('Content-Disposition', `attachment; filename="radar-${stamp}.xlsx"`);
    return reply.send(buildXlsx('Radar', EXPORT_HEADER, data));
  });

  app.post('/editais/:editalId/interacao', async (request, reply) => {
    const { editalId } = editalParams.parse(request.params);
    const body = interactionBody.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const exists = await client.query('SELECT 1 FROM editais WHERE id = $1', [editalId]);
      if (!exists.rows[0]) return null;
      const current = await client.query<{
        favorito: boolean;
        descartado: boolean;
        visto_em: Date | null;
        nota: string | null;
      }>(
        `SELECT favorito, descartado, visto_em, nota
           FROM edital_interacoes WHERE usuario_id = $1 AND edital_id = $2`,
        [request.user.sub, editalId],
      );
      const before = current.rows[0] ?? {
        favorito: false,
        descartado: false,
        visto_em: null,
        nota: null,
      };
      // Favoritar e descartar se excluem: marcar um desmarca o outro.
      let favorito = body.favorito ?? before.favorito;
      let descartado = body.descartado ?? before.descartado;
      if (body.favorito === true) descartado = false;
      else if (body.descartado === true) favorito = false;
      const vistoEm =
        body.visto === true
          ? (before.visto_em ?? new Date())
          : body.visto === false
            ? null
            : before.visto_em;
      const nota = body.nota !== undefined ? body.nota || null : before.nota;
      const saved = await client.query(
        `INSERT INTO edital_interacoes
           (tenant_id, usuario_id, edital_id, favorito, descartado, visto_em, nota)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (usuario_id, edital_id) DO UPDATE SET
           favorito = EXCLUDED.favorito, descartado = EXCLUDED.descartado,
           visto_em = EXCLUDED.visto_em, nota = EXCLUDED.nota, updated_at = now()
         RETURNING favorito, descartado, visto_em, nota, updated_at`,
        [request.user.tenantId, request.user.sub, editalId, favorito, descartado, vistoEm, nota],
      );
      return saved.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'edital_not_found' });
    return reply.send(result);
  });

  app.get('/radar/perfil', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      loadProfile(client, request),
    );
    return reply.send({
      perfil: result
        ? {
            ufs: result.ufs,
            palavras_interesse: result.palavras,
            valor_min: result.valorMin,
            valor_max: result.valorMax,
            modalidades: result.modalidades,
          }
        : { ufs: [], palavras_interesse: [], valor_min: null, valor_max: null, modalidades: [] },
    });
  });

  app.put('/radar/perfil', async (request, reply) => {
    const body = profileBody.parse(request.body);
    if (body.valor_min !== null && body.valor_max !== null && body.valor_min > body.valor_max) {
      return reply
        .code(400)
        .send({ error: 'invalid_range', message: 'O valor mínimo não pode passar do máximo.' });
    }
    if (!pool) return sendDatabaseUnavailable(reply);
    await withTenant(pool, authContext(request), async (client) => {
      await client.query(
        `INSERT INTO perfis_radar
           (tenant_id, usuario_id, ufs, palavras_interesse, valor_min, valor_max, modalidades)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (usuario_id) DO UPDATE SET
           ufs = EXCLUDED.ufs, palavras_interesse = EXCLUDED.palavras_interesse,
           valor_min = EXCLUDED.valor_min, valor_max = EXCLUDED.valor_max,
           modalidades = EXCLUDED.modalidades, updated_at = now()`,
        [
          request.user.tenantId,
          request.user.sub,
          body.ufs,
          body.palavras_interesse,
          body.valor_min,
          body.valor_max,
          body.modalidades,
        ],
      );
    });
    return reply.send({ ok: true, ...body });
  });

  app.post('/radar/visita', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const anterior = await withTenant(pool, authContext(request), async (client) => {
      const before = await client.query<{ radar_visita_em: string | null }>(
        'SELECT radar_visita_em FROM usuarios WHERE tenant_id = $1 AND id = $2',
        [request.user.tenantId, request.user.sub],
      );
      await client.query(
        // Visitas seguidas (menos de 30 minutos) contam como a mesma, para "novas desde a
        // última visita" não zerar a cada atualização da página.
        `UPDATE usuarios SET radar_visita_em = now()
          WHERE tenant_id = $1 AND id = $2
            AND (radar_visita_em IS NULL OR radar_visita_em < now() - interval '30 minutes')`,
        [request.user.tenantId, request.user.sub],
      );
      return before.rows[0]?.radar_visita_em ?? null;
    });
    return reply.send({ visita_anterior: anterior });
  });

  app.get('/radar/painel', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const base = (await scopedFilters(client, request, {})) as EditalSearchFilters;
      const ctx = await searchContext(client, request);
      const visit = await client.query<{ radar_visita_em: Date | null }>(
        'SELECT radar_visita_em FROM usuarios WHERE tenant_id = $1 AND id = $2',
        [request.user.tenantId, request.user.sub],
      );
      const since =
        visit.rows[0]?.radar_visita_em ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const sinceIso = since.toISOString();
      const count = async (extra: Record<string, unknown>): Promise<number> => {
        const filters = editalSearchSchema.parse({ ...base, ...extra, facetas: false });
        const query = buildEditalSearchQuery(filters, ctx);
        const found = await client.query<{ total: number }>(query.countText, query.countValues);
        return found.rows[0]?.total ?? 0;
      };
      const cards = {
        abertas: await count({ situacao_prazo: 'abertas' }),
        novas: await count({ periodo_tipo: 'publicacao', periodo_de: sinceIso }),
        encerram_hoje: await count({ situacao_prazo: 'vencendo_hoje' }),
        encerram_3_dias: await count({ situacao_prazo: 'vencendo_3' }),
        alteradas: await count({ alterados_desde: sinceIso }),
        favoritas: await count({ estado: 'favoritas' }),
        grande_vulto: await count({ grande_vulto: true, situacao_prazo: 'abertas' }),
        compativeis: ctx.profile
          ? await count({ compat_min: 70, situacao_prazo: 'abertas' })
          : null,
      };
      const highlights = buildEditalSearchQuery(
        editalSearchSchema.parse({
          ...base,
          situacao_prazo: 'abertas',
          ordem: ctx.profile ? 'compat' : 'recentes',
          page_size: 5,
          facetas: false,
        }),
        ctx,
      );
      const top = await client.query(highlights.text, highlights.values);
      return {
        desde: sinceIso,
        cards,
        destaques: top.rows,
        perfil_configurado: Boolean(ctx.profile),
      };
    });
    return reply.send(result);
  });

  app.get('/municipios', async (request, reply) => {
    const query = municipiosQuery.parse(request.query);
    if (!pool) return sendDatabaseUnavailable(reply);
    const escaped = query.q.replace(/[\\%_]/g, (char) => `\\${char}`);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT codigo_ibge, municipio, sigla_uf, regiao
           FROM municipios_ibge
          WHERE (municipio ILIKE $1 OR codigo_ibge = $2)
            AND ($3::text IS NULL OR sigla_uf = $3)
          ORDER BY (municipio ILIKE $4) DESC, municipio
          LIMIT 15`,
        [`%${escaped}%`, query.q, query.uf ?? null, `${escaped}%`],
      ),
    );
    return reply.send({ data: result.rows });
  });
}
