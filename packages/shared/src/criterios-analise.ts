/**
 * Critérios das análises, em texto, para a tela mostrar exatamente o que entra em cada resultado
 * ("mais fáceis", "mais lucrativas", "mais interessantes", "melhor preço") e na compatibilidade
 * do Farol. Os pesos e os limites vêm das mesmas constantes que o cálculo usa
 * (`analise.ts`), e os testes conferem que o texto continua batendo com o cálculo.
 */
import {
  DESCONTO_PADRAO_PCT,
  FAIXA_PADRAO_VALOR,
  LIMITE_EXCLUSIVO_ME_EPP,
  MIN_AMOSTRAS_HISTORICO,
  PESOS,
  type ComponenteAnalise,
  type FocoAnalise,
} from './analise.js';

const brl = (valor: number): string =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export type CriterioAnalise = {
  chave: ComponenteAnalise['chave'];
  rotulo: string;
  /** Peso na nota geral, em %. */
  peso_pct: number;
  pergunta: string;
  como_pontua: string[];
  dados: string;
};

export const CRITERIOS_ANALISE: readonly CriterioAnalise[] = [
  {
    chave: 'aderencia',
    rotulo: 'Aderência ao perfil',
    peso_pct: Math.round(PESOS.aderencia * 100),
    pergunta: 'O edital combina com o que a sua empresa vende e onde atua?',
    como_pontua: [
      'Usa a compatibilidade com o perfil do Farol (0 a 100).',
      'Sem perfil cadastrado, a aderência fica neutra (50) e a confiança da análise cai.',
    ],
    dados: 'Segmentos, itens, palavras, UFs, faixa de valor e modalidades do seu perfil.',
  },
  {
    chave: 'prazo',
    rotulo: 'Prazo',
    peso_pct: Math.round(PESOS.prazo * 100),
    pergunta: 'Dá tempo de preparar a proposta e os documentos?',
    como_pontua: [
      'De 3 a 14 dias para encerrar: nota máxima.',
      'De 15 a 30 dias: 80. Mais de 30 dias: 60.',
      'Menos de 3 dias: 55. Menos de 1 dia: 25. Já encerrado: 0.',
      'Sem data de encerramento: 40.',
    ],
    dados: 'Data de encerramento das propostas informada no PNCP.',
  },
  {
    chave: 'valor',
    rotulo: 'Valor',
    peso_pct: Math.round(PESOS.valor * 100),
    pergunta: 'O tamanho da contratação é compatível com a sua empresa?',
    como_pontua: [
      'Dentro da faixa do seu perfil: nota máxima.',
      `Sem faixa no perfil, usa uma faixa típica de pequena empresa (${brl(FAIXA_PADRAO_VALOR.min)} a ${brl(FAIXA_PADRAO_VALOR.max)}).`,
      'Fora da faixa, a nota cai quanto mais longe o valor estiver dela.',
      'Sem valor estimado: 30.',
    ],
    dados: 'Valor estimado do edital e a faixa de valor do perfil.',
  },
  {
    chave: 'facilidade',
    rotulo: 'Facilidade',
    peso_pct: Math.round(PESOS.facilidade * 100),
    pergunta: 'Quão provável é a disputa ter menos concorrência e menos exigência?',
    como_pontua: [
      'Parte de 50 pontos.',
      'Dispensa: +25. Concorrência: −10. Inexigibilidade: 10 (contratação direta).',
      `Valor até ${brl(LIMITE_EXCLUSIVO_ME_EPP)}: +20 (costuma ser exclusivo para ME/EPP; confirme no edital).`,
      'Mesmo estado da sua empresa: +10.',
      'Até 5 itens: +5. Mais de 40 itens: −10.',
    ],
    dados: 'Modalidade, valor, UF do órgão e da empresa e quantidade de itens.',
  },
  {
    chave: 'margem',
    rotulo: 'Folga de preço',
    peso_pct: Math.round(PESOS.margem * 100),
    pergunta: 'O órgão costuma fechar perto do preço estimado, sobrando margem para você?',
    como_pontua: [
      `Com histórico do órgão (pelo menos ${MIN_AMOSTRAS_HISTORICO} pregões com valor final): quanto menor o desconto que o órgão costuma conseguir, maior a nota.`,
      'Sem histórico suficiente: parte de 50.',
      'Estimado 10% ou mais acima da mediana de preços do catálogo: +15. 10% ou mais abaixo: −15.',
    ],
    dados: 'Valores homologados do órgão e mediana de preços dos mesmos itens no catálogo.',
  },
];

