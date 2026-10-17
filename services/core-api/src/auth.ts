import { z } from 'zod';

export const userRoleSchema = z.enum(['admin', 'operador', 'mentor', 'aluno']);
export const journeyProfileSchema = z.enum(['iniciante', 'mentorado', 'profissional']);

export const authClaimsSchema = z.object({
  sub: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: userRoleSchema,
  email: z.string().email().optional(),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type JourneyProfile = z.infer<typeof journeyProfileSchema>;
export type AuthClaims = z.infer<typeof authClaimsSchema>;

export function assertTenant(claims: AuthClaims, tenantId: string): void {
  if (claims.tenantId !== tenantId) {
    throw new Error('tenant_forbidden');
  }
}

export function hasRole(claims: AuthClaims, roles: readonly UserRole[]): boolean {
  return roles.includes(claims.role);
}
