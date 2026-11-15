import { randomUUID } from 'node:crypto';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runAlertCycle, unsubscribeToken } from '../src/alert-engine.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

const niche = NICHE_CATALOG[0]!;
const term = niche.terms[0]!;
const HOUR = 3_600_000;

suite('Alertas: motor, frequência, e-mail, preferências e sino (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const platformTenant = randomUUID();
  const tenantA = randomUUID();
  const adminA = randomUUID();
  const operadorA = randomUUID();
  const alunoA = randomUUID();
  const ids: Record<string, string> = {};
  let ruleId = '';
  let searchId = '';
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret',
    APP_URL: 'https://app.example.test',
  });

  const as = (sub: string, role: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, tenantId: tenantA, role })}`,
  });
  const cycle = (
    options: { now?: Date; email?: boolean; sendMail?: (m: never) => Promise<void> } = {},
  ) =>
    runAlertCycle({
      pool,
      config,
      now: () => options.now ?? new Date(),
      emailEnabled: options.email ?? false,
      ...(options.sendMail ? { sendMail: options.sendMail as never } : {}),
    });
  const deliveries = async (where = '') =>
    (
      await setup.query(
        `SELECT canal, status, tipo, usuario_id, edital_id FROM alerta_entregas
          WHERE alerta_regra_id = $1 ${where} ORDER BY created_at`,
        [ruleId],
      )
    ).rows as Array<{
      canal: string;
      status: string;
      tipo: string;
      usuario_id: string;
      edital_id: string;
    }>;
  const configure = (fields: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/alert-rules/${ruleId}`,
      headers: as(adminA, 'admin'),
      payload: fields,
    });

  async function insertUser(id: string, papel: string, nome: string) {
    const email = `${nome.toLowerCase().replace(/\s+/g, '.')}.${suffix}@example.test`;
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em,
                             nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb, true)`,
      [
        id,
        tenantA,
        email,
        nome,
        papel,
        hashPassword('Senha-Forte-2026!'),
        JSON.stringify([niche.code]),
      ],
    );
    return email;
  }

  async function insertEdital(key: string, fields: Record<string, unknown> = {}) {
    const base: Record<string, unknown> = {
      tenant_id: platformTenant,
      fonte: 'fixture',
      id_externo: `${key}-${suffix}`,
      titulo: `Contratação de ${term} ${key} ${suffix}`,
      hash_conteudo: `h-${key}-${suffix}`,
      uf: 'DF',
      ...fields,
    };
    const columns = Object.keys(base);
    const result = await setup.query<{ id: string }>(
      `INSERT INTO editais (${columns.join(', ')}) VALUES (${columns.map((_c, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(base),
    );
    ids[key] = result.rows[0]!.id;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({ jwtSecret: 'test-secret', logger: false, pool, config });
    await app.ready();
    for (const [id, nome] of [
      [platformTenant, 'Plataforma'],
      [tenantA, 'Empresa A'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `a-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    await insertUser(adminA, 'admin', 'Admin Alertas');
    await insertUser(operadorA, 'operador', 'Operador Alertas');
    await insertUser(alunoA, 'aluno', 'Aluno Alertas');

    // A busca nasce antes dos editais de teste: só o que chegar depois gera aviso.
    const created = await app.inject({
      method: 'POST',
      url: '/saved-searches',
      headers: as(adminA, 'admin'),
      payload: { nome: `Busca DF ${suffix}`, filtros: { uf: 'DF' } },
    });
    expect(created.statusCode, created.body).toBe(201);
    searchId = created.json().id;
    ruleId = (await setup.query('SELECT id FROM alertas_regras WHERE busca_id = $1', [searchId]))
      .rows[0].id;
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('só Empresa e Administração criam buscas e alertas', async () => {
    for (const [sub, role] of [
      [alunoA, 'aluno'],
      [randomUUID(), 'mentor'],
    ] as const) {
      const denied = await app.inject({
        method: 'POST',
        url: '/saved-searches',
        headers: as(sub, role),
        payload: { nome: 'x', filtros: {} },
      });
      expect(denied.statusCode).toBe(403);
      expect(
        (await app.inject({ method: 'GET', url: '/alert-rules', headers: as(sub, role) }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/alert-rules/${ruleId}`,
            headers: as(sub, role),
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
    }
    const rules = await app.inject({
      method: 'GET',
      url: '/alert-rules',
      headers: as(adminA, 'admin'),
    });
    expect(rules.statusCode).toBe(200);
    expect(rules.json().data[0]).toMatchObject({
      frequencia: 'diario',
      horario_diario: 7,
      tipos: ['novos'],
    });
  });

  it('3 editais, 2 combinam com a busca, e uma segunda rodada não repete nada', async () => {
    await configure({ frequencia: 'imediata', canais: ['in_app'], tipos: ['novos'] });
    await insertEdital('e1');
    await insertEdital('e2');
    await insertEdital('e3', { uf: 'SP' });

    const run = await cycle();
    expect(run.details).toEqual([]);
    const first = await deliveries();
    expect(first).toHaveLength(2);
    expect(new Set(first.map((row) => row.edital_id))).toEqual(new Set([ids.e1, ids.e2]));
    expect(
      first.every(
        (row) => row.status === 'pendente' && row.canal === 'in_app' && row.tipo === 'novo',
      ),
    ).toBe(true);

    await cycle();
    await cycle();
    expect(await deliveries()).toHaveLength(2);

    const inbox = await app.inject({ method: 'GET', url: '/alerts', headers: as(adminA, 'admin') });
    expect(inbox.statusCode, inbox.body).toBe(200);
    expect(inbox.json().data).toHaveLength(2);
    expect(inbox.json().nao_lidas).toBe(2);
    // o operador não é destinatário: não vê nada
    const other = await app.inject({
      method: 'GET',
      url: '/alerts',
      headers: as(operadorA, 'operador'),
    });
    expect(other.json().data).toHaveLength(0);

    const bell = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: as(adminA, 'admin'),
    });
    expect(bell.json().nao_lidas).toBe(1);
    expect(bell.json().data[0].titulo).toContain('2 novos editais');
    const notificationId = bell.json().data[0].id;
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/notifications/${notificationId}/read`,
          headers: as(adminA, 'admin'),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({ method: 'GET', url: '/notifications', headers: as(adminA, 'admin') })
      ).json().nao_lidas,
    ).toBe(0);
    // sino de uma pessoa não mostra o de outra
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/notifications/${notificationId}/read`,
          headers: as(operadorA, 'operador'),
        })
      ).statusCode,
    ).toBe(404);

    const alertId = inbox.json().data[0].id;
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/alerts/${alertId}/read`,
          headers: as(adminA, 'admin'),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({ method: 'POST', url: '/alerts/read-all', headers: as(adminA, 'admin') })
      ).json().lidas,
    ).toBe(1);
  });

  it('resumo diário guarda os avisos e só libera no horário escolhido (Brasília)', async () => {
    await configure({ frequencia: 'diario', horario_diario: 12, canais: ['in_app'] });
    await insertEdital('e4');
    // monta um "agora" fixo às 10:00 de Brasília (13:00 UTC) do dia atual
    const today = new Date();
    const tenAm = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 13, 0, 0),
    );
    await cycle({ now: tenAm });
    const staged = await deliveries(`AND edital_id = '${ids.e4}'`);
    expect(staged).toHaveLength(1);
    expect(staged[0]!.status).toBe('agendada');
    const before = await app.inject({
      method: 'GET',
      url: '/alerts?apenas_nao_lidas=true',
      headers: as(adminA, 'admin'),
    });
    expect(before.json().data.map((row: { edital_id: string }) => row.edital_id)).not.toContain(
      ids.e4,
    );

    await cycle({ now: new Date(tenAm.getTime() + 1 * HOUR) }); // 11:00, antes do meio-dia
    expect((await deliveries(`AND edital_id = '${ids.e4}'`))[0]!.status).toBe('agendada');

    await cycle({ now: new Date(tenAm.getTime() + 2 * HOUR + 60_000) }); // 12:01
    expect((await deliveries(`AND edital_id = '${ids.e4}'`))[0]!.status).toBe('pendente');
    const after = await app.inject({
      method: 'GET',
      url: '/alerts?apenas_nao_lidas=true',
      headers: as(adminA, 'admin'),
    });
    expect(after.json().data.map((row: { edital_id: string }) => row.edital_id)).toContain(ids.e4);
    const bell = await app.inject({
      method: 'GET',
      url: '/notifications?apenas_nao_lidas=true',
      headers: as(adminA, 'admin'),
    });
    expect(bell.json().data[0].titulo).toContain('1 novo edital');
  });

  it('avisa quando um edital da busca muda, uma vez por mudança', async () => {
    await configure({ frequencia: 'imediata', tipos: ['novos', 'alteracao'] });
    await setup.query(
      `UPDATE editais SET valor_estimado = 1234, situacao = 'Retificada' WHERE id = $1`,
      [ids.e1],
    );
    await cycle();
    const changes = await deliveries(`AND tipo = 'alteracao'`);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.edital_id).toBe(ids.e1);
    await cycle();
    expect(await deliveries(`AND tipo = 'alteracao'`)).toHaveLength(1);
    const inbox = await app.inject({
      method: 'GET',
      url: '/alerts?tipo=alteracao',
      headers: as(adminA, 'admin'),
    });
    expect(inbox.json().data[0].payload.campos.map((c: { campo: string }) => c.campo)).toEqual(
      expect.arrayContaining(['valor_estimado', 'situacao']),
    );
    await setup.query(`UPDATE editais SET valor_estimado = 9999 WHERE id = $1`, [ids.e1]);
    await cycle();
    expect(await deliveries(`AND tipo = 'alteracao'`)).toHaveLength(2);
  });

  it('avisa o prazo em dois marcos (3 dias e 24 horas), sem repetir', async () => {
    await configure({ tipos: ['novos', 'prazo'] });
    const now = new Date();
    await setup.query(`UPDATE editais SET data_encerramento_proposta = $2 WHERE id = $1`, [
      ids.e1,
      new Date(now.getTime() + 48 * HOUR),
    ]);
    await cycle({ now });
    expect(await deliveries(`AND tipo = 'prazo'`)).toHaveLength(1);
    await cycle({ now });
    expect(await deliveries(`AND tipo = 'prazo'`)).toHaveLength(1);
    await setup.query(`UPDATE editais SET data_encerramento_proposta = $2 WHERE id = $1`, [
      ids.e1,
      new Date(now.getTime() + 10 * HOUR),
    ]);
    await cycle({ now });
    expect(await deliveries(`AND tipo = 'prazo'`)).toHaveLength(2);
    await cycle({ now });
    expect(await deliveries(`AND tipo = 'prazo'`)).toHaveLength(2);
    // e2 não tem prazo: nada é gerado para ele
    expect(await deliveries(`AND tipo = 'prazo' AND edital_id = '${ids.e2}'`)).toHaveLength(0);
  });

  it('vários destinatários e pausar tudo', async () => {
    await configure({ tipos: ['novos'], destinatarios: [adminA, operadorA] });
    const invalid = await configure({ destinatarios: [alunoA] });
    expect(invalid.statusCode).toBe(403); // aluno não pode ser destinatário de alerta
    await app.inject({
      method: 'PUT',
      url: '/alerts/preferences',
      headers: as(operadorA, 'operador'),
      payload: { pausar_tudo: true },
    });
    await insertEdital('e5');
    await cycle();
    const forEdital = await deliveries(`AND edital_id = '${ids.e5}'`);
    expect(forEdital.map((row) => row.usuario_id)).toEqual([adminA]);

    await app.inject({
      method: 'PUT',
      url: '/alerts/preferences',
      headers: as(operadorA, 'operador'),
      payload: { pausar_tudo: false },
    });
    await insertEdital('e6');
    await cycle();
    const both = await deliveries(`AND edital_id = '${ids.e6}'`);
    expect(new Set(both.map((row) => row.usuario_id))).toEqual(new Set([adminA, operadorA]));
    const prefs = await app.inject({
      method: 'GET',
      url: '/alerts/preferences',
      headers: as(operadorA, 'operador'),
    });
    expect(prefs.json().preferencias).toMatchObject({ pausar_tudo: false, email_ativo: true });
  });

  it('e-mail: resumo único por pessoa, link para cancelar, nova tentativa e falha definitiva', async () => {
    await setup.query(
      `UPDATE alertas_regras SET canais = '["in_app","email"]'::jsonb, destinatarios = $2 WHERE id = $1`,
      [ruleId, [adminA]],
    );
    await insertEdital('e7');
    await insertEdital('e8');
    const sendMail = vi.fn().mockResolvedValue(undefined);
    await cycle({ email: true, sendMail });
    const mails = sendMail.mock.calls.map(
      (call) => call[0] as { to: string; subject: string; text: string },
    );
    const mine = mails.filter((mail) => mail.to.startsWith('admin.alertas'));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject).toContain('2 avisos novos');
    expect(mine[0]!.text).toContain('/cancelar-alertas?token=');
    expect(mine[0]!.text).toContain('e7');
    const sent = await deliveries(`AND canal = 'email' AND status = 'enviada'`);
    expect(sent).toHaveLength(2);
    await cycle({ email: true, sendMail });
    expect(
      sendMail.mock.calls.filter((call) =>
        (call[0] as { to: string }).to.startsWith('admin.alertas'),
      ),
    ).toHaveLength(1);

    // falha: tenta de novo mais tarde e desiste na terceira vez
    await insertEdital('e9');
    const failing = vi.fn().mockRejectedValue(new Error('SMTP fora do ar'));
    const t0 = new Date();
    await cycle({ email: true, sendMail: failing, now: t0 });
    let row = (
      await setup.query(
        `SELECT status, tentativas, erro FROM alerta_entregas WHERE alerta_regra_id = $1 AND canal = 'email' AND edital_id = $2`,
        [ruleId, ids.e9],
      )
    ).rows[0];
    expect(row).toMatchObject({ status: 'agendada', tentativas: 1 });
    expect(row.erro).toContain('SMTP fora do ar');
    await cycle({ email: true, sendMail: failing, now: new Date(t0.getTime() + 20 * 60_000) });
    await cycle({ email: true, sendMail: failing, now: new Date(t0.getTime() + 60 * 60_000) });
    row = (
      await setup.query(
        `SELECT status, tentativas FROM alerta_entregas WHERE alerta_regra_id = $1 AND canal = 'email' AND edital_id = $2`,
        [ruleId, ids.e9],
      )
    ).rows[0];
    expect(row).toMatchObject({ status: 'falha', tentativas: 3 });
  });

  it('sem e-mail configurado o canal não gera fila; WhatsApp aparece como indisponível', async () => {
    await insertEdital('e10');
    await cycle({ email: false });
    expect(await deliveries(`AND edital_id = '${ids.e10}' AND canal = 'email'`)).toHaveLength(0);
    const options = await app.inject({
      method: 'GET',
      url: '/alert-options',
      headers: as(adminA, 'admin'),
    });
    const channels = Object.fromEntries(
      options
        .json()
        .canais.map((c: { codigo: string; disponivel: boolean }) => [c.codigo, c.disponivel]),
    );
    expect(channels).toEqual({ in_app: true, email: false, whatsapp: false });
    const refused = await configure({ canais: ['in_app', 'email'] });
    expect(refused.statusCode).toBe(400);
  });

  it('cancelar e-mails pelo link funciona sem entrar na conta e recusa token inválido', async () => {
    const token = unsubscribeToken(config.jwtSecret, tenantA, adminA);
    const ok = await app.inject({
      method: 'POST',
      url: '/public/alerts/unsubscribe',
      payload: { token },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const prefs = await app.inject({
      method: 'GET',
      url: '/alerts/preferences',
      headers: as(adminA, 'admin'),
    });
    expect(prefs.json().preferencias.email_ativo).toBe(false);
    const forged = await app.inject({
      method: 'POST',
      url: '/public/alerts/unsubscribe',
      payload: { token: `${tenantA}.${adminA}.assinatura-falsa-assinatura-falsa` },
    });
    expect(forged.statusCode).toBe(400);
  });

  it('uma só instância roda por vez', async () => {
    const holder = await setup.connect();
    try {
      await holder.query(
        "SELECT pg_advisory_lock(hashtextextended('licite-comigo:alert-engine', 0))",
      );
      expect((await cycle()).skipped).toBe(true);
    } finally {
      await holder.query(
        "SELECT pg_advisory_unlock(hashtextextended('licite-comigo:alert-engine', 0))",
      );
      holder.release();
    }
    expect((await cycle()).skipped).toBe(false);
  });

  it('somente a plataforma vê o estado do motor e executa manualmente', async () => {
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/admin/alerts/status',
          headers: as(adminA, 'admin'),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/admin/alerts/run', headers: as(adminA, 'admin') }))
        .statusCode,
    ).toBe(403);
  });
});
