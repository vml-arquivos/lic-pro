import {
  FOCOS_ANALISE,
  analisarOportunidade,
  chaveDeOrdem,
  simularProposta,
  type FocoAnalise,
  type ResultadoAnalise,
} from '@licitecomigo/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { OPERATION_ROLES } from './auth.js';
import { withTenant } from './db.js';
import { scopedFilters, searchContext } from './radar.js';
import { authContext, requireRoles, sendDatabaseUnavailable } from './request-context.js';
import { buildEditalExportQuery, editalSearchSchema } from './search.js';

/**
 * Análise de oportunidades: ranking de editais por foco, comparação lado a lado e simulador.
 *
 * Os números vêm do que já está no banco (editais, itens, valores finais de pregões fechados) e
 * do perfil do Radar. A nota é explicável e não prevê vitória; o lucro é uma estimativa com a
 * margem informada por quem consulta. Quando falta dado, a resposta diz (premissa, sem histórico).
 */

type Deps = { pool: Pool | undefined };

const CATALOGO = "tenant_id IN (SELECT current_setting('app.tenant_id')::uuid UNION SELECT id FROM plataforma_tenants)";
const MAX_CANDIDATOS = 300;

const extras = z.object({
  foco: z.enum(FOCOS_ANALISE).default('interessantes'),
  margem_pct: z.coerce.number().min(0).max(90).default(15),
  limite: z.coerce.number().int().min(1).max(100).default(30),
});
const rankingQuery = editalSearchSchema.and(extras);

const compararQuery = z.object({
  ids: z
    .preprocess(
      (value) => (typeof value === 'string' ? value.split(',').map((id) => id.trim()) : value),
      z.array(z.string().uuid()).min(2).max(4),
    )
    .transform((list) => [...new Set(list)]),
  margem_pct: z.coerce.number().min(0).max(90).default(15),
});

const nonNegative = z.coerce.number().min(0).max(1_000_000_000);
const percent = z.coerce.number().min(0).max(100);
const simularBody = z.object({
  quantidade: z.coerce.number().positive().max(1_000_000_000),
  custo_unitario: nonNegative,
  frete_total: nonNegative.default(0),
  outros_custos_total: nonNegative.default(0),
  impostos_pct: percent.default(0),
  comissao_pct: percent.default(0),
  margem_minima_pct: percent.default(10),
  preco_referencia: nonNegative.nullable().default(null),
  preco_mercado: nonNegative.nullable().default(null),
});

