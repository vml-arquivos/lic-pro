import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reiniciarGatilhoDeAcesso } from '../src/coleta-routes.js';
import type { runPncpSync } from '../src/pncp-sync.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

suite('POST /editais/sincronizar — coleta ao acessar o sistema (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  let appOff!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const tenant = randomUUID();
  const user = randomUUID();
  const rowIds: string[] = [];
  // Executor falso: nenhuma rodada sai para a internet nem deixa rastro no banco.
  const rodadas: Array<Parameters<typeof runPncpSync>[1]> = [];
  const runSync = (async (_deps, options) => {
    rodadas.push(options);
    return { skipped: false, status: 'ok' };
  }) as typeof runPncpSync;
  const env = {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret',
    PNCP_BASE_URL: 'http://127.0.0.1:9/api/consulta',
    PNCP_API_BASE_URL: 'http://127.0.0.1:9/pncp-api/v1',
  };
  const headers = (a = app) => ({
    authorization: `Bearer ${a.jwt.sign({ sub: user, tenantId: tenant, role: 'admin' })}`,
  });
  const sincronizar = (a = app) =>
    a.inject({ method: 'POST', url: '/editais/sincronizar', headers: headers(a) });

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      runSync,
      config: loadConfig(env),
    });
    appOff = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      config: loadConfig({ ...env, PNCP_SYNC_ENABLED: 'false' }),
    });
    await app.ready();
    await appOff.ready();
    await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
      tenant,
      'Sync acesso',
      `sa-${tenant.slice(0, 8)}`,
    ]);
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em, onboarding_concluido)
       VALUES ($1, $2, $3, 'Dona Sync', 'admin', $4, now(), true)`,
      [user, tenant, `sync.${suffix}@example.test`, hashPassword('Senha-Forte-2026!')],
    );
  });

  beforeEach(() => reiniciarGatilhoDeAcesso());

  afterAll(async () => {
    if (rowIds.length)
      await setup.query('DELETE FROM coleta_pncp_execucoes WHERE id = ANY($1::uuid[])', [rowIds]);
    await app.close();
    await appOff.close();
    await pool.end();
    await setup.end();
  });

  it('exige sessão', async () => {
    const response = await app.inject({ method: 'POST', url: '/editais/sincronizar' });
    expect(response.statusCode).toBe(401);
  });

  it('não faz nada quando a coleta automática está desligada', async () => {
    const response = await sincronizar(appOff);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ iniciada: false, motivo: 'desligada' });
  });

  it('não coleta de novo quando os dados acabaram de ser atualizados', async () => {
    const row = await setup.query<{ id: string }>(
      `INSERT INTO coleta_pncp_execucoes (origem, janela_inicio, janela_fim, modalidades, status, finalizado_em)
       VALUES ('agendada', current_date, current_date, '{6}', 'ok', now()) RETURNING id`,
    );
    rowIds.push(row.rows[0]!.id);
    const response = await sincronizar();
    expect(response.statusCode).toBe(200);
    // Outra suíte pode estar coletando ao mesmo tempo no mesmo banco: então a resposta é "em andamento".
    expect(['atualizado', 'em_andamento']).toContain(response.json().motivo);
    expect(response.json().iniciada).toBe(false);
    expect(rodadas).toHaveLength(0);
  });

  it('começa uma rodada quando os dados estão velhos e não empilha a seguinte', async () => {
    await setup.query(
      `UPDATE coleta_pncp_execucoes SET finalizado_em = now() - interval '2 hours'
        WHERE id = ANY($1::uuid[])`,
      [rowIds],
    );
    // outras suítes podem ter deixado rodadas recentes; o teste só vale sem elas
    const recentes = await setup.query(
      `SELECT 1 FROM coleta_pncp_execucoes
        WHERE (status IN ('ok','parcial') AND finalizado_em > now() - interval '10 minutes')
           OR (status = 'rodando' AND iniciado_em > now() - interval '3 hours')`,
    );
    if (recentes.rowCount) return;
    const first = await sincronizar();
    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual({ iniciada: true });
    expect(rodadas).toEqual([{ origem: 'acesso', dias: 1, maxPaginas: 20 }]);
    const second = await sincronizar();
    expect(second.json()).toEqual({ iniciada: false, motivo: 'recente' });
    expect(rodadas).toHaveLength(1);
  });
});
