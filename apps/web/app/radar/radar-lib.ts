/** Tipos e funções puras do Alerta de Licitações (sem React), para testar e reaproveitar. */
import { infoDoPortal, portalDaLicitacao } from '@licitecomigo/shared';

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
  data_abertura_proposta?: string | null;
  data_encerramento_proposta?: string | null;
  srp?: boolean | null;
  /** Itens já coletados do PNCP; nulo quando ainda não foram buscados. */
  itens_coletados?: number | null;
  sistema_origem?: string | null;
  portal_slug?: string | null;
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
export type Facets = Partial<
  Record<'uf' | 'modalidade' | 'situacao' | 'esfera' | 'sistema_origem', FacetItem[]>
>;

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

/** Mesmas opções do campo Status do PNCP. */
export const STATUS_PNCP: ReadonlyArray<readonly [string, string]> = [
  ['recebendo', 'Recebendo propostas'],
  ['julgamento', 'Em julgamento'],
  ['encerradas', 'Encerradas'],
  ['todos', 'Todos'],
];

/** Anos da contratação: do atual para trás. */
export function anosDaContratacao(ate = new Date().getFullYear()): string[] {
  return Array.from({ length: 6 }, (_, indice) => String(ate - indice));
}

export const ESTADOS: ReadonlyArray<readonly [string, string]> = [
  ['favoritas', 'Favoritas'],
  ['nao_vistas', 'Ainda não vistas'],
  ['vistas', 'Já vistas'],
  ['descartadas', 'Descartadas'],
  ['pipeline', 'No meu pipeline'],
];

/**
 * Atalhos do topo da lista: cada um é só uma combinação de ordem e filtros que já existem.
 * `exige` marca o que a conta precisa ter (perfil configurado ou local de referência).
 */
export type Atalho = {
  id: string;
  rotulo: string;
  dica: string;
  params: Record<string, string>;
  exige?: 'perfil';
};
export const ATALHOS: ReadonlyArray<Atalho> = [
  {
    id: 'melhores',
    rotulo: 'Melhores para mim',
    dica: 'Abertas, da maior para a menor compatibilidade com o seu perfil.',
    params: { situacao_prazo: 'abertas', ordem: 'compat' },
    exige: 'perfil',
  },
  {
    id: 'encerram',
    rotulo: 'Encerram logo',
    dica: 'Abertas, com o prazo mais próximo primeiro.',
    params: { situacao_prazo: 'abertas', ordem: 'encerram' },
  },
  {
    id: 'valor',
    rotulo: 'Maior valor',
    dica: 'Abertas, dos maiores valores estimados para os menores.',
    params: { situacao_prazo: 'abertas', ordem: 'valor' },
  },
  {
    id: 'recentes',
    rotulo: 'Mais recentes',
    dica: 'Abertas, as últimas publicadas no PNCP.',
    params: { situacao_prazo: 'abertas', ordem: 'recentes' },
  },
  {
    id: 'srp',
    rotulo: 'Registro de preços',
    dica: 'Abertas em registro de preços (SRP): costumam ter vários itens e mais de uma chance.',
    params: { situacao_prazo: 'abertas', srp: 'true', ordem: 'recentes' },
  },
];

/** Atalho ativo: todos os parâmetros dele estão na busca atual. */
export function atalhoAtivo(params: URLSearchParams): string | null {
  for (const atalho of ATALHOS) {
    if (Object.entries(atalho.params).every(([chave, valor]) => params.get(chave) === valor)) {
      // "Mais recentes" é a ordem padrão: só conta se o prazo também estiver marcado e sem SRP.
      if (atalho.id === 'recentes' && params.get('srp')) continue;
      return atalho.id;
    }
  }
  return null;
}

/** Aplica um atalho sobre a busca atual, mantendo os demais filtros e limpando os que ele define. */
export function aplicarAtalho(params: URLSearchParams, atalho: Atalho): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('page');
  for (const chave of ['ordem', 'situacao_prazo', 'srp', 'status']) next.delete(chave);
  for (const [chave, valor] of Object.entries(atalho.params)) next.set(chave, valor);
  return next;
}

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
  sistema_origem: 'Portal',
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
  const multi = new Set(['nicho', 'situacao_tipo', 'segmento', 'item', 'portal']);
  const csv = new Set(['uf']);
  const csvValues: Record<string, string[]> = {};
  form.forEach((raw, key) => {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return;
    if (key === 'perto') return;
    if (key === 'status' && value === 'todos') return;
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

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Edital escolhido para comparar (guardado na sessão para a tela de Análise abrir já com ele). */
export type EscolhidoParaComparar = { id: string; titulo: string };
export const COMPARAR_CHAVE = 'licite:comparar';
export const COMPARAR_MAX = 4;

export function lerEscolhidos(): EscolhidoParaComparar[] {
  try {
    const raw = window.sessionStorage.getItem(COMPARAR_CHAVE);
    const lista = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(lista)) return [];
    return lista
      .filter(
        (item): item is EscolhidoParaComparar =>
          !!item && typeof item.id === 'string' && typeof item.titulo === 'string',
      )
      .slice(0, COMPARAR_MAX);
  } catch {
    return [];
  }
}

export function gravarEscolhidos(lista: EscolhidoParaComparar[]): void {
  try {
    window.sessionStorage.setItem(COMPARAR_CHAVE, JSON.stringify(lista.slice(0, COMPARAR_MAX)));
  } catch {
    // sem armazenamento: a escolha vale só enquanto a página está aberta
  }
}

/** Parâmetros da busca atual do Alerta de Licitações, prontos para o Ranking da Análise (mesmos filtros). */
export function paramsParaRanking(efetivos: URLSearchParams, semPerfil: boolean): URLSearchParams {
  const next = new URLSearchParams(efetivos);
  for (const chave of ['page', 'page_size', 'ordem', 'facetas', 'foco', 'limite']) {
    next.delete(chave);
  }
  if (!next.get('situacao_prazo') && !next.get('status')) next.set('situacao_prazo', 'abertas');
  if (semPerfil) next.set('usar_perfil', 'false');
  next.set('limite', '100');
  next.set('foco', 'interessantes');
  return next;
}

/** Portal de onde vem a licitação (nome do PNCP; sem ele, deduz pelo endereço do link de origem). */
export function portalDoEdital(
  item: Pick<Tender, 'sistema_origem' | 'url_origem' | 'titulo'>,
): { nome: string; slug: string; site: string | null } | null {
  const portal = portalDaLicitacao({
    usuario: item.sistema_origem,
    link: item.url_origem,
    objeto: item.titulo,
  });
  if (!portal) return null;
  return { nome: portal.nome, slug: portal.slug, site: infoDoPortal(portal.slug)?.site ?? null };
}