type Linha = Record<string, unknown> & {
  id: string;
  orgao_cnpj: string | null;
  uf: string | null;
  valor_estimado: string | number | null;
  data_encerramento_proposta: string | null;
  data_encerramento_propostas?: string | null;
  compat: number | null;
  modalidade: string | null;
  srp: boolean | null;
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

async function ufDaEmpresa(
  client: PoolClient,
  request: FastifyRequest,
  perfilUfs: string[],
): Promise<string | null> {
  if (request.user.empresaId) {
    const found = await client.query<{ uf: string | null }>(
      'SELECT uf FROM empresas WHERE id = $1',
      [request.user.empresaId],
    );
    const uf = found.rows[0]?.uf?.trim();
    if (uf) return uf;
  }
  return perfilUfs.length === 1 ? perfilUfs[0]! : null;
}

type Historico = { amostras: number; economia: number | null };
type PrecoRef = { itens: number; comparados: number; razao: number | null };

/** Quanto cada órgão costuma fechar abaixo do estimado, a partir dos pregões com valor final. */
async function historicoPorOrgao(client: PoolClient, cnpjs: string[]): Promise<Map<string, Historico>> {
  const result = new Map<string, Historico>();
  if (!cnpjs.length) return result;
  const rows = await client.query<{ orgao_cnpj: string; amostras: number; economia: number | null }>(
    `SELECT orgao_cnpj, count(*)::int AS amostras,
            avg(LEAST(0.9, GREATEST(-0.5, 1 - valor_homologado / valor_estimado)))::float8 AS economia
       FROM editais
      WHERE ${CATALOGO} AND orgao_cnpj = ANY($1::text[])
        AND valor_estimado > 0 AND valor_homologado > 0
      GROUP BY orgao_cnpj`,
    [cnpjs],
  );
  for (const row of rows.rows) {
    result.set(row.orgao_cnpj, { amostras: row.amostras, economia: row.economia });
  }
  return result;
}

/** Preço estimado dos itens de cada edital frente à mediana do catálogo para o mesmo código. */
async function precoContraMediana(
  client: PoolClient,
  ids: string[],
): Promise<Map<string, PrecoRef>> {
  const result = new Map<string, PrecoRef>();
  if (!ids.length) return result;
  const rows = await client.query<{
    edital_id: string;
    itens: number;
    comparados: number;
    estimado: number | null;
    mediana: number | null;
  }>(
    `WITH alvo AS (
       SELECT edital_id, catmat_catser, COALESCE(quantidade, 1) AS q, valor_unitario_estimado AS v
         FROM itens_edital WHERE edital_id = ANY($1::uuid[])
     ), ref AS (
       SELECT ie.catmat_catser,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY ie.valor_unitario_estimado) AS mediana,
              count(*) AS n
         FROM itens_edital ie
         JOIN editais e ON e.id = ie.edital_id
        WHERE ie.valor_unitario_estimado > 0
          AND e.tenant_id IN (SELECT current_setting('app.tenant_id')::uuid UNION SELECT id FROM plataforma_tenants)
          AND ie.edital_id <> ALL($1::uuid[])
          AND ie.catmat_catser IN (SELECT DISTINCT catmat_catser FROM alvo WHERE catmat_catser ~ '^[0-9]{4,9}$')
        GROUP BY ie.catmat_catser
     )
     SELECT a.edital_id, count(*)::int AS itens,
            (count(*) FILTER (WHERE r.n >= 3 AND a.v > 0))::int AS comparados,
            sum(a.q * a.v) FILTER (WHERE r.n >= 3 AND a.v > 0)::float8 AS estimado,
            sum(a.q * r.mediana) FILTER (WHERE r.n >= 3 AND a.v > 0)::float8 AS mediana
       FROM alvo a LEFT JOIN ref r USING (catmat_catser)
      GROUP BY a.edital_id`,
    [ids],
  );
  for (const row of rows.rows) {
    result.set(row.edital_id, {
      itens: row.itens,
      comparados: row.comparados,
      razao: row.estimado && row.mediana ? Math.round((row.estimado / row.mediana) * 100) / 100 : null,
    });
  }
  return result;
}

function montar(
  linha: Linha,
  contexto: {
    agora: Date;
    ufEmpresa: string | null;
    valorMin: number | null;
    valorMax: number | null;
    margem: number;
    historico: Map<string, Historico>;
    precos: Map<string, PrecoRef>;
  },
): { analise: ResultadoAnalise; itens: number | null; preco: PrecoRef | null } {
  const preco = contexto.precos.get(linha.id) ?? null;
  const analise = analisarOportunidade({
    valor_estimado: num(linha.valor_estimado),
    encerra_em: linha.data_encerramento_proposta ?? linha.data_encerramento_propostas ?? null,
    agora: contexto.agora,
    uf: linha.uf,
    uf_empresa: contexto.ufEmpresa,
    modalidade: linha.modalidade,
    srp: linha.srp,
    itens: preco?.itens ?? null,
    compat: linha.compat === null || linha.compat === undefined ? null : Number(linha.compat),
    perfil_valor_min: contexto.valorMin,
    perfil_valor_max: contexto.valorMax,
    historico_orgao: linha.orgao_cnpj ? (contexto.historico.get(linha.orgao_cnpj) ?? null) : null,
    preco_vs_mediana: preco ? { itens: preco.comparados, razao: preco.razao } : null,
    margem_pct: contexto.margem,
  });
  return { analise, itens: preco?.itens ?? null, preco };
}

const CAMPOS_LINHA = [
  'id',
  'titulo',
  'orgao',
  'orgao_cnpj',
  'uf',
  'municipio_nome',
  'modalidade',
  'situacao',
  'srp',
  'numero_compra',
  'valor_estimado',
  'valor_homologado',
  'data_publicacao',
  'data_abertura_proposta',
  'data_encerramento_proposta',
  'url_origem',
  'compat',
  'favorito',
] as const;

function resumo(linha: Linha): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_LINHA) out[campo] = linha[campo] ?? null;
  return out;
}

