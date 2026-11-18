import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { PublicRateLimiter } from './auth-public.js';
import { CacheCompartilhado, cacheLocal, metaDoDado } from './cache-compartilhado.js';
import { comPoliticaDeFonte } from './fonte-http.js';
import type { RuntimeConfig } from './config.js';
import { withTenant } from './db.js';
import { authContext, sendDatabaseUnavailable } from './request-context.js';

/**
 * Itens, benefícios ME/EPP e documentos de um edital, buscados no PNCP sob demanda.
 *
 * Só lê rotas públicas de consulta. Documentos entram como link para o PNCP (o arquivo continua
 * no portal oficial). Campo que a fonte não informa fica nulo. A gravação passa pela função
 * `coleta_gravar_detalhes` (migration 0024), que só aceita edital do catálogo da plataforma.
 */

export type ItemPncp = {
  numero: string;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario_estimado: number | null;
  catmat_catser: string | null;
  beneficio: string | null;
  situacao_item: string | null;
};

export type DocumentoPncp = {
  tipo: string | null;
  nome_arquivo: string | null;
  url: string;
  hash_conteudo: string;
  estado: string | null;
};

export class DetalhesError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** `00394460000141-1-000123/2026` → CNPJ, sequencial (sem zeros à esquerda) e ano. */
export function parseNumeroControle(
  id: string,
): { cnpj: string; sequencial: string; ano: string } | null {
  const match = /^(\d{14})-\d+-(\d+)\/(\d{4})$/.exec(id.trim());
  if (!match) return null;
  return { cnpj: match[1]!, sequencial: String(Number(match[2])), ano: match[3]! };
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : typeof value === 'number'
      ? String(value)
      : null;
const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function normalizeItem(raw: unknown): ItemPncp | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const numero = str(row.numeroItem ?? row.numero);
  const descricao = str(row.descricao);
  if (!numero || !descricao) return null;
  return {
    numero,
    descricao,
    unidade: str(row.unidadeMedida),
    quantidade: number(row.quantidade),
    valor_unitario_estimado: number(row.valorUnitarioEstimado),
    catmat_catser: str(row.catalogoCodigoItem ?? row.codigoItemCatalogo),
    // 1 exclusiva ME/EPP, 2 subcontratação, 3 cota reservada, 4 sem benefício
    beneficio: str(row.tipoBeneficioNome),
    situacao_item: str(row.situacaoCompraItemNome),
  };
}

export function normalizeDocumento(raw: unknown, base: string): DocumentoPncp | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.statusAtivo === false) return null;
  const sequencial = str(row.sequencialDocumento);
  const url = str(row.url ?? row.uri) ?? (sequencial ? `${base}/arquivos/${sequencial}` : null);
  if (!url || !/^https:\/\//i.test(url)) return null;
  return {
    tipo: str(row.tipoDocumentoNome ?? row.tipoDocumentoDescricao),
    nome_arquivo: str(row.titulo ?? row.nomeArquivo),
    url,
    hash_conteudo: createHash('sha256').update(url).digest('hex'),
    estado: str(row.dataPublicacaoPncp),
  };
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': 'LiciteComigo/1.0' },
      signal: controller.signal,
    });
    if (response.status === 204 || response.status === 404) return [];
    if (!response.ok) {
      throw new DetalhesError(
        502,
        'fonte_recusou',
        'O PNCP recusou a consulta dos detalhes. Tente mais tarde.',
      );
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof DetalhesError) throw error;
    throw new DetalhesError(
      502,
      'fonte_indisponivel',
      'O PNCP não respondeu agora. Tente novamente em instantes.',
    );
  } finally {
    clearTimeout(timer);
  }
}

function listOf(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const object = (body ?? {}) as Record<string, unknown>;
  const list = object.data ?? object.resultado ?? object.itens ?? [];
  return Array.isArray(list) ? list : [];
}

