/**
 * CNPJ, CPF e CEP: limpeza, máscara e validação (dígitos verificadores). Roda igual no navegador
 * (para validar enquanto digita) e na API (para nunca confiar só no navegador).
 */

export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

function todosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

function digitoVerificador(base: string, pesos: readonly number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i += 1) soma += Number(base[i]) * (pesos[i] as number);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_CPF_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_CPF_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const;

export function cnpjValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 14 || todosIguais(d)) return false;
  const d1 = digitoVerificador(d, PESOS_CNPJ_1);
  const d2 = digitoVerificador(d.slice(0, 12) + String(d1), PESOS_CNPJ_2);
  return d === d.slice(0, 12) + String(d1) + String(d2);
}

export function cpfValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || todosIguais(d)) return false;
  const d1 = digitoVerificador(d, PESOS_CPF_1);
  const d2 = digitoVerificador(d.slice(0, 9) + String(d1), PESOS_CPF_2);
  return d === d.slice(0, 9) + String(d1) + String(d2);
}

export function cepValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  return d.length === 8 && d !== '00000000';
}

/** 12.345.678/0001-95, formatando só até onde há dígitos (serve para máscara ao digitar). */
export function formatarCnpj(valor: string | null | undefined): string {
  const d = somenteDigitos(valor).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function formatarCpf(valor: string | null | undefined): string {
  const d = somenteDigitos(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** CPF (11 dígitos) ou CNPJ (14), escolhido pela quantidade de dígitos digitados. */
export function formatarCpfOuCnpj(valor: string | null | undefined): string {
  return somenteDigitos(valor).length > 11 ? formatarCnpj(valor) : formatarCpf(valor);
}

export function formatarCep(valor: string | null | undefined): string {
  const d = somenteDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export type DadosCnpj = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  porte: 'mei' | 'micro' | 'pequena' | 'media' | 'grande' | null;
  situacao: string | null;
  /** Situação diferente de "ativa" — a tela avisa, mas deixa seguir. */
  ativa: boolean;
  data_abertura: string | null;
  natureza_juridica: string | null;
  cnae_principal: string | null;
  cnae_descricao: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  email: string | null;
};

export type DadosCep = {
  cep: string;
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};
