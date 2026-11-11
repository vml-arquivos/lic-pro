/**
 * Análise de oportunidades: nota explicável de cada edital e simulador de proposta.
 *
 * Tudo aqui é cálculo puro (sem banco, sem rede), usado pela API e pela tela, para os números
 * serem os mesmos nos dois lados. Nenhuma nota é uma previsão de vitória: são critérios
 * conhecidos, cada um com o seu motivo, para ajudar a decidir onde gastar o tempo. A decisão
 * de participar e o preço da proposta continuam sendo de quem opera.
 */

export const FOCOS_ANALISE = ['interessantes', 'lucrativas', 'faceis', 'preco'] as const;
export type FocoAnalise = (typeof FOCOS_ANALISE)[number];

export const FOCO_ROTULOS: Record<FocoAnalise, string> = {
  interessantes: 'Mais interessantes',
  lucrativas: 'Mais lucrativas',
  faceis: 'Mais fáceis de ganhar',
  preco: 'Melhor preço frente ao governo',
};

/** Fora da faixa informada no perfil, a nota de valor cai; sem perfil usa uma faixa típica de PME. */
export const FAIXA_PADRAO_VALOR = { min: 10_000, max: 500_000 } as const;
/** Limite da exclusividade para ME/EPP em itens de compra (LC 123/2006, art. 48, I). */
export const LIMITE_EXCLUSIVO_ME_EPP = 80_000;
/** Desconto assumido quando o órgão não tem histórico suficiente. */
export const DESCONTO_PADRAO_PCT = 10;
export const MIN_AMOSTRAS_HISTORICO = 3;

export type EntradaAnalise = {
  valor_estimado: number | null;
  encerra_em: string | null;
  agora: Date;
  uf: string | null;
  uf_empresa: string | null;
  modalidade: string | null;
  srp: boolean | null;
  itens: number | null;
  /** Compatibilidade (0–100) com o perfil do Radar, quando a pessoa tem perfil. */
  compat: number | null;
  perfil_valor_min: number | null;
  perfil_valor_max: number | null;
  /** Quanto o órgão costuma fechar abaixo do estimado (0–1), e em quantos pregões isso se baseia. */
  historico_orgao: { amostras: number; economia: number | null } | null;
  /** Preço estimado do edital sobre a mediana do catálogo para os mesmos itens (1 = igual). */
  preco_vs_mediana: { itens: number; razao: number | null } | null;
  margem_pct: number;
};

export type ComponenteAnalise = {
  chave: 'aderencia' | 'prazo' | 'valor' | 'facilidade' | 'margem';
  rotulo: string;
  pontos: number;
  detalhe: string;
};

export type SinalAnalise = { tipo: 'positivo' | 'atencao'; texto: string };

export type ResultadoAnalise = {
  nota: number;
  componentes: ComponenteAnalise[];
  valor_provavel: number | null;
  desconto_tipico_pct: number | null;
  desconto_base: 'historico_do_orgao' | 'premissa' | null;
  lucro_estimado: number | null;
  sinais: SinalAnalise[];
  confianca: 'alta' | 'media' | 'baixa';
};

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));
const round1 = (value: number): number => Math.round(value * 10) / 10;
const money = (value: number): number => Math.round(value * 100) / 100;
const brl = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Pesos de cada critério na nota geral ("mais interessantes"). Somam 1. */
export const PESOS: Record<ComponenteAnalise['chave'], number> = {
  aderencia: 0.25,
  prazo: 0.15,
  valor: 0.15,
  facilidade: 0.2,
  margem: 0.25,
};

function pontosPrazo(encerraEm: string | null, agora: Date): { pontos: number; detalhe: string } {
  if (!encerraEm) return { pontos: 40, detalhe: 'Sem data de encerramento informada.' };
  const fim = new Date(encerraEm).getTime();
  if (Number.isNaN(fim)) return { pontos: 40, detalhe: 'Sem data de encerramento informada.' };
  const dias = (fim - agora.getTime()) / 86_400_000;
  if (dias < 0) return { pontos: 0, detalhe: 'Prazo para propostas já encerrado.' };
  if (dias < 1)
    return { pontos: 25, detalhe: 'Encerra em menos de 1 dia: pouco tempo para preparar.' };
  if (dias < 3)
    return { pontos: 55, detalhe: `Encerra em ${Math.ceil(dias)} dia(s): prazo apertado.` };
  if (dias <= 14)
    return { pontos: 100, detalhe: `Encerra em ${Math.ceil(dias)} dias: tempo bom para preparar.` };
  if (dias <= 30) return { pontos: 80, detalhe: `Encerra em ${Math.ceil(dias)} dias.` };
  return { pontos: 60, detalhe: `Encerra em ${Math.ceil(dias)} dias: ainda longe.` };
}