export function registerAnaliseRoutes(app: FastifyInstance, { pool }: Deps): void {
  /** Ranking: os editais que mais valem a pena, pelo foco escolhido. */
  app.get('/analise/ranking', async (request, reply) => {
    if (!requireRoles(reply, request, OPERATION_ROLES)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const parsed = rankingQuery.parse(request.query);
    const { foco, margem_pct: margem, limite } = parsed as z.infer<typeof extras>;
    const result = await withTenant(pool, authContext(request), async (client) => {
      const bruto = { ...(request.query as Record<string, unknown>) };
      delete bruto.foco;
      delete bruto.margem_pct;
      delete bruto.limite;
      if (!bruto.situacao_prazo) bruto.situacao_prazo = 'abertas';
      const filters = await scopedFilters(client, request, bruto);
      const contexto = await searchContext(client, request);
      const query = buildEditalExportQuery(filters, contexto, MAX_CANDIDATOS);
      const found = await client.query<Linha>(query.text, query.values);
      const linhas = found.rows;
      const cnpjs = [...new Set(linhas.map((l) => l.orgao_cnpj).filter((c): c is string => !!c))];
      const historico = await historicoPorOrgao(client, cnpjs);
      const precos = await precoContraMediana(
        client,
        linhas.map((l) => l.id),
      );
      const ufEmpresa = await ufDaEmpresa(client, request, contexto.profile?.ufs ?? []);
      const agora = new Date();
      const analisados = linhas.map((linha) => {
        const feito = montar(linha, {
          agora,
          ufEmpresa,
          valorMin: contexto.profile?.valorMin ?? null,
          valorMax: contexto.profile?.valorMax ?? null,
          margem,
          historico,
          precos,
        });
        return { edital: resumo(linha), ...feito };
      });
      analisados.sort((a, b) => {
        const ka = chaveDeOrdem(foco, a.analise);
        const kb = chaveDeOrdem(foco, b.analise);
        return kb[0] - ka[0] || kb[1] - ka[1];
      });
      return {
        total_candidatos: linhas.length,
        itens: analisados.slice(0, limite).map((item, indice) => ({
          posicao: indice + 1,
          ...item.edital,
          itens: item.itens,
          analise: item.analise,
        })),
        perfil_definido: Boolean(contexto.profile),
      };
    });
    return reply.send({
      foco,
      margem_pct: margem,
      limite_candidatos: MAX_CANDIDATOS,
      ...result,
      aviso:
        'A nota é um apoio para priorizar, não prevê vitória. O lucro estimado usa a margem que você informou e o desconto que o órgão costuma dar (ou 10% quando não há histórico).',
    });
  });

  /** Comparação lado a lado de 2 a 4 editais. */
  app.get('/analise/comparar', async (request, reply) => {
    if (!requireRoles(reply, request, OPERATION_ROLES)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { ids, margem_pct: margem } = compararQuery.parse(request.query);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const filters = await scopedFilters(client, request, {
        ids: ids.join(','),
        page_size: 10,
        facetas: false,
      });
      const contexto = await searchContext(client, request);
      const query = buildEditalExportQuery(filters, contexto, 10);
      const found = await client.query<Linha>(query.text, query.values);
      const linhas = ids
        .map((id) => found.rows.find((row) => row.id === id))
        .filter((row): row is Linha => Boolean(row));
      const cnpjs = [...new Set(linhas.map((l) => l.orgao_cnpj).filter((c): c is string => !!c))];
      const historico = await historicoPorOrgao(client, cnpjs);
      const precos = await precoContraMediana(client, ids);
      const ufEmpresa = await ufDaEmpresa(client, request, contexto.profile?.ufs ?? []);
      const agora = new Date();
      const itens = await client.query<{
        edital_id: string;
        numero: string;
        descricao: string;
        unidade: string | null;
        quantidade: string | null;
        valor_unitario_estimado: string | null;
      }>(
        `SELECT edital_id, numero, descricao, unidade, quantidade::text, valor_unitario_estimado::text
           FROM itens_edital WHERE edital_id = ANY($1::uuid[])
          ORDER BY edital_id, NULLIF(regexp_replace(numero, '[^0-9]', '', 'g'), '')::int NULLS LAST, numero
          LIMIT 400`,
        [ids],
      );
      return linhas.map((linha) => {
        const feito = montar(linha, {
          agora,
          ufEmpresa,
          valorMin: contexto.profile?.valorMin ?? null,
          valorMax: contexto.profile?.valorMax ?? null,
          margem,
          historico,
          precos,
        });
        const historicoOrgao = linha.orgao_cnpj ? historico.get(linha.orgao_cnpj) : undefined;
        return {
          ...resumo(linha),
          analise: feito.analise,
          historico_orgao: historicoOrgao ?? null,
          preco_vs_mediana: feito.preco,
          itens_total: feito.itens,
          itens_amostra: itens.rows
            .filter((item) => item.edital_id === linha.id)
            .slice(0, 8)
            .map((item) => ({
              numero: item.numero,
              descricao: item.descricao,
              unidade: item.unidade,
              quantidade: num(item.quantidade),
              valor_unitario_estimado: num(item.valor_unitario_estimado),
            })),
        };
      });
    });
    return reply.send({ margem_pct: margem, editais: result });
  });

  /** Simulador de proposta: custo, preço mínimo, desconto máximo e cenários. */
  app.post('/analise/simular', async (request, reply) => {
    if (!requireRoles(reply, request, OPERATION_ROLES)) return reply;
    const body = simularBody.parse(request.body);
    return reply.send(simularProposta(body));
  });
}

export type { FocoAnalise };
