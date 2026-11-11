import type { ResultadoAnalise } from '@licitecomigo/shared';

export type EditalAnalisado = {
  id: string;
  titulo: string | null;
  orgao: string | null;
  uf: string | null;
  municipio_nome: string | null;
  modalidade: string | null;
  situacao: string | null;
  srp: boolean | null;
  numero_compra: string | null;
  /** Plataforma onde a disputa acontece (ex.: BLL, Portal de Compras Públicas). */
  sistema_origem?: string | null;
  valor_estimado: string | number | null;
  data_encerramento_proposta: string | null;
  url_origem: string | null;
  compat: number | null;
  analise: ResultadoAnalise;
};

export type ItemRanking = EditalAnalisado & { posicao: number; itens: number | null };

export type RankingResposta = {
  foco: string;
  margem_pct: number;
  total_candidatos: number;
  limite_candidatos: number;
  perfil_definido: boolean;
  perfil_aplicado: {
    usado: boolean;
    ufs: string[];
    valor_min: number | null;
    valor_max: number | null;
    palavras: string[];
  };
  nichos: string[];
  itens: ItemRanking[];
  aviso: string;
};

export type ItemAmostra = {
  numero: string;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario_estimado: number | null;
};

export type EditalComparado = EditalAnalisado & {
  historico_orgao: { amostras: number; economia: number | null } | null;
  preco_vs_mediana: { itens: number; comparados: number; razao: number | null } | null;
  itens_total: number | null;
  itens_amostra: ItemAmostra[];
};

export const moeda = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      })
    : '—';
};

export const moeda2 = (value: number | null | undefined): string =>
  typeof value === 'number'
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';

export const numero = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function tomDaNota(nota: number): 'alta' | 'media' | 'baixa' {
  if (nota >= 70) return 'alta';
  if (nota >= 45) return 'media';
  return 'baixa';
}

export function prazoCurto(iso: string | null): string {
  if (!iso) return 'Sem data';
  const fim = new Date(iso).getTime();
  if (Number.isNaN(fim)) return 'Sem data';
  const dias = Math.ceil((fim - Date.now()) / 86_400_000);
  const data = new Date(iso).toLocaleDateString('pt-BR');
  if (dias < 0) return `Encerrou em ${data}`;
  if (dias === 0) return `Encerra hoje (${data})`;
  if (dias === 1) return `Encerra amanhã (${data})`;
  return `Encerra em ${dias} dias (${data})`;
}

/** Em cada edital o valor é de uma etapa diferente; só o último é dinheiro que saiu do caixa. */
export const GUIA_DE_VALORES: ReadonlyArray<readonly [string, string]> = [
  ['Estimado', 'Quanto o órgão acha que vai custar. É o teto da disputa, quando publicado.'],
  ['Lance ou proposta', 'Oferta de cada fornecedor durante a disputa.'],
  ['Homologado', 'Valor final do resultado, depois da disputa e da adjudicação.'],
  ['Ata de registro de preços', 'Preço registrado para compras futuras; pode não ser comprado.'],
  ['Contrato', 'Valor previsto no contrato assinado.'],
  ['Pagamento', 'O que o governo de fato pagou. Esta ferramenta não mostra pagamentos.'],
];

export const CRITERIOS_AJUDA: Record<string, string> = {
  aderencia: 'Quanto o edital combina com o seu perfil do Radar (UFs, palavras, faixa de valor).',
  prazo: 'Tempo que sobra para preparar a proposta. O ideal é entre 3 e 14 dias.',
  valor: 'Se o valor estimado está na faixa que a sua empresa costuma atender.',
  facilidade:
    'Sinais de menos concorrência: dispensa, valor até R$ 80 mil (comum ser exclusivo para ME/EPP), mesmo estado, poucos itens.',
  margem:
    'Folga de preço: quanto o órgão costuma fechar abaixo do estimado e como o estimado se compara à mediana do catálogo.',
};
