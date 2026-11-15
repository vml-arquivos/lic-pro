import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { areaSchema, databaseRole, hasRole, type UserRole } from './auth.js';
import { sanitizeMessage } from './alerts.js';
import { withTenant, type TenantContext } from './db.js';

export type DbClient = PoolClient;

export function sendDatabaseUnavailable(reply: FastifyReply): void {
  reply
    .code(503)
    .send({ error: 'database_unavailable', message: 'Banco não configurado neste ambiente.' });
}

/** Contexto de banco da requisição. A plataforma vira `admin` dentro da própria conta. */
export function authContext(request: FastifyRequest): TenantContext {
  const base: TenantContext = {
    tenantId: request.user.tenantId,
    userId: request.user.sub,
    role: databaseRole(request.user.role),
  };
  return request.user.empresaId ? { ...base, empresaId: request.user.empresaId } : base;
}

export function requireRoles(
  reply: FastifyReply,
  request: FastifyRequest,
  roles: readonly UserRole[],
): boolean {
  if (!hasRole(request.user, roles)) {
    reply.code(403).send({ error: 'forbidden' });
    return false;
  }
  return true;
}

/** Área de onde a equipe da plataforma está agindo ("ver como"), só para a auditoria. */
export function actingAs(request: FastifyRequest): string | null {
  if (request.user.role !== 'plataforma') return null;
  const raw = request.headers['x-acting-as'];
  const parsed = areaSchema.safeParse(Array.isArray(raw) ? raw[0] : raw);
  return parsed.success ? parsed.data : null;
}

export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]';
  if (typeof value === 'string') return sanitizeMessage(value, 500);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => sanitizeAuditMetadata(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [sanitizeMessage(key, 100), sanitizeAuditMetadata(item, depth + 1)]),
    );
  }
  return undefined;
}

export async function audit(
  client: DbClient,
  request: FastifyRequest,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const acting = actingAs(request);
  await client.query(
    `INSERT INTO auditoria
       (tenant_id, usuario_id, empresa_id, acao, recurso, recurso_id, metadata, request_id, origem, versao_dados)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'app', 'mvp1')`,
    [
      request.user.tenantId,
      request.user.sub,
      request.user.empresaId ?? null,
      action,
      resource,
      resourceId,
      JSON.stringify(sanitizeAuditMetadata(acting ? { ...metadata, acting_as: acting } : metadata)),
      request.id,
    ],
  );
}

export async function auditPublic(
  client: DbClient,
  request: FastifyRequest,
  tenantId: string,
  userId: string,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO auditoria
       (tenant_id, usuario_id, acao, recurso, recurso_id, metadata, request_id, origem, versao_dados)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'public', 'phase3.3')`,
    [tenantId, userId, action, resource, resourceId, JSON.stringify(metadata), request.id],
  );
}

/**
 * Executa `callback` numa sessão da plataforma: leitura entre contas liberada pelas policies.
 *
 * Só chame depois de `requireRoles(reply, request, ['plataforma'])`. O banco confere de novo
 * que a conta atual é da plataforma. Cada chamada grava uma linha de auditoria.
 */
export async function withPlatform<T>(
  pool: Pool,
  request: FastifyRequest,
  action: string,
  callback: (client: DbClient) => Promise<T>,
  metadata: Record<string, unknown> = {},
): Promise<T> {
  return withTenant(pool, { ...authContext(request), platform: true }, async (client) => {
    const check = await client.query<{ ok: boolean }>('SELECT app_is_platform_session() AS ok');
    if (!check.rows[0]?.ok) throw new Error('platform_forbidden');
    await audit(client, request, action, 'plataforma', null, metadata);
    return callback(client);
  });
}
