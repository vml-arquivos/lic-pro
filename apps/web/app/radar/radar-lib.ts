/** Tipos e funções puras do Radar (sem React), para testar e reaproveitar. */

export type Tender = {
  id: string;
  titulo: string;
  orgao?: string | null;
  uf?: string | null;
  municipio_nome?: string | null;
  esfera?: string | null;
  modalidade?: string | null;
  situacao?: string | null;
  numero_compra?: string | null;
  valor_estimado?: number | string | null;
  data_publicacao?: string | null;
  data_encerramento_proposta?: string | null;
  sistema_origem?: string | null;
  fonte?: string;
  url_origem?: string | null;
  compat?: number | null;
  compat_detalhe?: Array<{ criterio: string; descricao: string; pontos: number; maximo: number }>;
  distancia_km?: number | string | null;
  favorito?: boolean;
  descartado?: boolean;
  visto?: boolean;
};

export type FacetItem = { valor: string; total: number };
export type Facets = Partial<Record<'uf' | 'modalidade' | 'situacao' | 'esfera', FacetItem[]>>;

export type ListResponse = {
  data: Tender[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  facetas: Facets;
};

export const PRAZOS: ReadonlyArray<readonly [string, string]> = [
  ['abertas', 'Com propostas abertas'],
  ['vencendo_hoje', 'Encerram hoje'],
  ['vencendo_3', 'Encerram em até 3 dias'],
  ['vencendo_7', 'Encerram em até 7 dias'],
  ['encerradas', 'Já encerradas'],
];

export const ESTADOS: ReadonlyArray<readonly [string, string]> = [
  ['favoritas', 'Favoritas'],
  ['nao_vistas', 'Ainda não vistas'],
  ['vistas', 'Já vistas'],
  ['descartadas', 'Descartadas'],
  ['pipeline', 'No meu pipeline'],
];

export const ORDENS: ReadonlyArray<readonly [string, string]> = [
  ['recentes', 'Mais recentes'],
  ['encerram', 'Prazo mais próximo'],
  ['valor', 'Maior valor'],
  ['compat', 'Maior compatibilidade'],
  ['proximas', 'Mais perto de mim'],
];

export const PERIODOS: ReadonlyArray<readonly [string, string]> = [
  ['publicacao', 'Publicação'],
  ['abertura', 'Abertura das propostas'],
  ['encerramento', 'Encerramento das propostas'],
  ['atualizacao', 'Última atualização'],
];

export const REGIOES: ReadonlyArray<readonly [string, string]> = [
  ['norte', 'Norte'],
  ['nordeste', 'Nordeste'],
  ['centro-oeste', 'Centro-Oeste'],
  ['sudeste', 'Sudeste'],
  ['sul', 'Sul'],
];

export const FACET_TITLES: Record<string, string> = {
  uf: 'Estado',
  modalidade: 'Modalidade',
  situacao: 'Situação',
  esfera: 'Esfera',
};

/** Facetas que aceitam vários valores separados por vírgula. */
const CSV_FACETS = new Set(['uf', 'esfera']);

/** Liga ou desliga um valor de uma faceta, devolvendo os novos parâmetros (sem página). */
export function toggleFacet(
  params: URLSearchParams,
  campo: string,
  valor: string,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('page');
  const current = next.get(campo);
  if (CSV_FACETS.has(campo)) {
    const list = current ? current.split(',').filter(Boolean) : [];
    const updated = list.includes(valor) ? list.filter((item) => item !== valor) : [...list, valor];
    if (updated.length) next.set(campo, updated.join(','));
    else next.delete(campo);
  } else if (current === valor) {
    next.delete(campo);
  } else {
    next.set(campo, valor);
  }
  return next;
}

export function isFacetActive(params: URLSearchParams, campo: string, valor: string): boolean {
  const current = params.get(campo);
  if (!current) return false;
  return CSV_FACETS.has(campo) ? current.split(',').includes(valor) : current === valor;
}

/** Transforma o formulário em parâmetros de URL, descartando campos vazios. */
export function paramsFromForm(form: FormData): URLSearchParams {
  const params = new URLSearchParams();
  const multi = new Set(['nicho', 'situacao_tipo']);
  const csv = new Set(['uf']);
  const csvValues: Record<string, string[]> = {};
  form.forEach((raw, key) => {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return;
    if (key === 'perto') return;
    if (csv.has(key)) (csvValues[key] ??= []).push(value);
    else if (multi.has(key)) params.append(key, value);
    else params.set(key, value);
  });
  for (const [key, list] of Object.entries(csvValues)) params.set(key, list.join(','));
  const near = String(form.get('perto') ?? '').trim();
  if (near) {
    const code = /\((\d{7})\)\s*$/.exec(near)?.[1];
    if (code) params.set('perto_municipio', code);
    else params.set('municipio', near);
  }
  if (!params.get('perto_municipio')) params.delete('raio_km');
  return params;
}

export function brl(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Valor não informado';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Valor não informado';
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export type Deadline = { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' };

/** Texto curto sobre o prazo das propostas, sempre comparando com `now`. */
export function deadlineInfo(iso: string | null | undefined, now: Date = new Date()): Deadline {
  if (!iso) return { label: 'Prazo não informado', tone: 'muted' };
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return { label: 'Prazo não informado', tone: 'muted' };
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return { label: 'Propostas encerradas', tone: 'muted' };
  const hours = diff / 3_600_000;
  if (hours < 24) return { label: `Encerra em ${Math.max(1, Math.floor(hours))} h`, tone: 'bad' };
  const days = Math.ceil(hours / 24);
  return { label: `Encerra em ${days} dia${days > 1 ? 's' : ''}`, tone: days <= 3 ? 'warn' : 'ok' };
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Chaves de filtro que contam como "filtro ativo" (ordem e página não contam). */
export function activeFilterCount(params: URLSearchParams): number {
  const ignored = new Set(['page', 'page_size', 'ordem', 'raio_km', 'facetas']);
  const keys = new Set<string>();
  params.forEach((_value, key) => {
    if (!ignored.has(key)) keys.add(key);
  });
  return keys.size;
}
