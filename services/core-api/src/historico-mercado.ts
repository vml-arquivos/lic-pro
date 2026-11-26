import {
  agruparConcorrentes,
  AVISO_HISTORICO,
  compararPreco,
  documentoDoFornecedor,
  FONTES_HISTORICO,
  palavrasDoAssunto,
  similaridadeDeAssunto,
  type Concorrente,
  type ComparacaoDePreco,
  type RegistroDeCompra,
} from '@licitecomigo/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { PublicRateLimiter } from './auth-public.js';
import type { RuntimeConfig } from './config.js';
import { withTenant } from './db.js';
import {
  CacheCompartilhado,
  CarregandoError,
  prazoDaTelaMs,
  cacheLocal,
  metaCarregando,
  metaDoDado,
  type ResultadoDoCache,
} from './cache-compartilhado.js';
import { comPoliticaDeFonte } from './fonte-http.js';
import {
  DetalhesError,
  parseNumeroControle,
  resultadosDoEdital,
  type EstadoDosResultados,
} from './pncp-detalhes.js';
import {
  consultarPrecos,
  PrecosError,
  type PrecoItem,
  type PrecoStats,
  type PrecosResultado,
} from './precos.js';
import { authContext, sendDatabaseUnavailable } from './request-context.js';

/**
 * Histórico de mercado de um edital: preços pagos em outras compras e concorrentes.
 *
 * Só lê fontes públicas e oficiais, sob demanda, e nunca grava nada:
 * - PNCP `GET /v1/contratos` (contratos publicados pelo órgão do edital, com o fornecedor);
 * - PNCP resultado de item (quando a compra do próprio edital já foi encerrada);
 * - Compras.gov.br, pesquisa de preços por CATMAT (preço, fornecedor, UASG, data).
 * Cada registro volta com a origem e, quando existe, o link público. Fonte fora do ar vira aviso
 * em português; nunca se completa com número inventado.
 */

export class HistoricoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : typeof value === 'number'
      ? String(value)
      : null;

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : null;

const iso = (value: unknown): string | null => {
  const texto = str(value);
  if (!texto) return null;
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
};

const objeto = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** Link público do contrato no PNCP a partir do número de controle (`CNPJ-2-SEQ/ANO`). */
export function linkDoContrato(numeroControle: string | null): string | null {
  const achou = /^(\d{14})-\d+-(\d+)\/(\d{4})$/.exec(numeroControle ?? '');
  return achou
    ? `https://pncp.gov.br/app/contratos/${achou[1]}/${achou[3]}/${Number(achou[2])}`
    : null;
}

/** Contrato do PNCP → registro de compra fechada. Sem fornecedor identificado, descarta. */
export function normalizeContrato(raw: unknown): RegistroDeCompra | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const cnpj = documentoDoFornecedor(str(row.niFornecedor));
  const nome = str(row.nomeRazaoSocialFornecedor);
  if (!cnpj && !nome) return null;
  const orgao = objeto(row.orgaoEntidade);
  const unidade = objeto(row.unidadeOrgao);
  const valor = num(row.valorGlobal) ?? num(row.valorInicial);
  return {
    fornecedor: nome,
    cnpj,
    valor: valor !== null && valor > 0 ? valor : null,
    data: iso(row.dataAssinatura ?? row.dataVigenciaInicio ?? row.dataPublicacaoPncp),
    orgao: str(orgao.razaoSocial) ?? str(unidade.nomeUnidade),
    uf: str(unidade.ufSigla),
    objeto: str(row.objetoContrato),
    origem: 'pncp-contrato',
    link: linkDoContrato(str(row.numeroControlePNCP)),
  };
}

/** Páginas de 500 contratos lidas por órgão. Acima disso, a cobertura aparece como parcial. */
const PAGINAS_DE_CONTRATOS = 3;

const yyyymmdd = (data: Date): string => data.toISOString().slice(0, 10).replaceAll('-', '');

