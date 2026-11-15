import { z } from 'zod';

/**
 * Os dois módulos do produto.
 *
 * - `curso`: alunos, mentores e a venda do curso (Hotmart/Asaas, tipo de cobrança `curso`).
 * - `profissional`: empresas assinantes e a operação de licitações (tipo `assinatura`).
 *
 * Dinheiro, leads, cupons e planos de um módulo nunca aparecem no outro. Sem o parâmetro
 * `modulo`, as rotas continuam somando os dois (comportamento anterior).
 */
export const moduloSchema = z.enum(['curso', 'profissional']);
export type Modulo = z.infer<typeof moduloSchema>;

/** Tipo de cobrança de cada módulo (`cobrancas.tipo` e `planos.tipo`). */
export function tipoDeCobrancaDoModulo(modulo: Modulo | undefined): 'curso' | 'assinatura' | null {
  if (modulo === 'curso') return 'curso';
  if (modulo === 'profissional') return 'assinatura';
  return null;
}

/** Perfis de lead (`leads.perfil`) que pertencem a cada módulo. */
const PERFIS_DO_CURSO = new Set(['mentorado', 'iniciante']);

export function leadPertenceAoModulo(perfil: string | null | undefined, modulo: Modulo): boolean {
  const doCurso = PERFIS_DO_CURSO.has(perfil ?? '');
  return modulo === 'curso' ? doCurso : !doCurso;
}