function pontosValor(entrada: EntradaAnalise): { pontos: number; detalhe: string } {
  const valor = entrada.valor_estimado;
  if (valor === null || valor <= 0) return { pontos: 30, detalhe: 'Sem valor estimado informado.' };
  const temFaixa = entrada.perfil_valor_min !== null || entrada.perfil_valor_max !== null;
  const min = entrada.perfil_valor_min ?? (temFaixa ? 0 : FAIXA_PADRAO_VALOR.min);
  const max =
    entrada.perfil_valor_max ?? (temFaixa ? Number.POSITIVE_INFINITY : FAIXA_PADRAO_VALOR.max);
  const alvo = temFaixa ? 'da faixa do seu perfil' : 'de uma faixa típica de pequena empresa';
  if (valor >= min && valor <= max) {
    return { pontos: 100, detalhe: `${brl(valor)}, dentro ${alvo}.` };
  }
  const distancia = valor < min ? min / valor : valor / max;
  const pontos = clamp(100 - Math.log2(distancia) * 30);
  return {
    pontos: Math.round(pontos),
    detalhe: `${brl(valor)}, ${valor < min ? 'abaixo' : 'acima'} ${alvo}.`,
  };
}

function pontosFacilidade(entrada: EntradaAnalise): { pontos: number; detalhe: string } {
  const modalidade = (entrada.modalidade ?? '').toLowerCase();
  if (modalidade.includes('inexigibilidade')) {
    return {
      pontos: 10,
      detalhe: 'Inexigibilidade: contratação direta com fornecedor específico.',
    };
  }
  let pontos = 50;
  const motivos: string[] = [];
  if (modalidade.includes('dispensa')) {
    pontos += 25;
    motivos.push('dispensa (menos disputa)');
  } else if (modalidade.includes('concorr')) {
    pontos -= 10;
    motivos.push('concorrência (mais exigências)');
  }
  const valor = entrada.valor_estimado;
  if (valor !== null && valor > 0 && valor <= LIMITE_EXCLUSIVO_ME_EPP) {
    pontos += 20;
    motivos.push('até R$ 80 mil, comum ser exclusivo para ME/EPP (confira no edital)');
  }
  if (entrada.uf && entrada.uf_empresa && entrada.uf === entrada.uf_empresa) {
    pontos += 10;
    motivos.push('mesmo estado da empresa');
  }
  if (entrada.itens !== null && entrada.itens > 0 && entrada.itens <= 5) {
    pontos += 5;
    motivos.push('poucos itens');
  } else if (entrada.itens !== null && entrada.itens > 40) {
    pontos -= 10;
    motivos.push('muitos itens');
  }
  return {
    pontos: Math.round(clamp(pontos)),
    detalhe: motivos.length
      ? `Fatores: ${motivos.join('; ')}.`
      : 'Sem fatores a favor ou contra nos dados.',
  };
}

export function descontoTipico(entrada: EntradaAnalise): {
  pct: number;
  base: 'historico_do_orgao' | 'premissa';
} {
  const historico = entrada.historico_orgao;
  if (historico && historico.economia !== null && historico.amostras >= MIN_AMOSTRAS_HISTORICO) {
    return { pct: round1(clamp(historico.economia * 100, 0, 90)), base: 'historico_do_orgao' };
  }
  return { pct: DESCONTO_PADRAO_PCT, base: 'premissa' };
}

function pontosMargem(entrada: EntradaAnalise): {
  pontos: number;
  detalhe: string;
  sinal: boolean;
} {
  const historico = entrada.historico_orgao;
  const comHistorico =
    historico !== null &&
    historico.economia !== null &&
    historico.amostras >= MIN_AMOSTRAS_HISTORICO;
  let pontos = 50;
  const partes: string[] = [];
  if (comHistorico) {
    const economia = historico!.economia! * 100;
    pontos = clamp(100 - economia * 2.5);
    partes.push(
      `o órgão costuma fechar ${round1(economia)}% abaixo do estimado (${historico!.amostras} pregões)`,
    );
  } else {
    partes.push('sem histórico suficiente do órgão (menos de 3 pregões com valor final)');
  }
  const preco = entrada.preco_vs_mediana;
  if (preco && preco.razao !== null && preco.itens > 0) {
    if (preco.razao >= 1.1) {
      pontos += 15;
      partes.push(
        `o estimado está ${Math.round((preco.razao - 1) * 100)}% acima da mediana do catálogo`,
      );
    } else if (preco.razao <= 0.9) {
      pontos -= 15;
      partes.push(
        `o estimado está ${Math.round((1 - preco.razao) * 100)}% abaixo da mediana do catálogo`,
      );
    } else {
      partes.push('estimado próximo da mediana do catálogo');
    }
  }
  return {
    pontos: Math.round(clamp(pontos)),
    detalhe: `${partes[0]![0]!.toUpperCase()}${partes[0]!.slice(1)}${partes.length > 1 ? `; ${partes.slice(1).join('; ')}` : ''}.`,
    sinal: comHistorico || (preco?.razao ?? null) !== null,
  };
}

