import { AREA_LABELS, AREA_MENUS, AREAS, type Area, type MenuGroup } from './areas.js';

/**
 * Acessos da equipe: o que cada pessoa da equipe pode ou não abrir.
 *
 * O superadmin marca, para cada acesso criado, as funções que ficam BLOQUEADAS. Sem marcação,
 * a pessoa vê tudo o que o escopo dela permite. A lista de funções vem do próprio menu do
 * sistema (`AREA_MENUS`), então toda página nova do menu já aparece para marcar.
 *
 * O bloqueio vale na tela (menu e página) e na API, para as rotas listadas em `API_DOS_RECURSOS`.
 */

/** Páginas iniciais e de conta: ninguém fica sem entrada nem sem o próprio perfil. */
const SEMPRE_LIBERADAS = new Set(['/painel', '/admin', '/gestao', '/conta']);
/** Só o superadmin abre. Não aparece para marcar. */
export const SOMENTE_SUPERADMIN = ['/admin/equipe'] as const;

export type RecursoAcesso = { href: string; label: string; areas: Area[] };
export type PainelDeRecursos = {
  area: Area;
  titulo: string;
  grupos: { label: string; itens: { href: string; label: string }[] }[];
};

function bloqueavel(href: string): boolean {
  return !SEMPRE_LIBERADAS.has(href) && !(SOMENTE_SUPERADMIN as readonly string[]).includes(href);
}

function montar(): { recursos: RecursoAcesso[]; paineis: PainelDeRecursos[] } {
  const porHref = new Map<string, RecursoAcesso>();
  const paineis: PainelDeRecursos[] = [];
  for (const area of AREAS) {
    const grupos: PainelDeRecursos['grupos'] = [];
    for (const grupo of AREA_MENUS[area]) {
      const itens = grupo.items.filter((item) => bloqueavel(item.href));
      if (!itens.length) continue;
      grupos.push({
        label: grupo.label,
        itens: itens.map((item) => ({ href: item.href, label: item.label })),
      });
      for (const item of itens) {
        const atual = porHref.get(item.href);
        if (atual) atual.areas.push(area);
        else porHref.set(item.href, { href: item.href, label: item.label, areas: [area] });
      }
    }
    if (grupos.length) paineis.push({ area, titulo: AREA_LABELS[area], grupos });
  }
  return { recursos: [...porHref.values()], paineis };
}

const catalogo = montar();

/** Todas as funções que podem ser bloqueadas (uma por página do menu). */
export const RECURSOS_ACESSO: readonly RecursoAcesso[] = catalogo.recursos;
/** As mesmas funções, organizadas como o menu de cada painel, para a tela de marcação. */
export const PAINEIS_DE_RECURSOS: readonly PainelDeRecursos[] = catalogo.paineis;

const CHAVES = new Set(RECURSOS_ACESSO.map((recurso) => recurso.href));

/** Mantém só chaves que existem, sem repetir e em ordem estável. */
export function normalizarBloqueios(lista: readonly string[] | null | undefined): string[] {
  return [...new Set((lista ?? []).filter((chave) => CHAVES.has(chave)))].sort();
}

function combina(caminho: string, prefixo: string): boolean {
  return caminho === prefixo || caminho.startsWith(`${prefixo}/`);
}

function semBarraFinal(caminho: string): string {
  const limpo = caminho.split('?')[0]!.split('#')[0]!;
  return limpo.length > 1 ? limpo.replace(/\/+$/, '') : limpo;
}

/** Função que cobre a página: a mais específica (prefixo mais longo) do catálogo. */
export function recursoDaPagina(pathname: string): string | null {
  const caminho = semBarraFinal(pathname);
  let melhor: string | null = null;
  for (const chave of CHAVES) {
    if (combina(caminho, chave) && (!melhor || chave.length > melhor.length)) melhor = chave;
  }
  return melhor;
}

export function paginaBloqueada(
  bloqueios: readonly string[] | null | undefined,
  pathname: string,
): boolean {
  if (!bloqueios?.length) return false;
  const chave = recursoDaPagina(pathname);
  return chave !== null && bloqueios.includes(chave);
}

