/** Perguntas guiadas da prática com edital real. O aluno lê o edital e responde; não há proposta. */
export const PRACTICE_QUESTIONS = [
  {
    id: 'objeto',
    pergunta: 'O que está sendo comprado ou contratado?',
    dica: 'Explique com suas palavras, em uma ou duas frases.',
  },
  {
    id: 'prazo',
    pergunta: 'Quais são os prazos que importam?',
    dica: 'Proposta, esclarecimentos, impugnação e abertura da sessão.',
  },
  {
    id: 'exigencias',
    pergunta: 'O que o edital exige de quem quer participar?',
    dica: 'Documentos de habilitação, atestados, amostras, garantias.',
  },
  {
    id: 'valor',
    pergunta: 'Qual é o valor estimado e como ele é apresentado?',
    dica: 'Valor total, valor por item, sigilo do orçamento.',
  },
  {
    id: 'risco',
    pergunta: 'Que riscos você vê para um fornecedor?',
    dica: 'Prazo de entrega, pagamento, exigências difíceis, penalidades.',
  },
  {
    id: 'decisao',
    pergunta: 'Você participaria? Por quê?',
    dica: 'Escolha sim ou não e justifique em poucas linhas.',
  },
] as const;

export type PracticeAnswers = Partial<Record<(typeof PRACTICE_QUESTIONS)[number]['id'], string>>;

/** Perguntas que precisam de resposta para enviar ao mentor. */
export const REQUIRED_FOR_SUBMIT = ['objeto', 'prazo', 'exigencias', 'risco', 'decisao'] as const;
export const MIN_ANSWER_LENGTH = 10;

export function missingAnswers(respostas: Record<string, unknown>): string[] {
  return REQUIRED_FOR_SUBMIT.filter((id) => {
    const value = respostas[id];
    return typeof value !== 'string' || value.trim().length < MIN_ANSWER_LENGTH;
  });
}
