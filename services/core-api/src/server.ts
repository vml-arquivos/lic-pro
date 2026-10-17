import fastifyCors from '@fastify/cors';
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
import { checkReadiness } from './readiness.js';
import { buildEditalSearchQuery, editalSearchSchema } from './search.js';

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
const editalPathSchema = z.object({ editalId: z.string().uuid() });
const onboardingSchema = z.object({
  perfil_jornada: journeyProfileSchema,
  respostas: z.record(z.string().max(500)).default({}),
});
const slugPathSchema = z.object({ slug: z.string().trim().min(1).max(100) });
const aulaPathSchema = z.object({ aulaId: z.string().uuid() });
const moduloPathSchema = z.object({ moduloId: z.string().uuid() });
const quizPathSchema = z.object({ quizId: z.string().uuid() });
const progressSchema = z.object({
  concluida: z.boolean().default(false),
  percentual: z.number().int().min(0).max(100).default(0),
});
const quizAttemptSchema = z.object({
  respostas: z.record(z.number().int().min(0).max(100)),
});
const glossaryPathSchema = z.object({ termo: z.string().trim().min(1).max(100) });
const conversaPathSchema = z.object({ conversaId: z.string().uuid() });

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

  void app.register(fastifyCors, {
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : false,
    credentials: true,
  });
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
    if (request.url === '/health' || request.url === '/ready') {
      return;
    }
    await request.jwtVerify();
    const claims = authClaimsSchema.safeParse(request.user);
    if (!claims.success) {
      return reply.code(401).send({ error: 'invalid_claims' });
    }
  });

  app.get('/health', async () => ({ ...health('core-api'), databaseConfigured: Boolean(pool) }));

  app.get('/ready', async (_request, reply) => {
    const result = await checkReadiness(pool, config.redisUrl);
    return reply.code(result.ready ? 200 : 503).send({ service: 'core-api', ...result });
  });

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

  app.post('/me/onboarding', async (request, reply) => {
    const body = onboardingSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE usuarios
            SET perfil_jornada = $3, onboarding_concluido = true, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, tenant_id, nome, perfil_jornada, onboarding_concluido`,
        [request.user.tenantId, request.user.sub, body.perfil_jornada],
      );
      if (updated.rows[0]) {
        await audit(client, request, 'onboarding.completed', 'user', request.user.sub, {
          respostas: body.respostas,
        });
      }
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'user_not_found' });
    return reply.send(result);
  });

  app.get('/editais', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const filters = editalSearchSchema.parse(request.query);
    const search = buildEditalSearchQuery(filters);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const [rows, count] = await Promise.all([
        client.query(search.text, search.values),
        client.query<{ total: number }>(search.countText, search.countValues),
      ]);
      return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
    });
    return reply.send({
      data: result.rows,
      page: filters.page,
      page_size: filters.page_size,
      total: result.total,
      total_pages: Math.ceil(result.total / filters.page_size),
    });
  });

  app.get('/editais/:editalId', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const { editalId } = editalPathSchema.parse(request.params);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const [edital, itens] = await Promise.all([
        client.query(
          `SELECT id, fonte, id_externo, titulo, orgao, uf, uasg, modalidade, catmat_catser,
                  valor_estimado, data_publicacao, url_origem, conteudo_texto, hash_conteudo,
                  created_at, updated_at
             FROM editais
            WHERE id = $1`,
          [editalId],
        ),
        client.query(
          `SELECT id, numero, descricao, unidade, quantidade, valor_unitario_estimado,
                  catmat_catser
             FROM itens_edital
            WHERE edital_id = $1
            ORDER BY numero`,
          [editalId],
        ),
      ]);
      return { edital: edital.rows[0], itens: itens.rows };
    });
    if (!result.edital) return reply.code(404).send({ error: 'edital_not_found' });
    return reply.send(result);
  });

  app.get('/ana/conversations', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT id, titulo, created_at, updated_at
           FROM ana_conversas
          WHERE tenant_id = $1 AND usuario_id = $2 AND apagada_em IS NULL
          ORDER BY updated_at DESC`,
        [request.user.tenantId, request.user.sub],
      ),
    );
    return reply.send({ data: result.rows });
  });

  app.get('/ana/conversations/:conversaId/messages', async (request, reply) => {
    const { conversaId } = conversaPathSchema.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT m.id, m.tipo, m.conteudo, m.fonte, m.created_at
           FROM ana_mensagens m
           JOIN ana_conversas c ON c.id = m.conversa_id
          WHERE m.tenant_id = $1 AND c.tenant_id = $1 AND c.usuario_id = $2
            AND c.id = $3 AND c.apagada_em IS NULL
          ORDER BY m.created_at`,
        [request.user.tenantId, request.user.sub, conversaId],
      ),
    );
    return reply.send({ data: result.rows });
  });

  app.delete('/ana/conversations/:conversaId', async (request, reply) => {
    const { conversaId } = conversaPathSchema.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `UPDATE ana_conversas
            SET apagada_em = now(), updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND usuario_id = $3 AND apagada_em IS NULL
          RETURNING id`,
        [conversaId, request.user.tenantId, request.user.sub],
      ),
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'conversation_not_found' });
    return reply.code(204).send();
  });

  app.get('/academy/tracks', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT t.id, t.slug, t.titulo, t.descricao, t.status,
                count(DISTINCT m.id)::integer AS modulos,
                count(DISTINCT a.id)::integer AS aulas
           FROM trilhas t
           LEFT JOIN modulos m ON m.trilha_id = t.id
           LEFT JOIN aulas a ON a.modulo_id = m.id
          GROUP BY t.id
          ORDER BY t.titulo`,
      ),
    );
    return reply.send(result.rows);
  });

  app.get('/academy/tracks/:slug', async (request, reply) => {
    const { slug } = slugPathSchema.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const track = await client.query(
        `SELECT id, slug, titulo, descricao, status FROM trilhas WHERE slug = $1`,
        [slug],
      );
      if (!track.rows[0]) return null;
      const modules = await client.query(
        `SELECT m.id, m.ordem, m.titulo, m.resumo, m.status,
                json_agg(json_build_object(
                  'id', a.id, 'ordem', a.ordem, 'titulo', a.titulo,
                  'tipo', a.tipo, 'status', a.status
                ) ORDER BY a.ordem) AS aulas
           FROM modulos m
           LEFT JOIN aulas a ON a.modulo_id = m.id
          WHERE m.trilha_id = $1
          GROUP BY m.id
          ORDER BY m.ordem`,
        [track.rows[0].id],
      );
      return { ...track.rows[0], modulos: modules.rows };
    });
    if (!result) return reply.code(404).send({ error: 'track_not_found' });
    return reply.send(result);
  });

  app.get('/academy/glossary/:termo', async (request, reply) => {
    const { termo } = glossaryPathSchema.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT termo, definicao_simples, definicao_tecnica, referencia, status
           FROM glossario_termos WHERE lower(termo) = lower($1)`,
        [termo],
      ),
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'glossary_term_not_found' });
    return reply.send(result.rows[0]);
  });

  app.put('/academy/progress/:aulaId', async (request, reply) => {
    const { aulaId } = aulaPathSchema.parse(request.params);
    const body = progressSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `INSERT INTO progresso_aula (tenant_id, usuario_id, aula_id, concluida, percentual)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (usuario_id, aula_id) DO UPDATE SET
           concluida = EXCLUDED.concluida,
           percentual = EXCLUDED.percentual,
           updated_at = now()
         RETURNING id, aula_id, concluida, percentual, updated_at`,
        [request.user.tenantId, request.user.sub, aulaId, body.concluida, body.percentual],
      ),
    );
    return reply.send(result.rows[0]);
  });

  app.get('/academy/quizzes/:moduloId', async (request, reply) => {
    const { moduloId } = moduloPathSchema.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT q.id, q.modulo_id, q.titulo, q.status,
                json_agg(json_build_object(
                  'id', qq.id, 'ordem', qq.ordem, 'enunciado', qq.enunciado,
                  'alternativas', qq.alternativas
                ) ORDER BY qq.ordem) AS questoes
           FROM quizzes q
           LEFT JOIN quiz_questoes qq ON qq.quiz_id = q.id
          WHERE q.modulo_id = $1
          GROUP BY q.id`,
        [moduloId],
      ),
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'quiz_not_found' });
    return reply.send(result.rows[0]);
  });

  app.post('/academy/quizzes/:quizId/attempts', async (request, reply) => {
    const { quizId } = quizPathSchema.parse(request.params);
    const body = quizAttemptSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `INSERT INTO quiz_tentativas (tenant_id, usuario_id, quiz_id, respostas)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING id, quiz_id, respostas, nota, created_at`,
        [request.user.tenantId, request.user.sub, quizId, JSON.stringify(body.respostas)],
      ),
    );
    return reply.code(201).send(result.rows[0]);
  });

  app.get('/mentor/dashboard', async (request, reply) => {
    if (!requireRoles(reply, request, ['admin', 'mentor'])) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT u.id, u.nome, u.email, u.perfil_jornada, u.onboarding_concluido,
                count(pa.id)::integer AS aulas_com_progresso,
                count(*) FILTER (WHERE pa.concluida)::integer AS aulas_concluidas,
                max(pa.updated_at) AS ultimo_progresso
           FROM mentor_mentorado mm
           JOIN usuarios u ON u.id = mm.mentorado_id
           LEFT JOIN progresso_aula pa ON pa.usuario_id = u.id AND pa.tenant_id = mm.tenant_id
          WHERE mm.tenant_id = $1 AND mm.mentor_id = $2 AND mm.status = 'ativo'
          GROUP BY u.id
          ORDER BY u.nome`,
        [request.user.tenantId, request.user.sub],
      ),
    );
    return reply.send({ mentorados: result.rows });
  });

  return app;
}
