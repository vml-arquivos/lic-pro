/**
 * Modelos de checklist de habilitação. São um ponto de partida de apoio, baseados nas
 * categorias comuns da Lei 14.133/2021 (jurídica, fiscal, social e trabalhista, econômico-
 * financeira, técnica). Cada edital pode pedir mais ou menos: o usuário edita a lista depois
 * de criada e sempre confere o edital.
 */
export type ChecklistItemModel = { titulo: string; descricao?: string; obrigatorio?: boolean };
export type ChecklistModel = {
  codigo: string;
  nome: string;
  descricao: string;
  itens: ChecklistItemModel[];
};

const JURIDICA: ChecklistItemModel[] = [
  { titulo: 'Contrato social ou ato constitutivo atualizado', descricao: 'Habilitação jurídica.' },
  { titulo: 'Comprovante de inscrição no CNPJ', descricao: 'Habilitação jurídica.' },
];
const FISCAL: ChecklistItemModel[] = [
  { titulo: 'Certidão negativa de débitos federais e dívida ativa da União' },
  { titulo: 'Certificado de regularidade do FGTS (CRF)' },
  { titulo: 'Certidão negativa de débitos trabalhistas (CNDT)' },
  { titulo: 'Certidão de regularidade estadual' },
  { titulo: 'Certidão de regularidade municipal' },
];
const ECONOMICA: ChecklistItemModel[] = [
  {
    titulo: 'Balanço patrimonial do último exercício',
    descricao: 'Se o edital exigir.',
    obrigatorio: false,
  },
  { titulo: 'Certidão negativa de falência ou recuperação judicial' },
];
const TECNICA: ChecklistItemModel[] = [
  {
    titulo: 'Atestado(s) de capacidade técnica',
    descricao: 'Confira o que o edital pede.',
    obrigatorio: false,
  },
];
const DECLARACOES: ChecklistItemModel[] = [
  { titulo: 'Declaração de que não emprega menor (art. 7º, XXXIII, CF)' },
  { titulo: 'Declaração de inexistência de fato impeditivo' },
];
const PROPOSTA: ChecklistItemModel[] = [
  { titulo: 'Proposta com preço, validade e prazo de entrega conforme o edital' },
  { titulo: 'Planilha de composição de preços', obrigatorio: false },
];

export const CHECKLIST_MODELS: readonly ChecklistModel[] = [
  {
    codigo: 'pregao',
    nome: 'Pregão eletrônico',
    descricao: 'Compras e serviços comuns, disputa por lances.',
    itens: [
      {
        titulo: 'Cadastro e credenciamento no portal da disputa',
        descricao: 'Confira qual portal o edital usa.',
      },
      ...JURIDICA,
      ...FISCAL,
      ...ECONOMICA,
      ...TECNICA,
      ...DECLARACOES,
      ...PROPOSTA,
    ],
  },
  {
    codigo: 'concorrencia',
    nome: 'Concorrência',
    descricao: 'Obras, serviços especiais e compras de maior valor.',
    itens: [
      ...JURIDICA,
      ...FISCAL,
      ...ECONOMICA,
      ...TECNICA,
      ...DECLARACOES,
      ...PROPOSTA,
      { titulo: 'Garantia de proposta', descricao: 'Só se o edital exigir.', obrigatorio: false },
    ],
  },
  {
    codigo: 'dispensa',
    nome: 'Dispensa de licitação',
    descricao: 'Contratação direta, em geral com menos documentos.',
    itens: [
      ...JURIDICA,
      ...FISCAL.slice(0, 3),
      ...DECLARACOES.slice(0, 1),
      ...PROPOSTA.slice(0, 1),
    ],
  },
  {
    codigo: 'generico',
    nome: 'Checklist em branco com o essencial',
    descricao: 'Para qualquer modalidade. Edite conforme o edital.',
    itens: [...JURIDICA, ...FISCAL.slice(0, 3), ...PROPOSTA.slice(0, 1)],
  },
];

export function modelByCode(code: string): ChecklistModel | undefined {
  return CHECKLIST_MODELS.find((model) => model.codigo === code);
}

/** Modelo sugerido a partir do texto da modalidade do edital. */
export function suggestModel(modalidade: string | null | undefined): string {
  const text = (modalidade ?? '').toLowerCase();
  if (text.includes('preg')) return 'pregao';
  if (text.includes('concorr')) return 'concorrencia';
  if (text.includes('dispensa')) return 'dispensa';
  return 'generico';
}
