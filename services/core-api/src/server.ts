import fastifyJwt from '@fastify/jwt';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { health } from '@licitecomigo/shared';
import {
  assertTenant,
  authClaimsSchema,
  hasRole,
  journeyProfileSchema,
  type UserRole,
} from './auth.js';
import { loadConfig, type RuntimeConfig } from './config.js';
import { withTenant } from './db.js';

export type BuildAppOptions = {
  pool?: Pool;
  config?: RuntimeConfig;
  jwtSecret?: string;
  logger?: boolean;
};

const tenantPathSchema = z.object({ tenantId: z.string().uuid() });
const userPathSchema = z.object({ userId: z.string().uuid() });
const tenantBodySchema = z.object({
  nome: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .min(1)
    .max(80),
});
const createUserSchema = z.object({
  email: z.string().email(),
  nome: z.string().trim().min(1).max(160),
  papel: z.enum(['admin', 'operador', 'mentor', 'aluno']).default('aluno'),
  perfil_jornada: journeyProfileSchema.default('iniciante'),
});
const updateUserSchema = z.object({
  nome: z.string().trim().min(1).max(160).optional(),
  perfil_jornada: journeyProfileSchema.optional(),
  onboarding_concluido: z.boolean().optional(),
});

function sendDatabaseUnavailable(reply: FastifyReply): void {
  reply
    .code(503)
    .send({ error: 'database_unavailable', message: 'Banco não configurado neste ambiente.' });
}

function authContext(request: FastifyRequest) {
  return { tenantId: request.user.tenantId, userId: request.user.sub };
}

function requireRoles(
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

async function audit(
  client: Parameters<Parameters<typeof withTenant>[2]>[0],
  request: FastifyRequest,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO auditoria (tenant_id, usuario_id, acao, recurso, recurso_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      request.user.tenantId,
      request.user.sub,
      action,
      resource,
      resourceId,
      JSON.stringify(metadata),
    ],
  );
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();
  const pool = options.pool;
  const app = Fastify({ logger: options.logger ?? true });

  void app.register(fastifyJwt, { secret: options.jwtSecret ?? config.jwtSecret });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      reply.code(400).send({ error: 'validation_error', details: error.flatten() });
      return;
    }
    if (error instanceof Error && error.message === 'tenant_forbidden') {
      reply.code(403).send({ error: 'tenant_forbidden' });
      return;
    }
    reply.send(error);
  });

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') {
      return;
    }
    await request.jwtVerify();
    const claims = authClaimsSchema.safeParse(request.user);
    if (!claims.success) {
      reply.code(401).send({ error: 'invalid_claims' });
    }
  });

  app.get('/health', async () => ({ ...health('core-api'), databaseConfigured: Boolean(pool) }));

  app.post('/tenants', async (request, reply) => {
    if (!requireRoles(reply, request, ['admin'])) return;
    const body = tenantBodySchema.parse(request.body);
    const tenantId = request.user.tenantId;
    if (!pool) return sendDatabaseUnavailable(reply);

    const result = await withTenant(pool, authContext(request), async (client) => {
      const inserted = await client.query(
        `INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, slug = EXCLUDED.slug, updated_at = now()
         RETURNING id, nome, slug, created_at, updated_at`,
        [tenantId, body.nome, body.slug],
      );
      await audit(client, request, 'tenant.created', 'tenant', tenantId);
      return inserted.rows[0];
    });
    return reply.code(201).send(result);
  });

  app.get('/tenants/:tenantId', async (request, reply) => {
    const { tenantId } = tenantPathSchema.parse(request.params);
    assertTenant(request.user, tenantId);
    if (!pool) return sendDatabaseUnavailable(reply);

    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query('SELECT id, nome, slug, created_at, updated_at FROM tenants WHERE id = $1', [
        tenantId,
      ]),
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'tenant_not_found' });
    return reply.send(result.rows[0]);
  });

  app.patch('/tenants/:tenantId', async (request, reply) => {
    if (!requireRoles(reply, request, ['admin'])) return;
    const { tenantId } = tenantPathSchema.parse(request.params);
    assertTenant(request.user, tenantId);
    const body = tenantBodySchema.partial().parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);

    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE tenants SET nome = COALESCE($2, nome), slug = COALESCE($3, slug), updated_at = now()
         WHERE id = $1 RETURNING id, nome, slug, created_at, updated_at`,
        [tenantId, body.nome ?? null, body.slug ?? null],
      );
      if (updated.rows[0]) await audit(client, request, 'tenant.updated', 'tenant', tenantId);
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'tenant_not_found' });
    return reply.send(result);
  });

  app.get('/users', async (request, reply) => {
    if (!requireRoles(reply, request, ['admin', 'mentor'])) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT id, tenant_id, email, nome, papel, perfil_jornada, ativo, onboarding_concluido,
                created_at, updated_at
         FROM usuarios ORDER BY nome`,
      ),
    );
    return reply.send(result.rows);
  });

  app.post('/users', async (request, reply) => {
    if (!requireRoles(reply, request, ['admin'])) return;
    const body = createUserSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const inserted = await client.query(
        `INSERT INTO usuarios (tenant_id, email, nome, papel, perfil_jornada)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, tenant_id, email, nome, papel, perfil_jornada, ativo, onboarding_concluido,
                   created_at, updated_at`,
        [request.user.tenantId, body.email, body.nome, body.papel, body.perfil_jornada],
      );
      await audit(client, request, 'user.created', 'user', inserted.rows[0].id);
      return inserted.rows[0];
    });
    return reply.code(201).send(result);
  });

  app.patch('/users/:userId', async (request, reply) => {
    const { userId } = userPathSchema.parse(request.params);
    if (userId !== request.user.sub && !hasRole(request.user, ['admin'])) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = updateUserSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE usuarios
            SET nome = COALESCE($3, nome),
                perfil_jornada = COALESCE($4, perfil_jornada),
                onboarding_concluido = COALESCE($5, onboarding_concluido),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, tenant_id, email, nome, papel, perfil_jornada, ativo, onboarding_concluido,
                    created_at, updated_at`,
        [
          request.user.tenantId,
          userId,
          body.nome ?? null,
          body.perfil_jornada ?? null,
          body.onboarding_concluido ?? null,
        ],
      );
      if (updated.rows[0]) await audit(client, request, 'user.updated', 'user', userId);
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'user_not_found' });
    return reply.send(result);
  });

  return app;
}