export type CriterioFoco = {
  foco: FocoAnalise;
  rotulo: string;
  pergunta: string;
  ordena_por: string;
  usa: string[];
  observacao: string;
};

export const CRITERIOS_FOCOS: readonly CriterioFoco[] = [
  {
    foco: 'interessantes',
    rotulo: 'Mais interessantes',
    pergunta: 'Quais valem mais o seu tempo, no conjunto?',
    ordena_por: 'Nota geral (0 a 100); empate decidido pelo lucro estimado.',
    usa: CRITERIOS_ANALISE.map((c) => `${c.rotulo} (${c.peso_pct}%)`),
    observacao: 'Soma ponderada dos cinco critérios abaixo.',
  },
  {
    foco: 'lucrativas',
    rotulo: 'Mais lucrativas',
    pergunta: 'Quais devem deixar mais dinheiro, se você ganhar?',
    ordena_por: 'Lucro estimado em R$; empate decidido pela nota geral.',
    usa: ['Valor estimado do edital', 'Desconto típico do órgão', 'Margem de lucro do seu perfil'],
    observacao: `Lucro = valor provável × margem. Valor provável = valor estimado menos o desconto típico do órgão (histórico de pelo menos ${MIN_AMOSTRAS_HISTORICO} pregões) ou, sem histórico, uma premissa de ${DESCONTO_PADRAO_PCT}%. Edital sem valor estimado fica sem lucro calculado.`,
  },
  {
    foco: 'faceis',
    rotulo: 'Mais fáceis de ganhar',
    pergunta: 'Quais tendem a ter menos concorrência e menos exigência?',
    ordena_por: 'Nota do critério Facilidade; empate decidido pela nota geral.',
    usa: ['Modalidade', 'Valor (benefício de ME/EPP)', 'Estado', 'Quantidade de itens'],
    observacao:
      'É um indicador, não uma previsão: não há dado público de quantos concorrentes vão aparecer.',
  },
  {
    foco: 'preco',
    rotulo: 'Melhor preço frente ao governo',
    pergunta: 'Onde o preço estimado deixa mais folga em relação ao que o governo paga?',
    ordena_por: 'Nota do critério Folga de preço; empate decidido pela nota geral.',
    usa: ['Histórico de valores fechados do órgão', 'Mediana de preços do catálogo'],
    observacao: 'Precisa de histórico ou de itens com preço no catálogo; sem eles a nota é neutra.',
  },
];

export type CriterioCompatibilidade = {
  chave: 'segmento' | 'uf' | 'valor' | 'itens' | 'palavras' | 'modalidade';
  rotulo: string;
  pontos: number;
  regra: string;
};

/** Compatibilidade do Farol: só entram os critérios que a pessoa preencheu no perfil. */
export const CRITERIOS_COMPATIBILIDADE: readonly CriterioCompatibilidade[] = [
  {
    chave: 'segmento',
    rotulo: 'Segmento ou nicho',
    pontos: 35,
    regra: 'O objeto do edital combina com os seus segmentos (ou nichos).',
  },
  { chave: 'uf', rotulo: 'Estado', pontos: 20, regra: 'O edital é de um estado em que você atua.' },
  {
    chave: 'valor',
    rotulo: 'Faixa de valor',
    pontos: 20,
    regra: 'O valor estimado está dentro da faixa do seu perfil.',
  },
  {
    chave: 'itens',
    rotulo: 'Produtos e serviços',
    pontos: 15,
    regra: 'O edital cita produtos ou serviços que você vende.',
  },
  {
    chave: 'palavras',
    rotulo: 'Palavras de interesse',
    pontos: 15,
    regra: 'O texto contém palavras de interesse da sua empresa.',
  },
  {
    chave: 'modalidade',
    rotulo: 'Modalidade',
    pontos: 10,
    regra: 'A modalidade é uma das que você prefere.',
  },
];

export const AVISO_CRITERIOS =
  'Estas notas ajudam a escolher onde gastar o tempo. Não são previsão de vitória nem de lucro: o preço e a decisão de participar continuam sendo seus.';
