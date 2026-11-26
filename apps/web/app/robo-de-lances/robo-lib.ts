/**
 * Robô de lances: planeja a disputa. Calcula o menor preço que ainda dá lucro (piso), a
 * sequência de lances e o próximo lance a dar. Não envia nada a nenhum portal.
 */

export type EntradaDoPlano = {
  /** Custo total do que será entregue, em reais. */
  custo: number;
  /** Lucro mínimo aceito, em % sobre o custo. */
  margemMinima: number;
  /** Primeiro lance. */
  inicial: number;
  /** Quanto cada lance abaixa o anterior, em reais. */
  decremento: number;
  /** Valor de referência do edital, para comparar. */
  referencia?: number | null;
};

export type Lance = { ordem: number; valor: number; lucro: number; margem: number };

const centavos = (valor: number) => Math.round(valor * 100) / 100;

export function calcularPiso(custo: number, margemMinima: number): number {
  return centavos(custo * (1 + Math.max(0, margemMinima) / 100));
}

export function margemDoLance(valor: number, custo: number): number {
  return custo > 0 ? centavos(((valor - custo) / custo) * 100) : 0;
}

export type ValidacaoDoPlano = { campo: keyof EntradaDoPlano; mensagem: string };

export function validarPlano(entrada: EntradaDoPlano): ValidacaoDoPlano[] {
  const erros: ValidacaoDoPlano[] = [];
  if (!(entrada.custo > 0)) erros.push({ campo: 'custo', mensagem: 'Informe o custo.' });
  if (!(entrada.inicial > 0))
    erros.push({ campo: 'inicial', mensagem: 'Informe o primeiro lance.' });
  if (!(entrada.decremento > 0)) {
    erros.push({ campo: 'decremento', mensagem: 'O decremento precisa ser maior que zero.' });
  }
  if (entrada.margemMinima < 0) {
    erros.push({ campo: 'margemMinima', mensagem: 'A margem não pode ser negativa.' });
  }
  return erros;
}

/** Lances do primeiro até o piso. Para antes de passar do piso e em no máximo `limite` lances. */
export function planoDeLances(entrada: EntradaDoPlano, limite = 40): Lance[] {
  if (validarPlano(entrada).length) return [];
  const piso = calcularPiso(entrada.custo, entrada.margemMinima);
  const lances: Lance[] = [];
  let valor = centavos(entrada.inicial);
  while (valor >= piso && lances.length < limite) {
    lances.push({
      ordem: lances.length + 1,
      valor,
      lucro: centavos(valor - entrada.custo),
      margem: margemDoLance(valor, entrada.custo),
    });
    valor = centavos(valor - entrada.decremento);
  }
  return lances;
}

export type ProximoLance =
  | { tipo: 'dar'; valor: number; lucro: number; margem: number }
  | { tipo: 'no_piso'; valor: number; lucro: number; margem: number }
  | { tipo: 'parar'; piso: number };

/**
 * Próximo lance para cobrir o melhor valor do mercado: um decremento abaixo dele. Se isso passar
 * do piso, o melhor que dá é o próprio piso (só se ainda cobrir o mercado). Abaixo disso, parar.
 */
export function proximoLance(
  melhorDoMercado: number,
  entrada: Pick<EntradaDoPlano, 'custo' | 'margemMinima' | 'decremento'>,
): ProximoLance {
  const piso = calcularPiso(entrada.custo, entrada.margemMinima);
  const alvo = centavos(melhorDoMercado - entrada.decremento);
  const resumo = (valor: number) => ({
    valor,
    lucro: centavos(valor - entrada.custo),
    margem: margemDoLance(valor, entrada.custo),
  });
  if (alvo >= piso) return { tipo: 'dar', ...resumo(alvo) };
  if (piso < melhorDoMercado) return { tipo: 'no_piso', ...resumo(piso) };
  return { tipo: 'parar', piso };
}