const TAMANHO_PAGINA = 500;
const MAX_PAGINAS_DE_ITENS = 10;

export async function buscarDetalhes(
  config: Pick<RuntimeConfig, 'pncpApiBaseUrl'>,
  idExterno: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ itens: ItemPncp[]; documentos: DocumentoPncp[] }> {
  const key = parseNumeroControle(idExterno);
  if (!key)
    throw new DetalhesError(
      422,
      'identificador_invalido',
      'Este edital não tem identificador do PNCP.',
    );
  const base = `${config.pncpApiBaseUrl}/orgaos/${key.cnpj}/compras/${key.ano}/${key.sequencial}`;
  // Lê todas as páginas de itens (até o limite). A fonte devolve lista curta na última página.
  const rawItems: unknown[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS_DE_ITENS; pagina += 1) {
    const lote = listOf(
      await getJson(fetchImpl, `${base}/itens?pagina=${pagina}&tamanhoPagina=${TAMANHO_PAGINA}`),
    );
    // Página repetida (a fonte ignorou o parâmetro): para, para não duplicar.
    if (pagina > 1 && JSON.stringify(lote[0]) === JSON.stringify(rawItems[0])) break;
    rawItems.push(...lote);
    if (lote.length < TAMANHO_PAGINA) break;
  }
  const rawDocs = listOf(await getJson(fetchImpl, `${base}/arquivos`));
  const itens = rawItems.map(normalizeItem).filter((item): item is ItemPncp => item !== null);
  const documentos = rawDocs
    .map((doc) => normalizeDocumento(doc, base))
    .filter((doc): doc is DocumentoPncp => doc !== null);
  return { itens, documentos };
}

/** Resultado de um item de pregão já encerrado: quanto fechou e quem ganhou. */
export type ResultadoPncp = {
  valor_unitario_homologado: number;
  valor_total_homologado: number | null;
  quantidade_homologada: number | null;
  desconto_pct: number | null;
  fornecedor: string | null;
  cnpj_fornecedor: string | null;
  data: string | null;
  situacao: string | null;
};

export type ItemComResultado = {
  numero: string;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario_estimado: number | null;
  resultado: ResultadoPncp | null;
  /** publicado = a fonte tem o resultado; sem_registro = a fonte respondeu e não há; falhou = não deu para saber. */
  estado_resultado?: 'publicado' | 'sem_registro' | 'falhou';
};

export function normalizeResultado(raw: unknown): ResultadoPncp | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const unit = number(row.valorUnitarioHomologado);
  if (unit === null || unit <= 0) return null;
  const situacao = str(row.situacaoCompraItemResultadoNome ?? row.situacaoCompraItemNome);
  if (situacao && /cancelad|anulad|revogad/i.test(situacao)) return null;
  const data = str(row.dataResultado ?? row.dataInclusao);
  const parsed = data ? new Date(data) : null;
  return {
    valor_unitario_homologado: unit,
    valor_total_homologado: number(row.valorTotalHomologado),
    quantidade_homologada: number(row.quantidadeHomologada),
    desconto_pct: number(row.percentualDesconto),
    fornecedor: str(row.nomeRazaoSocialFornecedor ?? row.nomeFornecedor),
    cnpj_fornecedor: str(row.niFornecedor),
    data: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    situacao,
  };
}

/**
 * Busca no PNCP o resultado de cada item do edital (valor homologado e vencedor).
 * Item sem resultado publicado (404/204) volta com `resultado: null`. Se a fonte falhar em
 * todos os itens, o erro sobe: nunca se inventa valor.
 */
