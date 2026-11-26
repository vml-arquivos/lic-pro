import { documentoDoFornecedor } from '@licitecomigo/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { PublicRateLimiter } from './auth-public.js';
import { OPERATION_ROLES } from './auth.js';
import { cacheLocal, metaDoDado, type CacheCompartilhado } from './cache-compartilhado.js';
import type { RuntimeConfig } from './config.js';
import { withTenant } from './db.js';
import { comPoliticaDeFonte } from './fonte-http.js';
import { buildEditalSearchQuery } from './search.js';
import { audit, authContext, requireRoles, sendDatabaseUnavailable } from './request-context.js';
import { scopedFilters, searchContext } from './radar.js';

/**
 * Concorrência: contratos que fornecedores fecharam com o governo, lidos do PNCP.
 * Só leitura. Nada vem de memória: sem resposta da fonte, a tela mostra o aviso.
 */

type Deps = {
  pool: Pool | undefined;
  config: RuntimeConfig;
  fetchImpl?: typeof fetch;
  cache?: CacheCompartilhado;
};

export type ContratoPublico = {
  numero_controle: string | null;
  fornecedor: string | null;
  cnpj: string | null;
  valor: number | null;
  assinatura: string | null;
  vigencia_fim: string | null;
  publicado_em: string | null;
  orgao: string | null;
  uf: string | null;
  municipio: string | null;
  objeto: string | null;
  link: string | null;
};

const texto = (valor: unknown): string | null =>
  typeof valor === 'string' && valor.trim() ? valor.trim() : null;
