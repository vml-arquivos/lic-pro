import type { Area } from './areas.js';

/**
 * Rede de especialistas: os nós de cada área (dados puros, sem interface).
 * Só entram páginas que existem e que a área pode abrir (a mesma regra do menu em areas.ts);
 * o teste `hubs.test.ts` garante isso. Ao criar uma página nova, inclua o nó aqui.
 */
export type HubTone = 'violet' | 'teal' | 'rose' | 'amber' | 'blue' | 'green' | 'slate' | 'pink';

export type HubNodeData = {
  label: string;
  caption: string;
  href: string;
  /** Nome de ícone do app web (components/Icon.tsx). */
  icon: string;
  tone: HubTone;
};

export const HUB_NODES: Record<Area, readonly HubNodeData[]> = {
  empresa: [
    {
      label: 'Radar',
      caption: 'Editais do governo',
      href: '/radar',
      icon: 'search',
      tone: 'violet',
    },
    {
      label: 'Buscas salvas',
      caption: 'Seu funil de busca',
      href: '/buscas-salvas',
      icon: 'target',
      tone: 'blue',
    },
    {
      label: 'Alertas',
      caption: 'Avisos automáticos',
      href: '/alertas',
      icon: 'bell',
      tone: 'rose',
    },
    {
      label: 'Oportunidades',
      caption: 'Pipeline de disputa',
      href: '/oportunidades',
      icon: 'columns',
      tone: 'teal',
    },
    {
      label: 'Agenda',
      caption: 'Prazos e sessões',
      href: '/agenda',
      icon: 'calendar',
      tone: 'amber',
    },
    {
      label: 'Documentos',
      caption: 'Habilitação em dia',
      href: '/documentos',
      icon: 'file',
      tone: 'green',
    },
    { label: 'Pregões', caption: 'Publicados', href: '/pregoes', icon: 'globe', tone: 'slate' },
    {
      label: 'Empresa',
      caption: 'Dados e CNPJ',
      href: '/empresas',
      icon: 'building',
      tone: 'pink',
    },
    {
      label: 'Academia',
      caption: 'Aprenda o processo',
      href: '/academia',
      icon: 'cap',
      tone: 'violet',
    },
    {
      label: 'Conversar',
      caption: 'Dúvidas com fontes',
      href: '/ana',
      icon: 'spark',
      tone: 'teal',
    },
  ],
  aluno: [
    {
      label: 'Plano de 30 dias',
      caption: 'Seu caminho guiado',
      href: '/plano-30-dias',
      icon: 'calendar',
      tone: 'violet',
    },
    { label: 'Academia', caption: 'Trilhas e aulas', href: '/academia', icon: 'cap', tone: 'blue' },
    { label: 'Praticar', caption: 'Editais reais', href: '/praticar', icon: 'pen', tone: 'rose' },
    {
      label: 'Mentoria',
      caption: 'Recados e sessões',
      href: '/mentoria',
      icon: 'chat',
      tone: 'teal',
    },
    {
      label: 'Radar',
      caption: 'Editais do governo',
      href: '/radar',
      icon: 'search',
      tone: 'amber',
    },
    { label: 'Pregões', caption: 'Publicados', href: '/pregoes', icon: 'globe', tone: 'slate' },
    {
      label: 'Certificado',
      caption: 'Conclusão do curso',
      href: '/certificado',
      icon: 'award',
      tone: 'green',
    },
    {
      label: 'Conversar',
      caption: 'Dúvidas com fontes',
      href: '/ana',
      icon: 'spark',
      tone: 'pink',
    },
  ],
  mentor: [
    {
      label: 'Meus alunos',
      caption: 'Quem precisa de você',
      href: '/mentor',
      icon: 'users',
      tone: 'violet',
    },
    {
      label: 'Devolutivas',
      caption: 'Comentários nas práticas',
      href: '/mentor/devolutivas',
      icon: 'pen',
      tone: 'rose',
    },
    {
      label: 'Sessões',
      caption: 'Encontros marcados',
      href: '/mentor/sessoes',
      icon: 'video',
      tone: 'teal',
    },
    {
      label: 'Academia',
      caption: 'Conteúdo do curso',
      href: '/academia',
      icon: 'cap',
      tone: 'blue',
    },
    { label: 'Conversar', caption: 'Apoio com fontes', href: '/ana', icon: 'spark', tone: 'pink' },
  ],
  administracao: [
    { label: 'Leads', caption: 'Contatos do site', href: '/leads', icon: 'inbox', tone: 'rose' },
    {
      label: 'Empresas',
      caption: 'Clientes e convites',
      href: '/admin/empresas',
      icon: 'building',
      tone: 'violet',
    },
    {
      label: 'Alunos e turmas',
      caption: 'Matrículas',
      href: '/admin/alunos',
      icon: 'users',
      tone: 'blue',
    },
    {
      label: 'Mentores',
      caption: 'Equipe de ensino',
      href: '/admin/mentores',
      icon: 'award',
      tone: 'amber',
    },
    {
      label: 'Fontes de dados',
      caption: 'PNCP e governo',
      href: '/admin/fontes',
      icon: 'sync',
      tone: 'teal',
    },
    {
      label: 'Auditoria',
      caption: 'Quem fez o quê',
      href: '/admin/auditoria',
      icon: 'list',
      tone: 'slate',
    },
    {
      label: 'Radar',
      caption: 'Editais do governo',
      href: '/radar',
      icon: 'search',
      tone: 'green',
    },
    {
      label: 'Academia',
      caption: 'Conteúdo do curso',
      href: '/academia',
      icon: 'cap',
      tone: 'pink',
    },
  ],
};