async function getJson(
  fetchImpl: typeof fetch,
  url: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': 'LiciteComigo/1.0' },
      signal: controller.signal,
    });
    const bruto = await response.text();
    let body: unknown = null;
    try {
      body = bruto ? JSON.parse(bruto) : null;
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch {
    throw new HistoricoError(
      502,
      'fonte_indisponivel',
      'O PNCP não respondeu agora. Tente novamente em instantes.',
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Contratos que o órgão publicou no PNCP nos últimos meses (até 3 páginas de 500). Se o PNCP
 * recusar a janela, tenta janelas menores antes de desistir.
 */
export async function buscarContratosDoOrgao(
  config: Pick<RuntimeConfig, 'pncpBaseUrl'>,
  cnpjOrgao: string,
  opcoes: { meses: number; agora?: Date },
  fetchImpl: typeof fetch = fetch,
): Promise<{
  registros: RegistroDeCompra[];
  meses: number;
  paginas: number;
  totalPaginas: number;
  /** Uma página falhou no meio: o resultado é incompleto. */
  incompleto: boolean;
}> {
  const agora = opcoes.agora ?? new Date();
  for (const meses of [...new Set([opcoes.meses, 6, 3])].filter((m) => m <= opcoes.meses)) {
    const inicio = new Date(agora.getTime() - meses * 30.4375 * 86_400_000);
    const montar = (pagina: number) =>
      `${config.pncpBaseUrl}/v1/contratos?dataInicial=${yyyymmdd(inicio)}&dataFinal=${yyyymmdd(agora)}` +
      `&cnpjOrgao=${cnpjOrgao}&pagina=${pagina}&tamanhoPagina=500`;
    const primeira = await getJson(fetchImpl, montar(1));
    if (primeira.status === 400 || primeira.status === 422) continue;
    if (primeira.status === 204 || primeira.status === 404) {
      return { registros: [], meses, paginas: 1, totalPaginas: 1, incompleto: false };
    }
    if (primeira.status >= 400) {
      throw new HistoricoError(
        502,
        'fonte_recusou',
        'O PNCP recusou a consulta de contratos do órgão. Tente mais tarde.',
      );
    }
    const lista = (corpo: unknown): { itens: unknown[]; totalPaginas: number } => {
      const dados = objeto(corpo);
      const itens = Array.isArray(corpo) ? corpo : dados.data;
      return {
        itens: Array.isArray(itens) ? itens : [],
        totalPaginas: num(dados.totalPaginas) ?? 1,
      };
    };
    const brutos: unknown[] = [];
    const inicial = lista(primeira.body);
    brutos.push(...inicial.itens);
    let paginas = 1;
    let incompleto = false;
    // As páginas seguintes saem juntas: o tempo é o da mais lenta, não a soma.
    const demais = Array.from(
      { length: Math.max(0, Math.min(inicial.totalPaginas, PAGINAS_DE_CONTRATOS) - 1) },
      (_, indice) => indice + 2,
    );
    const lidas = await Promise.all(
      demais.map(async (pagina) => {
        try {
          const proxima = await getJson(fetchImpl, montar(pagina));
          return proxima.status >= 400 ? null : lista(proxima.body).itens;
        } catch {
          return null;
        }
      }),
    );
    for (const itens of lidas) {
      if (itens === null) incompleto = true;
      else {
        paginas += 1;
        brutos.push(...itens);
      }
    }
    return {
      totalPaginas: inicial.totalPaginas,
      incompleto,
      registros: brutos
        .map(normalizeContrato)
        .filter((registro): registro is RegistroDeCompra => registro !== null),
      meses,
      paginas,
    };
  }
  throw new HistoricoError(
    502,
    'fonte_recusou',
    'O PNCP recusou a consulta de contratos do órgão. Tente mais tarde.',
  );
}

/** Preço pago (Compras.gov.br) → registro de compra fechada, para entrar na lista de concorrentes. */
export function registroDePreco(preco: PrecoItem): RegistroDeCompra | null {
  const nomeEhDocumento = preco.fornecedor ? /^[\d.\-/\s]+$/.test(preco.fornecedor) : false;
  const cnpj = documentoDoFornecedor(
    preco.cnpj_fornecedor ?? (nomeEhDocumento ? preco.fornecedor : null),
  );
  const nome = nomeEhDocumento ? null : preco.fornecedor;
  if (!cnpj && !nome) return null;
  return {
    fornecedor: nome,
    cnpj,
    valor: preco.preco,
    data: preco.data,
    orgao: preco.uasg,
    uf: preco.uf,
    objeto: preco.descricao,
    origem: 'compras-gov-preco',
    link: null,
  };
}

type Item = {
  numero: string;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario_estimado: number | null;
  catmat_catser: string | null;
};

const CATMAT = /^\d{4,9}$/;

/** Itens com CATMAT, os de maior valor total primeiro, um por código. */
export function itensParaComparar(itens: readonly Item[], limite: number): Item[] {
  const vistos = new Set<string>();
  return [...itens]
    .filter((item) => item.catmat_catser && CATMAT.test(item.catmat_catser))
    .sort(
      (a, b) =>
        (b.valor_unitario_estimado ?? 0) * (b.quantidade ?? 1) -
        (a.valor_unitario_estimado ?? 0) * (a.quantidade ?? 1),
    )
    .filter((item) => {
      if (vistos.has(item.catmat_catser!)) return false;
      vistos.add(item.catmat_catser!);
      return true;
    })
    .slice(0, limite);
}

const MESES = 12;
const MENSAGEM_CARREGANDO_PRECO = 'Buscando os preços deste item…';
const RESUMO_ITEM = (item: Item) => ({
  numero: item.numero,
  descricao: item.descricao,
  unidade: item.unidade,
  quantidade: item.quantidade,
  valor_unitario_estimado: item.valor_unitario_estimado,
  catmat: item.catmat_catser && CATMAT.test(item.catmat_catser) ? item.catmat_catser : null,
});

export type PrecoDoItem = ReturnType<typeof RESUMO_ITEM> & {
  comparacao: ComparacaoDePreco | null;
  estatistica: PrecoStats | null;
  na_uf: PrecoStats | null;
  precos_recentes: Array<
    Pick<PrecoItem, 'preco' | 'quantidade' | 'data' | 'fornecedor' | 'uasg' | 'uf'>
  >;
  extremos_removidos: number;
  motivo: string | null;
};

type Deps = {
  pool: Pool | undefined;
  config: RuntimeConfig;
  fetchImpl?: typeof fetch;
  cache?: CacheCompartilhado;
};

function statsDaUf(precos: PrecosResultado, uf: string | null): PrecoStats | null {
  if (!uf) return null;
  const daUf = precos.itens.filter((item) => item.uf?.toUpperCase() === uf.toUpperCase());
  if (daUf.length < 3) return null;
  const ordenados = daUf.map((item) => item.preco).sort((a, b) => a - b);
  const q = (fracao: number) => {
    const posicao = (ordenados.length - 1) * fracao;
    const baixo = Math.floor(posicao);
    const alto = Math.ceil(posicao);
    return ordenados[baixo]! + (ordenados[alto]! - ordenados[baixo]!) * (posicao - baixo);
  };
  const r2 = (valor: number) => Math.round(valor * 100) / 100;
  return {
    amostras: ordenados.length,
    minimo: r2(ordenados[0]!),
    maximo: r2(ordenados[ordenados.length - 1]!),
    media: r2(ordenados.reduce((total, valor) => total + valor, 0) / ordenados.length),
    mediana: r2(q(0.5)),
    p25: r2(q(0.25)),
    p75: r2(q(0.75)),
  };
}

/** O dado mais velho (e se algum está desatualizado) entre vários consultados. */
function metaDoPiorCaso(dados: ResultadoDoCache<unknown>[]) {
  const maisVelho = dados.reduce((a, b) => (a.em <= b.em ? a : b));
  return {
    ...metaDoDado(maisVelho),
    desatualizado: dados.some((dado) => dado.desatualizado),
    atualizando: dados.some((dado) => dado.atualizando),
    parcial: dados.some((dado) => dado.parcial),
  };
}

type EstadoDoBloco =
  | 'disponivel'
  | 'sem_registro'
  | 'aguardando_publicacao'
  | 'parcial'
  | 'fonte_indisponivel'
  | 'carregando'
  | 'nao_se_aplica';

const MENSAGEM_DO_ESTADO: Record<EstadoDoBloco, string> = {
  disponivel: 'Vencedores já publicados.',
  sem_registro: 'O PNCP não tem resultado registrado para este edital.',
  aguardando_publicacao: 'Ainda sem resultado publicado.',
  parcial: 'Resultado parcial.',
  fonte_indisponivel: 'A fonte não respondeu agora.',
  carregando: 'Buscando…',
  nao_se_aplica: 'Só existe para editais do PNCP.',
};

export function registerHistoricoRoutes(
  app: FastifyInstance,
  { pool, config, fetchImpl: fetchBase, cache = cacheLocal }: Deps,
): void {
  const limiter = new PublicRateLimiter(60);
  // Consulta feita com a pessoa esperando: poucas esperas entre tentativas.
  const fetchPncp = comPoliticaDeFonte(fetchBase ?? fetch, 'pncp', {
    concorrencia: 8,
    esperaMaximaMs: 4_000,
  });
  const fetchCompras = comPoliticaDeFonte(fetchBase ?? fetch, 'compras', {
    concorrencia: 4,
    esperaMaximaMs: 4_000,
  });

  /** Preços do CATMAT: um resultado por código para toda a plataforma. */
  const precosDoCatmat = (catmat: string, prazoMs: number = prazoDaTelaMs()) =>
    cache.obter<PrecosResultado>(`compras:precos:${catmat}:${MESES}`, {
      validadeMs: 6 * 3_600_000,
      retencaoMs: 7 * 86_400_000,
      servirVelhoEAtualizar: true,
      prazoMs,
      buscar: async () => ({
        valor: await consultarPrecos({ config, fetchImpl: fetchCompras }, { catmat, meses: MESES }),
      }),
    });

  /** Contratos do órgão: um resultado por órgão, usado por todos os editais dele. */
  const contratosDoOrgao = (cnpj: string, prazoMs: number = prazoDaTelaMs()) =>
    cache.obter<Awaited<ReturnType<typeof buscarContratosDoOrgao>>>(
      `pncp:contratos:${cnpj}:${MESES}`,
      {
        validadeMs: 6 * 3_600_000,
        retencaoMs: 7 * 86_400_000,
        servirVelhoEAtualizar: true,
        prazoMs,
        buscar: async () => {
          const valor = await buscarContratosDoOrgao(config, cnpj, { meses: MESES }, fetchPncp);
          return { valor, parcial: valor.incompleto };
        },
      },
    );

  const carregar = async (request: Parameters<typeof authContext>[0], id: string) => {
    if (!pool) return 'sem_banco' as const;
    return withTenant(pool, authContext(request), async (client) => {
      const edital = (
        await client.query<{
          id_externo: string;
          fonte: string;
          titulo: string;
          orgao: string | null;
          uf: string | null;
          valor_homologado: string | null;
          encerrada: boolean;
          fechado: boolean;
        }>(
          `SELECT id_externo, fonte, titulo, orgao, uf, valor_homologado,
                  (COALESCE(data_encerramento_propostas, data_encerramento_proposta) < now()) AS encerrada,
                  (valor_homologado IS NOT NULL
                     OR COALESCE(data_encerramento_propostas, data_encerramento_proposta) < now()) AS fechado
             FROM editais WHERE id = $1`,
          [id],
        )
      ).rows[0];
      if (!edital) return null;
      const itens = await client.query<Item>(
        `SELECT numero, descricao, unidade, quantidade::float8 AS quantidade,
                valor_unitario_estimado::float8 AS valor_unitario_estimado, catmat_catser
           FROM itens_edital WHERE edital_id = $1 ORDER BY numero`,
        [id],
      );
      return { edital, itens: itens.rows.slice(0, 300) };
    });
  };

  /**
   * Deixa pronto o que a tela do edital vai pedir: contratos do órgão, preços dos itens e
   * resultados. A lista do Radar chama isto para os primeiros editais que aparecem, de modo que,
   * ao abrir um deles, o dado já está guardado. Responde na hora; o trabalho corre por baixo, no
   * máximo dois por vez, e o que já está guardado não volta à fonte.
   */
  const fila: Array<() => Promise<void>> = [];
  let ativos = 0;
  const LIMITE_DA_FILA = 40;
  const andar = (): void => {
    while (ativos < 2 && fila.length) {
      const tarefa = fila.shift()!;
      ativos += 1;
      void tarefa()
        .catch(() => undefined)
        .finally(() => {
          ativos -= 1;
          andar();
        });
    }
  };
  const aquecerEdital = async (
    edital: { id_externo: string; fonte: string; fechado: boolean },
    itens: Item[],
  ): Promise<void> => {
    const chave = edital.fonte === 'pncp' ? parseNumeroControle(edital.id_externo) : null;
    const trabalhos: Array<() => Promise<unknown>> = [];
    if (chave) trabalhos.push(() => contratosDoOrgao(chave.cnpj, 0));
    for (const item of itensParaComparar(itens, 4)) {
      trabalhos.push(() => precosDoCatmat(item.catmat_catser!, 0));
    }
    if (chave && edital.fechado && itens.length) {
      trabalhos.push(() =>
        resultadosDoEdital(
          { cache, config, fetchImpl: fetchPncp },
          edital.id_externo,
          itens.map((item) => ({
            numero: item.numero,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: item.quantidade,
            valor_unitario_estimado: item.valor_unitario_estimado,
          })),
          true,
        ),
      );
    }
    for (const trabalho of trabalhos) {
      if (fila.length >= LIMITE_DA_FILA) return;
      fila.push(async () => {
        await trabalho();
      });
    }
    andar();
  };

  app.post('/editais/aquecer', async (request, reply) => {
    const { ids } = z
      .object({ ids: z.array(z.string().uuid()).min(1).max(8) })
      .parse(request.body ?? {});
    limiter.check(`aquecer:${request.user.sub}`);
    if (!pool) return reply.code(202).send({ aquecendo: 0 });
    let aquecendo = 0;
    for (const id of [...new Set(ids)]) {
      try {
        const carregado = await carregar(request, id);
        if (carregado === 'sem_banco' || !carregado) continue;
        aquecendo += 1;
        await aquecerEdital(carregado.edital, carregado.itens);
      } catch (error) {
        request.log.warn({ err: error }, 'aquecer edital falhou');
      }
    }
    return reply.code(202).send({ aquecendo });
  });

  /** Preço estimado de cada item × o que foi pago em outras compras do mesmo item (CATMAT). */
  app.get('/editais/:id/historico-precos', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    limiter.check(`historico:${request.user.sub}`);
    const carregado = await carregar(request, id);
    if (carregado === 'sem_banco') return sendDatabaseUnavailable(reply);
    if (!carregado) return reply.code(404).send({ error: 'edital_not_found' });
    const { edital, itens } = carregado;
    if (!itens.length) {
      return reply.code(409).send({
        error: 'itens_nao_coletados',
        message: 'Os itens do edital ainda não foram buscados.',
      });
    }

    const escolhidos = itensParaComparar(itens, 8);
    const porCatmat = new Map<string, PrecosResultado | string>();
    const idades: ResultadoDoCache<PrecosResultado>[] = [];
    const fila = [...new Set(escolhidos.map((item) => item.catmat_catser!))];
    let falhas = 0;
    let carregando = 0;
    const trabalhador = async (): Promise<void> => {
      for (let catmat = fila.shift(); catmat; catmat = fila.shift()) {
        try {
          const dado = await precosDoCatmat(catmat);
          idades.push(dado);
          porCatmat.set(catmat, dado.valor);
        } catch (error) {
          if (error instanceof CarregandoError) {
            carregando += 1;
            porCatmat.set(catmat, MENSAGEM_CARREGANDO_PRECO);
            continue;
          }
          falhas += 1;
          porCatmat.set(
            catmat,
            error instanceof PrecosError
              ? error.message
              : 'A consulta de preços deste item falhou. Tente novamente.',
          );
        }
      }
    };
    const total = fila.length;
    // Todos os códigos ao mesmo tempo: o limite por fonte já protege o Compras.gov.br.
    await Promise.all(Array.from({ length: Math.min(4, total) }, trabalhador));
    if (total > 0 && carregando === total) {
      return reply.code(202).send({ estado: 'carregando', dados: metaCarregando() });
    }
    if (total > 0 && falhas === total) {
      return reply.code(502).send({
        error: 'fonte_indisponivel',
        message: 'O Compras.gov.br não respondeu agora. Tente novamente em instantes.',
      });
    }

    const comparados: PrecoDoItem[] = escolhidos.map((item) => {
      const resultado = porCatmat.get(item.catmat_catser!);
      const base = RESUMO_ITEM(item);
      if (typeof resultado === 'string' || !resultado) {
        return {
          ...base,
          comparacao: null,
          estatistica: null,
          na_uf: null,
          precos_recentes: [],
          extremos_removidos: 0,
          motivo: typeof resultado === 'string' ? resultado : 'Sem resposta da fonte.',
        };
      }
      const estatistica = resultado.sem_extremos ?? resultado.todas;
      return {
        ...base,
        comparacao: compararPreco(item.valor_unitario_estimado, estatistica),
        estatistica,
        na_uf: statsDaUf(resultado, edital.uf),
        precos_recentes: resultado.itens.slice(0, 6).map((preco) => ({
          preco: preco.preco,
          quantidade: preco.quantidade,
          data: preco.data,
          fornecedor: preco.fornecedor,
          uasg: preco.uasg,
          uf: preco.uf,
        })),
        extremos_removidos: resultado.extremos_removidos,
        motivo: estatistica ? null : 'Nenhuma compra deste item nos últimos 12 meses nesta fonte.',
      };
    });
    const sem = itens
      .filter((item) => !escolhidos.some((escolhido) => escolhido.numero === item.numero))
      .map((item) => ({
        ...RESUMO_ITEM(item),
        motivo:
          item.catmat_catser && CATMAT.test(item.catmat_catser)
            ? 'Fora dos 8 itens de maior valor comparados.'
            : 'Sem código CATMAT no edital: não dá para comparar com precisão.',
      }));
    const value = {
      itens: comparados,
      nao_comparados: sem.slice(0, 40),
      resumo: {
        itens_total: itens.length,
        comparados: comparados.filter((item) => item.estatistica).length,
        acima_da_faixa: comparados.filter(
          (item) =>
            item.comparacao?.posicao === 'acima_da_faixa' ||
            item.comparacao?.posicao === 'acima_do_maximo',
        ).length,
        abaixo_da_faixa: comparados.filter(
          (item) =>
            item.comparacao?.posicao === 'abaixo_da_faixa' ||
            item.comparacao?.posicao === 'abaixo_do_minimo',
        ).length,
      },
      periodo_meses: MESES,
      uf: edital.uf,
      aviso: AVISO_HISTORICO,
      estado:
        falhas > 0 || carregando > 0
          ? 'parcial'
          : escolhidos.length
            ? 'completo'
            : 'sem_itens_comparaveis',
      cobertura: {
        itens_total: itens.length,
        itens_comparaveis: escolhidos.length,
        limite: 8,
        codigos_consultados: total,
        codigos_com_falha: falhas,
      },
      dados: idades.length
        ? {
            ...metaDoPiorCaso(idades),
            atualizando: carregando > 0 || metaDoPiorCaso(idades).atualizando,
          }
        : carregando > 0
          ? metaCarregando()
          : null,
      fonte: {
        ...FONTES_HISTORICO[2],
        consultado_em: idades.length
          ? new Date(Math.min(...idades.map((dado) => dado.em))).toISOString()
          : new Date().toISOString(),
      },
    };
    return reply.send(value);
  });

  /** Quem costuma vencer compras como esta: neste edital (se já fechou), no órgão e nos itens. */
  app.get('/editais/:id/concorrentes', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    limiter.check(`concorrentes:${request.user.sub}`);
    const carregado = await carregar(request, id);
    if (carregado === 'sem_banco') return sendDatabaseUnavailable(reply);
    if (!carregado) return reply.code(404).send({ error: 'edital_not_found' });
    const { edital, itens } = carregado;

    const avisos: string[] = [];
    const dadosUsados: ResultadoDoCache<unknown>[] = [];
    const chave = edital.fonte === 'pncp' ? parseNumeroControle(edital.id_externo) : null;
    const palavrasDoEdital = palavrasDoAssunto(
      [edital.titulo, ...itens.slice(0, 40).map((item) => item.descricao)].join(' '),
    );

    // As três fontes são independentes: consulta ao mesmo tempo.
    const [resultadoDoEdital, contratos, porItem] = await Promise.all([
      // 1) Quem ganhou neste edital (só existe depois do resultado)
      (async () => {
        if (!chave) return { estado: 'nao_se_aplica' as EstadoDoBloco, vencedores: [] };
        if (!itens.length)
          return { estado: 'aguardando_publicacao' as EstadoDoBloco, vencedores: [] };
        try {
          const dado = await resultadosDoEdital(
            { cache, config, fetchImpl: fetchPncp },
            edital.id_externo,
            itens.map((item) => ({
              numero: item.numero,
              descricao: item.descricao,
              unidade: item.unidade,
              quantidade: item.quantidade,
              valor_unitario_estimado: item.valor_unitario_estimado,
            })),
            edital.fechado,
            prazoDaTelaMs(),
          );
          dadosUsados.push(dado);
          const registros: RegistroDeCompra[] = dado.valor.itens.flatMap((item) =>
            item.resultado
              ? [
                  {
                    fornecedor: item.resultado.fornecedor,
                    cnpj: documentoDoFornecedor(item.resultado.cnpj_fornecedor),
                    valor: item.resultado.valor_unitario_homologado,
                    data: item.resultado.data,
                    orgao: edital.orgao,
                    uf: edital.uf,
                    objeto: item.descricao,
                    origem: 'pncp-resultado' as const,
                    link: null,
                  },
                ]
              : [],
          );
          const mapa: Record<EstadoDosResultados, EstadoDoBloco> = {
            publicado: 'disponivel',
            parcial: 'parcial',
            aguardando_publicacao: 'aguardando_publicacao',
            sem_registro: 'sem_registro',
          };
          return {
            estado: mapa[dado.valor.estado],
            vencedores: agruparConcorrentes(registros, 20),
            cobertura: dado.valor.cobertura,
          };
        } catch (error) {
          if (error instanceof CarregandoError) {
            return { estado: 'carregando' as EstadoDoBloco, vencedores: [] };
          }
          avisos.push(
            error instanceof DetalhesError
              ? error.message
              : 'Não foi possível ler os resultados deste edital no PNCP agora.',
          );
          return { estado: 'fonte_indisponivel' as EstadoDoBloco, vencedores: [] };
        }
      })(),
      // 2) Contratos que o órgão do edital publicou (PNCP)
      (async () => {
        if (!chave) {
          if (edital.fonte !== 'pncp') {
            avisos.push('Os contratos por órgão só existem para editais do PNCP.');
          }
          return null;
        }
        try {
          const dado = await contratosDoOrgao(chave.cnpj);
          dadosUsados.push(dado);
          return dado.valor;
        } catch (error) {
          if (error instanceof CarregandoError) return 'carregando' as const;
          avisos.push(
            error instanceof HistoricoError
              ? error.message
              : 'Não foi possível ler os contratos do órgão no PNCP agora.',
          );
          return 'falhou' as const;
        }
      })(),
      // 3) Fornecedores que venderam os mesmos itens (Compras.gov.br, por CATMAT)
      (async () => {
        const catmats = itensParaComparar(itens, 4);
        const registros: RegistroDeCompra[] = [];
        let falhas = 0;
        let carregando = 0;
        await Promise.all(
          catmats.map(async (item) => {
            try {
              const dado = await precosDoCatmat(item.catmat_catser!);
              dadosUsados.push(dado);
              for (const preco of dado.valor.itens) {
                const registro = registroDePreco(preco);
                if (registro) registros.push(registro);
              }
            } catch (error) {
              if (error instanceof CarregandoError) carregando += 1;
              else falhas += 1;
            }
          }),
        );
        if (catmats.length && falhas === catmats.length) {
          avisos.push('O Compras.gov.br não respondeu agora; fornecedores por item indisponíveis.');
        }
        return { catmats, registros, falhas, carregando };
      })(),
    ]);

    const nesteEdital = {
      disponivel: resultadoDoEdital.vencedores.length > 0,
      estado: resultadoDoEdital.estado,
      motivo: MENSAGEM_DO_ESTADO[resultadoDoEdital.estado],
      vencedores: resultadoDoEdital.vencedores,
      cobertura: 'cobertura' in resultadoDoEdital ? resultadoDoEdital.cobertura : null,
    };

    let contratosAnalisados = 0;
    let mesesContratos: number = MESES;
    let doOrgao: Concorrente[] = [];
    let similares: Concorrente[] = [];
    let blocoContratos: {
      estado: EstadoDoBloco;
      paginas_lidas?: number;
      total_paginas?: number;
    } = {
      estado:
        contratos === 'carregando' ? 'carregando' : chave ? 'fonte_indisponivel' : 'nao_se_aplica',
    };
    if (contratos && contratos !== 'falhou' && contratos !== 'carregando') {
      contratosAnalisados = contratos.registros.length;
      mesesContratos = contratos.meses;
      doOrgao = agruparConcorrentes(contratos.registros, 10);
      similares = agruparConcorrentes(
        contratos.registros.filter(
          (registro) => similaridadeDeAssunto(palavrasDoEdital, registro.objeto) >= 0.5,
        ),
        10,
      );
      const parcial = contratos.incompleto || contratos.paginas < contratos.totalPaginas;
      blocoContratos = {
        estado: contratosAnalisados === 0 ? 'sem_registro' : parcial ? 'parcial' : 'disponivel',
        paginas_lidas: contratos.paginas,
        total_paginas: contratos.totalPaginas,
      };
    }

    const dosItens = agruparConcorrentes(porItem.registros, 10);
    const blocoItens = {
      estado: (!porItem.catmats.length
        ? 'sem_registro'
        : porItem.carregando > 0 && !dosItens.length
          ? 'carregando'
          : porItem.falhas === porItem.catmats.length
            ? 'fonte_indisponivel'
            : porItem.falhas > 0 || porItem.carregando > 0
              ? 'parcial'
              : dosItens.length
                ? 'disponivel'
                : 'sem_registro') as EstadoDoBloco,
      consultados: porItem.catmats.length,
      falhas: porItem.falhas,
    };

    // Ainda buscando pela primeira vez: se nada ficou pronto, a tela espera e pergunta de novo.
    const algoCarregando =
      resultadoDoEdital.estado === 'carregando' ||
      contratos === 'carregando' ||
      porItem.carregando > 0;
    const semNada =
      !nesteEdital.vencedores.length && !doOrgao.length && !similares.length && !dosItens.length;
    const nadaConsultadoNosItens =
      blocoItens.estado === 'fonte_indisponivel' || porItem.catmats.length === 0;
    const resultadoDoEditalSemResposta =
      nesteEdital.estado === 'fonte_indisponivel' ||
      nesteEdital.estado === 'nao_se_aplica' ||
      nesteEdital.estado === 'aguardando_publicacao';
    if (
      algoCarregando &&
      semNada &&
      !dadosUsados.length &&
      resultadoDoEdital.estado !== 'fonte_indisponivel' &&
      contratos !== 'falhou'
    ) {
      return reply.code(202).send({ estado: 'carregando', dados: metaCarregando() });
    }
    if (
      semNada &&
      contratos === 'falhou' &&
      nadaConsultadoNosItens &&
      resultadoDoEditalSemResposta
    ) {
      return reply.code(502).send({
        error: 'fonte_indisponivel',
        message: 'As fontes públicas não responderam agora. Tente novamente em instantes.',
      });
    }

    return reply.send({
      neste_edital: nesteEdital,
      similares,
      do_orgao: doOrgao,
      dos_itens: dosItens,
      blocos: { contratos_do_orgao: blocoContratos, fornecedores_dos_itens: blocoItens },
      contratos_analisados: contratosAnalisados,
      periodo_meses: mesesContratos,
      itens_consultados: porItem.catmats.map((item) => item.catmat_catser),
      avisos,
      aviso: AVISO_HISTORICO,
      fontes: FONTES_HISTORICO,
      dados: dadosUsados.length
        ? {
            ...metaDoPiorCaso(dadosUsados),
            atualizando: algoCarregando || metaDoPiorCaso(dadosUsados).atualizando,
          }
        : algoCarregando
          ? metaCarregando()
          : null,
      consultado_em: dadosUsados.length
        ? new Date(Math.min(...dadosUsados.map((dado) => dado.em))).toISOString()
        : new Date().toISOString(),
    });
  });
}
