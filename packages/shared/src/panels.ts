import { flatMenu, pageAreas, type Area } from './areas.js';

/**
 * Painéis com endereço próprio.
 *
 * Cada painel (Administração, Empresa, Aluno e, se quiser, Mentor) pode ter o seu domínio ou
 * subdomínio. O mesmo aplicativo responde por todos, mas em cada endereço só abre o que é
 * daquele painel, e a sessão (cookie sem `Domain`) não passa de um endereço para o outro.
 *
 * Tudo é opcional: sem nenhuma variável `PANEL_URL_*` o sistema se comporta como antes.
 */
export type PanelEntry = { url: string; host: string };
export type PanelMap = Partial<Record<Area, PanelEntry>>;

type Env = Record<string, string | undefined>;

const ENV_KEYS: Record<Area, string> = {
  administracao: 'PANEL_URL_ADMIN',
  empresa: 'PANEL_URL_EMPRESA',
  aluno: 'PANEL_URL_ALUNO',
  mentor: 'PANEL_URL_MENTOR',
  colaborador: 'PANEL_URL_COLABORADOR',
};

export function normalizeHost(value: string | null | undefined): string {
  return (value ?? '').split(',')[0]!.trim().toLowerCase();
}

/** Lê as variáveis `PANEL_URL_*`. Valor inválido é ignorado (o painel fica sem endereço próprio). */
export function parsePanels(env: Env): PanelMap {
  const panels: PanelMap = {};
  for (const [area, key] of Object.entries(ENV_KEYS) as [Area, string][]) {
    const raw = env[key]?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      panels[area] = { url: url.origin, host: normalizeHost(url.host) };
    } catch {
      // endereço inválido: ignora
    }
  }
  return panels;
}

export function panelsConfigured(panels: PanelMap): boolean {
  return Object.keys(panels).length > 0;
}

/** Painel que responde por este endereço, ou `null` (sondas internas, endereço desconhecido). */
export function panelForHost(panels: PanelMap, host: string | null | undefined): Area | null {
  const wanted = normalizeHost(host);
  if (!wanted) return null;
  for (const area of Object.keys(panels) as Area[]) {
    if (panels[area]?.host === wanted) return area;
  }
  return null;
}

/**
 * Áreas que um painel abre. Sem endereço de Mentor, o mentor usa o painel do Aluno; sem
 * endereço de Colaborador, o colaborador usa o painel da Administração.
 */
export function areasForPanel(panels: PanelMap, panel: Area): readonly Area[] {
  if (panel === 'aluno' && !panels.mentor) return ['aluno', 'mentor'];
  if (panel === 'administracao' && !panels.colaborador) return ['administracao', 'colaborador'];
  return [panel];
}

/** Área própria de cada papel do banco. */
export function areaOfRole(role: string): Area {
  switch (role) {
    case 'plataforma':
      return 'administracao';
    case 'admin':
    case 'operador':
      return 'empresa';
    case 'mentor':
      return 'mentor';
    case 'colaborador':
      return 'colaborador';
    default:
      return 'aluno';
  }
}

/**
 * Quem pode entrar em um painel. A equipe (papel `plataforma`) entra em qualquer um, para dar
 * suporte e testar, mas sempre pela porta daquele painel e vendo só o que ele mostra.
 * Empresa, aluno e mentor só entram no painel da própria área.
 */
export function roleAllowedOnPanel(panels: PanelMap, panel: Area, role: string): boolean {
  if (role === 'plataforma') return true;
  return areasForPanel(panels, panel).includes(areaOfRole(role));
}

/** Endereço do painel de uma área, quando configurado. */
export function panelUrl(panels: PanelMap, area: Area): string | null {
  if (area === 'mentor' && !panels.mentor) return panels.aluno?.url ?? null;
  if (area === 'colaborador' && !panels.colaborador) return panels.administracao?.url ?? null;
  return panels[area]?.url ?? null;
}

/** Endereço do painel certo para um papel. */
export function panelUrlForRole(panels: PanelMap, role: string): string | null {
  return panelUrl(panels, areaOfRole(role));
}

const OPEN_EVERYWHERE = [
  '/login',
  '/convite',
  '/password-recovery',
  '/password-reset',
  '/verify-email',
  '/health',
  '/ready',
] as const;

/** Páginas sem regra de área que pertencem a um único painel. */
const PANEL_ONLY: readonly { prefix: string; panels: readonly Area[] }[] = [
  { prefix: '/curso', panels: ['aluno'] },
  { prefix: '/compra', panels: ['aluno'] },
  { prefix: '/mentorado', panels: ['aluno'] },
  { prefix: '/signup', panels: ['empresa'] },
  { prefix: '/cancelar-alertas', panels: ['empresa'] },
  { prefix: '/edital', panels: ['empresa'] },
  { prefix: '/precificacao', panels: ['empresa'] },
  { prefix: '/aprovacoes', panels: ['empresa'] },
  { prefix: '/automacoes', panels: ['empresa'] },
  { prefix: '/mercado', panels: ['empresa'] },
  { prefix: '/oportunidade', panels: ['empresa'] },
  { prefix: '/fornecedores', panels: ['empresa'] },
  { prefix: '/jornada', panels: ['empresa'] },
  { prefix: '/profissional', panels: ['empresa'] },
  { prefix: '/workspace', panels: ['empresa'] },
  { prefix: '/dashboard', panels: ['empresa'] },
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function menuPrefixes(area: Area): string[] {
  const extras = area === 'administracao' ? [] : ['/painel', '/onboarding'];
  return [...flatMenu(area).map((item) => item.href), '/conta', ...extras];
}

/**
 * Um painel só abre as páginas do próprio menu (e as de entrada). Caminho desconhecido nunca
 * é aberto: a página simplesmente não existe naquele endereço.
 */
export function panelPathAllowed(panels: PanelMap, panel: Area, pathname: string): boolean {
  if (OPEN_EVERYWHERE.some((prefix) => matches(pathname, prefix))) return true;
  if (pathname === '/') return true;
  const only = PANEL_ONLY.find((entry) => matches(pathname, entry.prefix));
  if (only) return only.panels.includes(panel);
  const required = pageAreas(pathname);
  if (!required) return false;
  const areas = areasForPanel(panels, panel);
  if (!required.some((area) => areas.includes(area))) return false;
  return areas.some((area) => menuPrefixes(area).some((prefix) => matches(pathname, prefix)));
}

/** Páginas que qualquer visitante pode abrir em um painel (o resto exige sessão). */
export function panelPathPublic(panel: Area, pathname: string): boolean {
  if (OPEN_EVERYWHERE.some((prefix) => matches(pathname, prefix))) return true;
  if (panel === 'administracao') return false;
  return ['/radar', '/academia', '/curso', '/compra', '/signup', '/cancelar-alertas'].some(
    (prefix) => matches(pathname, prefix),
  );
}

/** Rotas da API que só existem no painel da Administração. */
const ADMIN_API_PREFIXES = ['/admin', '/platform', '/operations'] as const;

export function panelApiAllowed(panel: Area, apiPath: string): boolean {
  if (panel === 'administracao') return true;
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return !ADMIN_API_PREFIXES.some((prefix) => matches(path, prefix));
}

/** Nome de cada painel, usado no título da página e na tela de entrada. */
export const PANEL_COPY: Record<Area, { title: string }> = {
  administracao: { title: 'Administração' },
  empresa: { title: 'Empresas' },
  aluno: { title: 'Alunos' },
  mentor: { title: 'Mentores' },
  colaborador: { title: 'Colaboradores' },
};
