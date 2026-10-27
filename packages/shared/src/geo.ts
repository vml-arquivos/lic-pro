/** Unidades da Federação e regiões do país (divisão oficial do IBGE). */
export const REGIOES = ['norte', 'nordeste', 'centro-oeste', 'sudeste', 'sul'] as const;
export type Regiao = (typeof REGIOES)[number];

export const REGIAO_LABELS: Record<Regiao, string> = {
  norte: 'Norte',
  nordeste: 'Nordeste',
  'centro-oeste': 'Centro-Oeste',
  sudeste: 'Sudeste',
  sul: 'Sul',
};

export const UFS_POR_REGIAO: Record<Regiao, readonly string[]> = {
  norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
  nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'centro-oeste': ['DF', 'GO', 'MS', 'MT'],
  sudeste: ['ES', 'MG', 'RJ', 'SP'],
  sul: ['PR', 'RS', 'SC'],
};

export const UFS: readonly string[] = Object.values(UFS_POR_REGIAO).flat().sort();

export function ufsDaRegiao(regioes: readonly string[]): string[] {
  return regioes.flatMap((regiao) => [...(UFS_POR_REGIAO[regiao as Regiao] ?? [])]);
}

export function regiaoDaUf(uf: string): Regiao | null {
  const sigla = uf.toUpperCase();
  return REGIOES.find((regiao) => UFS_POR_REGIAO[regiao].includes(sigla)) ?? null;
}

/**
 * Valor de referência de "contratação de grande vulto" (Lei 14.133/2021, art. 6º, XXII:
 * R$ 200 milhões). O valor é atualizado por decreto; por isso é configurável no servidor
 * (variável GRANDE_VULTO_MIN) e a tela mostra o limiar usado.
 */
export const GRANDE_VULTO_PADRAO = 200_000_000;
