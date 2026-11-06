import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RuntimeConfig } from './config.js';

/**
 * Preços de referência a partir do Compras.gov.br (Dados Abertos, pesquisa de preços de material).
 *
 * Consulta sob demanda, sem guardar nada no banco. A API pública do Compras.gov.br já mudou a
 * assinatura da rota sem versionar, por isso:
 * - tenta a assinatura atual (`tipo` + `codigo`) e, se recusada, a antiga (`codigoItemCatalogo`);
 * - lê os campos de forma tolerante (nomes alternativos);
 * - qualquer falha vira uma mensagem clara, nunca um número inventado.
 * Os números são apoio à pesquisa de preços. A metodologia de preço de referência continua
 * sendo decisão e responsabilidade de quem elabora a proposta ou a pesquisa.
 */

export type PrecoItem = {
  preco: number;
  quantidade: number | null;
  data: string | null;
  fornecedor: string | null;
  unidade: string | null;
  uasg: string | null;
  uf: string | null;
  municipio: string | null;
  descricao: string | null;
};

export type PrecoStats = {
  amostras: number;
  minimo: number;
  maximo: number;
  media: number;
  mediana: number;
  p25: number;
  p75: number;
};

export type PrecosResultado = {
  catmat: string;
  descricao: string | null;
  periodo_meses: number;
  uf: string | null;
  todas: PrecoStats | null;
  sem_extremos: PrecoStats | null;
  extremos_removidos: number;
  itens: PrecoItem[];
  fonte: { nome: string; consultado_em: string; paginas: number };
};

export class PrecosError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    const plain = Number(value);
    if (Number.isFinite(plain)) return plain;
  }
  return null;
}

function text(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizePreco(raw: unknown): PrecoItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const preco = num(
    row.precoUnitario ?? row.valorUnitario ?? row.vlUnitario ?? row.valorUnitarioResultado,
  );
  if (preco === null || preco <= 0) return null;
  return {
    preco,
    quantidade: num(row.quantidade ?? row.quantidadeItem),
    data: isoDate(
      row.dataCompra ?? row.dataResultado ?? row.dataHoraAtualizacao ?? row.dataPublicacao,
    ),
    fornecedor: text(row.nomeFornecedor, row.nomeRazaoSocialFornecedor, row.niFornecedor),
    unidade: text(
      row.siglaUnidadeFornecimento,
      row.nomeUnidadeFornecimento,
      row.unidadeFornecimento,
    ),
    uasg: text(row.nomeUasg, row.codigoUasg, row.uasg),
    uf: text(row.estado, row.ufSigla, row.uf, row.siglaUf),
    municipio: text(row.municipio, row.nomeMunicipio),
    descricao: text(row.descricaoItem, row.descricao, row.descricaoMaterial),
  };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function statsOf(values: number[]): PrecoStats | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    amostras: sorted.length,
    minimo: round2(sorted[0]!),
    maximo: round2(sorted[sorted.length - 1]!),
    media: round2(sum / sorted.length),
    mediana: round2(quantile(sorted, 0.5)),
    p25: round2(quantile(sorted, 0.25)),
    p75: round2(quantile(sorted, 0.75)),
  };
}

