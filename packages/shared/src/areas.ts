/**
 * Áreas do produto e regras de navegação.
 *
 * Fonte única para o menu e para a guarda de páginas. O papel (`plataforma`, `admin`,
 * `aluno`, `mentor`, `colaborador`) é gravado no banco; a área é o que o usuário enxerga.
 * A equipe (`plataforma`) tem duas administrações separadas: a profissional (`administracao`)
 * e a do curso (`curso`). Quem pode abrir
 * cada área é decidido no servidor (core-api); aqui só se descreve o que cada área mostra.
 */
export const AREAS = [
  'administracao',
  'curso',
  'empresa',
  'aluno',
  'mentor',
  'colaborador',
] as const;
export type Area = (typeof AREAS)[number];

/**
 * Os dois módulos do produto. Cada um tem a sua administração, e dinheiro, leads e usuários de
 * um módulo nunca se misturam com os do outro. A Ana e a base de editais são as mesmas.
 *
 * - `curso`: alunos, mentores e a Administração do curso (área `curso`).
 * - `profissional`: empresas assinantes, colaboradores e a Administração profissional
 *   (área `administracao`), que também trabalha com as licitações.
 */
export const MODULES = ['curso', 'profissional'] as const;
export type ModuleName = (typeof MODULES)[number];

export const MODULE_LABELS: Record<ModuleName, string> = {
  curso: 'Curso e mentoria',
  profissional: 'Sistema profissional de licitações',
};

export const MODULE_AREAS: Record<ModuleName, readonly Area[]> = {
  curso: ['curso', 'aluno', 'mentor'],
  profissional: ['administracao', 'empresa', 'colaborador'],
};

export function moduleOfArea(area: Area): ModuleName {
  return MODULE_AREAS.curso.includes(area) ? 'curso' : 'profissional';
}

export const AREA_LABELS: Record<Area, string> = {
  administracao: 'Administração profissional',
  curso: 'Administração do curso',
  empresa: 'Empresa',
  aluno: 'Aluno',
  mentor: 'Mentor',
  colaborador: 'Colaborador',
};

/** `icon` é o nome de um ícone do app web (components/Icon.tsx). */
export type MenuItem = { label: string; href: string; icon: string };
export type MenuGroup = { label: string; items: readonly MenuItem[] };

const account: MenuItem = { label: 'Minha conta', href: '/conta', icon: 'user' };
const ana: MenuItem = { label: 'Ana', href: '/ana', icon: 'spark' };
const academy: MenuItem = { label: 'Academia', href: '/academia', icon: 'cap' };
const materials: MenuItem = { label: 'Materiais', href: '/materiais', icon: 'file' };
const radar: MenuItem = { label: 'Explorar licitações', href: '/radar', icon: 'search' };
const published: MenuItem = { label: 'Pregões publicados', href: '/pregoes', icon: 'globe' };
const prices: MenuItem = { label: 'Preços pagos', href: '/precos', icon: 'chart' };

