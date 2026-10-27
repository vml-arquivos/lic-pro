import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { RuntimeConfig } from './config.js';
import { MODALIDADES_PNCP, runPncpSync } from './pncp-sync.js';
import { requireRoles, sendDatabaseUnavailable, withPlatform } from './request-context.js';

type Deps = { pool: Pool | undefined; config: RuntimeConfig };

const runBody = z.object({ dias: z.number().int().min(1).max(30).default(3) }).default({ dias: 3 });

/** Coleta do PNCP: estado e execução manual (só a equipe da plataforma). */
export function registerCollectionRoutes(app: FastifyInstance, { pool, config }: Deps): void {
  app.get('/admin/coleta/status', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const data = await withPlatform(pool, request, 'platform.coleta.status', async (client) => {
      const runs = await client.query(
        `SELECT id, origem, iniciado_em, finalizado_em, janela_inicio, janela_fim, modalidades,
                status, paginas, lidos, inseridos, atualizados, ignorados, erros, ultimo_erro
           FROM coleta_pncp_execucoes ORDER BY iniciado_em DESC LIMIT 10`,
      );
      const catalog = await client.query<{
        total: number;
        capturados_24h: number;
        abertos: number;
        ultima_publicacao: string | null;
      }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS capturados_24h,
                count(*) FILTER (WHERE data_encerramento_proposta > now())::int AS abertos,
                max(data_publicacao) AS ultima_publicacao
           FROM editais WHERE tenant_id = $1 AND fonte = 'pncp'`,
        [request.user.tenantId],
      );
      return { execucoes: runs.rows, catalogo: catalog.rows[0] };
    });
    return reply.send({
      ligada: config.pncpSyncEnabled,
      intervalo_minutos: config.pncpSyncIntervalMinutes,
      dias_por_rodada: config.pncpSyncDays,
      max_paginas: config.pncpSyncMaxPages,
      modalidades: config.pncpSyncModalidades.map((codigo) => ({
        codigo,
        nome: MODALIDADES_PNCP[codigo] ?? `Modalidade ${codigo}`,
      })),
      fonte: new URL(config.pncpBaseUrl).host,
      ...data,
    });
  });

  app.post('/admin/coleta/run', async (request, reply) => {
    if (!requireRoles(reply, request, ['plataforma'])) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const body = runBody.parse(request.body ?? {});
    const running = await withPlatform(
      pool,
      request,
      'platform.coleta.run',
      async (client) => {
        const found = await client.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM coleta_pncp_execucoes
            WHERE status = 'rodando' AND iniciado_em > now() - interval '3 hours'`,
        );
        return (found.rows[0]?.total ?? 0) > 0;
      },
      { dias: body.dias },
    );
    if (running) return reply.code(409).send({ error: 'coleta_em_andamento' });
    // A rodada pode levar minutos: responde na hora e o painel acompanha pelo status.
    void runPncpSync(
      { pool, config, tenantId: request.user.tenantId },
      { origem: 'manual', dias: body.dias },
    ).catch((error: unknown) => request.log.error({ err: error }, 'coleta manual falhou'));
    return reply.code(202).send({ iniciada: true, dias: body.dias });
  });
}