const numero = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : null;
const data = (valor: unknown): string | null => {
  const t = texto(valor);
  if (!t) return null;
  const d = new Date(t.length === 10 ? `${t}T12:00:00Z` : t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Item da busca pública do PNCP (`tipos_documento=contrato`) → contrato da tela. */
export function normalizarContratoPublico(bruto: unknown): ContratoPublico | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const linha = bruto as Record<string, unknown>;
  const cnpj = documentoDoFornecedor(texto(linha.fornecedor_ni));
  const nome = texto(linha.fornecedor_nome);
  if (!cnpj && !nome) return null;
  const caminho = texto(linha.item_url);
  return {
    numero_controle: texto(linha.numero_controle_pncp),
    fornecedor: nome,
    cnpj,
    valor: numero(linha.valor_global),
    assinatura: data(linha.data_assinatura),
    vigencia_fim: data(linha.data_fim_vigencia),
    publicado_em: data(linha.data_publicacao_pncp),
    orgao: texto(linha.orgao_nome),
    uf: texto(linha.uf),
    municipio: texto(linha.municipio_nome),
    objeto: texto(linha.description) ?? texto(linha.title),
    link: caminho && caminho.startsWith('/contratos/') ? `https://pncp.gov.br/app${caminho}` : null,
  };
}

const POR_PAGINA = 50;

export type LeituraDeContratos = {
  contratos: ContratoPublico[];
  total_na_fonte: number;
  paginas_lidas: number;
  /** Havia mais contratos na fonte do que os lidos. */
  parcial: boolean;
};

export class ConcorrenciaError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function urlDaBuscaDeContratos(
  config: Pick<RuntimeConfig, 'pncpBaseUrl'>,
  opcoes: { q: string; uf?: string | undefined; pagina: number },
): string {
  const base = `${new URL(config.pncpBaseUrl).origin}/api/search/`;
  const parametros = new URLSearchParams({
    tipos_documento: 'contrato',
    ordenacao: '-data',
    pagina: String(opcoes.pagina),
    tam_pagina: String(POR_PAGINA),
    q: opcoes.q,
  });
  if (opcoes.uf) parametros.set('ufs', opcoes.uf);
  return `${base}?${parametros.toString()}`;
}

/** Lê até `paginas` páginas da busca pública de contratos. Com `cnpj`, só fica o que é dele. */
export async function lerContratosDoPncp(
  config: Pick<RuntimeConfig, 'pncpBaseUrl'>,
  opcoes: { q: string; uf?: string | undefined; paginas: number; cnpj?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<LeituraDeContratos> {
  const contratos: ContratoPublico[] = [];
  let total = 0;
  let lidas = 0;
  let vistos = 0;
  for (let pagina = 1; pagina <= opcoes.paginas; pagina += 1) {
    let corpo: unknown;
    try {
      const controle = new AbortController();
      const relogio = setTimeout(() => controle.abort(), 20_000);
      try {
        const resposta = await fetchImpl(
          urlDaBuscaDeContratos(config, { q: opcoes.q, uf: opcoes.uf, pagina }),
          {
            headers: { accept: 'application/json', 'user-agent': 'LiciteComigo/1.0' },
            signal: controle.signal,
          },
        );
        if (!resposta.ok) throw new Error(`status_${resposta.status}`);
        corpo = await resposta.json();
      } finally {
        clearTimeout(relogio);
      }
    } catch {
      if (pagina === 1) {
        throw new ConcorrenciaError(
          502,
          'fonte_indisponivel',
          'O PNCP não respondeu agora. Tente novamente em instantes.',
        );
      }
      return { contratos, total_na_fonte: total, paginas_lidas: lidas, parcial: true };
    }
    const objeto = (corpo ?? {}) as { items?: unknown; total?: unknown };
    const itens = Array.isArray(objeto.items) ? objeto.items : [];
    total = typeof objeto.total === 'number' ? objeto.total : total;
    lidas += 1;
    vistos += itens.length;
    for (const item of itens) {
      const contrato = normalizarContratoPublico(item);
      if (!contrato) continue;
      if (opcoes.cnpj && contrato.cnpj !== opcoes.cnpj) continue;
      contratos.push(contrato);
    }
    if (itens.length < POR_PAGINA || vistos >= total) break;
  }
  return {
    contratos,
    total_na_fonte: total,
    paginas_lidas: lidas,
    parcial: vistos < total,
  };
}

const soma = (valores: Array<number | null>) =>
  Math.round(valores.reduce<number>((acc, v) => acc + (v ?? 0), 0) * 100) / 100;

function topo<T extends { valor_total: number; contratos: number }>(lista: T[], limite: number) {
  return [...lista]
    .sort((a, b) => b.valor_total - a.valor_total || b.contratos - a.contratos)
    .slice(0, limite);
}

/** Totais de um fornecedor: contratos, valor, onde vende, para quem e quando. */
export function resumirFornecedor(contratos: ContratoPublico[]) {
  const porUf = new Map<string, { uf: string; contratos: number; valor_total: number }>();
  const porOrgao = new Map<string, { orgao: string; contratos: number; valor_total: number }>();
  const porAno = new Map<string, { ano: string; contratos: number; valor_total: number }>();
  for (const c of contratos) {
    const acumular = <T extends { contratos: number; valor_total: number }>(
      mapa: Map<string, T>,
      chave: string | null,
      novo: () => T,
    ) => {
      if (!chave) return;
      const atual = mapa.get(chave) ?? novo();
      atual.contratos += 1;
      atual.valor_total = Math.round((atual.valor_total + (c.valor ?? 0)) * 100) / 100;
      mapa.set(chave, atual);
    };
    acumular(porUf, c.uf, () => ({ uf: c.uf!, contratos: 0, valor_total: 0 }));
    acumular(porOrgao, c.orgao, () => ({ orgao: c.orgao!, contratos: 0, valor_total: 0 }));
    const ano = (c.assinatura ?? c.publicado_em)?.slice(0, 4) ?? null;
    acumular(porAno, ano, () => ({ ano: ano!, contratos: 0, valor_total: 0 }));
  }
  const comValor = contratos.filter((c) => c.valor !== null);
  return {
    contratos: contratos.length,
    valor_total: soma(contratos.map((c) => c.valor)),
    maior_contrato: comValor.length ? Math.max(...comValor.map((c) => c.valor!)) : null,
    por_uf: topo([...porUf.values()], 10),
    principais_orgaos: topo([...porOrgao.values()], 8),
    por_ano: [...porAno.values()].sort((a, b) => b.ano.localeCompare(a.ano)),
  };
}

export type FornecedorDoMercado = {
  cnpj: string | null;
  nome: string | null;
  contratos: number;
  valor_total: number;
  ufs: string[];
  ultimo_contrato: string | null;
};

/** Quem mais aparece nos contratos de um assunto: agrupa por CNPJ (ou nome, sem CNPJ). */
export function agruparFornecedores(contratos: ContratoPublico[], limite = 20) {
  const grupos = new Map<string, FornecedorDoMercado>();
  for (const c of contratos) {
    const chave = c.cnpj ?? `nome:${(c.fornecedor ?? '').toLowerCase()}`;
    const grupo = grupos.get(chave) ?? {
      cnpj: c.cnpj,
      nome: c.fornecedor,
      contratos: 0,
      valor_total: 0,
      ufs: [],
      ultimo_contrato: null,
    };
    grupo.contratos += 1;
    grupo.valor_total = Math.round((grupo.valor_total + (c.valor ?? 0)) * 100) / 100;
    if (c.uf && !grupo.ufs.includes(c.uf)) grupo.ufs.push(c.uf);
    const quando = c.assinatura ?? c.publicado_em;
    if (quando && (!grupo.ultimo_contrato || quando > grupo.ultimo_contrato)) {
      grupo.ultimo_contrato = quando;
    }
    grupos.set(chave, grupo);
  }
  return [...grupos.values()]
    .sort((a, b) => b.contratos - a.contratos || b.valor_total - a.valor_total)
    .slice(0, limite);
}

const cnpjSchema = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ''))
  .refine((valor) => valor.length === 14, 'Informe um CNPJ com 14 números.');

const consultaFornecedor = z.object({ cnpj: cnpjSchema });
const consultaMercado = z.object({
  q: z.string().trim().min(3, 'Digite ao menos 3 letras.').max(120),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
});
const acompanharBody = z.object({
  cnpj: cnpjSchema,
  nome: z.string().trim().max(200).optional(),
  apelido: z.string().trim().max(80).optional(),
});
const idParams = z.object({ id: z.string().uuid() });

const LIMITE_ACOMPANHADOS = 30;
const VALIDADE = 3_600_000;
const RETENCAO = 7 * 86_400_000;

export function registerConcorrenciaRoutes(
  app: FastifyInstance,
  { pool, config, fetchImpl, cache = cacheLocal }: Deps,
): void {
  const limiter = new PublicRateLimiter(40);
  const fetchPncp = comPoliticaDeFonte(fetchImpl ?? fetch, 'pncp');

  const contratosDoFornecedor = (cnpj: string, paginas: number) =>
    cache.obter<LeituraDeContratos>(`pncp:fornecedor:${cnpj}:${paginas}`, {
      validadeMs: VALIDADE,
      retencaoMs: RETENCAO,
      servirVelhoEAtualizar: true,
      buscar: async () => {
        const valor = await lerContratosDoPncp(config, { q: cnpj, paginas, cnpj }, fetchPncp);
        return { valor, parcial: valor.parcial };
      },
    });

  const tratarErro = (reply: Parameters<typeof sendDatabaseUnavailable>[0], erro: unknown) => {
    if (erro instanceof ConcorrenciaError) {
      return reply.code(erro.status).send({ error: erro.code, message: erro.message });
    }
    throw erro;
  };

  /** Tudo o que o PNCP mostra de um fornecedor: contratos, valores, órgãos e estados. */
  app.get('/concorrencia/fornecedor', async (request, reply) => {
    if (!requireRoles(reply, request, OPERATION_ROLES)) return reply;
    const { cnpj } = consultaFornecedor.parse(request.query);
    limiter.check(`concorrencia:${request.user.sub}`);
    try {
      const lido = await contratosDoFornecedor(cnpj, 4);
      return reply.send({
        cnpj,
        nome: lido.valor.contratos.find((c) => c.fornecedor)?.fornecedor ?? null,
        resumo: resumirFornecedor(lido.valor.contratos),
        contratos: lido.valor.contratos.slice(0, 100),
        parcial: lido.valor.parcial,
        dados: metaDoDado(lido),
        fonte: { nome: 'PNCP — contratos publicados', link: 'https://pncp.gov.br/app/contratos' },
      });
    } catch (erro) {
      return tratarErro(reply, erro);
    }
  });

  /** Quem fecha contratos de um assunto: os fornecedores que mais aparecem na amostra recente. */
  app.get('/concorrencia/mercado', async (request, reply) => {
    if (!requireRoles(reply, request, OPERATION_ROLES)) return reply;
    const { q, uf } = consultaMercado.parse(request.query);
    limiter.check(`concorrencia:${request.user.sub}`);
    try {
      const lido = await cache.obter<LeituraDeContratos>(
        `pncp:mercado:${q.toLowerCase()}:${uf ?? ''}`,
        {
          validadeMs: VALIDADE,
          retencaoMs: RETENCAO,
          servirVelhoEAtualizar: true,
          buscar: async () => {
            const valor = await lerContratosDoPncp(config, { q, uf, paginas: 3 }, fetchPncp);
            return { valor, parcial: valor.parcial };
          },
        },
      );
      return reply.send({
        q,
        uf: uf ?? null,
        contratos_lidos: lido.valor.contratos.length,
        total_na_fonte: lido.valor.total_na_fonte,
        fornecedores: agruparFornecedores(lido.valor.contratos),
        valor_total: soma(lido.valor.contratos.map((c) => c.valor)),
        dados: metaDoDado(lido),
        fonte: { nome: 'PNCP — contratos publicados', link: 'https://pncp.gov.br/app/contratos' },
      });
    } catch (erro) {
      return tratarErro(reply, erro);
    }
  });

  /** Fornecedores que a empresa acompanha, com os contratos novos desde a última visita. */
  app.get('/fornecedores-acompanhados', async (request, reply) => {
    if (!requireRoles(reply, request, OPERATION_ROLES)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const linhas = await withTenant(pool, authContext(request), async (client) =>
      client.query<{
        id: string;
        cnpj: string;
        nome: string | null;
        apelido: string | null;
        ultimo_visto_em: Date;
        created_at: Date;
      }>(
        `SELECT id, cnpj, nome, apelido, ultimo_visto_em, created_at
           FROM fornecedores_acompanhados
          WHERE tenant_id = $1
          ORDER BY created_at DESC`,
        [request.user.tenantId],
      ),
    );
    const itens = await Promise.all(
      linhas.rows.map(async (linha) => {
        try {
          const lido = await contratosDoFornecedor(linha.cnpj, 1);
          const desde = new Date(linha.ultimo_visto_em).toISOString();
          const novos = lido.valor.contratos.filter((c) => (c.publicado_em ?? '') > desde);
          const recentes = lido.valor.contratos[0] ?? null;
          return {
            ...linha,
            nome: linha.nome ?? lido.valor.contratos.find((c) => c.fornecedor)?.fornecedor ?? null,
            ultimo_visto_em: desde,
            contratos_novos: novos.length,
            ultimo_contrato: recentes
              ? {
                  objeto: recentes.objeto,
                  orgao: recentes.orgao,
                  valor: recentes.valor,
                  data: recentes.assinatura ?? recentes.publicado_em,
                  link: recentes.link,
                }
              : null,
            disponivel: true,
          };
        } catch {
          return {
            ...linha,
            ultimo_visto_em: new Date(linha.ultimo_visto_em).toISOString(),
            contratos_novos: 0,
            ultimo_contrato: null,
            disponivel: false,
          };
        }
      }),
    );
    return reply.send({ data: itens, limite: LIMITE_ACOMPANHADOS });
  });

  app.post('/fornecedores-acompanhados', async (request, reply) => {
    if (!requireRoles(reply, request, OPERATION_ROLES)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const body = acompanharBody.parse(request.body);
    const criado = await withTenant(pool, authContext(request), async (client) => {
      const total = await client.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM fornecedores_acompanhados WHERE tenant_id = $1',
        [request.user.tenantId],
      );
      if ((total.rows[0]?.total ?? 0) >= LIMITE_ACOMPANHADOS) return 'limite' as const;
      const inserido = await client.query<{ id: string }>(
        `INSERT INTO fornecedores_acompanhados (tenant_id, usuario_id, cnpj, nome, apelido)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, cnpj) DO NOTHING
         RETURNING id`,
        [
          request.user.tenantId,
          request.user.sub,
          body.cnpj,
          body.nome ?? null,
          body.apelido ?? null,
        ],
      );
      if (!inserido.rows[0]) return 'existe' as const;
      await audit(
        client,
        request,
        'fornecedor_acompanhado.created',
        'fornecedor',
        inserido.rows[0].id,
        {
          cnpj: body.cnpj,
        },
      );
      return inserido.rows[0];
    });
    if (criado === 'limite') {
      return reply.code(409).send({
        error: 'limite',
        message: `Você pode acompanhar até ${LIMITE_ACOMPANHADOS} fornecedores.`,
      });
    }
    if (criado === 'existe') {
      return reply
        .code(409)
        .send({ error: 'ja_acompanhado', message: 'Este CNPJ já está na lista.' });
    }
    return reply.code(201).send(criado);
  });

  /** Marca os contratos de hoje como vistos. */
  app.post('/fornecedores-acompanhados/:id/visto', async (request, reply) => {
    if (!requireRoles(reply, request, OPERATION_ROLES)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { id } = idParams.parse(request.params);
    const feito = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        'UPDATE fornecedores_acompanhados SET ultimo_visto_em = now() WHERE id = $1 AND tenant_id = $2',
        [id, request.user.tenantId],
      ),
    );
    if (!feito.rowCount) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });

  app.delete('/fornecedores-acompanhados/:id', async (request, reply) => {
    if (!requireRoles(reply, request, OPERATION_ROLES)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { id } = idParams.parse(request.params);
    const feito = await withTenant(pool, authContext(request), async (client) => {
      const removido = await client.query(
        'DELETE FROM fornecedores_acompanhados WHERE id = $1 AND tenant_id = $2',
        [id, request.user.tenantId],
      );
      if (removido.rowCount) {
        await audit(client, request, 'fornecedor_acompanhado.deleted', 'fornecedor', id);
      }
      return removido.rowCount ?? 0;
    });
    if (!feito) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });

  /** De onde vêm os dados: cada fonte, quando foi atualizada e quanto há no sistema. */
  app.get('/fontes-de-dados', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const dados = await withTenant(pool, authContext(request), async (client) => {
      const escopo = `tenant_id IN (SELECT current_setting('app.tenant_id')::uuid UNION SELECT id FROM plataforma_tenants)`;
      const catalogo = await client.query<{
        total: number;
        abertos: number;
        ultima_publicacao: Date | null;
      }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE data_encerramento_proposta > now())::int AS abertos,
                max(data_publicacao) AS ultima_publicacao
           FROM editais WHERE ${escopo}`,
      );
      const portais = await client.query<{ portal: string; total: number }>(
        `SELECT COALESCE(sistema_origem::text, 'PNCP') AS portal, count(*)::int AS total
           FROM editais WHERE ${escopo}
          GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
      );
      const coleta = await client.query<{ ultima: Date | null }>(
        `SELECT max(finalizado_em) AS ultima FROM coleta_pncp_execucoes
          WHERE status IN ('ok', 'parcial') AND finalizado_em IS NOT NULL`,
      );
      return {
        catalogo: catalogo.rows[0] ?? { total: 0, abertos: 0, ultima_publicacao: null },
        portais: portais.rows,
        ultima_coleta: coleta.rows[0]?.ultima ?? null,
      };
    });
    return reply.send({
      ...dados,
      coleta_ligada: config.pncpSyncEnabled,
      intervalo_minutos: config.pncpSyncIntervalMinutes,
      fontes: [
        {
          nome: 'PNCP — editais',
          detalhe: 'Contratações publicadas pelos órgãos. O sistema coleta sozinho.',
          atualizacao: `A cada ${config.pncpSyncIntervalMinutes} min`,
          link: 'https://pncp.gov.br/app/editais',
        },
        {
          nome: 'PNCP — contratos',
          detalhe: 'Quem assinou contrato com o governo e por quanto. Lido na hora da consulta.',
          atualizacao: 'Na consulta (guardado por 1 hora)',
          link: 'https://pncp.gov.br/app/contratos',
        },
        {
          nome: 'Compras.gov.br — preços pagos',
          detalhe: 'Preços praticados por código CATMAT/CATSER. Lido na hora da consulta.',
          atualizacao: 'Na consulta (guardado por 6 horas)',
          link: 'https://dadosabertos.compras.gov.br',
        },
      ],
    });
  });

  /** Buscas salvas ligadas, com quantas licitações abertas cada uma encontra agora. */
  app.get('/consultas-ativas', async (request, reply) => {
    if (!requireRoles(reply, request, OPERATION_ROLES)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const dados = await withTenant(pool, authContext(request), async (client) => {
      const buscas = await client.query<{
        id: string;
        nome: string;
        filtros: Record<string, unknown>;
        updated_at: Date;
      }>(
        `SELECT id, nome, filtros, updated_at
           FROM buscas_salvas
          WHERE tenant_id = $1 AND usuario_id = $2 AND ativa
          ORDER BY updated_at DESC
          LIMIT 30`,
        [request.user.tenantId, request.user.sub],
      );
      const contexto = await searchContext(client, request);
      const resultado = [];
      for (const busca of buscas.rows) {
        let abertas: number | null = null;
        let novas_24h: number | null = null;
        try {
          const filtros = await scopedFilters(client, request, {
            ...busca.filtros,
            status: 'recebendo',
            page: 1,
            page_size: 1,
          });
          const consulta = buildEditalSearchQuery(filtros, contexto);
          const contagem = await client.query<{ total: number }>(
            consulta.countText,
            consulta.countValues,
          );
          abertas = contagem.rows[0]?.total ?? 0;
          const recentes = buildEditalSearchQuery(
            await scopedFilters(client, request, {
              ...busca.filtros,
              status: 'recebendo',
              periodo_tipo: 'publicacao',
              periodo_de: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
              page: 1,
              page_size: 1,
            }),
            contexto,
          );
          const novas = await client.query<{ total: number }>(
            recentes.countText,
            recentes.countValues,
          );
          novas_24h = novas.rows[0]?.total ?? 0;
        } catch {
          abertas = null;
        }
        resultado.push({
          id: busca.id,
          nome: busca.nome,
          filtros: busca.filtros,
          abertas,
          novas_24h,
          atualizada_em: busca.updated_at,
        });
      }
      return resultado;
    });
    return reply.send({ data: dados });
  });
}