/** Somente páginas que existem e funcionam. Nada de item "em breve". */
export const AREA_MENUS: Record<Area, readonly MenuGroup[]> = {
  administracao: [
    {
      label: 'Administração profissional',
      items: [
        { label: 'Visão geral', href: '/admin', icon: 'home' },
        { label: 'Leads de empresas', href: '/leads', icon: 'inbox' },
        { label: 'Fontes de dados', href: '/admin/fontes', icon: 'sync' },
        { label: 'Financeiro', href: '/admin/financeiro', icon: 'chart' },
        { label: 'Assinantes', href: '/admin/assinantes', icon: 'users' },
        { label: 'Cupons', href: '/admin/cupons', icon: 'award' },
        { label: 'Planos e preços', href: '/admin/planos', icon: 'clipboard' },
        { label: 'Auditoria', href: '/admin/auditoria', icon: 'list' },
      ],
    },
    {
      label: 'Usuários',
      items: [
        { label: 'Empresas clientes', href: '/admin/empresas', icon: 'building' },
        { label: 'Colaboradores', href: '/admin/colaboradores', icon: 'users' },
        { label: 'Equipe administrativa', href: '/admin/equipe', icon: 'shield' },
      ],
    },
    { label: 'Ferramentas', items: [radar, academy, ana] },
    { label: 'Conta', items: [account] },
  ],
  curso: [
    {
      label: 'Administração do curso',
      items: [
        { label: 'Visão geral', href: '/gestao', icon: 'home' },
        { label: 'Leads de alunos', href: '/gestao/leads', icon: 'inbox' },
        { label: 'Vendas do curso', href: '/gestao/financeiro', icon: 'chart' },
        { label: 'Cupons do curso', href: '/gestao/cupons', icon: 'award' },
        { label: 'Preço do curso', href: '/gestao/planos', icon: 'clipboard' },
      ],
    },
    {
      label: 'Alunos e ensino',
      items: [
        { label: 'Alunos e turmas', href: '/gestao/alunos', icon: 'users' },
        { label: 'Mentores', href: '/gestao/mentores', icon: 'award' },
        { label: 'Materiais', href: '/gestao/materiais', icon: 'file' },
        { label: 'Encontros ao vivo', href: '/mentor/encontros', icon: 'calendar' },
      ],
    },
    { label: 'Ferramentas', items: [academy, ana] },
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
        prices,
        { label: 'Dados da empresa', href: '/empresas', icon: 'building' },
      ],
    },
    { label: 'Aprender', items: [academy, ana] },
    {
      label: 'Conta',
      items: [{ label: 'Assinatura', href: '/assinatura', icon: 'award' }, account],
    },
  ],
  aluno: [
    {
      label: 'Meu curso',
      items: [
        { label: 'Início', href: '/painel', icon: 'home' },
        { label: 'Meu diagnóstico', href: '/diagnostico', icon: 'clipboard' },
        { label: 'Plano de 30 dias', href: '/plano-30-dias', icon: 'calendar' },
        academy,
        materials,
        { label: 'Praticar com editais', href: '/praticar', icon: 'pen' },
        { label: 'Mentoria', href: '/mentoria', icon: 'chat' },
        { label: 'Encontros ao vivo', href: '/encontros', icon: 'video' },
        { label: 'Certificado', href: '/certificado', icon: 'check' },
      ],
    },
    { label: 'Ferramentas', items: [radar, published, prices, ana] },
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
        { label: 'Encontros ao vivo', href: '/mentor/encontros', icon: 'calendar' },
        academy,
        materials,
        ana,
      ],
    },
    { label: 'Conta', items: [account] },
  ],
  colaborador: [
    {
      label: 'Operação',
      items: [
        { label: 'Início', href: '/painel', icon: 'home' },
        radar,
        { label: 'Buscas salvas', href: '/buscas-salvas', icon: 'target' },
        { label: 'Alertas', href: '/alertas', icon: 'bell' },
        { label: 'Oportunidades', href: '/oportunidades', icon: 'columns' },
        { label: 'Agenda', href: '/agenda', icon: 'calendar' },
        { label: 'Documentos', href: '/documentos', icon: 'file' },
        published,
        prices,
        { label: 'Dados da empresa', href: '/empresas', icon: 'building' },
      ],
    },
    { label: 'Apoio', items: [academy, ana] },
    { label: 'Conta', items: [account] },
  ],
};

export type PageRule = { prefix: string; areas: readonly Area[] };

const ALL: readonly Area[] = AREAS;
const WORK: readonly Area[] = ['administracao', 'empresa', 'aluno', 'colaborador'];
const COMPANY: readonly Area[] = ['administracao', 'empresa'];
/** Ferramentas de busca e acompanhamento: empresa cliente e colaborador da operação. */
const OPERATION: readonly Area[] = ['administracao', 'empresa', 'colaborador'];
const TEACHING: readonly Area[] = ['administracao', 'curso', 'mentor'];
const STUDENT: readonly Area[] = ['administracao', 'curso', 'aluno'];

/**
 * Páginas protegidas por área. A regra mais específica (prefixo mais longo) vence.
 * Página sem regra é aberta ou cuida do próprio acesso (login, convite, páginas de demonstração).
 */
export const PAGE_RULES: readonly PageRule[] = [
  { prefix: '/admin', areas: ['administracao'] },
  { prefix: '/leads', areas: ['administracao'] },
  { prefix: '/gestao', areas: ['curso'] },
  { prefix: '/mentor', areas: TEACHING },
  { prefix: '/academia/mentor', areas: TEACHING },
  { prefix: '/academia', areas: ALL },
  { prefix: '/plano-30-dias', areas: STUDENT },
  { prefix: '/praticar', areas: STUDENT },
  { prefix: '/diagnostico', areas: STUDENT },
  { prefix: '/encontros', areas: STUDENT },
  { prefix: '/materiais', areas: ['administracao', 'curso', 'aluno', 'mentor'] },
  { prefix: '/mentoria', areas: STUDENT },
  { prefix: '/certificado', areas: STUDENT },
  { prefix: '/radar', areas: WORK },
  { prefix: '/pregoes', areas: WORK },
  { prefix: '/precos', areas: WORK },
  { prefix: '/assinatura', areas: COMPANY },
  { prefix: '/oportunidades', areas: OPERATION },
  { prefix: '/agenda', areas: OPERATION },
  { prefix: '/documentos', areas: OPERATION },
  { prefix: '/buscas-salvas', areas: OPERATION },
  { prefix: '/alertas', areas: OPERATION },
  { prefix: '/empresas', areas: OPERATION },
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
