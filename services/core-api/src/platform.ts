import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createOpaqueToken, hashOpaqueToken, PublicRateLimiter } from './auth-public.js';
import type { RuntimeConfig } from './config.js';
import { withTenant } from './db.js';
import { sendEmail } from './email.js';
import { assertStrongPassword, hashPassword } from './password.js';
import { auditPublic, sendDatabaseUnavailable, withPlatform } from './request-context.js';

/** Convites valem 7 dias e só podem ser usados uma vez. */
export const INVITATION_TTL_DAYS = 7;

const uuid = z.string().uuid();
const idParams = z.object({ id: uuid });
const userParams = z.object({ userId: uuid });

const classBody = z.object({
  nome: z.string().trim().min(2).max(120),
  mentor_id: uuid.nullable().optional(),
  inicio: z.string().date().nullable().optional(),
  fim: z.string().date().nullable().optional(),
});
const classPatch = classBody
  .partial()
  .extend({ status: z.enum(['ativa', 'encerrada']).optional() });

const invitationBody = z
  .object({
    tipo: z.enum(['aluno', 'mentor', 'empresa']),
    nome: z.string().trim().min(2).max(160),
    email: z.string().trim().toLowerCase().email().max(200),
    empresa_nome: z.string().trim().min(2).max(200).optional(),
    turma_id: uuid.optional(),
    mentor_id: uuid.optional(),
  })
  .superRefine((value, context) => {
    if (value.tipo === 'empresa' && !value.empresa_nome) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['empresa_nome'],
        message: 'Informe o nome da empresa.',
      });
    }
    if (value.tipo === 'aluno' && !value.turma_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['turma_id'],
        message: 'Escolha a turma do aluno.',
      });
    }
  });

const tokenBody = z.object({ token: z.string().min(20).max(200) });
const acceptBody = tokenBody.extend({
  password: z.string().min(1).max(200),
  termos_aceitos: z.literal(true),
  privacidade_aceita: z.literal(true),
});

export function invitationLink(config: RuntimeConfig, token: string): string {
  const base = (config.appUrl ?? config.siteUrl ?? '').replace(/\/+$/, '');
  return `${base}/convite?token=${token}`;
}

