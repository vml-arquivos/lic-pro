/** Formata centavos como moeda brasileira. Aceita número ou texto (o banco devolve bigint como texto). */
export function brl(cents: number | string | null | undefined): string {
  const value = Number(cents ?? 0) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Formata reais (valor decimal), como vem dos preços de referência. */
export function reais(value: number | null | undefined): string {
  return typeof value === 'number'
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';
}

/** Máscara de CPF (11 dígitos) ou CNPJ (14) enquanto a pessoa digita. */
export function maskDocumento(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export const CICLO_LABEL: Record<string, string> = {
  mensal: 'por mês',
  anual: 'por ano',
  unico: 'pagamento único',
};
