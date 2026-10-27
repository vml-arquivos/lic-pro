/**
 * Áreas do produto e regras de navegação.
 *
 * Fonte única para o menu e para a guarda de páginas. O papel (`plataforma`, `admin`,
 * `aluno`, `mentor`) é gravado no banco; a área é o que o usuário enxerga. Quem pode abrir
 * cada área é decidido no servidor (core-api); aqui só se descreve o que cada área mostra.
 */
export const AREAS = ['administracao', 'empresa', 'aluno', 'mentor'] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABELS: Record<Area, string> = {
  administracao: 'Administração',
  empresa: 'Empresa',
  aluno: 'Aluno',
  mentor: 'Mentor',
};

/** `icon` é o nome de um ícone do app web (components/Icon.tsx). */
export type MenuItem = { label: string; href: string; icon: string };
export type MenuGroup = { label: string; items: readonly MenuItem[] };

const account: MenuItem = { label: 'Minha conta', href: '/conta', icon: 'user' };
const ana: MenuItem = { label: 'Ana', href: '/ana', icon: 'spark' };
const academy: MenuItem = { label: 'Academia', href: '/academia', icon: 'cap' };
const radar: MenuItem = { label: 'Explorar licitações', href: '/radar', icon: 'search' };
const published: MenuItem = { label: 'Pregões publicados', href: '/pregoes', icon: 'globe' };

/** Somente páginas que existem e funcionam. Nada de item "em breve". */
export const AREA_MENUS: Record<Area, readonly MenuGroup[]> = {
  administracao: [
    {
      label: 'Administração',
      items: [
        { label: 'Visão geral', href: '/admin', icon: 'home' },
        { label: 'Leads', href: '/leads', icon: 'inbox' },
        { label: 'Empresas clientes', href: '/admin/empresas', icon: 'building' },
        { label: 'Alunos e turmas', href: '/admin/alunos', icon: 'users' },
        { label: 'Mentores', href: '/admin/mentores', icon: 'award' },
        { label: 'Fontes de dados', href: '/admin/fontes', icon: 'sync' },
        { label: 'Auditoria', href: '/admin/auditoria', icon: 'list' },
      ],
    },
    { label: 'Ferramentas', items: [radar, academy, ana] },
    { label: 'Conta', items: [account] },
  ],
  empresa: [
    {
      label: 'Minha empresa',
      items: [
        { label: 'Início', href: '/painel', icon: 'home' },
        radar,
        { label: 'Buscas salvas', href: '/buscas-salvas', icon: 'target' },
        { label: 'Alertas', href: '/alertas', icon: 'bell' },
        { label: 'Oportunidades', href: '/oportunidades', icon: 'columns' },
        { label: 'Agenda', href: '/agenda', icon: 'calendar' },
        { label: 'Documentos', href: '/documentos', icon: 'file' },
        published,
        { label: 'Dados da empresa', href: '/empresas', icon: 'building' },
      ],
    },
    { label: 'Aprender', items: [academy, ana] },
    { label: 'Conta', items: [account] },
  ],
  aluno: [
    {
      label: 'Meu curso',
      items: [
        { label: 'Início', href: '/painel', icon: 'home' },
        { label: 'Plano de 30 dias', href: '/plano-30-dias', icon: 'calendar' },
        academy,
        { label: 'Praticar com editais', href: '/praticar', icon: 'pen' },
        { label: 'Mentoria', href: '/mentoria', icon: 'chat' },
        { label: 'Certificado', href: '/certificado', icon: 'check' },
      ],
    },
    { label: 'Ferramentas', items: [radar, published, ana] },
    { label: 'Conta', items: [account] },
  ],
  mentor: [
    {
      label: 'Mentoria',
      items: [
        { label: 'Início', href: '/painel', icon: 'home' },
        { label: 'Meus alunos', href: '/mentor', icon: 'users' },
        { label: 'Devolutivas', href: '/mentor/devolutivas', icon: 'pen' },
        { label: 'Sessões', href: '/mentor/sessoes', icon: 'video' },
        academy,
        ana,
      ],
    },
    { label: 'Conta', items: [account] },
  ],
};

export type PageRule = { prefix: string; areas: readonly Area[] };

const ALL: readonly Area[] = AREAS;
const WORK: readonly Area[] = ['administracao', 'empresa', 'aluno'];
const COMPANY: readonly Area[] = ['administracao', 'empresa'];
const TEACHING: readonly Area[] = ['administracao', 'mentor'];
const STUDENT: readonly Area[] = ['administracao', 'aluno'];

/**
 * Páginas protegidas por área. A regra mais específica (prefixo mais longo) vence.
 * Página sem regra é aberta ou cuida do próprio acesso (login, convite, páginas de demonstração).
 */
export const PAGE_RULES: readonly PageRule[] = [
  { prefix: '/admin', areas: ['administracao'] },
  { prefix: '/leads', areas: ['administracao'] },
  { prefix: '/mentor', areas: TEACHING },
  { prefix: '/academia/mentor', areas: TEACHING },
  { prefix: '/academia', areas: ALL },
  { prefix: '/plano-30-dias', areas: STUDENT },
  { prefix: '/praticar', areas: STUDENT },
  { prefix: '/mentoria', areas: STUDENT },
  { prefix: '/certificado', areas: STUDENT },
  { prefix: '/radar', areas: WORK },
  { prefix: '/pregoes', areas: WORK },
  { prefix: '/oportunidades', areas: COMPANY },
  { prefix: '/agenda', areas: COMPANY },
  { prefix: '/documentos', areas: COMPANY },
  { prefix: '/buscas-salvas', areas: COMPANY },
  { prefix: '/alertas', areas: COMPANY },
  { prefix: '/empresas', areas: COMPANY },
  { prefix: '/painel', areas: ALL },
  { prefix: '/ana', areas: ALL },
  { prefix: '/conta', areas: ALL },
  { prefix: '/onboarding', areas: ALL },
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Áreas que podem abrir a página, ou `null` quando a página não tem regra de área. */
export function pageAreas(pathname: string): readonly Area[] | null {
  let best: PageRule | null = null;
  for (const rule of PAGE_RULES) {
    if (matches(pathname, rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) {
      best = rule;
    }
  }
  return best ? best.areas : null;
}

/** `allowed` são as áreas que a conta pode abrir (vindas do servidor, em `/me`). */
export function canOpenPage(allowed: readonly Area[], pathname: string): boolean {
  const required = pageAreas(pathname);
  if (!required) return true;
  return required.some((area) => allowed.includes(area));
}

/** Páginas que só fazem sentido para quem tem sessão. Sem sessão, vão para o login. */
export function requiresSession(pathname: string): boolean {
  return (
    pageAreas(pathname) !== null &&
    !pathname.startsWith('/radar') &&
    !pathname.startsWith('/academia')
  );
}

export function isArea(value: unknown): value is Area {
  return typeof value === 'string' && (AREAS as readonly string[]).includes(value);
}

export function flatMenu(area: Area): MenuItem[] {
  return AREA_MENUS[area].flatMap((group) => [...group.items]);
}
