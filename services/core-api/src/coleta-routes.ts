import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { RuntimeConfig } from './config.js';
import { MODALIDADES_PNCP, runPncpSync } from './pncp-sync.js';
import { withTenant } from './db.js';
import {
  authContext,
  requireRoles,
  sendDatabaseUnavailable,
  withPlatform,
} from './request-context.js';

type Deps = {
  pool: Pool | undefined;
  config: RuntimeConfig;
  /** Executor da rodada (os testes passam um falso, sem sair para a internet). */
  runSync?: typeof runPncpSync;
};

/** Menor intervalo entre duas rodadas disparadas por acesso (por processo e pelo banco). */
const ACESSO_MIN_MINUTOS = 5;
let ultimoGatilhoDeAcesso = 0;
export function reiniciarGatilhoDeAcesso(): void {
  ultimoGatilhoDeAcesso = 0;
}

const runBody = z.object({ dias: z.number().int().min(1).max(30).default(3) }).default({ dias: 3 });

/** Coleta do PNCP: estado e execução manual (só a equipe da plataforma). */
export function registerCollectionRoutes(
  app: FastifyInstance,
  { pool, config, runSync = runPncpSync }: Deps,
): void {
  /** Frescor dos dados, para qualquer pessoa logada ver "atualizado há X minutos". */
  app.get('/editais/atualizacao', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const row = await withTenant(pool, authContext(request), async (client) => {
      const found = await client.query<{ ultima: string | null; status: string | null }>(
        `SELECT finalizado_em AS ultima, status
           FROM coleta_pncp_execucoes
          WHERE status IN ('ok', 'parcial') AND finalizado_em IS NOT NULL
          ORDER BY finalizado_em DESC LIMIT 1`,
      );
      return found.rows[0] ?? null;
    });
    return reply.send({
      fonte: 'PNCP',
      ligada: config.pncpSyncEnabled,
      ultima_atualizacao_em: row?.ultima ?? null,
      status: row?.status ?? null,
      rodada_rapida_minutos: config.pncpSyncFastMinutes,
      rodada_completa_minutos: config.pncpSyncIntervalMinutes,
    });
  });

  /**
   * Chamada quando alguém abre o sistema: se os dados do PNCP estão velhos, começa uma rodada
   * rápida (só hoje, poucas páginas) em segundo plano. Responde na hora e nunca empilha rodadas:
   * há um intervalo mínimo, a trava do banco impede duas ao mesmo tempo, e a coleta agendada
   * continua rodando como sempre.
   */
  app.post('/editais/sincronizar', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    if (!config.pncpSyncEnabled) return reply.send({ iniciada: false, motivo: 'desligada' });
    const agora = Date.now();
    const intervalo = Math.max(ACESSO_MIN_MINUTOS, config.pncpSyncFastMinutes) * 60_000;
    if (agora - ultimoGatilhoDeAcesso < intervalo) {
      return reply.send({ iniciada: false, motivo: 'recente' });
    }
    const estado = await withTenant(pool, authContext(request), async (client) => {
      const found = await client.query<{ ultima: Date | null; rodando: number }>(
        `SELECT (SELECT max(finalizado_em) FROM coleta_pncp_execucoes
                  WHERE status IN ('ok', 'parcial') AND finalizado_em IS NOT NULL) AS ultima,
                (SELECT count(*)::int FROM coleta_pncp_execucoes
                  WHERE status = 'rodando' AND iniciado_em > now() - interval '3 hours') AS rodando`,
      );
      return found.rows[0] ?? { ultima: null, rodando: 0 };
    });
    if (estado.rodando > 0) return reply.send({ iniciada: false, motivo: 'em_andamento' });
    if (estado.ultima && agora - new Date(estado.ultima).getTime() < intervalo) {
      return reply.send({
        iniciada: false,
        motivo: 'atualizado',
        ultima_atualizacao_em: new Date(estado.ultima).toISOString(),
      });
    }
    ultimoGatilhoDeAcesso = agora;
    void runSync({ pool, config }, { origem: 'acesso', dias: 1, maxPaginas: 20 }).catch(
      (error: unknown) => request.log.error({ err: error }, 'coleta ao acessar falhou'),
    );
    return reply.code(202).send({ iniciada: true });
  });

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
      const pendencias = await client.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM coleta_pncp_pendencias WHERE tenant_id = $1',
        [request.user.tenantId],
      );
      return {
        execucoes: runs.rows,
        catalogo: catalog.rows[0],
        pendencias: pendencias.rows[0]?.total ?? 0,
      };
    });
    return reply.send({
      ligada: config.pncpSyncEnabled,
      intervalo_minutos: config.pncpSyncIntervalMinutes,
      rodada_rapida_minutos: config.pncpSyncFastMinutes,
      consultas_paralelas: config.pncpSyncConcurrency,
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