export function analisarOportunidade(entrada: EntradaAnalise): ResultadoAnalise {
  const aderencia =
    entrada.compat === null
      ? {
          pontos: 50,
          detalhe: 'Sem perfil no Radar: defina UFs e palavras para medir a aderência.',
        }
      : {
          pontos: Math.round(clamp(entrada.compat)),
          detalhe: `Compatibilidade de ${Math.round(entrada.compat)}% com os seus nichos e o perfil do Radar.`,
        };
  const prazo = pontosPrazo(entrada.encerra_em, entrada.agora);
  const valor = pontosValor(entrada);
  const facilidade = pontosFacilidade(entrada);
  const margem = pontosMargem(entrada);

  const componentes: ComponenteAnalise[] = [
    { chave: 'aderencia', rotulo: 'Aderência ao perfil', ...aderencia },
    { chave: 'prazo', rotulo: 'Prazo', ...prazo },
    { chave: 'valor', rotulo: 'Valor', ...valor },
    { chave: 'facilidade', rotulo: 'Facilidade', ...facilidade },
    { chave: 'margem', rotulo: 'Folga de preço', pontos: margem.pontos, detalhe: margem.detalhe },
  ];
  const nota = Math.round(
    componentes.reduce((soma, componente) => soma + componente.pontos * PESOS[componente.chave], 0),
  );

  const desconto = descontoTipico(entrada);
  const estimado = entrada.valor_estimado;
  const temValor = estimado !== null && estimado > 0;
  const valorProvavel = temValor ? money(estimado * (1 - desconto.pct / 100)) : null;
  const lucro = valorProvavel === null ? null : money(valorProvavel * (entrada.margem_pct / 100));

  const sinais: SinalAnalise[] = [];
  if (prazo.pontos === 0) sinais.push({ tipo: 'atencao', texto: 'Prazo encerrado.' });
  else if (prazo.pontos <= 25) sinais.push({ tipo: 'atencao', texto: prazo.detalhe });
  if (facilidade.pontos >= 75)
    sinais.push({ tipo: 'positivo', texto: 'Boa chance de menos concorrência.' });
  if (facilidade.pontos <= 25) sinais.push({ tipo: 'atencao', texto: facilidade.detalhe });
  if (margem.pontos >= 75)
    sinais.push({ tipo: 'positivo', texto: 'Folga de preço acima da média.' });
  if (margem.pontos <= 30)
    sinais.push({ tipo: 'atencao', texto: 'Órgão costuma fechar bem abaixo do estimado.' });
  if (entrada.compat !== null && entrada.compat >= 75)
    sinais.push({ tipo: 'positivo', texto: 'Combina bem com o seu perfil.' });
  if (!temValor)
    sinais.push({ tipo: 'atencao', texto: 'Sem valor estimado: lucro não calculado.' });
  if (entrada.srp)
    sinais.push({ tipo: 'positivo', texto: 'Registro de preços: pode gerar vários pedidos.' });

  const dadosReais =
    (entrada.compat !== null ? 1 : 0) +
    (desconto.base === 'historico_do_orgao' ? 1 : 0) +
    ((entrada.preco_vs_mediana?.razao ?? null) !== null ? 1 : 0) +
    (temValor ? 1 : 0);
  const confianca = dadosReais >= 4 ? 'alta' : dadosReais >= 2 ? 'media' : 'baixa';

  return {
    nota,
    componentes,
    valor_provavel: valorProvavel,
    desconto_tipico_pct: temValor ? desconto.pct : null,
    desconto_base: temValor ? desconto.base : null,
    lucro_estimado: lucro,
    sinais,
    confianca,
  };
}

/** Valor usado para ordenar conforme o foco escolhido (maior primeiro). */
export function chaveDeOrdem(foco: FocoAnalise, resultado: ResultadoAnalise): [number, number] {
  const componente = (chave: ComponenteAnalise['chave']): number =>
    resultado.componentes.find((item) => item.chave === chave)?.pontos ?? 0;
  switch (foco) {
    case 'lucrativas':
      return [resultado.lucro_estimado ?? -1, resultado.nota];
    case 'faceis':
      return [componente('facilidade'), resultado.nota];
    case 'preco':
      return [componente('margem'), resultado.nota];
    default:
      return [resultado.nota, resultado.lucro_estimado ?? -1];
  }
}

