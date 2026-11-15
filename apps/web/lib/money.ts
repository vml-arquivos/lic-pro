import { cnpjValido, cpfValido, formatarCpfOuCnpj, somenteDigitos } from '@licitecomigo/shared';

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
  return formatarCpfOuCnpj(value);
}

/**
 * Situação do CPF/CNPJ digitado: `incompleto` enquanto faltam números, `invalido` quando o
 * número fecha mas os dígitos verificadores não batem, `ok` quando é válido.
 */
export function situacaoDocumento(value: string): 'vazio' | 'incompleto' | 'invalido' | 'ok' {
  const digitos = somenteDigitos(value);
  if (!digitos) return 'vazio';
  if (digitos.length === 11) return cpfValido(digitos) ? 'ok' : 'invalido';
  if (digitos.length === 14) return cnpjValido(digitos) ? 'ok' : 'invalido';
  return 'incompleto';
}

export const CICLO_LABEL: Record<string, string> = {
  mensal: 'por mês',
  anual: 'por ano',
  unico: 'pagamento único',
};