export function paginaSoDoSuperadmin(pathname: string): boolean {
  const caminho = semBarraFinal(pathname);
  return SOMENTE_SUPERADMIN.some((prefixo) => combina(caminho, prefixo));
}

/** Tira do menu o que está bloqueado e os grupos que ficaram vazios. */
export function menuSemBloqueios(
  grupos: readonly MenuGroup[],
  bloqueios: readonly string[] | null | undefined,
  superadmin = true,
): MenuGroup[] {
  const fechado = new Set(bloqueios ?? []);
  return grupos
    .map((grupo) => ({
      ...grupo,
      items: grupo.items.filter(
        (item) => !fechado.has(item.href) && (superadmin || !paginaSoDoSuperadmin(item.href)),
      ),
    }))
    .filter((grupo) => grupo.items.length > 0);
}

/**
 * Rotas da API que cada função usa. Quando a mesma rota serve a mais de uma função (ex.: o
 * financeiro do Painel admin e o da mentoria), ela só é negada se TODAS as funções que a usam
 * estiverem bloqueadas, para um bloqueio não quebrar a outra tela.
 */
export const API_DOS_RECURSOS: Readonly<Record<string, readonly string[]>> = {
  '/leads': ['/admin/leads'],
  '/gestao/leads': ['/admin/leads'],
  '/admin/financeiro': ['/admin/financeiro', '/admin/cobrancas'],
  '/gestao/financeiro': ['/admin/financeiro', '/admin/cobrancas'],
  '/admin/assinantes': ['/admin/assinantes', '/admin/assinaturas'],
  '/admin/planos': ['/admin/planos'],
  '/gestao/planos': ['/admin/planos'],
  '/admin/cupons': ['/admin/cupons'],
  '/gestao/cupons': ['/admin/cupons'],
  '/admin/empresas': ['/platform/companies'],
  '/admin/colaboradores': ['/platform/colaboradores'],
  '/admin/fontes': ['/admin/coleta', '/admin/integracoes', '/operations'],
  '/admin/auditoria': ['/admin/users/audit'],
  '/gestao/alunos': ['/platform/students', '/platform/classes'],
  '/gestao/mentores': ['/platform/mentors'],
  '/gestao/materiais': ['/platform/materiais'],
  '/radar': ['/radar', '/editais'],
  '/pregoes': ['/editais'],
  '/analise': ['/analise'],
  '/precos': ['/precos'],
  '/portais': ['/portais'],
  '/buscas-salvas': ['/saved-searches'],
  '/alertas': ['/alerts', '/alert-rules', '/alert-options'],
  '/oportunidades': ['/opportunities'],
  '/agenda': ['/agenda', '/tasks'],
  '/documentos': ['/empresa/documentos'],
  '/empresas': ['/empresa/inicio', '/companies'],
  '/assinatura': ['/billing'],
  '/ana': ['/ana'],
  '/academia': ['/academy'],
  '/materiais': ['/aluno/materiais'],
  '/diagnostico': ['/aluno/diagnostico'],
  '/plano-30-dias': ['/aluno/plano'],
  '/praticar': ['/aluno/praticas'],
  '/mentoria': ['/aluno/mentoria'],
  '/encontros': ['/aluno/encontros'],
  '/certificado': ['/aluno/certificados'],
  '/mentor': ['/mentor/alunos'],
  '/mentor/devolutivas': ['/mentor/devolutivas', '/mentor/notas'],
  '/mentor/sessoes': ['/mentor/sessoes'],
  '/mentor/encontros': ['/mentor/encontros'],
};

/** A rota da API está fechada para quem tem estes bloqueios? */
export function rotaBloqueada(
  bloqueios: readonly string[] | null | undefined,
  caminho: string,
): boolean {
  if (!bloqueios?.length) return false;
  const alvo = semBarraFinal(caminho);
  const donos = Object.entries(API_DOS_RECURSOS)
    .filter(([, rotas]) => rotas.some((rota) => combina(alvo, rota)))
    .map(([chave]) => chave);
  return donos.length > 0 && donos.every((chave) => bloqueios.includes(chave));
}
