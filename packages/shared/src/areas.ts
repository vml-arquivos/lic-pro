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
 * - `curso`: alunos, mentores e a Administração da mentoria (área `curso`).
 * - `profissional`: empresas assinantes, colaboradores e a Administração
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
  administracao: 'Painel admin',
  curso: 'Painel da mentoria',
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
const analysis: MenuItem = {
  label: 'Análise',
  href: '/analise',
  icon: 'scale',
};
const prices: MenuItem = { label: 'Preços pagos', href: '/precos', icon: 'chart' };

const home: MenuItem = { label: 'Início', href: '/painel', icon: 'home' };
const subscription: MenuItem = { label: 'Assinatura e uso', href: '/assinatura', icon: 'award' };
const savedSearches: MenuItem = { label: 'Buscas salvas', href: '/buscas-salvas', icon: 'target' };
const alerts: MenuItem = { label: 'Alertas', href: '/alertas', icon: 'bell' };
const pipeline: MenuItem = { label: 'Oportunidades', href: '/oportunidades', icon: 'columns' };
const agenda: MenuItem = { label: 'Agenda', href: '/agenda', icon: 'calendar' };
const documents: MenuItem = { label: 'Documentos', href: '/documentos', icon: 'file' };
const companyData: MenuItem = { label: 'Dados da empresa', href: '/empresas', icon: 'building' };
const liveMeetings: MenuItem = {
  label: 'Encontros ao vivo',
  href: '/mentor/encontros',
  icon: 'calendar',
};

/** Os mesmos grupos de tema para quem trabalha com licitações no dia a dia. */
const biddingGroup: MenuGroup = {
  label: 'Licitações',
  items: [radar, published, analysis, prices],
};
const trackingGroup: MenuGroup = {
  label: 'Acompanhamento',
  items: [savedSearches, alerts, pipeline, agenda],
};
const supportGroup: MenuGroup = { label: 'Aprender e apoio', items: [academy, ana] };

/**
 * Menu por área, agrupado por tema. O primeiro grupo, sem título, traz só a página inicial.
 * Somente páginas que existem e funcionam. Nada de item "em breve".
 * Cada área vê apenas o que o seu papel pode abrir; quem manda no acesso são `PAGE_RULES` e o servidor.
 */
export const AREA_MENUS: Record<Area, readonly MenuGroup[]> = {
  administracao: [
    { label: '', items: [{ label: 'Visão geral', href: '/admin', icon: 'home' }] },
    {
      label: 'Vendas e financeiro',
      items: [
        { label: 'Leads de empresas', href: '/leads', icon: 'inbox' },
        { label: 'Financeiro', href: '/admin/financeiro', icon: 'chart' },
        { label: 'Assinantes', href: '/admin/assinantes', icon: 'users' },
        { label: 'Planos e preços', href: '/admin/planos', icon: 'clipboard' },
        { label: 'Cupons', href: '/admin/cupons', icon: 'award' },
      ],
    },
    {
      label: 'Clientes e equipe',
      items: [
        { label: 'Empresas clientes', href: '/admin/empresas', icon: 'building' },
        { label: 'Colaboradores', href: '/admin/colaboradores', icon: 'users' },
        { label: 'Equipe administrativa', href: '/admin/equipe', icon: 'shield' },
      ],
    },
    biddingGroup,
    {
      label: 'Dados e controle',
      items: [
        { label: 'Fontes de dados', href: '/admin/fontes', icon: 'sync' },
        { label: 'Auditoria', href: '/admin/auditoria', icon: 'list' },
      ],
    },
    supportGroup,
    { label: 'Conta', items: [account] },
  ],
  curso: [
    { label: '', items: [{ label: 'Visão geral', href: '/gestao', icon: 'home' }] },
    {
      label: 'Vendas e financeiro',
      items: [
        { label: 'Leads de alunos', href: '/gestao/leads', icon: 'inbox' },
        { label: 'Vendas do curso', href: '/gestao/financeiro', icon: 'chart' },
        { label: 'Preço do curso', href: '/gestao/planos', icon: 'clipboard' },
        { label: 'Cupons do curso', href: '/gestao/cupons', icon: 'award' },
      ],
    },
    {
      label: 'Alunos e ensino',
      items: [
        { label: 'Alunos e turmas', href: '/gestao/alunos', icon: 'users' },
        { label: 'Mentores', href: '/gestao/mentores', icon: 'award' },
        { label: 'Materiais', href: '/gestao/materiais', icon: 'file' },
        liveMeetings,
      ],
    },
    supportGroup,
    { label: 'Conta', items: [account] },
  ],
  empresa: [
    { label: '', items: [home] },
    biddingGroup,
    trackingGroup,
    { label: 'Minha empresa', items: [companyData, documents] },
    supportGroup,
    { label: 'Conta e financeiro', items: [subscription, account] },
  ],
  aluno: [
    { label: '', items: [home] },
    {
      label: 'Aprendizado',
      items: [
        { label: 'Meu diagnóstico', href: '/diagnostico', icon: 'clipboard' },
        { label: 'Plano de 30 dias', href: '/plano-30-dias', icon: 'calendar' },
        academy,
        materials,
      ],
    },
    {
      label: 'Mentoria e prática',
      items: [
        { label: 'Praticar com editais', href: '/praticar', icon: 'pen' },
        { label: 'Mentoria', href: '/mentoria', icon: 'chat' },
        { label: 'Encontros ao vivo', href: '/encontros', icon: 'video' },
        { label: 'Certificado', href: '/certificado', icon: 'check' },
      ],
    },
    biddingGroup,
    { label: 'Apoio', items: [ana] },
    { label: 'Conta', items: [account] },
  ],
  mentor: [
    { label: '', items: [home] },
    {
      label: 'Mentoria',
      items: [
        { label: 'Meus alunos', href: '/mentor', icon: 'users' },
        { label: 'Devolutivas', href: '/mentor/devolutivas', icon: 'pen' },
        { label: 'Sessões', href: '/mentor/sessoes', icon: 'video' },
        liveMeetings,
      ],
    },
    { label: 'Conteúdo', items: [academy, materials] },
    { label: 'Apoio', items: [ana] },
    { label: 'Conta', items: [account] },
  ],
  colaborador: [
    { label: '', items: [home] },
    biddingGroup,
    trackingGroup,
    { label: 'Empresa', items: [companyData, documents] },
    supportGroup,
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
  { prefix: '/analise', areas: ['administracao', 'empresa', 'colaborador', 'aluno', 'mentor'] },
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