/**
 * Visitante (página inicial pública): vitrine do que o sistema oferece. Radar e Academia abrem
 * sem conta; os demais levam ao login e voltam para a página escolhida.
 */
const toLogin = (path: string) => `/login?next=${encodeURIComponent(path)}`;
export const HUB_VISITOR: readonly HubNodeData[] = [
  { label: 'Radar', caption: 'Editais do governo', href: '/radar', icon: 'search', tone: 'violet' },
  {
    label: 'Buscas salvas',
    caption: 'Seu funil de busca',
    href: toLogin('/buscas-salvas'),
    icon: 'target',
    tone: 'blue',
  },
  {
    label: 'Alertas',
    caption: 'Avisos automáticos',
    href: toLogin('/alertas'),
    icon: 'bell',
    tone: 'rose',
  },
  {
    label: 'Oportunidades',
    caption: 'Pipeline de disputa',
    href: toLogin('/oportunidades'),
    icon: 'columns',
    tone: 'teal',
  },
  {
    label: 'Agenda',
    caption: 'Prazos e sessões',
    href: toLogin('/agenda'),
    icon: 'calendar',
    tone: 'amber',
  },
  {
    label: 'Documentos',
    caption: 'Habilitação em dia',
    href: toLogin('/documentos'),
    icon: 'file',
    tone: 'green',
  },
  {
    label: 'Academia',
    caption: 'Aprenda o processo',
    href: '/academia',
    icon: 'cap',
    tone: 'violet',
  },
  {
    label: 'Mentoria',
    caption: 'Acompanhamento',
    href: toLogin('/mentoria'),
    icon: 'chat',
    tone: 'pink',
  },
  {
    label: 'Plano de 30 dias',
    caption: 'Caminho guiado',
    href: toLogin('/plano-30-dias'),
    icon: 'clock',
    tone: 'slate',
  },
  {
    label: 'Conversar',
    caption: 'Dúvidas com fontes',
    href: toLogin('/ana'),
    icon: 'spark',
    tone: 'teal',
  },
];

export const HUB_CTA: Record<Area, { title: string; text: string }> = {
  empresa: {
    title: 'Ana',
    text: 'Pergunte sobre um edital, um prazo ou um documento. As respostas trazem a fonte e dizem quando faltar informação.',
  },
  aluno: {
    title: 'Ana',
    text: 'Tire dúvidas do conteúdo e dos editais que você está praticando, com fontes e limites claros.',
  },
  mentor: {
    title: 'Ana',
    text: 'Apoio para explicar conceitos e conferir referências antes de devolver uma prática ao aluno.',
  },
  administracao: {
    title: 'Ana',
    text: 'Use a Ana para conferir como o sistema responde a quem está na ponta, em cada área.',
  },
};
