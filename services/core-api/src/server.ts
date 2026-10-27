import { randomUUID } from 'node:crypto';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  GRANDE_VULTO_PADRAO,
  NICHE_CATALOG,
  REGIAO_LABELS,
  REGIOES,
  UFS_POR_REGIAO,
  health,
  isNicheCode,
} from '@licitecomigo/shared';
import { createOpaqueToken, hashIp, hashOpaqueToken, PublicRateLimiter } from './auth-public.js';
import {
  activeArea,
  allowedAreas,
  areaSchema,
  assertTenant,
  authClaimsSchema,
  databaseRole,
  hasRole,
  journeyProfileSchema,
  type UserRole,
} from './auth.js';
import {
  audit,
  auditPublic,
  authContext,
  requireRoles,
  sendDatabaseUnavailable,
  withPlatform,
} from './request-context.js';
import { registerCollectionRoutes } from './coleta-routes.js';
import { registerPlatformRoutes } from './platform.js';
import { loadConfig, type RuntimeConfig } from './config.js';
import { withTenant } from './db.js';
import { assertStrongPassword, hashPassword, verifyPassword } from './password.js';
import { sendEmail } from './email.js';
import { checkReadiness } from './readiness.js';
import { applyNicheScope, readUserNiches } from './niche-scope.js';
import { registerAlertRoutes } from './alerts-routes.js';
import { registerCompanyRoutes } from './empresa.js';
import { registerLearningRoutes } from './learning.js';
import { registerRadarRoutes } from './radar.js';
import { ESTADO_USUARIO, ORDEM, PERIODO_TIPO, SITUACAO_PRAZO, SITUACAO_TIPO } from './search.js';
import { alertReadSchema, savedSearchPatchSchema, savedSearchSchema } from './alerts.js';

export type BuildAppOptions = {
  pool?: Pool;
  config?: RuntimeConfig;
  jwtSecret?: string;
  logger?: boolean;
};

const tenantPathSchema = z.object({ tenantId: z.string().uuid() });
const userPathSchema = z.object({ userId: z.string().uuid() });
const companyPathSchema = z.object({ companyId: z.string().uuid() });
const concessionPathSchema = z.object({ concessionId: z.string().uuid() });
const chunkPathSchema = z.object({ chunkId: z.string().uuid() });
const tenantBodySchema = z.object({
  nome: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .min(1)
    .max(80),
});
const nicheListSchema = z
  .array(z.string().trim().min(1).max(80))
  .min(1)
  .max(3)
  .refine(
    (values) => new Set(values).size === values.length && values.every(isNicheCode),
    'Selecione entre um e três nichos disponíveis no catálogo.',
  );
const createUserSchema = z.object({
  email: z.string().email(),
  nome: z.string().trim().min(1).max(160),
  papel: z.enum(['admin', 'operador', 'mentor', 'aluno']).default('aluno'),
  perfil_jornada: journeyProfileSchema.default('iniciante'),
  nichos: nicheListSchema.optional(),
});
const updateUserSchema = z.object({
  nome: z.string().trim().min(1).max(160).optional(),
  perfil_jornada: journeyProfileSchema.optional(),
  onboarding_concluido: z.boolean().optional(),
  nichos: nicheListSchema.optional(),
});
const editalPathSchema = z.object({ editalId: z.string().uuid() });
const onboardingSchema = z.object({
  perfil_jornada: journeyProfileSchema,
  nichos: nicheListSchema,
  respostas: z.record(z.string().max(500)).default({}),
});
const slugPathSchema = z.object({ slug: z.string().trim().min(1).max(100) });
const aulaPathSchema = z.object({ aulaId: z.string().uuid() });
const moduloPathSchema = z.object({ moduloId: z.string().uuid() });
const quizPathSchema = z.object({ quizId: z.string().uuid() });
const savedSearchPathSchema = z.object({ savedSearchId: z.string().uuid() });
const alertPathSchema = z.object({ alertId: z.string().uuid() });
const savedSearchQuerySchema = z.object({
  empresa_id: z.string().uuid().optional(),
  ativa: z.preprocess((value) => {
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return value;
  }, z.boolean().optional()),
});
const progressSchema = z.object({
  concluida: z.boolean().default(false),
  percentual: z.number().int().min(0).max(100).default(0),
});
const quizAttemptSchema = z.object({
  respostas: z.record(z.number().int().min(0).max(100)),
});
const glossaryPathSchema = z.object({ termo: z.string().trim().min(1).max(100) });
const conversaPathSchema = z.object({ conversaId: z.string().uuid() });
const loginSchema = z.object({
  tenant_id: z.string().uuid().optional(),
  email: z.string().email(),
  password: z.string().min(1).max(200),
});
const signupSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  empresa_nome: z.string().trim().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(1).max(200),
  nichos: nicheListSchema,
  termos_aceitos: z.literal(true),
  privacidade_aceita: z.literal(true),
});
const tokenSchema = z.object({ token: z.string().min(20).max(200) });
const recoverySchema = z.object({ email: z.string().email() });
const leadSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  email: z.string().email(),
  whatsapp: z.string().trim().max(40).optional(),
  perfil: z.enum(['empresario', 'mentorado', 'iniciante']),
  consentimento_lgpd: z.literal(true),
  origem: z.string().trim().max(160).optional(),
  utm_source: z.string().trim().max(160).optional(),
  utm_medium: z.string().trim().max(160).optional(),
  utm_campaign: z.string().trim().max(160).optional(),
  website: z.string().max(200).optional(),
});
const companySchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/),
  razao_social: z.string().trim().min(1).max(200),
  nome_fantasia: z.string().trim().max(200).optional(),
  porte: z.enum(['mei', 'micro', 'pequena', 'media', 'grande']).optional(),
  segmento: z.string().trim().max(160).optional(),
  cidade: z.string().trim().max(120).optional(),
  uf: z.string().trim().length(2).toUpperCase().optional(),
});
const companyUpdateSchema = companySchema.partial();
const diagnosisSchema = z.object({
  publico: z.enum(['empresa', 'mentoria']).optional(),
  nivel_diagnostico: z
    .enum(['sem_diagnostico', 'iniciante', 'em_evolucao', 'pronto_para_operar'])
    .optional(),
  perfil_jornada: journeyProfileSchema.optional(),
  nichos: nicheListSchema.optional(),
});
const accountProfileSchema = z.object({
  nome: z.string().trim().min(2).max(160).optional(),
  publico: z.enum(['empresa', 'mentoria']).optional(),
  nivel_diagnostico: z
    .enum(['sem_diagnostico', 'iniciante', 'em_evolucao', 'pronto_para_operar'])
    .optional(),
  perfil_jornada: journeyProfileSchema.optional(),
  onboarding_concluido: z.boolean().optional(),
  nichos: nicheListSchema.optional(),
});
const passwordChangeSchema = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(1).max(200),
});
const concessionSchema = z.object({
  mentor_id: z.string().uuid(),
  empresa_id: z.string().uuid(),
  escopo: z.record(z.unknown()).default({}),
  fim_em: z.string().datetime().optional(),
});
const correctionSchema = z.object({
  titulo: z.string().trim().min(1).max(500).optional(),
  orgao: z.string().trim().max(300).nullable().optional(),
  uf: z.string().trim().length(2).toUpperCase().nullable().optional(),
  modalidade: z.string().trim().max(160).nullable().optional(),
  catmat_catser: z.string().trim().max(160).nullable().optional(),
  valor_estimado: z.number().nonnegative().nullable().optional(),
  url_origem: z.string().url().nullable().optional(),
  observacao: z.string().trim().max(2000).optional(),
});
const chunkCorrectionSchema = z.object({
  status_validacao: z.enum(['extraido', 'confirmado_usuario', 'corrigido']),
  observacao_correcao: z.string().trim().max(2000).optional(),
});
const publicRateLimiter = new PublicRateLimiter(12);
// O app web chama o core-api de dentro da rede: todo login chega com o mesmo IP. O limite por
// IP é largo (proteção geral); o apertado é por IP + e-mail (proteção contra adivinhar senha).
const loginIpLimiter = new PublicRateLimiter(120);

