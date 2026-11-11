const BOM = String.fromCharCode(0xfeff);

/** Baixa uma tabela como CSV que o Excel em português abre direto (separador ";" e BOM). */
export function baixarCsv(nome: string, cabecalho: string[], linhas: (string | number | null)[][]) {
  const celula = (valor: string | number | null): string => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const corpo = [cabecalho, ...linhas].map((linha) => linha.map(celula).join(';')).join('\r\n');
  const blob = new Blob([`${BOM}${corpo}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

export function estatisticaDeVariacao(valores: readonly number[]): {
  desvio: number;
  coeficiente: number;
} | null {
  const validos = valores.filter((valor) => Number.isFinite(valor));
  if (validos.length < 3) return null;
  const media = validos.reduce((soma, valor) => soma + valor, 0) / validos.length;
  if (media <= 0) return null;
  const variancia =
    validos.reduce((soma, valor) => soma + (valor - media) ** 2, 0) / (validos.length - 1);
  const desvio = Math.sqrt(variancia);
  return { desvio, coeficiente: (desvio / media) * 100 };
}
