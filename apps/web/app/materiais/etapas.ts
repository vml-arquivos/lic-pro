/** Etapas da jornada, na ordem em que o aluno costuma precisar de cada material. */
export const ETAPAS: ReadonlyArray<readonly [string, string, string]> = [
  ['comecar', 'Começar', 'Entender o mercado e dar os primeiros passos'],
  ['oportunidades', 'Encontrar licitações', 'Achar e escolher as oportunidades certas'],
  ['documentos', 'Documentos e habilitação', 'Preparar o que o edital exige'],
  ['proposta', 'Proposta e preço', 'Montar uma proposta que se sustenta'],
  ['sessao', 'Participar da sessão', 'Lances, chat e recursos'],
  ['pos', 'Depois de ganhar', 'Contrato, entrega e nota fiscal'],
  ['assessor', 'Trabalhar como assessor', 'Atender empresários e cobrar pelo serviço'],
  ['base', 'Lei e referências', 'Texto da lei, manuais e decisões'],
];

export const TIPOS: Record<string, string> = {
  guia: 'Guia',
  checklist: 'Checklist',
  modelo: 'Modelo',
  planilha: 'Planilha',
  lista: 'Lista',
  lei: 'Lei',
  video: 'Vídeo',
  outro: 'Material',
};

export const ATUACAO: Record<string, string> = {
  fornecedor: 'Fornecedor',
  assessor: 'Assessor em licitações',
};