const JOURNEY_BY_ROLE: Record<UserRole, readonly string[]> = {
  plataforma: ['iniciante', 'mentorado', 'profissional'],
  admin: ['iniciante', 'profissional'],
  operador: ['iniciante', 'profissional'],
  aluno: ['iniciante', 'mentorado'],
  mentor: ['iniciante', 'mentorado', 'profissional'],
};

/**
 * O tipo de conta (`publico`) e a área não são escolhidos pelo usuário. Só a equipe da
 * plataforma altera `publico`. `perfil_jornada` é só preferência de conforto e precisa ser
 * coerente com a área da conta (empresa não vira "mentorado" por conta própria).
 */
function rejectForbiddenProfileChange(
  reply: FastifyReply,
  request: FastifyRequest,
  body: { publico?: string | undefined; perfil_jornada?: string | undefined },
): boolean {
  const role = request.user.role;
  const forbidden =
    (body.publico !== undefined && role !== 'plataforma') ||
    (body.perfil_jornada !== undefined && !JOURNEY_BY_ROLE[role].includes(body.perfil_jornada));
  if (forbidden) {
    reply.code(403).send({
      error: 'profile_change_forbidden',
      message: 'O tipo de conta é definido pela equipe do Licite Comigo.',
    });
  }
  return forbidden;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();
  const pool = options.pool;
  const app = Fastify({ logger: options.logger ?? true });

  void app.register(fastifyCors, {
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : false,
    credentials: true,
  });
  const jwtOptions: { secret: string; issuer?: string; audience?: string } = {
    secret: options.jwtSecret ?? config.jwtSecret,
  };
  if (config.jwtIssuer) jwtOptions.issuer = config.jwtIssuer;
  if (config.jwtAudience) jwtOptions.audience = config.jwtAudience;
  void app.register(fastifyJwt, jwtOptions);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      reply.code(400).send({ error: 'validation_error', details: error.flatten() });
      return;
    }
    if (error instanceof Error && error.message === 'platform_forbidden') {
      reply.code(403).send({ error: 'forbidden' });
      return;
    }
    if (error instanceof Error && error.message === 'tenant_forbidden') {
      reply.code(403).send({ error: 'tenant_forbidden' });
      return;
    }
    if (error instanceof Error && error.message === 'public_rate_limit') {
      reply.code(429).send({ error: 'rate_limited' });
      return;
    }
    if (error instanceof Error && error.message === 'mentor_capability_forbidden') {
      reply.code(403).send({ error: 'forbidden' });
      return;
    }
    if (error instanceof Error && error.message === 'niche_preferences_required') {
      reply.code(409).send({
        error: 'niche_preferences_required',
        message: 'Selecione de um a três nichos no onboarding antes de usar o Radar e os alertas.',
      });
      return;
    }
    if (error instanceof Error && error.message === 'niche_not_allowed') {
      reply.code(403).send({
        error: 'niche_not_allowed',
        message: 'A busca precisa permanecer dentro dos nichos informados na sua conta.',
      });
      return;
    }
    if (error instanceof Error && error.message === 'invalid_niche') {
      reply.code(400).send({ error: 'invalid_niche' });
      return;
    }
    reply.send(error);
  });

  app.addHook('preHandler', async (request, reply) => {
    const publicPaths = new Set([
      '/health',
      '/ready',
      '/auth/login',
      '/auth/signup',
      '/auth/verify-email',
      '/auth/password-recovery',
      '/auth/password-reset',
      '/auth/invitations/preview',
      '/auth/invitations/accept',
      '/public/leads',
      '/public/alerts/unsubscribe',
    ]);
    if (publicPaths.has(request.url.split('?')[0] ?? '')) {
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

  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    loginIpLimiter.check(`login-ip:${request.ip}`);
    publicRateLimiter.check(`login:${request.ip}:${body.email.toLowerCase()}`);
    if (!pool) return sendDatabaseUnavailable(reply);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.auth_flow', 'true', true)");
      const result = await client.query<{
        id: string;
        tenant_id: string;
        tenant_nome: string;
        email: string;
        papel: UserRole;
        password_hash: string;
        empresa_id: string | null;
      }>(
        `SELECT c.usuario_id AS id, c.tenant_id, t.nome AS tenant_nome, c.email,
                u.papel, c.password_hash, NULL::uuid AS empresa_id
           FROM auth_credentials c
           JOIN tenants t ON t.id = c.tenant_id
           JOIN usuarios u ON u.id = c.usuario_id AND u.tenant_id = c.tenant_id
          WHERE lower(c.email) = lower($1) AND c.ativo = true AND u.ativo = true
            AND ($2::uuid IS NULL OR c.tenant_id = $2)
          ORDER BY c.tenant_id`,
        [body.email, body.tenant_id ?? null],
      );
      const valid = result.rows.filter((candidate) =>
        verifyPassword(body.password, candidate.password_hash),
      );
      if (valid.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      if (valid.length > 1 && !body.tenant_id) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'tenant_selection_required',
          tenants: valid.map((candidate) => ({
            id: candidate.tenant_id,
            nome: candidate.tenant_nome,
          })),
        });
      }
      const user = valid[0];
      if (!user) return reply.code(401).send({ error: 'invalid_credentials' });
      const verified = await client.query<{ email_verificado_em: Date | null }>(
        `SELECT email_verificado_em FROM auth_credentials
          WHERE tenant_id = $1 AND usuario_id = $2`,
        [user.tenant_id, user.id],
      );
      if (!verified.rows[0]?.email_verificado_em) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'email_not_verified' });
      }
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [user.tenant_id]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
      const company = await client.query<{ empresa_id: string }>(
        `SELECT empresa_id FROM empresa_usuarios
          WHERE tenant_id = $1 AND usuario_id = $2 AND ativo = true
          ORDER BY created_at LIMIT 1`,
        [user.tenant_id, user.id],
      );
      user.empresa_id = company.rows[0]?.empresa_id ?? null;
      await client.query('COMMIT');
      const tokenOptions: { expiresIn: number; issuer?: string; audience?: string } = {
        expiresIn: config.jwtTtlSeconds,
      };
      if (config.jwtIssuer) tokenOptions.issuer = config.jwtIssuer;
      if (config.jwtAudience) tokenOptions.audience = config.jwtAudience;
      const accessToken = app.jwt.sign(
        {
          sub: user.id,
          tenantId: user.tenant_id,
          empresaId: user.empresa_id ?? undefined,
          role: user.papel,
          email: user.email,
        },
        tokenOptions,
      );
      return reply.send({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: config.jwtTtlSeconds,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/auth/password-change', async (request, reply) => {
    const body = passwordChangeSchema.parse(request.body);
    if (body.current_password === body.new_password) {
      return reply.code(400).send({ error: 'password_must_change' });
    }
    try {
      assertStrongPassword(body.new_password);
    } catch {
      return reply.code(400).send({ error: 'weak_password' });
    }
    if (!pool) return sendDatabaseUnavailable(reply);
    const changed = await withTenant(pool, authContext(request), async (client) => {
      await client.query("SELECT set_config('app.auth_flow', 'true', true)");
      const current = await client.query<{ password_hash: string }>(
        `SELECT password_hash FROM auth_credentials
          WHERE tenant_id = $1 AND usuario_id = $2 AND ativo = true
          LIMIT 1`,
        [request.user.tenantId, request.user.sub],
      );
      if (!verifyPassword(body.current_password, current.rows[0]?.password_hash ?? null)) {
        return false;
      }
      const passwordHash = hashPassword(body.new_password);
      await client.query(
        `UPDATE auth_credentials
            SET password_hash = $3, reset_token_hash = NULL, reset_token_expires_at = NULL,
                updated_at = now()
          WHERE tenant_id = $1 AND usuario_id = $2`,
        [request.user.tenantId, request.user.sub, passwordHash],
      );
      await client.query(
        'UPDATE usuarios SET password_hash = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2',
        [request.user.tenantId, request.user.sub, passwordHash],
      );
      await audit(client, request, 'auth.password_changed', 'usuario', request.user.sub);
      return true;
    });
    if (!changed) return reply.code(401).send({ error: 'current_password_invalid' });
    return reply.send({ message: 'senha atualizada' });
  });

  app.post('/auth/signup', async (request, reply) => {
    if (!config.signupEnabled) return reply.code(404).send({ error: 'signup_disabled' });
    publicRateLimiter.check(`signup:${request.ip}`);
    const body = signupSchema.parse(request.body);
    try {
      assertStrongPassword(body.password);
    } catch {
      return reply.code(400).send({ error: 'weak_password' });
    }
    if (!pool) return sendDatabaseUnavailable(reply);
    const tenantId = randomUUID();
    const userId = randomUUID();
    const verificationToken = createOpaqueToken();
    const slug = `${
      body.empresa_nome
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'empresa'
    }-${tenantId.slice(0, 8)}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.auth_flow', 'true', true)");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        tenantId,
        body.empresa_nome,
        slug,
      ]);
      const passwordHash = hashPassword(body.password);
      await client.query(
        `INSERT INTO usuarios
          (id, tenant_id, email, nome, papel, perfil_jornada, password_hash, publico,
           nicho_preferencias, termos_versao, termos_aceitos_em, politica_versao, politica_aceita_em)
         VALUES ($1, $2, $3, $4, 'admin', 'iniciante', $5, 'empresa', $6::jsonb, $7, now(), $8, now())`,
        [
          userId,
          tenantId,
          body.email.toLowerCase(),
          body.nome,
          passwordHash,
          JSON.stringify(body.nichos),
          config.termsVersion,
          config.privacyVersion,
        ],
      );
      await client.query(
        `INSERT INTO auth_credentials
          (tenant_id, usuario_id, email, password_hash, verification_token_hash, verification_token_expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '24 hours')`,
        [
          tenantId,
          userId,
          body.email.toLowerCase(),
          passwordHash,
          hashOpaqueToken(verificationToken),
        ],
      );
      await auditPublic(
        client,
        request,
        tenantId,
        userId,
        'auth.signup.requested',
        'usuario',
        userId,
        {
          termos_versao: config.termsVersion,
          politica_versao: config.privacyVersion,
        },
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        return reply
          .code(202)
          .send({ message: 'Se os dados forem válidos, enviaremos instruções por e-mail.' });
      }
      throw error;
    } finally {
      client.release();
    }
    await sendEmail(config, {
      to: body.email,
      subject: 'Confirme seu e-mail — Licite Comigo',
      text: `Confirme seu e-mail em ${config.appUrl ?? config.siteUrl ?? ''}/verify-email?token=${verificationToken}`,
    });
    return reply
      .code(202)
      .send({ message: 'Se os dados forem válidos, enviaremos instruções por e-mail.' });
  });

  app.post('/auth/verify-email', async (request, reply) => {
    publicRateLimiter.check(`verify:${request.ip}`);
    const { token } = tokenSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.auth_flow', 'true', true)");
      const match = await client.query<{ tenant_id: string; usuario_id: string }>(
        `SELECT tenant_id, usuario_id FROM auth_credentials
          WHERE verification_token_hash = $1 AND verification_token_expires_at > now() AND ativo = true LIMIT 1`,
        [hashOpaqueToken(token)],
      );
      const row = match.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'invalid_or_expired_token' });
      }
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [row.tenant_id]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [row.usuario_id]);
      await client.query(
        `UPDATE auth_credentials SET email_verificado_em = now(), verification_token_hash = NULL,
          verification_token_expires_at = NULL, updated_at = now()
         WHERE tenant_id = $1 AND usuario_id = $2`,
        [row.tenant_id, row.usuario_id],
      );
      await client.query(
        'UPDATE usuarios SET email_verificado_em = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2',
        [row.tenant_id, row.usuario_id],
      );
      await auditPublic(
        client,
        request,
        row.tenant_id,
        row.usuario_id,
        'auth.email_verified',
        'usuario',
        row.usuario_id,
      );
      await client.query('COMMIT');
      return reply.send({ message: 'e-mail verificado' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/auth/password-recovery', async (request, reply) => {
    publicRateLimiter.check(`recovery:${request.ip}`);
    const body = recoverySchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const client = await pool.connect();
    let token: string | undefined;
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.auth_flow', 'true', true)");
      const result = await client.query<{ tenant_id: string; usuario_id: string }>(
        `SELECT tenant_id, usuario_id FROM auth_credentials
          WHERE lower(email) = lower($1) AND ativo = true LIMIT 1`,
        [body.email],
      );
      const row = result.rows[0];
      if (row) {
        token = createOpaqueToken();
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [row.tenant_id]);
        await client.query("SELECT set_config('app.user_id', $1, true)", [row.usuario_id]);
        await client.query(
          `UPDATE auth_credentials SET reset_token_hash = $3, reset_token_expires_at = now() + interval '1 hour', updated_at = now()
            WHERE tenant_id = $1 AND usuario_id = $2`,
          [row.tenant_id, row.usuario_id, hashOpaqueToken(token)],
        );
        await auditPublic(
          client,
          request,
          row.tenant_id,
          row.usuario_id,
          'auth.password_recovery.requested',
          'usuario',
          row.usuario_id,
        );
      }
      await client.query('COMMIT');
      if (token) {
        await sendEmail(config, {
          to: body.email,
          subject: 'Recuperação de senha — Licite Comigo',
          text: `Redefina sua senha em ${config.appUrl ?? config.siteUrl ?? ''}/password-reset?token=${token}`,
        });
      }
      return reply
        .code(202)
        .send({ message: 'Se o e-mail estiver cadastrado, enviaremos instruções.' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/auth/password-reset', async (request, reply) => {
    publicRateLimiter.check(`reset:${request.ip}`);
    const body = tokenSchema.extend({ password: z.string().min(1).max(200) }).parse(request.body);
    try {
      assertStrongPassword(body.password);
    } catch {
      return reply.code(400).send({ error: 'weak_password' });
    }
    if (!pool) return sendDatabaseUnavailable(reply);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.auth_flow', 'true', true)");
      const result = await client.query<{ tenant_id: string; usuario_id: string }>(
        `SELECT tenant_id, usuario_id FROM auth_credentials
          WHERE reset_token_hash = $1 AND reset_token_expires_at > now() AND ativo = true LIMIT 1`,
        [hashOpaqueToken(body.token)],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'invalid_or_expired_token' });
      }
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [row.tenant_id]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [row.usuario_id]);
      const passwordHash = hashPassword(body.password);
      await client.query(
        `UPDATE auth_credentials SET password_hash = $3, reset_token_hash = NULL, reset_token_expires_at = NULL, updated_at = now()
          WHERE tenant_id = $1 AND usuario_id = $2`,
        [row.tenant_id, row.usuario_id, passwordHash],
      );
      await client.query(
        'UPDATE usuarios SET password_hash = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2',
        [row.tenant_id, row.usuario_id, passwordHash],
      );
      await auditPublic(
        client,
        request,
        row.tenant_id,
        row.usuario_id,
        'auth.password_reset.completed',
        'usuario',
        row.usuario_id,
      );
      await client.query('COMMIT');
      return reply.send({ message: 'senha atualizada' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/public/leads', async (request, reply) => {
    publicRateLimiter.check(`lead:${request.ip}`);
    const body = leadSchema.parse(request.body);
    if (body.website) return reply.code(202).send({ message: 'recebido' });
    if (!pool) return sendDatabaseUnavailable(reply);
    const ipHash = hashIp(request.ip, config.jwtSecret);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // O aplicativo não tem SELECT direto em `leads`; a checagem passa por uma função do banco.
      const duplicate = await client.query<{ recebido: boolean }>(
        'SELECT lead_recebido_recentemente($1) AS recebido',
        [body.email],
      );
      if (duplicate.rows[0]?.recebido) {
        await client.query('COMMIT');
        return reply.code(202).send({ message: 'recebido' });
      }
      const leadId = randomUUID();
      await client.query(
        `INSERT INTO leads
          (id, nome, email, whatsapp, perfil, consentimento_lgpd, consentimento_versao, consentimento_em,
           origem, utm_source, utm_medium, utm_campaign, ip_hash)
         VALUES ($11, $1, lower($2), $3, $4, true, $5, now(), $6, $7, $8, $9, $10)`,
        [
          body.nome,
          body.email,
          body.whatsapp ?? null,
          body.perfil,
          config.privacyVersion,
          body.origem ?? null,
          body.utm_source ?? null,
          body.utm_medium ?? null,
          body.utm_campaign ?? null,
          ipHash,
          leadId,
        ],
      );
      await client.query(
        `INSERT INTO leads_auditoria (lead_id, acao, ip_hash, metadata)
         VALUES ($1, 'lead.created', $2, $3::jsonb)`,
        [leadId, ipHash, JSON.stringify({ origem: body.origem ?? null })],
      );
      await client.query('COMMIT');
      return reply.code(202).send({ message: 'recebido' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/admin/leads', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withPlatform(pool, request, 'platform.leads.listed', (client) =>
      client.query('SELECT * FROM plataforma_listar_leads(200)'),
    );
    return reply.send({ data: result.rows });
  });

  app.get('/me', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT u.id, u.tenant_id, u.email, u.nome, u.papel, u.publico, u.nivel_diagnostico,
                u.perfil_jornada, u.onboarding_concluido, u.nicho_preferencias,
                u.email_verificado_em, u.termos_versao, u.termos_aceitos_em,
                u.politica_versao, u.politica_aceita_em, u.created_at, u.updated_at,
                u.visualizar_como, tn.nome AS tenant_nome,
                eu.empresa_id, eu.papel AS empresa_papel
           FROM usuarios u
           JOIN tenants tn ON tn.id = u.tenant_id
           LEFT JOIN empresa_usuarios eu
             ON eu.usuario_id = u.id AND eu.tenant_id = u.tenant_id AND eu.ativo = true
          WHERE u.tenant_id = $1 AND u.id = $2
          ORDER BY eu.created_at NULLS LAST
          LIMIT 1`,
        [request.user.tenantId, request.user.sub],
      ),
    );
    const account = result.rows[0];
    if (!account) return reply.code(404).send({ error: 'user_not_found' });
    // A área vem do papel do token, nunca de preferências do usuário.
    const role = request.user.role;
    return reply.send({
      ...account,
      papel: role,
      area: activeArea(role, account.visualizar_como as string | null),
      areas_permitidas: allowedAreas(role),
      plataforma: role === 'plataforma',
    });
  });

  // "Ver como": só a equipe da plataforma. Muda a interface, nunca a autoridade da requisição.
  app.patch('/me/view-as', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return;
    const body = z.object({ area: areaSchema }).parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    await withTenant(pool, authContext(request), async (client) => {
      await client.query(
        'UPDATE usuarios SET visualizar_como = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2',
        [request.user.tenantId, request.user.sub, body.area],
      );
      await audit(client, request, 'platform.view_as.changed', 'usuario', request.user.sub, {
        area: body.area,
      });
    });
    return reply.send({ area: body.area });
  });

  app.patch('/me', async (request, reply) => {
    const body = accountProfileSchema.parse(request.body);
    if (rejectForbiddenProfileChange(reply, request, body)) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE usuarios
            SET nome = COALESCE($3, nome),
                publico = COALESCE($4, publico),
                nivel_diagnostico = COALESCE($5, nivel_diagnostico),
                perfil_jornada = COALESCE($6, perfil_jornada),
                onboarding_concluido = COALESCE($7, onboarding_concluido),
                nicho_preferencias = COALESCE($8::jsonb, nicho_preferencias),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, tenant_id, email, nome, papel, publico, nivel_diagnostico,
                    perfil_jornada, onboarding_concluido, nicho_preferencias,
                    email_verificado_em, termos_versao, termos_aceitos_em,
                    politica_versao, politica_aceita_em, created_at, updated_at`,
        [
          request.user.tenantId,
          request.user.sub,
          body.nome ?? null,
          body.publico ?? null,
          body.nivel_diagnostico ?? null,
          body.perfil_jornada ?? null,
          body.onboarding_concluido ?? null,
          body.nichos ? JSON.stringify(body.nichos) : null,
        ],
      );
      if (updated.rows[0])
        await audit(client, request, 'account.profile_updated', 'usuario', request.user.sub);
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'user_not_found' });
    return reply.send(result);
  });

  app.patch('/me/diagnostico', async (request, reply) => {
    const body = diagnosisSchema.parse(request.body);
    if (rejectForbiddenProfileChange(reply, request, body)) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE usuarios
            SET publico = COALESCE($3, publico),
                nivel_diagnostico = COALESCE($4, nivel_diagnostico),
                perfil_jornada = COALESCE($5, perfil_jornada),
                nicho_preferencias = COALESCE($6::jsonb, nicho_preferencias),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, publico, nivel_diagnostico, perfil_jornada, nicho_preferencias`,
        [
          request.user.tenantId,
          request.user.sub,
          body.publico ?? null,
          body.nivel_diagnostico ?? null,
          body.perfil_jornada ?? null,
          body.nichos ? JSON.stringify(body.nichos) : null,
        ],
      );
      if (updated.rows[0])
        await audit(client, request, 'diagnostico.updated', 'usuario', request.user.sub);
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'user_not_found' });
    return reply.send(result);
  });

  app.get('/companies', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT e.id, e.cnpj, e.razao_social, e.nome_fantasia, e.porte, e.segmento, e.cidade, e.uf,
                e.ativo, count(eu.usuario_id)::integer AS usuarios
           FROM empresas e
           LEFT JOIN empresa_usuarios eu ON eu.empresa_id = e.id AND eu.ativo = true
          WHERE e.tenant_id = $1
          GROUP BY e.id
          ORDER BY e.razao_social`,
        [request.user.tenantId],
      ),
    );
    return reply.send({ data: result.rows });
  });

  app.post('/companies', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'admin', 'operador'])) return;
    const body = companySchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const inserted = await client.query(
        `INSERT INTO empresas (tenant_id, cnpj, razao_social, nome_fantasia, porte, segmento, cidade, uf)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, tenant_id, cnpj, razao_social, nome_fantasia, porte, segmento, cidade, uf, ativo`,
        [
          request.user.tenantId,
          body.cnpj,
          body.razao_social,
          body.nome_fantasia ?? null,
          body.porte ?? null,
          body.segmento ?? null,
          body.cidade ?? null,
          body.uf ?? null,
        ],
      );
      const company = inserted.rows[0];
      await client.query(
        `INSERT INTO empresa_usuarios (tenant_id, empresa_id, usuario_id, papel)
         VALUES ($1, $2, $3, 'proprietario')`,
        [request.user.tenantId, company.id, request.user.sub],
      );
      await audit(client, request, 'empresa.created', 'empresa', company.id);
      return company;
    });
    return reply.code(201).send(result);
  });

  app.patch('/companies/:companyId', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'admin', 'operador'])) return;
    const { companyId } = companyPathSchema.parse(request.params);
    const body = companyUpdateSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE empresas
            SET cnpj = COALESCE($3, cnpj), razao_social = COALESCE($4, razao_social),
                nome_fantasia = COALESCE($5, nome_fantasia), porte = COALESCE($6, porte),
                segmento = COALESCE($7, segmento), cidade = COALESCE($8, cidade),
                uf = COALESCE($9, uf), updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, tenant_id, cnpj, razao_social, nome_fantasia, porte, segmento, cidade, uf, ativo`,
        [
          request.user.tenantId,
          companyId,
          body.cnpj ?? null,
          body.razao_social ?? null,
          body.nome_fantasia ?? null,
          body.porte ?? null,
          body.segmento ?? null,
          body.cidade ?? null,
          body.uf ?? null,
        ],
      );
      if (updated.rows[0]) await audit(client, request, 'empresa.updated', 'empresa', companyId);
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'company_not_found' });
    return reply.send(result);
  });

  app.post('/mentor/concessions', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return;
    const body = concessionSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const inserted = await client.query(
        `INSERT INTO concessoes_mentor (tenant_id, mentor_id, empresa_id, escopo, fim_em)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (tenant_id, mentor_id, empresa_id) DO UPDATE SET
           escopo = EXCLUDED.escopo, fim_em = EXCLUDED.fim_em, revogada_em = NULL
         RETURNING id, tenant_id, mentor_id, empresa_id, escopo, inicio_em, fim_em`,
        [
          request.user.tenantId,
          body.mentor_id,
          body.empresa_id,
          JSON.stringify(body.escopo),
          body.fim_em ?? null,
        ],
      );
      await audit(client, request, 'mentor.concession.granted', 'empresa', body.empresa_id, {
        mentor_id: body.mentor_id,
      });
      return inserted.rows[0];
    });
    return reply.code(201).send(result);
  });

  app.get('/mentor/companies', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'mentor'])) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT cm.id, cm.mentor_id, cm.empresa_id, e.razao_social, e.cnpj, cm.escopo, cm.inicio_em, cm.fim_em
           FROM concessoes_mentor cm
           JOIN empresas e ON e.id = cm.empresa_id AND e.tenant_id = cm.tenant_id
          WHERE cm.tenant_id = $1 AND cm.revogada_em IS NULL
            AND (cm.mentor_id = $2 OR $3 = 'admin')
          ORDER BY e.razao_social`,
        [request.user.tenantId, request.user.sub, databaseRole(request.user.role)],
      ),
    );
    return reply.send({ data: result.rows });
  });

  app.delete('/mentor/concessions/:concessionId', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return;
    const { concessionId } = concessionPathSchema.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const revoked = await client.query(
        `UPDATE concessoes_mentor SET revogada_em = now(), fim_em = COALESCE(fim_em, now())
          WHERE id = $1 AND tenant_id = $2 AND revogada_em IS NULL
          RETURNING id, mentor_id, empresa_id, revogada_em`,
        [concessionId, request.user.tenantId],
      );
      if (revoked.rows[0])
        await audit(client, request, 'mentor.concession.revoked', 'concessao_mentor', concessionId);
      return revoked.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'concession_not_found' });
    return reply.send(result);
  });

  app.post('/tenants', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'admin'])) return;
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
    if (!requireRoles(reply, request, ['plataforma', 'admin'])) return;
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
    if (!requireRoles(reply, request, ['plataforma', 'mentor'])) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT id, tenant_id, email, nome, papel, perfil_jornada, nicho_preferencias,
                ativo, onboarding_concluido,
                created_at, updated_at
         FROM usuarios ORDER BY nome`,
      ),
    );
    return reply.send(result.rows);
  });

  app.post('/users', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return;
    const body = createUserSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const inserted = await client.query(
        `INSERT INTO usuarios (tenant_id, email, nome, papel, perfil_jornada, nicho_preferencias)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id, tenant_id, email, nome, papel, perfil_jornada, nicho_preferencias, ativo, onboarding_concluido,
                   created_at, updated_at`,
        [
          request.user.tenantId,
          body.email,
          body.nome,
          body.papel,
          body.perfil_jornada,
          JSON.stringify(body.nichos ?? []),
        ],
      );
      await audit(client, request, 'user.created', 'user', inserted.rows[0].id);
      return inserted.rows[0];
    });
    return reply.code(201).send(result);
  });

  app.patch('/users/:userId', async (request, reply) => {
    const { userId } = userPathSchema.parse(request.params);
    if (userId !== request.user.sub && !hasRole(request.user, ['plataforma'])) {
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
                nicho_preferencias = COALESCE($6::jsonb, nicho_preferencias),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, tenant_id, email, nome, papel, perfil_jornada, nicho_preferencias, ativo, onboarding_concluido,
                    created_at, updated_at`,
        [
          request.user.tenantId,
          userId,
          body.nome ?? null,
          body.perfil_jornada ?? null,
          body.onboarding_concluido ?? null,
          body.nichos ? JSON.stringify(body.nichos) : null,
        ],
      );
      if (updated.rows[0]) await audit(client, request, 'user.updated', 'user', userId);
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'user_not_found' });
    return reply.send(result);
  });

  app.get('/admin/users/audit', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT a.id, a.usuario_id, u.nome AS usuario_nome, u.email AS usuario_email,
                a.acao, a.recurso, a.recurso_id, a.metadata, a.created_at
           FROM auditoria a
           LEFT JOIN usuarios u ON u.id = a.usuario_id AND u.tenant_id = a.tenant_id
          WHERE a.tenant_id = $1
          ORDER BY a.created_at DESC
          LIMIT 200`,
        [request.user.tenantId],
      ),
    );
    return reply.send({ data: result.rows });
  });

  app.get('/operations/ingest', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const [checkpoints, deadLetters] = await Promise.all([
        client.query(
          `SELECT count(*)::integer AS checkpoints,
                  count(*) FILTER (WHERE updated_at >= now() - interval '24 hours')::integer AS atualizados_24h,
                  max(updated_at) AS ultima_atualizacao
             FROM ingest_checkpoints WHERE tenant_id = $1`,
          [request.user.tenantId],
        ),
        client.query(
          `SELECT count(*)::integer AS total,
                  count(*) FILTER (WHERE resolvida_em IS NULL)::integer AS pendentes,
                  max(created_at) AS ultimo_registro
             FROM ingest_dead_letters WHERE tenant_id = $1`,
          [request.user.tenantId],
        ),
      ]);
      return {
        checkpoints: checkpoints.rows[0] ?? {
          checkpoints: 0,
          atualizados_24h: 0,
          ultima_atualizacao: null,
        },
        dead_letters: deadLetters.rows[0] ?? {
          total: 0,
          pendentes: 0,
          ultimo_registro: null,
        },
      };
    });
    return reply.send(result);
  });

  app.post('/me/onboarding', async (request, reply) => {
    const body = onboardingSchema.parse(request.body);
    if (rejectForbiddenProfileChange(reply, request, body)) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE usuarios
            SET perfil_jornada = $3, nicho_preferencias = $4::jsonb,
                onboarding_concluido = true, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, tenant_id, nome, perfil_jornada, nicho_preferencias, onboarding_concluido`,
        [request.user.tenantId, request.user.sub, body.perfil_jornada, JSON.stringify(body.nichos)],
      );
      if (updated.rows[0]) {
        await audit(client, request, 'onboarding.completed', 'user', request.user.sub, {
          respostas: body.respostas,
          nichos: body.nichos,
        });
      }
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'user_not_found' });
    return reply.send(result);
  });

  app.get('/catalog/filters', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const ufs = [
      'AC',
      'AL',
      'AP',
      'AM',
      'BA',
      'CE',
      'DF',
      'ES',
      'GO',
      'MA',
      'MT',
      'MS',
      'MG',
      'PA',
      'PB',
      'PR',
      'PE',
      'PI',
      'RJ',
      'RN',
      'RS',
      'RO',
      'RR',
      'SC',
      'SP',
      'SE',
      'TO',
    ];
    const result = await withTenant(pool, authContext(request), async (client) => {
      const fields = [
        'fonte',
        'sistema_origem',
        'esfera',
        'poder',
        'modalidade',
        'modo_disputa',
        'situacao',
        'instrumento',
        'amparo_legal',
        'catmat_catser',
      ];
      const values = await Promise.all(
        fields.map(async (field) => {
          const result = await client.query<{ value: string }>(
            `SELECT DISTINCT ${field} AS value
               FROM editais
              WHERE tenant_id IN (SELECT $1::uuid UNION SELECT id FROM plataforma_tenants)
                AND ${field} IS NOT NULL AND trim(${field}) <> ''
              ORDER BY ${field}
              LIMIT 200`,
            [request.user.tenantId],
          );
          return [field, result.rows.map((row) => row.value)] as const;
        }),
      );
      return Object.fromEntries(values);
    });
    return reply.send({
      nichos: NICHE_CATALOG.map(({ code, label, description, source }) => ({
        code,
        label,
        description,
        source,
      })),
      ufs,
      regioes: REGIOES.map((codigo) => ({
        codigo,
        nome: REGIAO_LABELS[codigo],
        ufs: UFS_POR_REGIAO[codigo],
      })),
      grande_vulto_min: GRANDE_VULTO_PADRAO,
      situacao_prazo: SITUACAO_PRAZO,
      situacao_tipo: SITUACAO_TIPO,
      periodo_tipo: PERIODO_TIPO,
      estados: ESTADO_USUARIO,
      ordens: ORDEM,
      ...result,
    });
  });

  app.get('/saved-searches', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'admin', 'operador'])) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const filters = savedSearchQuerySchema.parse(request.query);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT id, tenant_id, usuario_id, empresa_id, nome, filtros, ativa, created_at, updated_at
           FROM buscas_salvas
          WHERE tenant_id = $1
            AND (usuario_id = $2 OR $3::text IN ('admin', 'operador'))
            AND ($4::boolean IS NULL OR ativa = $4)
          ORDER BY updated_at DESC`,
        [
          request.user.tenantId,
          request.user.sub,
          databaseRole(request.user.role),
          filters.ativa ?? null,
        ],
      ),
    );
    return reply.send({ data: result.rows });
  });

  app.post('/saved-searches', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'admin', 'operador'])) return reply;
    const body = savedSearchSchema.parse(request.body);
    const empresaId = body.empresa_id ?? request.user.empresaId;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const preferences = await readUserNiches(client, request.user.tenantId, request.user.sub);
      const scopedFilters = applyNicheScope(body.filtros, preferences, request.user.role);
      const inserted = await client.query(
        `INSERT INTO buscas_salvas (tenant_id, usuario_id, empresa_id, nome, filtros, ativa)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (tenant_id, usuario_id, nome) DO UPDATE SET
           empresa_id = EXCLUDED.empresa_id, filtros = EXCLUDED.filtros,
           ativa = EXCLUDED.ativa, updated_at = now()
         RETURNING id, tenant_id, usuario_id, empresa_id, nome, filtros, ativa, created_at, updated_at`,
        [
          request.user.tenantId,
          request.user.sub,
          empresaId ?? null,
          body.nome,
          JSON.stringify(scopedFilters),
          body.ativa,
        ],
      );
      const saved = inserted.rows[0];
      await client.query(
        `INSERT INTO alertas_regras (tenant_id, busca_id, usuario_id, empresa_id, nome, regra, ativa,
                                     canais, frequencia, tipos)
         SELECT $1, $2, $3, $4, $5, $6::jsonb, $7, '["in_app"]'::jsonb, 'diario', ARRAY['novos']
          WHERE NOT EXISTS (
            SELECT 1 FROM alertas_regras WHERE tenant_id = $1 AND busca_id = $2
          )`,
        [
          request.user.tenantId,
          saved.id,
          request.user.sub,
          empresaId ?? null,
          body.nome,
          JSON.stringify(scopedFilters),
          body.ativa,
        ],
      );
      await audit(client, request, 'saved_search.created', 'busca_salva', saved.id, {
        empresa_id: empresaId ?? null,
      });
      return saved;
    });
    return reply.code(201).send(result);
  });

  app.patch('/saved-searches/:savedSearchId', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'admin', 'operador'])) return reply;
    const { savedSearchId } = savedSearchPathSchema.parse(request.params);
    const body = savedSearchPatchSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const scopedFilters = body.filtros
        ? applyNicheScope(
            body.filtros,
            await readUserNiches(client, request.user.tenantId, request.user.sub),
            request.user.role,
          )
        : null;
      const updated = await client.query(
        `UPDATE buscas_salvas
            SET nome = COALESCE($3, nome), filtros = COALESCE($4::jsonb, filtros),
                ativa = COALESCE($5, ativa), updated_at = now()
          WHERE id = $1 AND tenant_id = $2
            AND (usuario_id = $6 OR $7::text IN ('admin', 'operador'))
          RETURNING id, tenant_id, usuario_id, empresa_id, nome, filtros, ativa, created_at, updated_at`,
        [
          savedSearchId,
          request.user.tenantId,
          body.nome ?? null,
          scopedFilters ? JSON.stringify(scopedFilters) : null,
          body.ativa ?? null,
          request.user.sub,
          databaseRole(request.user.role),
        ],
      );
      if (!updated.rows[0]) return null;
      await client.query(
        `UPDATE alertas_regras
            SET nome = COALESCE($3, nome), regra = COALESCE($4::jsonb, regra),
                ativa = COALESCE($5, ativa), updated_at = now()
          WHERE tenant_id = $1 AND busca_id = $2`,
        [
          request.user.tenantId,
          savedSearchId,
          body.nome ?? null,
          scopedFilters ? JSON.stringify(scopedFilters) : null,
          body.ativa ?? null,
        ],
      );
      await audit(client, request, 'saved_search.updated', 'busca_salva', savedSearchId);
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'saved_search_not_found' });
    return reply.send(result);
  });

  app.delete('/saved-searches/:savedSearchId', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'admin', 'operador'])) return reply;
    const { savedSearchId } = savedSearchPathSchema.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const removed = await withTenant(pool, authContext(request), async (client) => {
      const result = await client.query(
        `DELETE FROM buscas_salvas
          WHERE id = $1 AND tenant_id = $2
            AND (usuario_id = $3 OR $4::text IN ('admin', 'operador'))
          RETURNING id`,
        [savedSearchId, request.user.tenantId, request.user.sub, databaseRole(request.user.role)],
      );
      if (result.rows[0]) {
        await audit(client, request, 'saved_search.deleted', 'busca_salva', savedSearchId);
      }
      return result.rows[0];
    });
    if (!removed) return reply.code(404).send({ error: 'saved_search_not_found' });
    return reply.code(204).send();
  });

  const markAlertRead = async (request: FastifyRequest, reply: FastifyReply) => {
    const { alertId } = alertPathSchema.parse(request.params);
    const body = alertReadSchema.parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE alerta_entregas
            SET status = CASE WHEN $3 THEN 'lida' ELSE 'pendente' END
          WHERE id = $1 AND tenant_id = $2
            AND usuario_id = $4 AND canal = 'in_app' AND status IN ('pendente', 'lida')
          RETURNING id, alerta_regra_id, edital_id, canal, status, payload, entregue_em`,
        [alertId, request.user.tenantId, body.lida, request.user.sub],
      );
      if (updated.rows[0]) await audit(client, request, 'alert.read', 'alerta_entrega', alertId);
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'alert_not_found' });
    return reply.send(result);
  };
  app.patch('/alerts/:alertId/read', markAlertRead);
  app.patch('/alerts/:alertId', markAlertRead);

  app.get('/dashboard/alerts-summary', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT count(*)::integer AS total,
                count(*) FILTER (WHERE ae.status <> 'lida')::integer AS nao_lidas,
                max(created_at) AS ultimo_alerta
           FROM alerta_entregas ae
          WHERE ae.tenant_id = $1 AND ae.usuario_id = $2
            AND ae.canal = 'in_app' AND ae.status IN ('pendente', 'lida')`,
        [request.user.tenantId, request.user.sub],
      ),
    );
    return reply.send(result.rows[0] ?? { total: 0, nao_lidas: 0, ultimo_alerta: null });
  });

  app.get('/dashboard/summary', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const [opportunities, deadlines, tasks, unread] = await Promise.all([
        client.query(
          `SELECT count(*)::integer AS total,
                  count(*) FILTER (WHERE status = 'triagem')::integer AS triagem,
                  count(*) FILTER (WHERE status = 'em_analise')::integer AS em_analise,
                  count(*) FILTER (WHERE status = 'proposta')::integer AS proposta
             FROM oportunidades_salvas WHERE tenant_id = $1`,
          [request.user.tenantId],
        ),
        client.query(
          `SELECT count(*)::integer AS total,
                  count(*) FILTER (WHERE vence_em < now() AND status = 'aberto')::integer AS atrasados
             FROM prazos_agenda WHERE tenant_id = $1`,
          [request.user.tenantId],
        ),
        client.query(
          `SELECT count(*)::integer AS abertas
             FROM tarefas WHERE tenant_id = $1 AND status IN ('aberta', 'em_andamento')`,
          [request.user.tenantId],
        ),
        client.query(
          `SELECT count(*)::integer AS total
             FROM notificacoes WHERE tenant_id = $1 AND usuario_id = $2 AND lida_em IS NULL`,
          [request.user.tenantId, request.user.sub],
        ),
      ]);
      return {
        oportunidades: opportunities.rows[0],
        prazos: deadlines.rows[0],
        tarefas: tasks.rows[0],
        notificacoes_nao_lidas: unread.rows[0]?.total ?? 0,
      };
    });
    return reply.send(result);
  });

  app.get('/editais/:editalId', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const { editalId } = editalPathSchema.parse(request.params);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const [edital, itens, versoes, chunks, analise, documentos, eventos] = await Promise.all([
        client.query(
          `SELECT id, fonte, sistema_origem, id_externo, titulo, orgao, uf, uasg,
                  municipio_ibge, municipio_nome, esfera, poder, modalidade, codigo_modalidade,
                  modo_disputa, codigo_modo_disputa, situacao, instrumento, codigo_instrumento,
                  srp, catmat_catser, valor_estimado, valor_homologado, data_publicacao,
                  data_atualizacao, data_abertura_proposta, data_encerramento_proposta,
                  url_origem, conteudo_texto, hash_conteudo, estado_completude,
                  orgao_cnpj, numero_compra, processo, amparo_legal, informacao_complementar,
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
        client.query(
          `SELECT id, numero, fonte, url_origem, hash_conteudo, publicado_em, capturado_em
             FROM edital_versoes WHERE edital_id = $1 ORDER BY numero DESC`,
          [editalId],
        ),
        client.query(
          `SELECT id, pagina, secao, clausula, conteudo, fonte, confianca, status_validacao,
                  corrigido_por, corrigido_em, observacao_correcao
             FROM edital_chunks WHERE edital_id = $1 ORDER BY pagina, id`,
          [editalId],
        ),
        client.query(
          `SELECT id, status, resultado, modelo, prompt_version, erro, created_at, updated_at
             FROM analises_ia WHERE edital_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [editalId],
        ),
        client.query(
          `SELECT id, tipo, nome_arquivo, url, mime_type, tamanho_bytes, hash_conteudo,
                  estado, created_at, updated_at
             FROM edital_documentos WHERE edital_id = $1 ORDER BY created_at DESC`,
          [editalId],
        ),
        client.query(
          `SELECT id, tipo, fonte, ocorrido_em, payload, hash_evento, created_at
             FROM edital_eventos WHERE edital_id = $1 ORDER BY ocorrido_em DESC NULLS LAST, created_at DESC`,
          [editalId],
        ),
      ]);
      const interacao = await client.query(
        `SELECT favorito, descartado, visto_em, nota, updated_at
           FROM edital_interacoes WHERE edital_id = $1 AND usuario_id = $2`,
        [editalId, request.user.sub],
      );
      return {
        edital: edital.rows[0],
        interacao: interacao.rows[0] ?? {
          favorito: false,
          descartado: false,
          visto_em: null,
          nota: null,
        },
        itens: itens.rows,
        versoes: versoes.rows,
        evidencias: chunks.rows,
        analise: analise.rows[0] ?? null,
        documentos: documentos.rows,
        eventos: eventos.rows,
      };
    });
    if (!result.edital) return reply.code(404).send({ error: 'edital_not_found' });
    return reply.send(result);
  });

  app.patch('/editais/:editalId/corrections', async (request, reply) => {
    const { editalId } = editalPathSchema.parse(request.params);
    const body = correctionSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE editais
            SET titulo = COALESCE($3, titulo), orgao = COALESCE($4, orgao),
                uf = COALESCE($5, uf), modalidade = COALESCE($6, modalidade),
                catmat_catser = COALESCE($7, catmat_catser), valor_estimado = COALESCE($8, valor_estimado),
                url_origem = COALESCE($9, url_origem), updated_at = now()
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, titulo, orgao, uf, modalidade, catmat_catser, valor_estimado, url_origem, updated_at`,
        [
          editalId,
          request.user.tenantId,
          body.titulo ?? null,
          body.orgao ?? null,
          body.uf ?? null,
          body.modalidade ?? null,
          body.catmat_catser ?? null,
          body.valor_estimado ?? null,
          body.url_origem ?? null,
        ],
      );
      if (updated.rows[0]) {
        await audit(client, request, 'edital.corrected', 'edital', editalId, {
          origem: 'user_correction',
          observacao: body.observacao ?? '',
        });
      }
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'edital_not_found' });
    return reply.send(result);
  });

  app.patch('/reader/chunks/:chunkId', async (request, reply) => {
    const { chunkId } = chunkPathSchema.parse(request.params);
    const body = chunkCorrectionSchema.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE edital_chunks
            SET status_validacao = $3, observacao_correcao = $4,
                corrigido_por = $5, corrigido_em = now()
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, edital_id, pagina, conteudo, fonte, confianca, status_validacao,
                    observacao_correcao, corrigido_por, corrigido_em`,
        [
          chunkId,
          request.user.tenantId,
          body.status_validacao,
          body.observacao_correcao ?? null,
          request.user.sub,
        ],
      );
      if (updated.rows[0])
        await audit(client, request, 'reader.evidence.validated', 'edital_chunk', chunkId);
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'reader_chunk_not_found' });
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
    const result = await withTenant(pool, authContext(request), async (client) => {
      const questions = await client.query<{ id: string; resposta_correta: number | null }>(
        'SELECT id, resposta_correta FROM quiz_questoes WHERE quiz_id = $1 ORDER BY ordem',
        [quizId],
      );
      if (questions.rows.length === 0) return null;
      const graded = questions.rows.filter((question) => question.resposta_correta !== null);
      const resultado = graded.map((question) => ({
        questao_id: question.id,
        correta: body.respostas[question.id] === question.resposta_correta,
        resposta_correta: question.resposta_correta,
      }));
      const nota = graded.length
        ? Math.round((resultado.filter((item) => item.correta).length / graded.length) * 10000) /
          100
        : null;
      const inserted = await client.query(
        `INSERT INTO quiz_tentativas (tenant_id, usuario_id, quiz_id, respostas, nota)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING id, quiz_id, respostas, nota, created_at`,
        [request.user.tenantId, request.user.sub, quizId, JSON.stringify(body.respostas), nota],
      );
      return { ...inserted.rows[0], resultado };
    });
    if (!result) return reply.code(404).send({ error: 'quiz_not_found' });
    return reply.code(201).send(result);
  });

  app.get('/mentorado/dashboard', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'aluno'])) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const [profile, progress, alerts] = await Promise.all([
        client.query(
          `SELECT id, nome, perfil_jornada, onboarding_concluido
             FROM usuarios WHERE tenant_id = $1 AND id = $2`,
          [request.user.tenantId, request.user.sub],
        ),
        client.query(
          `SELECT count(*)::integer AS aulas_com_progresso,
                  count(*) FILTER (WHERE concluida)::integer AS aulas_concluidas,
                  coalesce(round(avg(percentual)), 0)::integer AS percentual_medio
             FROM progresso_aula WHERE tenant_id = $1 AND usuario_id = $2`,
          [request.user.tenantId, request.user.sub],
        ),
        client.query(
          `SELECT count(*)::integer AS nao_lidas
             FROM notificacoes WHERE tenant_id = $1 AND usuario_id = $2 AND lida_em IS NULL`,
          [request.user.tenantId, request.user.sub],
        ),
      ]);
      return {
        usuario: profile.rows[0] ?? null,
        progresso: progress.rows[0] ?? {
          aulas_com_progresso: 0,
          aulas_concluidas: 0,
          percentual_medio: 0,
        },
        notificacoes_nao_lidas: alerts.rows[0]?.nao_lidas ?? 0,
      };
    });
    if (!result.usuario) return reply.code(404).send({ error: 'user_not_found' });
    return reply.send(result);
  });

  app.get('/professional/dashboard', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'admin', 'operador'])) return;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const profile = await client.query<{ id: string }>(
        `SELECT id FROM usuarios
          WHERE tenant_id = $1 AND id = $2 AND ativo = true`,
        [request.user.tenantId, request.user.sub],
      );
      if (!profile.rows[0]) return null;
      const [opportunities, deadlines, tasks] = await Promise.all([
        client.query(
          `SELECT count(*)::integer AS total,
                  count(*) FILTER (WHERE status IN ('triagem', 'em_analise', 'proposta'))::integer AS em_andamento
             FROM oportunidades_salvas WHERE tenant_id = $1 AND usuario_id = $2`,
          [request.user.tenantId, request.user.sub],
        ),
        client.query(
          `SELECT count(*)::integer AS total,
                  count(*) FILTER (WHERE vence_em >= now() AND vence_em < now() + interval '7 days' AND status = 'aberto')::integer AS proximos_7_dias
             FROM prazos_agenda WHERE tenant_id = $1`,
          [request.user.tenantId],
        ),
        client.query(
          `SELECT count(*)::integer AS abertas
             FROM tarefas WHERE tenant_id = $1 AND status IN ('aberta', 'em_andamento')`,
          [request.user.tenantId],
        ),
      ]);
      return {
        oportunidades: opportunities.rows[0],
        prazos: deadlines.rows[0],
        tarefas: tasks.rows[0],
      };
    });
    if (!result) return reply.code(403).send({ error: 'forbidden' });
    return reply.send(result);
  });

  app.get('/mentor/dashboard', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma', 'mentor'])) return;
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

  registerPlatformRoutes(app, { pool, config });
  registerRadarRoutes(app, { pool });
  registerAlertRoutes(app, { pool, config });
  registerLearningRoutes(app, { pool });
  registerCompanyRoutes(app, { pool });
  registerCollectionRoutes(app, { pool, config });

  return app;
}
