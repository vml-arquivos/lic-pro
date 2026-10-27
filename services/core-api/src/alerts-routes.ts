import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { runAlertCycle, readUnsubscribeToken } from './alert-engine.js';
import type { RuntimeConfig } from './config.js';
import { withTenant } from './db.js';
import { sendEmail } from './email.js';
import {
  audit,
  authContext,
  requireRoles,
  sendDatabaseUnavailable,
  withPlatform,
} from './request-context.js';

type Deps = { pool: Pool | undefined; config: RuntimeConfig };

const uuid = z.string().uuid();
const idParams = z.object({ id: uuid });
const CREATORS = ['plataforma', 'admin', 'operador'] as const;

const listQuery = z.object({
  apenas_nao_lidas: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  tipo: z.enum(['novo', 'alteracao', 'prazo']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const ruleBody = z
  .object({
    ativa: z.boolean(),
    frequencia: z.enum(['imediata', 'diario', 'semanal']),
    horario_diario: z.union([z.literal(7), z.literal(12), z.literal(18)]),
    dia_semana: z.number().int().min(1).max(7),
    canais: z.array(z.enum(['in_app', 'email'])).min(1),
    tipos: z.array(z.enum(['novos', 'alteracao', 'prazo'])).min(1),
    destinatarios: z.array(uuid).max(20),
  })
  .partial();

const preferencesBody = z
  .object({
    pausar_tudo: z.boolean(),
    email_ativo: z.boolean(),
    em_app_ativo: z.boolean(),
  })
  .partial();

const notificationsQuery = z.object({
  apenas_nao_lidas: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function registerAlertRoutes(app: FastifyInstance, { pool, config }: Deps): void {
  const emailEnabled = config.emailProvider === 'smtp';

  app.get('/alerts', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const filters = listQuery.parse(request.query);
    const offset = (filters.page - 1) * filters.page_size;
    const result = await withTenant(pool, authContext(request), async (client) => {
      const rows = await client.query(
        `SELECT ae.id, ae.alerta_regra_id, ae.edital_id, ae.canal, ae.status, ae.tipo,
                ae.idempotency_key, ae.payload, ae.entregue_em, ae.created_at,
                ar.busca_id, COALESCE(bs.nome, ae.payload->>'busca_nome') AS busca_nome,
                e.titulo, e.orgao, e.fonte, e.url_origem, e.data_publicacao,
                e.data_encerramento_proposta
           FROM alerta_entregas ae
           LEFT JOIN alertas_regras ar ON ar.id = ae.alerta_regra_id AND ar.tenant_id = ae.tenant_id
           LEFT JOIN buscas_salvas bs ON bs.id = ar.busca_id AND bs.tenant_id = ae.tenant_id
           JOIN editais e ON e.id = ae.edital_id
          WHERE ae.tenant_id = $1 AND ae.usuario_id = $2
            AND ae.canal = 'in_app' AND ae.status IN ('pendente', 'lida')
            AND ($3::boolean = false OR ae.status <> 'lida')
            AND ($4::text IS NULL OR ae.tipo = $4)
          ORDER BY ae.created_at DESC
          LIMIT $5 OFFSET $6`,
        [
          request.user.tenantId,
          request.user.sub,
          filters.apenas_nao_lidas,
          filters.tipo ?? null,
          filters.page_size,
          offset,
        ],
      );
      const unread = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM alerta_entregas
          WHERE tenant_id = $1 AND usuario_id = $2 AND canal = 'in_app' AND status = 'pendente'`,
        [request.user.tenantId, request.user.sub],
      );
      return { rows: rows.rows, unread: unread.rows[0]?.total ?? 0 };
    });
    return reply.send({
      data: result.rows,
      page: filters.page,
      page_size: filters.page_size,
      nao_lidas: result.unread,
    });
  });

  app.post('/alerts/read-all', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const changed = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE alerta_entregas SET status = 'lida'
          WHERE tenant_id = $1 AND usuario_id = $2 AND canal = 'in_app' AND status = 'pendente'`,
        [request.user.tenantId, request.user.sub],
      );
      return updated.rowCount ?? 0;
    });
    return reply.send({ lidas: changed });
  });

  app.get('/alert-options', async (request, reply) => {
    if (!requireRoles(reply, request, CREATORS)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const people = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT id, nome, email FROM usuarios
          WHERE tenant_id = $1 AND ativo AND papel IN ('admin', 'operador', 'plataforma')
          ORDER BY nome LIMIT 100`,
        [request.user.tenantId],
      ),
    );
    return reply.send({
      canais: [
        { codigo: 'in_app', nome: 'No Licite Comigo (sino)', disponivel: true },
        {
          codigo: 'email',
          nome: 'E-mail',
          disponivel: emailEnabled,
          motivo: emailEnabled
            ? null
            : 'O envio de e-mail ainda não foi configurado neste ambiente.',
        },
        {
          codigo: 'whatsapp',
          nome: 'WhatsApp',
          disponivel: false,
          motivo: 'Indisponível: ainda não há provedor de WhatsApp contratado.',
        },
      ],
      destinatarios: people.rows,
    });
  });

  app.get('/alert-rules', async (request, reply) => {
    if (!requireRoles(reply, request, CREATORS)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const rows = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT ar.id, ar.busca_id, bs.nome AS busca_nome, bs.filtros, ar.ativa, ar.frequencia,
                ar.horario_diario, ar.dia_semana, ar.canais, ar.tipos, ar.destinatarios,
                ar.usuario_id, ar.created_at, ar.updated_at,
                (SELECT count(*)::int FROM alerta_entregas ae WHERE ae.alerta_regra_id = ar.id) AS entregas
           FROM alertas_regras ar
           JOIN buscas_salvas bs ON bs.id = ar.busca_id AND bs.tenant_id = ar.tenant_id
          WHERE ar.tenant_id = $1 AND (ar.usuario_id = $2 OR $3::text IN ('admin', 'operador'))
          ORDER BY bs.nome`,
        [
          request.user.tenantId,
          request.user.sub,
          request.user.role === 'plataforma' ? 'admin' : request.user.role,
        ],
      ),
    );
    return reply.send({ data: rows.rows });
  });

  app.patch('/alert-rules/:id', async (request, reply) => {
    if (!requireRoles(reply, request, CREATORS)) return reply;
    const { id } = idParams.parse(request.params);
    const body = ruleBody.parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    if (body.canais?.includes('email') && !emailEnabled) {
      return reply.code(400).send({
        error: 'channel_unavailable',
        message: 'O envio de e-mail ainda não foi configurado neste ambiente.',
      });
    }
    const result = await withTenant(pool, authContext(request), async (client) => {
      if (body.destinatarios?.length) {
        const valid = await client.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM usuarios
            WHERE tenant_id = $1 AND ativo AND id = ANY($2::uuid[])
              AND papel IN ('admin', 'operador', 'plataforma')`,
          [request.user.tenantId, body.destinatarios],
        );
        if (valid.rows[0]?.total !== new Set(body.destinatarios).size)
          throw new Error('tenant_forbidden');
      }
      const updated = await client.query(
        `UPDATE alertas_regras SET
            ativa = COALESCE($3, ativa),
            frequencia = COALESCE($4, frequencia),
            horario_diario = COALESCE($5, horario_diario),
            dia_semana = COALESCE($6, dia_semana),
            canais = COALESCE($7::jsonb, canais),
            tipos = COALESCE($8::text[], tipos),
            destinatarios = COALESCE($9::uuid[], destinatarios),
            updated_at = now()
          WHERE id = $1 AND tenant_id = $2
            AND (usuario_id = $10 OR $11::text IN ('admin', 'operador'))
          RETURNING id, ativa, frequencia, horario_diario, dia_semana, canais, tipos, destinatarios`,
        [
          id,
          request.user.tenantId,
          body.ativa ?? null,
          body.frequencia ?? null,
          body.horario_diario ?? null,
          body.dia_semana ?? null,
          body.canais ? JSON.stringify(body.canais) : null,
          body.tipos ?? null,
          body.destinatarios ?? null,
          request.user.sub,
          request.user.role === 'plataforma' ? 'admin' : request.user.role,
        ],
      );
      if (updated.rows[0]) await audit(client, request, 'alert_rule.updated', 'alerta_regra', id);
      return updated.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'alert_rule_not_found' });
    return reply.send(result);
  });

  app.get('/alerts/preferences', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const row = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        'SELECT pausar_tudo, email_ativo, em_app_ativo FROM preferencias_alertas WHERE usuario_id = $1',
        [request.user.sub],
      ),
    );
    return reply.send({
      preferencias: row.rows[0] ?? { pausar_tudo: false, email_ativo: true, em_app_ativo: true },
      email_disponivel: emailEnabled,
    });
  });

  app.put('/alerts/preferences', async (request, reply) => {
    const body = preferencesBody.parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const saved = await withTenant(pool, authContext(request), async (client) => {
      const result = await client.query(
        `INSERT INTO preferencias_alertas (tenant_id, usuario_id, pausar_tudo, email_ativo, em_app_ativo)
         VALUES ($1, $2, COALESCE($3, false), COALESCE($4, true), COALESCE($5, true))
         ON CONFLICT (usuario_id) DO UPDATE SET
           pausar_tudo = COALESCE($3, preferencias_alertas.pausar_tudo),
           email_ativo = COALESCE($4, preferencias_alertas.email_ativo),
           em_app_ativo = COALESCE($5, preferencias_alertas.em_app_ativo),
           updated_at = now()
         RETURNING pausar_tudo, email_ativo, em_app_ativo`,
        [
          request.user.tenantId,
          request.user.sub,
          body.pausar_tudo ?? null,
          body.email_ativo ?? null,
          body.em_app_ativo ?? null,
        ],
      );
      await audit(
        client,
        request,
        'alert_preferences.updated',
        'preferencias_alertas',
        request.user.sub,
      );
      return result.rows[0];
    });
    return reply.send({ preferencias: saved });
  });

  // Cancelar e-mails de alerta pelo link da mensagem (sem entrar na conta).
  app.post('/public/alerts/unsubscribe', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(20).max(400) }).parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const identity = readUnsubscribeToken(config.jwtSecret, token);
    if (!identity) return reply.code(400).send({ error: 'invalid_token' });
    await withTenant(
      pool,
      { tenantId: identity.tenantId, userId: identity.userId, role: 'operador' },
      async (client) => {
        await client.query(
          `INSERT INTO preferencias_alertas (tenant_id, usuario_id, email_ativo)
           SELECT u.tenant_id, u.id, false FROM usuarios u WHERE u.tenant_id = $1 AND u.id = $2
           ON CONFLICT (usuario_id) DO UPDATE SET email_ativo = false, updated_at = now()`,
          [identity.tenantId, identity.userId],
        );
      },
    );
    return reply.send({ ok: true });
  });

  // Central de notificações (sino): cada pessoa vê só as suas.
  app.get('/notifications', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const query = notificationsQuery.parse(request.query);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const rows = await client.query(
        `SELECT id, tipo, titulo, mensagem, dados, lida_em, created_at
           FROM notificacoes
          WHERE tenant_id = $1 AND usuario_id = $2 AND ($3::boolean = false OR lida_em IS NULL)
          ORDER BY created_at DESC LIMIT $4`,
        [request.user.tenantId, request.user.sub, query.apenas_nao_lidas, query.limit],
      );
      const unread = await client.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM notificacoes WHERE tenant_id = $1 AND usuario_id = $2 AND lida_em IS NULL',
        [request.user.tenantId, request.user.sub],
      );
      return { rows: rows.rows, unread: unread.rows[0]?.total ?? 0 };
    });
    return reply.send({ data: result.rows, nao_lidas: result.unread });
  });

  app.patch('/notifications/:id/read', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const updated = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `UPDATE notificacoes SET lida_em = COALESCE(lida_em, now())
          WHERE id = $1 AND tenant_id = $2 AND usuario_id = $3 RETURNING id, lida_em`,
        [id, request.user.tenantId, request.user.sub],
      ),
    );
    if (!updated.rows[0]) return reply.code(404).send({ error: 'notification_not_found' });
    return reply.send(updated.rows[0]);
  });

  app.post('/notifications/read-all', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const changed = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE notificacoes SET lida_em = now()
          WHERE tenant_id = $1 AND usuario_id = $2 AND lida_em IS NULL`,
        [request.user.tenantId, request.user.sub],
      );
      return updated.rowCount ?? 0;
    });
    return reply.send({ lidas: changed });
  });

  // Operação: estado do motor e execução manual (só equipe da plataforma).
  app.get('/admin/alerts/status', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withPlatform(pool, request, 'platform.alerts.status', async (client) => {
      const runs = await client.query(
        `SELECT id, iniciado_em, finalizado_em, regras, criadas, liberadas, emails, erros, detalhe
           FROM alertas_motor_execucoes ORDER BY iniciado_em DESC LIMIT 10`,
      );
      const queue = await client.query<{ status: string; total: number }>(
        `SELECT status, count(*)::int AS total FROM alerta_entregas GROUP BY status`,
      );
      return { execucoes: runs.rows, entregas_por_status: queue.rows };
    });
    return reply.send({
      motor_ligado: config.alertEngineEnabled,
      email_disponivel: emailEnabled,
      ...result,
    });
  });

  app.post('/admin/alerts/run', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await runAlertCycle({
      pool,
      config,
      emailEnabled,
      sendMail: (message) => sendEmail(config, message),
    });
    await withTenant(pool, authContext(request), async (client) => {
      await audit(client, request, 'platform.alerts.run', 'plataforma', null, { ...result });
    });
    return reply.send(result);
  });
}