function slugify(value: string, suffix: string): string {
  const base = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${base || 'empresa'}-${suffix}`;
}

type Deps = { pool: Pool | undefined; config: RuntimeConfig };

/**
 * Rotas da equipe do produto. Todas exigem o papel `plataforma` (conferido aqui e de novo
 * pelo banco em `withPlatform`) e gravam auditoria.
 */
export function registerPlatformRoutes(app: FastifyInstance, { pool, config }: Deps): void {
  const publicLimiter = new PublicRateLimiter(12);

  app.register(async (platform) => {
    platform.addHook('preHandler', async (request, reply) => {
      if (request.user.role !== 'plataforma') {
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (!pool) return sendDatabaseUnavailable(reply);
    });

    platform.get('/platform/overview', async (request) => {
      const tenantId = request.user.tenantId;
      return withPlatform(pool!, request, 'platform.overview.read', async (client) => {
        // Sequencial de propósito: o driver não aceita consultas simultâneas no mesmo cliente.
        const row = async (sql: string, params: unknown[] = []) =>
          (await client.query(sql, params)).rows[0];
        const accounts = await client.query(
          `SELECT papel::text AS papel, count(*)::int AS total,
                  count(*) FILTER (WHERE ativo)::int AS ativos
             FROM usuarios GROUP BY papel ORDER BY papel`,
        );
        return {
          contas_por_papel: accounts.rows,
          empresas_clientes: await row(
            `SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS novos_30d
               FROM tenants WHERE NOT is_platform_tenant(id)`,
          ),
          curso: await row(
            `SELECT (SELECT count(*) FROM usuarios WHERE tenant_id = $1 AND papel = 'aluno' AND ativo)::int AS alunos_ativos,
                    (SELECT count(*) FROM turmas WHERE tenant_id = $1 AND status = 'ativa')::int AS turmas_ativas,
                    (SELECT count(*) FROM usuarios WHERE tenant_id = $1 AND papel = 'mentor' AND ativo)::int AS mentores_ativos,
                    (SELECT count(*) FROM convites WHERE tenant_id = $1 AND usado_em IS NULL
                        AND revogado_em IS NULL AND expira_em > now())::int AS convites_pendentes`,
            [tenantId],
          ),
          alertas: await row(
            `SELECT count(*)::int AS ultimas_24h FROM alerta_entregas
              WHERE created_at > now() - interval '24 hours'`,
          ),
          buscas_salvas: await row('SELECT count(*)::int AS ativas FROM buscas_salvas WHERE ativa'),
          leads: await row(
            `SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS novos_7d,
                    count(*) FILTER (WHERE status = 'novo')::int AS novos
               FROM plataforma_listar_leads(500)`,
          ),
          editais: await row(
            `SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS capturados_24h,
                    max(updated_at) AS ultima_captura
               FROM editais WHERE tenant_id = $1`,
            [tenantId],
          ),
          ingestao: await row(
            `SELECT (SELECT count(*) FROM ingest_checkpoints WHERE tenant_id = $1)::int AS checkpoints,
                    (SELECT max(updated_at) FROM ingest_checkpoints WHERE tenant_id = $1) AS ultima_execucao,
                    (SELECT count(*) FROM ingest_dead_letters WHERE tenant_id = $1 AND resolvida_em IS NULL)::int AS dead_letters_pendentes`,
            [tenantId],
          ),
          ana: await row(
            `SELECT count(*)::int AS conversas_7d FROM ana_conversas
              WHERE created_at > now() - interval '7 days'`,
          ),
        };
      });
    });

    platform.get('/platform/companies', async (request) => {
      const result = await withPlatform(pool!, request, 'platform.companies.listed', (client) =>
        client.query(
          `SELECT t.id AS tenant_id, t.nome, t.created_at,
                  u.id AS usuario_id, u.nome AS responsavel, u.email, u.ativo,
                  u.onboarding_concluido, u.nicho_preferencias, u.email_verificado_em,
                  e.razao_social, e.cnpj,
                  (SELECT count(*) FROM buscas_salvas b WHERE b.tenant_id = t.id AND b.ativa)::int AS buscas_ativas,
                  (SELECT count(*) FROM oportunidades_salvas o WHERE o.tenant_id = t.id)::int AS oportunidades
             FROM tenants t
             LEFT JOIN LATERAL (
               SELECT * FROM usuarios x
                WHERE x.tenant_id = t.id AND x.papel IN ('admin', 'operador')
                ORDER BY x.created_at LIMIT 1
             ) u ON true
             LEFT JOIN LATERAL (
               SELECT razao_social, cnpj FROM empresas y
                WHERE y.tenant_id = t.id ORDER BY y.created_at LIMIT 1
             ) e ON true
            WHERE NOT is_platform_tenant(t.id)
            ORDER BY t.created_at DESC
            LIMIT 500`,
        ),
      );
      return { data: result.rows };
    });

    platform.patch('/platform/users/:userId/active', async (request, reply) => {
      const { userId } = userParams.parse(request.params);
      const body = z.object({ ativo: z.boolean() }).parse(request.body);
      if (userId === request.user.sub) {
        return reply.code(409).send({
          error: 'cannot_change_self',
          message: 'Você não pode desativar a própria conta.',
        });
      }
      const result = await withPlatform(
        pool!,
        request,
        body.ativo ? 'platform.user.activated' : 'platform.user.deactivated',
        async (client) => {
          const updated = await client.query(
            `UPDATE usuarios SET ativo = $2, updated_at = now() WHERE id = $1
             RETURNING id, tenant_id, nome, email, ativo`,
            [userId, body.ativo],
          );
          return updated.rows[0] ?? null;
        },
        { usuario_id: userId },
      );
      if (!result) return reply.code(404).send({ error: 'user_not_found' });
      return result;
    });

    platform.get('/platform/students', async (request) => {
      const tenantId = request.user.tenantId;
      const result = await withPlatform(pool!, request, 'platform.students.listed', (client) =>
        client.query(
          `SELECT u.id, u.nome, u.email, u.ativo, u.onboarding_concluido, u.created_at,
                  m.status AS matricula_status, t.id AS turma_id, t.nome AS turma_nome,
                  mm.mentor_id, mu.nome AS mentor_nome,
                  (SELECT count(*) FILTER (WHERE p.concluida) FROM progresso_aula p
                    WHERE p.tenant_id = u.tenant_id AND p.usuario_id = u.id)::int AS aulas_concluidas,
                  (SELECT max(p.updated_at) FROM progresso_aula p
                    WHERE p.tenant_id = u.tenant_id AND p.usuario_id = u.id) AS ultimo_progresso,
                  (SELECT count(*) FROM plano_dias d
                    WHERE d.tenant_id = u.tenant_id AND d.aluno_id = u.id AND d.status <> 'pendente')::int AS plano_feitos,
                  (SELECT count(*) FROM plano_dias d
                    WHERE d.tenant_id = u.tenant_id AND d.aluno_id = u.id)::int AS plano_total,
                  (SELECT count(*) FROM praticas_edital x
                    WHERE x.tenant_id = u.tenant_id AND x.aluno_id = u.id AND x.status <> 'rascunho')::int AS praticas_enviadas,
                  (SELECT count(*) FROM praticas_edital x
                    WHERE x.tenant_id = u.tenant_id AND x.aluno_id = u.id AND x.status = 'devolvida')::int AS praticas_devolvidas,
                  (SELECT count(*) FROM certificados_internos c
                    WHERE c.tenant_id = u.tenant_id AND c.aluno_id = u.id)::int AS certificados
             FROM usuarios u
             LEFT JOIN LATERAL (
               SELECT * FROM matriculas x WHERE x.aluno_id = u.id ORDER BY x.created_at DESC LIMIT 1
             ) m ON true
             LEFT JOIN turmas t ON t.id = m.turma_id
             LEFT JOIN LATERAL (
               SELECT mentor_id FROM mentor_mentorado y
                WHERE y.mentorado_id = u.id AND y.status = 'ativo' ORDER BY y.created_at LIMIT 1
             ) mm ON true
             LEFT JOIN usuarios mu ON mu.id = mm.mentor_id
            WHERE u.tenant_id = $1 AND u.papel = 'aluno'
            ORDER BY u.nome`,
          [tenantId],
        ),
      );
      return { data: result.rows };
    });

    platform.get('/platform/mentors', async (request) => {
      const tenantId = request.user.tenantId;
      const result = await withPlatform(pool!, request, 'platform.mentors.listed', (client) =>
        client.query(
          `SELECT u.id, u.nome, u.email, u.ativo, u.created_at,
                  (SELECT count(*) FROM mentor_mentorado m
                    WHERE m.tenant_id = u.tenant_id AND m.mentor_id = u.id AND m.status = 'ativo')::int AS alunos_ativos,
                  (SELECT count(*) FROM concessoes_mentor c
                    WHERE c.tenant_id = u.tenant_id AND c.mentor_id = u.id AND c.revogada_em IS NULL
                      AND (c.fim_em IS NULL OR c.fim_em > now()))::int AS concessoes_ativas
             FROM usuarios u
            WHERE u.tenant_id = $1 AND u.papel = 'mentor'
            ORDER BY u.nome`,
          [tenantId],
        ),
      );
      return { data: result.rows };
    });

    platform.get('/platform/classes', async (request) => {
      const tenantId = request.user.tenantId;
      const result = await withPlatform(pool!, request, 'platform.classes.listed', (client) =>
        client.query(
          `SELECT t.id, t.nome, t.status, t.inicio, t.fim, t.mentor_id, mu.nome AS mentor_nome,
                  (SELECT count(*) FROM matriculas m WHERE m.turma_id = t.id AND m.status = 'ativa')::int AS alunos_ativos
             FROM turmas t LEFT JOIN usuarios mu ON mu.id = t.mentor_id
            WHERE t.tenant_id = $1
            ORDER BY t.status, t.nome`,
          [tenantId],
        ),
      );
      return { data: result.rows };
    });

    platform.post('/platform/classes', async (request, reply) => {
      const body = classBody.parse(request.body);
      try {
        const created = await withPlatform(
          pool!,
          request,
          'platform.class.created',
          async (client) => {
            if (body.mentor_id) await assertMentor(client, request.user.tenantId, body.mentor_id);
            const inserted = await client.query(
              `INSERT INTO turmas (tenant_id, nome, mentor_id, inicio, fim)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, nome, status, inicio, fim, mentor_id`,
              [
                request.user.tenantId,
                body.nome,
                body.mentor_id ?? null,
                body.inicio ?? null,
                body.fim ?? null,
              ],
            );
            return inserted.rows[0];
          },
        );
        return reply.code(201).send(created);
      } catch (error) {
        return handleKnownErrors(reply, error);
      }
    });

    platform.patch('/platform/classes/:id', async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = classPatch.parse(request.body);
      try {
        const updated = await withPlatform(
          pool!,
          request,
          'platform.class.updated',
          async (client) => {
            if (body.mentor_id) await assertMentor(client, request.user.tenantId, body.mentor_id);
            const result = await client.query(
              `UPDATE turmas
                  SET nome = COALESCE($3, nome),
                      mentor_id = CASE WHEN $4::boolean THEN $5::uuid ELSE mentor_id END,
                      inicio = CASE WHEN $6::boolean THEN $7::date ELSE inicio END,
                      fim = CASE WHEN $8::boolean THEN $9::date ELSE fim END,
                      status = COALESCE($10, status),
                      updated_at = now()
                WHERE tenant_id = $1 AND id = $2
                RETURNING id, nome, status, inicio, fim, mentor_id`,
              [
                request.user.tenantId,
                id,
                body.nome ?? null,
                body.mentor_id !== undefined,
                body.mentor_id ?? null,
                body.inicio !== undefined,
                body.inicio ?? null,
                body.fim !== undefined,
                body.fim ?? null,
                body.status ?? null,
              ],
            );
            return result.rows[0] ?? null;
          },
          { turma_id: id },
        );
        if (!updated) return reply.code(404).send({ error: 'class_not_found' });
        return updated;
      } catch (error) {
        return handleKnownErrors(reply, error);
      }
    });

    platform.get('/platform/invitations', async (request) => {
      const result = await withPlatform(pool!, request, 'platform.invitations.listed', (client) =>
        client.query(
          `SELECT c.id, c.tipo, c.nome, c.email, c.empresa_nome, c.turma_id, t.nome AS turma_nome,
                  c.expira_em, c.usado_em, c.revogado_em, c.created_at,
                  CASE WHEN c.usado_em IS NOT NULL THEN 'aceito'
                       WHEN c.revogado_em IS NOT NULL THEN 'revogado'
                       WHEN c.expira_em <= now() THEN 'expirado'
                       ELSE 'pendente' END AS situacao
             FROM convites c LEFT JOIN turmas t ON t.id = c.turma_id
            WHERE c.tenant_id = $1
            ORDER BY c.created_at DESC
            LIMIT 300`,
          [request.user.tenantId],
        ),
      );
      return { data: result.rows };
    });

    platform.post('/platform/invitations', async (request, reply) => {
      const body = invitationBody.parse(request.body);
      const token = createOpaqueToken();
      try {
        const created = await withPlatform(
          pool!,
          request,
          'platform.invitation.created',
          async (client) => {
            const tenantId = request.user.tenantId;
            await assertEmailFree(client, body.tipo, tenantId, body.email);
            if (body.turma_id) {
              const turma = await client.query<{ mentor_id: string | null }>(
                "SELECT mentor_id FROM turmas WHERE tenant_id = $1 AND id = $2 AND status = 'ativa'",
                [tenantId, body.turma_id],
              );
              if (!turma.rows[0]) throw new PlatformError(404, 'class_not_found');
            }
            if (body.mentor_id) await assertMentor(client, tenantId, body.mentor_id);
            // Um único convite pendente por e-mail e tipo: o novo substitui o anterior.
            await client.query(
              `UPDATE convites SET revogado_em = now()
                WHERE tenant_id = $1 AND lower(email) = $2 AND tipo = $3
                  AND usado_em IS NULL AND revogado_em IS NULL`,
              [tenantId, body.email, body.tipo],
            );
            const inserted = await client.query<{ id: string; expira_em: Date }>(
              `INSERT INTO convites
                 (tenant_id, tipo, email, nome, empresa_nome, turma_id, mentor_id, token_hash,
                  expira_em, criado_por)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                       now() + make_interval(days => $9), $10)
               RETURNING id, expira_em`,
              [
                tenantId,
                body.tipo,
                body.email,
                body.nome,
                body.tipo === 'empresa' ? (body.empresa_nome ?? null) : null,
                body.turma_id ?? null,
                body.mentor_id ?? null,
                hashOpaqueToken(token),
                INVITATION_TTL_DAYS,
                request.user.sub,
              ],
            );
            return inserted.rows[0]!;
          },
          { tipo: body.tipo },
        );
        const link = invitationLink(config, token);
        await deliverInvitationEmail(config, body.email, body.nome, link);
        // O link só aparece nesta resposta. Quem tem acesso a ele pode criar a conta.
        return reply.code(201).send({
          id: created.id,
          expira_em: created.expira_em,
          link,
          email_enviado: config.emailProvider === 'smtp',
        });
      } catch (error) {
        return handleKnownErrors(reply, error);
      }
    });

    platform.post('/platform/invitations/:id/revoke', async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const revoked = await withPlatform(
        pool!,
        request,
        'platform.invitation.revoked',
        async (client) => {
          const result = await client.query(
            `UPDATE convites SET revogado_em = now()
              WHERE tenant_id = $1 AND id = $2 AND usado_em IS NULL AND revogado_em IS NULL
              RETURNING id`,
            [request.user.tenantId, id],
          );
          return result.rows[0] ?? null;
        },
        { convite_id: id },
      );
      if (!revoked) return reply.code(404).send({ error: 'invitation_not_found' });
      return reply.send({ id, situacao: 'revogado' });
    });

    platform.post('/platform/invitations/:id/reissue', async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const token = createOpaqueToken();
      const reissued = await withPlatform(
        pool!,
        request,
        'platform.invitation.reissued',
        async (client) => {
          const result = await client.query<{ email: string; nome: string; expira_em: Date }>(
            `UPDATE convites
                SET token_hash = $3, expira_em = now() + make_interval(days => $4), revogado_em = NULL
              WHERE tenant_id = $1 AND id = $2 AND usado_em IS NULL
              RETURNING email, nome, expira_em`,
            [request.user.tenantId, id, hashOpaqueToken(token), INVITATION_TTL_DAYS],
          );
          return result.rows[0] ?? null;
        },
        { convite_id: id },
      );
      if (!reissued) return reply.code(404).send({ error: 'invitation_not_found' });
      const link = invitationLink(config, token);
      await deliverInvitationEmail(config, reissued.email, reissued.nome, link);
      return reply.send({
        id,
        expira_em: reissued.expira_em,
        link,
        email_enviado: config.emailProvider === 'smtp',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Aceite público do convite (sem sessão). Mensagens genéricas: não revelam quem existe.
  // -------------------------------------------------------------------------
  app.post('/auth/invitations/preview', async (request, reply) => {
    publicLimiter.check(`invite-preview:${request.ip}`);
    const { token } = tokenBody.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const found = await withAuthFlow(pool, async (client) => {
      const result = await client.query(
        `SELECT tipo, nome, email, empresa_nome FROM convites
          WHERE token_hash = $1 AND usado_em IS NULL AND revogado_em IS NULL AND expira_em > now()`,
        [hashOpaqueToken(token)],
      );
      return result.rows[0] ?? null;
    });
    if (!found) return reply.code(404).send({ error: 'invalid_or_expired_invitation' });
    return reply.send(found);
  });

  app.post('/auth/invitations/accept', async (request, reply) => {
    publicLimiter.check(`invite-accept:${request.ip}`);
    const body = acceptBody.parse(request.body);
    try {
      assertStrongPassword(body.password);
    } catch {
      return reply.code(400).send({ error: 'weak_password' });
    }
    if (!pool) return sendDatabaseUnavailable(reply);

    const outcome = await withAuthFlow(pool, async (client) => {
      const found = await client.query<{
        id: string;
        tenant_id: string;
        tipo: 'aluno' | 'mentor' | 'empresa';
        email: string;
        nome: string;
        empresa_nome: string | null;
        turma_id: string | null;
        mentor_id: string | null;
      }>(
        `SELECT id, tenant_id, tipo, email, nome, empresa_nome, turma_id, mentor_id FROM convites
          WHERE token_hash = $1 AND usado_em IS NULL AND revogado_em IS NULL AND expira_em > now()
          FOR UPDATE`,
        [hashOpaqueToken(body.token)],
      );
      const invite = found.rows[0];
      if (!invite) return null;

      const userId = randomUUID();
      const passwordHash = hashPassword(body.password);
      let tenantId = invite.tenant_id;
      if (invite.tipo === 'empresa') {
        tenantId = randomUUID();
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        await client.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
          tenantId,
          invite.empresa_nome ?? invite.nome,
          slugify(invite.empresa_nome ?? invite.nome, tenantId.slice(0, 8)),
        ]);
      } else {
        // Aluno e mentor entram na conta da plataforma. O fluxo é do sistema: grava com o
        // papel administrativo da própria conta, como as policies exigem.
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        await client.query("SELECT set_config('app.role', 'admin', true)");
      }
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);

      const role = invite.tipo === 'empresa' ? 'admin' : invite.tipo;
      await client.query(
        `INSERT INTO usuarios
           (id, tenant_id, email, nome, papel, perfil_jornada, password_hash, publico,
            email_verificado_em, termos_versao, termos_aceitos_em, politica_versao, politica_aceita_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, now(), $10, now())`,
        [
          userId,
          tenantId,
          invite.email,
          invite.nome,
          role,
          invite.tipo === 'aluno'
            ? 'mentorado'
            : invite.tipo === 'mentor'
              ? 'profissional'
              : 'iniciante',
          passwordHash,
          invite.tipo === 'empresa' ? 'empresa' : 'mentoria',
          config.termsVersion,
          config.privacyVersion,
        ],
      );
      await client.query(
        `INSERT INTO auth_credentials
           (tenant_id, usuario_id, email, password_hash, email_verificado_em)
         VALUES ($1, $2, $3, $4, now())`,
        [tenantId, userId, invite.email, passwordHash],
      );
      if (invite.tipo === 'aluno' && invite.turma_id) {
        await client.query(
          'INSERT INTO matriculas (tenant_id, turma_id, aluno_id) VALUES ($1, $2, $3)',
          [tenantId, invite.turma_id, userId],
        );
        const mentorId =
          invite.mentor_id ??
          (
            await client.query<{ mentor_id: string | null }>(
              'SELECT mentor_id FROM turmas WHERE tenant_id = $1 AND id = $2',
              [tenantId, invite.turma_id],
            )
          ).rows[0]?.mentor_id ??
          null;
        if (mentorId) {
          await client.query(
            `INSERT INTO mentor_mentorado (tenant_id, mentor_id, mentorado_id)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [tenantId, mentorId, userId],
          );
        }
      }
      await client.query(
        `UPDATE convites SET usado_em = now(), usuario_criado_id = $2, tenant_criado_id = $3
          WHERE id = $1`,
        [invite.id, userId, tenantId],
      );
      await auditPublic(
        client,
        request,
        tenantId,
        userId,
        'auth.invitation.accepted',
        'convite',
        invite.id,
        {
          tipo: invite.tipo,
        },
      );
      return { tipo: invite.tipo, email: invite.email };
    });

    if (!outcome) return reply.code(404).send({ error: 'invalid_or_expired_invitation' });
    return reply
      .code(201)
      .send({ message: 'Conta criada. Entre com seu e-mail e senha.', ...outcome });
  });
}

