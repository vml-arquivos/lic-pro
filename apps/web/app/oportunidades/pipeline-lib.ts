/** Etapas do pipeline da empresa, com os nomes que a pessoa vê na tela. */
export const STATUS_LABEL: Record<string, string> = {
  salva: 'Salva',
  triagem: 'Em triagem',
  em_analise: 'Em análise',
  em_habilitacao: 'Preparando documentos',
  decidida: 'Decidida',
  proposta: 'Proposta enviada',
  ganha: 'Ganha',
  perdida: 'Perdida',
  arquivada: 'Arquivada',
};

export const STATUS_ORDER = [
  'salva',
  'triagem',
  'em_analise',
  'em_habilitacao',
  'decidida',
  'proposta',
  'ganha',
  'perdida',
  'arquivada',
] as const;

export type Column = { key: string; title: string; hint: string; statuses: readonly string[] };

export const COLUMNS: readonly Column[] = [
  {
    key: 'salvas',
    title: 'Salvas',
    hint: 'Achados no Radar para olhar depois.',
    statuses: ['salva', 'triagem'],
  },
  {
    key: 'analise',
    title: 'Analisando',
    hint: 'Lendo o edital e vendo se vale a pena.',
    statuses: ['em_analise'],
  },
  {
    key: 'documentos',
    title: 'Preparando documentos',
    hint: 'Reunindo a habilitação pedida no edital.',
    statuses: ['em_habilitacao'],
  },
  {
    key: 'decididas',
    title: 'Decididas',
    hint: 'Você escolheu participar ou não, e disse por quê.',
    statuses: ['decidida'],
  },
  {
    key: 'resultado',
    title: 'Proposta e resultado',
    hint: 'Proposta enviada, ganha, perdida ou arquivada.',
    statuses: ['proposta', 'ganha', 'perdida', 'arquivada'],
  },
];

export const DECISION_LABEL: Record<string, string> = {
  participar: 'Participar',
  nao_participar: 'Não participar',
};

export const DEADLINE_TYPES: Record<string, string> = {
  abertura_propostas: 'Abertura das propostas',
  encerramento_propostas: 'Encerramento das propostas',
  esclarecimento: 'Pedido de esclarecimento',
  impugnacao: 'Impugnação',
  entrega_documentos: 'Entrega de documentos',
  outro: 'Outro prazo',
};

export const PRIORITY_LABEL: Record<string, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

const DAY = 86_400_000;

/** Texto curto de quanto falta para um prazo, em dias corridos no horário de Brasília. */
export function dueLabel(
  value: string | null | undefined,
  now = new Date(),
): {
  text: string;
  tone: 'bad' | 'warn' | 'ok' | 'muted';
} {
  if (!value) return { text: 'sem data', tone: 'muted' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { text: 'sem data', tone: 'muted' };
  const key = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  const days = Math.round((Date.parse(key(date)) - Date.parse(key(now))) / DAY);
  if (days < 0) return { text: `atrasado há ${-days} dia(s)`, tone: 'bad' };
  if (days === 0) return { text: 'hoje', tone: 'bad' };
  if (days === 1) return { text: 'amanhã', tone: 'warn' };
  if (days <= 3) return { text: `em ${days} dias`, tone: 'warn' };
  return { text: `em ${days} dias`, tone: 'ok' };
}

export function toIso(local: string): string {
  // Campo datetime-local vem sem fuso; a pessoa pensa em horário de Brasília.
  return new Date(`${local}:00-03:00`).toISOString();
}
