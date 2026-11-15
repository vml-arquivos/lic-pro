/** Regra única de senha: usada pela API e por todas as telas. */
export const PASSWORD_MIN_LENGTH = 8;
/** Não há limite de tamanho para o usuário; este teto só protege o servidor de abuso. */
export const PASSWORD_TECHNICAL_MAX = 1024;
export const PASSWORD_HINT = `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres, sem limite de tamanho.`;
export const PASSWORD_WEAK_MESSAGE = `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;

export function isAcceptablePassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_TECHNICAL_MAX;
}