/** Remove valores fora de [Q1 − 1,5·IQR, Q3 + 1,5·IQR]. Poucas amostras: não remove nada. */
export function withoutExtremes(values: number[]): { kept: number[]; removed: number } {
  if (values.length < 8) return { kept: values, removed: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const kept = sorted.filter((value) => value >= q1 - 1.5 * iqr && value <= q3 + 1.5 * iqr);
  return { kept, removed: sorted.length - kept.length };
}

type Deps = {
  config: Pick<RuntimeConfig, 'comprasBaseUrl'>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

async function getJson(
  fetchImpl: typeof fetch,
  url: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': 'LiciteComigo/1.0' },
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch {
    throw new PrecosError(
      502,
      'fonte_indisponivel',
      'O Compras.gov.br não respondeu agora. Tente novamente em alguns minutos.',
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function consultarPrecos(
  deps: Deps,
  input: { catmat: string; uf?: string | undefined; meses: number },
): Promise<PrecosResultado> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = (deps.now ?? (() => new Date()))();
  const base = `${deps.config.comprasBaseUrl}/modulo-pesquisa-preco/1_consultarMaterial`;
  const attempts = [
    (page: number) =>
      `${base}?pagina=${page}&tamanhoPagina=100&tipo=codigoItemCatalogo&codigo=${encodeURIComponent(input.catmat)}`,
    (page: number) =>
      `${base}?pagina=${page}&tamanhoPagina=100&codigoItemCatalogo=${encodeURIComponent(input.catmat)}`,
  ];

  let build = attempts[0]!;
  let first = await getJson(fetchImpl, build(1));
  if (first.status === 400 || first.status === 404 || first.status === 422) {
    build = attempts[1]!;
    first = await getJson(fetchImpl, build(1));
  }
  if (first.status === 429) {
    throw new PrecosError(
      502,
      'fonte_limitada',
      'O Compras.gov.br pediu para aguardar. Tente em instantes.',
    );
  }
  if (first.status >= 400) {
    throw new PrecosError(
      502,
      'fonte_recusou',
      'O Compras.gov.br recusou a consulta para este código. Confira o CATMAT.',
    );
  }

  const rows: unknown[] = [];
  let pages = 1;
  const pick = (body: unknown): { items: unknown[]; totalPages: number } => {
    const object = (body ?? {}) as Record<string, unknown>;
    const list = object.resultado ?? object.data ?? object.itens ?? [];
    return {
      items: Array.isArray(list) ? list : [],
      totalPages: num(object.totalPaginas) ?? 1,
    };
  };
  const firstPage = pick(first.body);
  rows.push(...firstPage.items);
  for (let page = 2; page <= Math.min(firstPage.totalPages, 3); page += 1) {
    const next = await getJson(fetchImpl, build(page));
    if (next.status >= 400) break;
    pages += 1;
    rows.push(...pick(next.body).items);
  }

  const since = new Date(now.getTime() - input.meses * 30.4375 * 86_400_000);
  const itens = rows
    .map(normalizePreco)
    .filter((item): item is PrecoItem => item !== null)
    .filter((item) => !item.data || new Date(item.data) >= since)
    .filter((item) => !input.uf || !item.uf || item.uf.toUpperCase() === input.uf.toUpperCase());

  const values = itens.map((item) => item.preco);
  const { kept, removed } = withoutExtremes(values);
  return {
    catmat: input.catmat,
    descricao: itens.find((item) => item.descricao)?.descricao ?? null,
    periodo_meses: input.meses,
    uf: input.uf ?? null,
    todas: statsOf(values),
    sem_extremos: statsOf(kept),
    extremos_removidos: removed,
    itens: [...itens].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')).slice(0, 100),
    fonte: {
      nome: 'Compras.gov.br — Dados Abertos (pesquisa de preços)',
      consultado_em: now.toISOString(),
      paginas: pages,
    },
  };
}

const querySchema = z.object({
  catmat: z
    .string()
    .trim()
    .regex(/^\d{4,9}$/, 'Informe o código CATMAT (4 a 9 números).'),
  uf: z.string().trim().length(2).toUpperCase().optional(),
  meses: z.coerce.number().int().min(1).max(36).default(12),
});

export function registerPriceRoutes(app: FastifyInstance, deps: Deps): void {
  const cache = new Map<string, { at: number; value: PrecosResultado }>();
  app.get('/precos/referencia', async (request, reply) => {
    const query = querySchema.parse(request.query);
    const key = `${query.catmat}|${query.uf ?? ''}|${query.meses}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 10 * 60_000) return reply.send(hit.value);
    try {
      const value = await consultarPrecos(deps, query);
      cache.set(key, { at: Date.now(), value });
      if (cache.size > 200) cache.delete(cache.keys().next().value as string);
      return reply.send(value);
    } catch (error) {
      if (error instanceof PrecosError) {
        return reply.code(error.status).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  });
}