export async function buscarResultados(
  config: Pick<RuntimeConfig, 'pncpApiBaseUrl'>,
  idExterno: string,
  itens: ReadonlyArray<Omit<ItemComResultado, 'resultado'>>,
  fetchImpl: typeof fetch = fetch,
  limite = LIMITE_DE_RESULTADOS,
): Promise<ItemComResultado[]> {
  const key = parseNumeroControle(idExterno);
  if (!key)
    throw new DetalhesError(
      422,
      'identificador_invalido',
      'Este edital não tem identificador do PNCP.',
    );
  const base = `${config.pncpApiBaseUrl}/orgaos/${key.cnpj}/compras/${key.ano}/${key.sequencial}/itens`;
  const out: ItemComResultado[] = [];
  let failures = 0;
  const queue = itens.slice(0, limite);
  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const body = await getJson(
          fetchImpl,
          `${base}/${encodeURIComponent(item.numero)}/resultados`,
        );
        const resultado =
          listOf(body)
            .map(normalizeResultado)
            .find((value): value is ResultadoPncp => value !== null) ?? null;
        out.push({
          ...item,
          resultado,
          estado_resultado: resultado ? 'publicado' : 'sem_registro',
        });
      } catch {
        failures += 1;
        out.push({ ...item, resultado: null, estado_resultado: 'falhou' });
      }
    }
  };
  const total = queue.length;
  await Promise.all(Array.from({ length: Math.min(6, total) }, worker));
  if (total > 0 && failures === total) {
    throw new DetalhesError(
      502,
      'fonte_indisponivel',
      'O PNCP não respondeu agora. Tente novamente em instantes.',
    );
  }
  return out.sort((a, b) => Number(a.numero) - Number(b.numero));
}

/** Quantos itens do edital têm o resultado consultado (o mesmo limite para toda a plataforma). */
export const LIMITE_DE_RESULTADOS = 120;

export type EstadoDosResultados =
  'publicado' | 'parcial' | 'aguardando_publicacao' | 'sem_registro';

export type ResultadosDoEdital = {
  itens: ItemComResultado[];
  cobertura: {
    itens_total: number;
    consultados: number;
    limite: number;
    publicados: number;
    sem_registro: number;
    falhas: number;
  };
  estado: EstadoDosResultados;
  /** Quanto tempo este resultado vale antes de consultar de novo. */
  validade_ms: number;
};

export function estadoDosResultados(
  cobertura: ResultadosDoEdital['cobertura'],
  fechado: boolean,
): EstadoDosResultados {
  if (cobertura.publicados === 0) return fechado ? 'sem_registro' : 'aguardando_publicacao';
  if (cobertura.publicados === cobertura.consultados) return 'publicado';
  return 'parcial';
}

/**
 * Único caminho para os resultados oficiais de um edital no PNCP. "Valores fechados" e
 * "Concorrentes" usam este mesmo resultado, guardado uma vez para todos.
 */
export async function resultadosDoEdital(
  deps: {
    cache: CacheCompartilhado;
    config: Pick<RuntimeConfig, 'pncpApiBaseUrl'>;
    fetchImpl: typeof fetch;
  },
  idExterno: string,
  itens: ReadonlyArray<Omit<ItemComResultado, 'resultado'>>,
  fechado: boolean,
) {
  return deps.cache.obter<ResultadosDoEdital>(`pncp:resultados:${idExterno}`, {
    validadeMs: 10 * 60_000,
    retencaoMs: 14 * 86_400_000,
    servirVelhoEAtualizar: true,
    validadeDoValor: (valor) => valor.validade_ms,
    buscar: async (anterior) => {
      const novos = await buscarResultados(deps.config, idExterno, itens, deps.fetchImpl);
      // Item que falhou agora, mas já tinha resultado publicado antes, mantém o que se sabia.
      const antes = new Map((anterior?.itens ?? []).map((item) => [item.numero, item]));
      const lista = novos.map((item) => {
        const velho = antes.get(item.numero);
        return item.estado_resultado === 'falhou' && velho?.estado_resultado === 'publicado'
          ? velho
          : item;
      });
      const cobertura = {
        itens_total: itens.length,
        consultados: lista.length,
        limite: LIMITE_DE_RESULTADOS,
        publicados: lista.filter((item) => item.estado_resultado === 'publicado').length,
        sem_registro: lista.filter((item) => item.estado_resultado === 'sem_registro').length,
        falhas: lista.filter((item) => item.estado_resultado === 'falhou').length,
      };
      const estado = estadoDosResultados(cobertura, fechado);
      // Resultado final de edital fechado muda pouco: guarda por mais tempo.
      const validade_ms =
        estado === 'publicado' && fechado ? 24 * 3_600_000 : fechado ? 30 * 60_000 : 10 * 60_000;
      return {
        valor: { itens: lista, cobertura, estado, validade_ms },
        parcial: cobertura.falhas > 0,
      };
    },
  });
}

