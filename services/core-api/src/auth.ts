import { z } from 'zod';

/**
 * Papéis gravados no banco.
 *
 * - `plataforma`: equipe do Licite Comigo. Único papel que enxerga a Administração.
 * - `admin`: dono da conta de uma empresa cliente (uma empresa = um usuário).
 * - `operador`: reservado para equipe de empresa; hoje tem as mesmas permissões de `admin`
 *   sobre a própria conta.
 * - `mentor` e `aluno`: curso e mentoria, vivem na conta da plataforma.
 */
export const userRoleSchema = z.enum(['plataforma', 'admin', 'operador', 'mentor', 'aluno']);
export const journeyProfileSchema = z.enum(['iniciante', 'mentorado', 'profissional']);

/** Áreas do produto. É o que o usuário enxerga; o papel é o que o banco guarda. */
export const areaSchema = z.enum(['administracao', 'empresa', 'aluno', 'mentor']);

export const authClaimsSchema = z.object({
  sub: z.string().uuid(),
  tenantId: z.string().uuid(),
  empresaId: z.string().uuid().optional(),
  role: userRoleSchema,
  email: z.string().email().optional(),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type JourneyProfile = z.infer<typeof journeyProfileSchema>;
export type Area = z.infer<typeof areaSchema>;
export type AuthClaims = z.infer<typeof authClaimsSchema>;

export const ALL_AREAS: readonly Area[] = areaSchema.options;

export function assertTenant(claims: AuthClaims, tenantId: string): void {
  if (claims.tenantId !== tenantId) {
    throw new Error('tenant_forbidden');
  }
}

export function hasRole(claims: AuthClaims, roles: readonly UserRole[]): boolean {
  return roles.includes(claims.role);
}

/** Área própria de cada papel. Nunca é deduzida de preferências do usuário. */
export function areaForRole(role: UserRole): Area {
  switch (role) {
    case 'plataforma':
      return 'administracao';
    case 'admin':
    case 'operador':
      return 'empresa';
    case 'aluno':
      return 'aluno';
    case 'mentor':
      return 'mentor';
  }
}

/** Áreas que o papel pode abrir. Só a plataforma pode "ver como" as demais. */
export function allowedAreas(role: UserRole): readonly Area[] {
  return role === 'plataforma' ? ALL_AREAS : [areaForRole(role)];
}

/**
 * Área ativa na interface. Para a plataforma, respeita a preferência de "ver como" quando
 * ela é válida; para os demais papéis é sempre a área própria.
 */
export function activeArea(role: UserRole, viewAs?: string | null): Area {
  if (role !== 'plataforma') return areaForRole(role);
  const parsed = areaSchema.safeParse(viewAs);
  return parsed.success ? parsed.data : 'administracao';
}

/**
 * Papel usado pelas policies do banco. A plataforma tem, dentro da própria conta, os mesmos
 * poderes de `admin`; o que a diferencia (leitura entre contas) é uma sessão explícita
 * (`app.platform`), ligada só pelas rotas /platform e /admin depois de conferir o papel.
 */
export function databaseRole(role: UserRole): Exclude<UserRole, 'plataforma'> {
  return role === 'plataforma' ? 'admin' : role;
}

/** Quem precisa ficar dentro dos nichos escolhidos: todos, exceto a equipe da plataforma. */
export function isNicheRestricted(role: UserRole): boolean {
  return role !== 'plataforma';
}