// ---------------------------------------------------------------------------
// Simulador de proposta
// ---------------------------------------------------------------------------

export type EntradaSimulacao = {
  quantidade: number;
  /** Quanto custa para você, por unidade (compra, produção ou serviço). */
  custo_unitario: number;
  frete_total: number;
  outros_custos_total: number;
  impostos_pct: number;
  comissao_pct: number;
  margem_minima_pct: number;
  /** Preço unitário estimado pelo órgão (teto), se houver. */
  preco_referencia: number | null;
  /** Preço unitário de mercado (por exemplo, a mediana paga pelo governo), se houver. */
  preco_mercado: number | null;
};

export type CenarioSimulacao = {
  desconto_pct: number;
  preco_unitario: number;
  receita: number;
  impostos_e_comissao: number;
  lucro: number;
  margem_pct: number;
  atinge_margem_minima: boolean;
};

export type ResultadoSimulacao = {
  custo_total: number;
  preco_equilibrio: number | null;
  preco_minimo: number | null;
  desconto_maximo_pct: number | null;
  cenarios: CenarioSimulacao[];
  leitura_mercado: { diferenca_pct: number; texto: string } | null;
  avisos: string[];
};

export const DESCONTOS_PADRAO = [0, 5, 10, 15, 20, 25, 30] as const;

export function simularProposta(entrada: EntradaSimulacao): ResultadoSimulacao {
  const avisos: string[] = [];
  const q = entrada.quantidade;
  const taxa = (entrada.impostos_pct + entrada.comissao_pct) / 100;
  const custoTotal = money(
    q * entrada.custo_unitario + entrada.frete_total + entrada.outros_custos_total,
  );
  const margemMin = entrada.margem_minima_pct / 100;

  if (q <= 0) avisos.push('Informe uma quantidade maior que zero.');
  if (taxa >= 1) avisos.push('Impostos e comissão somam 100% ou mais: não há preço que cubra.');

  const divisorEquilibrio = q * (1 - taxa);
  const divisorMinimo = q * (1 - taxa - margemMin);
  const precoEquilibrio =
    q > 0 && divisorEquilibrio > 0 ? money(custoTotal / divisorEquilibrio) : null;
  const precoMinimo = q > 0 && divisorMinimo > 0 ? money(custoTotal / divisorMinimo) : null;
  if (q > 0 && taxa < 1 && precoMinimo === null) {
    avisos.push(
      'Com esses impostos, comissão e margem mínima, não existe preço que feche a conta.',
    );
  }

  const cenarios: CenarioSimulacao[] = [];
  const base = entrada.preco_referencia ?? entrada.preco_mercado;
  if (base !== null && base > 0 && q > 0) {
    for (const desconto of DESCONTOS_PADRAO) {
      const preco = money(base * (1 - desconto / 100));
      const receita = money(preco * q);
      const encargos = money(receita * taxa);
      const lucro = money(receita - encargos - custoTotal);
      const margem = receita > 0 ? round1((lucro / receita) * 100) : 0;
      cenarios.push({
        desconto_pct: desconto,
        preco_unitario: preco,
        receita,
        impostos_e_comissao: encargos,
        lucro,
        margem_pct: margem,
        atinge_margem_minima: margem >= entrada.margem_minima_pct - 1e-9,
      });
    }
  } else {
    avisos.push(
      'Informe o preço de referência do edital (ou o de mercado) para ver os cenários de desconto.',
    );
  }

  const descontoMaximo =
    base !== null && base > 0 && precoMinimo !== null
      ? round1(Math.max(0, (1 - precoMinimo / base) * 100))
      : null;
  if (base !== null && base > 0 && precoMinimo !== null && precoMinimo > base) {
    avisos.push('Mesmo sem desconto o preço de referência não cobre custo e margem mínima.');
  }

  let leitura: ResultadoSimulacao['leitura_mercado'] = null;
  if (entrada.preco_mercado !== null && entrada.preco_mercado > 0 && precoMinimo !== null) {
    const diferenca = round1((precoMinimo / entrada.preco_mercado - 1) * 100);
    leitura = {
      diferenca_pct: diferenca,
      texto:
        diferenca <= 0
          ? `Seu preço mínimo está ${Math.abs(diferenca).toLocaleString('pt-BR')}% abaixo do mercado: espaço para competir.`
          : `Seu preço mínimo está ${diferenca.toLocaleString('pt-BR')}% acima do que o governo costuma pagar: difícil ganhar no preço.`,
    };
  }

  return {
    custo_total: custoTotal,
    preco_equilibrio: precoEquilibrio,
    preco_minimo: precoMinimo,
    desconto_maximo_pct: descontoMaximo,
    cenarios,
    leitura_mercado: leitura,
    avisos,
  };
}