type Deps = {
  pool: Pool | undefined;
  config: RuntimeConfig;
  fetchImpl?: typeof fetch;
  cache?: CacheCompartilhado;
};

/** O PNCP considera o edital fechado quando as propostas já encerraram ou há valor homologado. */
const EDITAL_FECHADO_SQL = `(valor_homologado IS NOT NULL
        OR COALESCE(data_encerramento_propostas, data_encerramento_proposta) < now())`;

/** Por quanto tempo os itens e documentos gravados valem, conforme o estado do edital. */
export function detalhesVencidos(edital: {
  coletado_em: Date | string | null;
  atualizado_em: Date | string | null;
  fechado: boolean;
}): boolean {
  if (!edital.coletado_em) return true;
  const coletado = new Date(edital.coletado_em).getTime();
  const agora = Date.now();
  // O PNCP mudou o edital depois da última coleta dos detalhes.
  if (edital.atualizado_em && new Date(edital.atualizado_em).getTime() > coletado) return true;
  const validade = edital.fechado ? 24 * 3_600_000 : 3 * 3_600_000;
  return agora - coletado > validade;
}

export function registerDetalhesRoutes(
  app: FastifyInstance,
  { pool, config, fetchImpl: fetchBase, cache = cacheLocal }: Deps,
): void {
  const limiter = new PublicRateLimiter(60);
  const fetchImpl = comPoliticaDeFonte(fetchBase ?? fetch, 'pncp');

  /** Valor fechado e vencedor de cada item do edital. */
  app.get('/editais/:id/resultados', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    limiter.check(`resultados:${request.user.sub}`);
    if (!pool) return sendDatabaseUnavailable(reply);
    const loaded = await withTenant(pool, authContext(request), async (client) => {
      const edital = (
        await client.query<{ id_externo: string; fonte: string; fechado: boolean }>(
          `SELECT id_externo, fonte, ${EDITAL_FECHADO_SQL} AS fechado FROM editais WHERE id = $1`,
          [id],
        )
      ).rows[0];
      if (!edital) return null;
      const itens = await client.query<Omit<ItemComResultado, 'resultado'>>(
        `SELECT numero, descricao, unidade, quantidade::float8 AS quantidade,
                valor_unitario_estimado::float8 AS valor_unitario_estimado
           FROM itens_edital WHERE edital_id = $1 ORDER BY numero`,
        [id],
      );
      return { edital, itens: itens.rows };
    });
    if (!loaded) return reply.code(404).send({ error: 'edital_not_found' });
    if (loaded.edital.fonte !== 'pncp') {
      return reply.code(422).send({
        error: 'fonte_sem_detalhes',
        message: 'Os resultados por item só existem para editais do PNCP.',
      });
    }
    if (!loaded.itens.length) {
      return reply.code(409).send({
        error: 'itens_nao_coletados',
        message: 'Os itens do edital ainda não foram buscados.',
      });
    }
    try {
      const dado = await resultadosDoEdital(
        { cache, config, fetchImpl },
        loaded.edital.id_externo,
        loaded.itens,
        loaded.edital.fechado,
      );
      const { itens, cobertura, estado } = dado.valor;
      const comResultado = itens.filter((item) => item.resultado);
      const estimado = comResultado.reduce(
        (total, item) => total + (item.valor_unitario_estimado ?? 0) * (item.quantidade ?? 1),
        0,
      );
      const fechado = comResultado.reduce(
        (total, item) =>
          total +
          (item.resultado!.valor_total_homologado ??
            item.resultado!.valor_unitario_homologado * (item.quantidade ?? 1)),
        0,
      );
      return reply.send({
        itens,
        resumo: {
          itens: itens.length,
          com_resultado: comResultado.length,
          total_estimado: comResultado.length ? Math.round(estimado * 100) / 100 : null,
          total_homologado: comResultado.length ? Math.round(fechado * 100) / 100 : null,
          economia_pct:
            comResultado.length && estimado > 0
              ? Math.round((1 - fechado / estimado) * 1000) / 10
              : null,
        },
        estado,
        cobertura,
        dados: metaDoDado(dado),
        fonte: {
          nome: 'PNCP — resultado dos itens',
          consultado_em: new Date(dado.em).toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof DetalhesError) {
        return reply.code(error.status).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  });

  /**
   * Itens e documentos do edital. Sem `force`, só consulta o PNCP se o que está gravado venceu
   * (3 h em edital aberto, 24 h em fechado, ou o edital mudou depois da última coleta).
   */
  app.post('/editais/:id/detalhes/atualizar', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { force } = z.object({ force: z.boolean().default(false) }).parse(request.body ?? {});
    limiter.check(`detalhes:${request.user.sub}`);
    if (!pool) return sendDatabaseUnavailable(reply);

    const edital = await withTenant(
      pool,
      authContext(request),
      async (client) =>
        (
          await client.query<{
            id_externo: string;
            fonte: string;
            coletado_em: Date | null;
            atualizado_em: Date | null;
            fechado: boolean;
          }>(
            `SELECT id_externo, fonte, detalhes_coletados_em AS coletado_em,
                    data_atualizacao AS atualizado_em, ${EDITAL_FECHADO_SQL} AS fechado
               FROM editais WHERE id = $1`,
            [id],
          )
        ).rows[0],
    );
    if (!edital) return reply.code(404).send({ error: 'edital_not_found' });
    if (edital.fonte !== 'pncp') {
      return reply.code(422).send({
        error: 'fonte_sem_detalhes',
        message: 'Os detalhes automáticos só existem para editais do PNCP.',
      });
    }
    if (!force && !detalhesVencidos(edital)) {
      return reply.send({ atualizado: false, motivo: 'recente' });
    }

    try {
      const feito = await cache.exclusivo(`detalhes:${id}`, async () => {
        const detalhes = await buscarDetalhes(config, edital.id_externo, fetchImpl);
        return withTenant(
          pool,
          authContext(request),
          async (client) =>
            (
              await client.query<{ itens: number; documentos: number }>(
                'SELECT itens, documentos FROM coleta_gravar_detalhes($1, $2::jsonb, $3::jsonb)',
                [id, JSON.stringify(detalhes.itens), JSON.stringify(detalhes.documentos)],
              )
            ).rows[0],
        );
      });
      // Outra pessoa (ou outra instância) já está buscando este mesmo edital agora.
      if (feito.ocupado) return reply.send({ atualizado: false, motivo: 'em_andamento' });
      return reply.send({
        atualizado: true,
        itens: feito.valor?.itens ?? 0,
        documentos: feito.valor?.documentos ?? 0,
      });
    } catch (error) {
      if (error instanceof DetalhesError) {
        return reply.code(error.status).send({ error: error.code, message: error.message });
      }
      if (error instanceof Error && /edital_fora_do_catalogo/.test(error.message)) {
        return reply.code(422).send({
          error: 'fonte_sem_detalhes',
          message: 'Este edital não está no catálogo compartilhado.',
        });
      }
      throw error;
    }
  });
}