class PlatformError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function handleKnownErrors(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  error: unknown,
): unknown {
  if (error instanceof PlatformError) return reply.code(error.status).send({ error: error.code });
  if (error instanceof Error && 'code' in error && (error as { code?: string }).code === '23505') {
    return reply.code(409).send({ error: 'already_exists' });
  }
  throw error;
}

async function assertMentor(
  client: Parameters<Parameters<typeof withTenant>[2]>[0],
  tenantId: string,
  mentorId: string,
): Promise<void> {
  const result = await client.query(
    "SELECT 1 FROM usuarios WHERE tenant_id = $1 AND id = $2 AND papel = 'mentor' AND ativo",
    [tenantId, mentorId],
  );
  if (!result.rows[0]) throw new PlatformError(404, 'mentor_not_found');
}

async function assertEmailFree(
  client: Parameters<Parameters<typeof withTenant>[2]>[0],
  tipo: 'aluno' | 'mentor' | 'empresa',
  tenantId: string,
  email: string,
): Promise<void> {
  // Aluno e mentor: e-mail livre na conta da plataforma. Empresa: livre em qualquer conta,
  // para o login não precisar pedir escolha de conta. A leitura entre contas é da sessão.
  const result = await client.query(
    tipo === 'empresa'
      ? 'SELECT 1 FROM usuarios WHERE lower(email) = $1 LIMIT 1'
      : 'SELECT 1 FROM usuarios WHERE tenant_id = $2 AND lower(email) = $1 LIMIT 1',
    tipo === 'empresa' ? [email] : [email, tenantId],
  );
  if (result.rows[0]) throw new PlatformError(409, 'email_in_use');
}

async function deliverInvitationEmail(
  config: RuntimeConfig,
  to: string,
  nome: string,
  link: string,
): Promise<void> {
  try {
    await sendEmail(config, {
      to,
      subject: 'Seu acesso ao Licite Comigo',
      text: `Olá, ${nome}.\n\nCrie sua senha e acesse o Licite Comigo pelo link abaixo. Ele vale por ${INVITATION_TTL_DAYS} dias e só pode ser usado uma vez.\n\n${link}\n`,
    });
  } catch {
    // O convite continua valendo e o link já foi entregue ao administrador.
  }
}

/** Sessão sem usuário logado, no fluxo de autenticação (mesmo padrão de login e cadastro). */
async function withAuthFlow<T>(
  pool: Pool,
  callback: (client: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.auth_flow', 'true', true)");
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
