import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { runCleanup } from '../src/limpeza.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

suite('limpeza de registros técnicos', () => {
  let pool: Pool;
  let setup: Pool;
  const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret' });

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    await setup.query('DELETE FROM coleta_pncp_execucoes');
    await setup.query('DELETE FROM alertas_motor_execucoes');
  });

  afterAll(async () => {
    await setup.query('DELETE FROM coleta_pncp_execucoes');
    await setup.query('DELETE FROM alertas_motor_execucoes');
    await pool.end();
    await setup.end();
  });

  it('os padrões guardam 7 dias de rodadas e 90 de histórico', () => {
    expect(config.logRetentionDays).toBe(7);
    expect(config.historyRetentionDays).toBe(90);
  });

  it('apaga rodadas antigas, guarda as recentes e a última coleta concluída', async () => {
    // 40 rodadas antigas (30 dias atrás) e 5 recentes; a última concluída é uma das antigas.
    await setup.query(
      `INSERT INTO coleta_pncp_execucoes (origem, iniciado_em, finalizado_em, janela_inicio, janela_fim, status)
       SELECT 'agendada', now() - interval '30 days' - (g || ' minutes')::interval,
              now() - interval '30 days' - (g || ' minutes')::interval, current_date, current_date, 'ok'
         FROM generate_series(1, 40) g`,
    );
    await setup.query(
      `INSERT INTO coleta_pncp_execucoes (origem, iniciado_em, janela_inicio, janela_fim, status)
       SELECT 'agendada', now() - (g || ' minutes')::interval, current_date, current_date, 'erro'
         FROM generate_series(1, 5) g`,
    );
    await setup.query(
      `INSERT INTO alertas_motor_execucoes (iniciado_em, finalizado_em)
       SELECT now() - interval '20 days' - (g || ' minutes')::interval,
              now() - interval '20 days' - (g || ' minutes')::interval
         FROM generate_series(1, 30) g`,
    );
    await setup.query(
      `INSERT INTO alertas_motor_execucoes (iniciado_em, finalizado_em)
       SELECT now() - (g || ' minutes')::interval, now() FROM generate_series(1, 3) g`,
    );

    const result = await runCleanup(pool, config);
    expect(result.coleta).toBeGreaterThan(0);
    expect(result.alertas).toBeGreaterThan(0);

    const coleta = await setup.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'ok')::int AS concluidas
         FROM coleta_pncp_execucoes`,
    );
    // 5 recentes + 15 antigas (completa as 20 mais novas) + a última concluída, que já está entre elas.
    expect(coleta.rows[0].total).toBe(20);
    expect(coleta.rows[0].concluidas).toBe(15);
    const alertas = await setup.query('SELECT count(*)::int AS total FROM alertas_motor_execucoes');
    expect(alertas.rows[0].total).toBe(20);

    const segunda = await runCleanup(pool, config);
    expect(segunda).toMatchObject({ coleta: 0, alertas: 0 });
  });

  it('nunca apaga a última coleta concluída, mesmo velha e fora das 20 mais novas', async () => {
    await setup.query('DELETE FROM coleta_pncp_execucoes');
    await setup.query(
      `INSERT INTO coleta_pncp_execucoes (origem, iniciado_em, finalizado_em, janela_inicio, janela_fim, status)
       VALUES ('agendada', now() - interval '40 days', now() - interval '40 days', current_date, current_date, 'ok')`,
    );
    await setup.query(
      `INSERT INTO coleta_pncp_execucoes (origem, iniciado_em, janela_inicio, janela_fim, status)
       SELECT 'agendada', now() - (g || ' minutes')::interval, current_date, current_date, 'erro'
         FROM generate_series(1, 25) g`,
    );
    await runCleanup(pool, config);
    const ok = await setup.query(
      `SELECT count(*)::int AS total FROM coleta_pncp_execucoes WHERE status = 'ok'`,
    );
    expect(ok.rows[0].total).toBe(1);
  });

  it('rodada que ficou "rodando" há mais de um dia é descartada', async () => {
    await setup.query('DELETE FROM coleta_pncp_execucoes');
    await setup.query(
      `INSERT INTO coleta_pncp_execucoes (origem, iniciado_em, janela_inicio, janela_fim, status)
       SELECT 'agendada', now() - interval '2 days' - (g || ' minutes')::interval, current_date, current_date, 'rodando'
         FROM generate_series(1, 25) g`,
    );
    const result = await runCleanup(pool, config);
    expect(result.coleta).toBe(5);
  });

  it('apaga histórico de alterações e avisos lidos antigos, e só eles', async () => {
    const tenant = randomUUID();
    const usuario = randomUUID();
    const edital = randomUUID();
    await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
      tenant,
      'Limpeza',
      `l-${tenant.slice(0, 8)}`,
    ]);
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel) VALUES ($1, $2, $3, 'Limpeza', 'admin')`,
      [usuario, tenant, `limpeza.${tenant.slice(0, 8)}@example.test`],
    );
    await setup.query(
      `INSERT INTO editais (id, tenant_id, fonte, id_externo, titulo, hash_conteudo) VALUES ($1, $2, 'teste', $3, 'Edital', 'h')`,
      [edital, tenant, `LIMP-${tenant}`],
    );
    for (const [hash, dias] of [
      ['velho', 200],
      ['novo', 2],
    ] as const) {
      await setup.query(
        `INSERT INTO edital_eventos (tenant_id, edital_id, tipo, hash_evento, created_at)
         VALUES ($1, $2, 'alteracao', $3, now() - ($4 || ' days')::interval)`,
        [tenant, edital, hash, String(dias)],
      );
    }
    for (const [titulo, lida, dias] of [
      ['lida antiga', true, 200],
      ['lida recente', true, 2],
      ['não lida antiga', false, 200],
    ] as const) {
      await setup.query(
        `INSERT INTO notificacoes (tenant_id, usuario_id, tipo, titulo, mensagem, lida_em, created_at)
         VALUES ($1, $2, 'aviso', $3, 'm',
                 CASE WHEN $4::boolean THEN now() - ($5 || ' days')::interval END,
                 now() - ($5 || ' days')::interval)`,
        [tenant, usuario, titulo, lida, String(dias)],
      );
    }
    const result = await runCleanup(pool, config);
    expect(result.eventos).toBeGreaterThanOrEqual(1);
    expect(result.notificacoes).toBeGreaterThanOrEqual(1);
    const eventos = await setup.query(
      'SELECT hash_evento FROM edital_eventos WHERE tenant_id = $1',
      [tenant],
    );
    expect(eventos.rows.map((row) => row.hash_evento)).toEqual(['novo']);
    const avisos = await setup.query(
      'SELECT titulo FROM notificacoes WHERE tenant_id = $1 ORDER BY titulo',
      [tenant],
    );
    expect(avisos.rows.map((row) => row.titulo)).toEqual(['lida recente', 'não lida antiga']);
    await setup.query('DELETE FROM notificacoes WHERE tenant_id = $1', [tenant]);
    await setup.query('DELETE FROM edital_eventos WHERE tenant_id = $1', [tenant]);
    await setup.query('DELETE FROM editais WHERE tenant_id = $1', [tenant]);
  });
});
