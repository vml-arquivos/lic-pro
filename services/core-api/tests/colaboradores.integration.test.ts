import { randomUUID } from 'node:crypto';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAlertCycle } from '../src/alert-engine.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

const PASSWORD = 'Senha-Forte-2026!';
const niche = NICHE_CATALOG[0]!;
const otherNiche = NICHE_CATALOG[1]!;
const term = niche.terms[0]!;
const MINUTE = 60_000;

suite('Colaboradores: painel próprio, nichos travados e alerta de sessão (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const platformTenant = randomUUID();
  const clientTenant = randomUUID();
  const team = randomUUID();
  const clientAdmin = randomUUID();
  const mentor = randomUUID();
  const aluno = randomUUID();
  let colaboradorId = '';
  let colaboradorToken = '';
  let ruleId = '';
  let editalId = '';
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret',
    APP_URL: 'https://app.example.test',
  });

  const sign = (sub: string, tenantId: string, role: string) =>
    app.jwt.sign({ sub, tenantId, role });
  const bearer = (value: string) => ({ authorization: `Bearer ${value}` });
  const TEAM = () => bearer(sign(team, platformTenant, 'plataforma'));
  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    headers: Record<string, string>,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url,
      headers,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const cycle = (now: Date) => runAlertCycle({ pool, config, now: () => now, emailEnabled: false });
  /** Só as entregas de sessão deste teste: o catálogo compartilhado pode ter editais de outras execuções. */
  const sessionDeliveries = async (onlyEdital = editalId) =>
    (
      await setup.query<{ marco: string; usuario_id: string; edital_id: string }>(
        `SELECT payload->>'marco' AS marco, usuario_id, edital_id
           FROM alerta_entregas
          WHERE alerta_regra_id = $1 AND tipo = 'sessao' AND edital_id = $2 ORDER BY created_at`,
        [ruleId, onlyEdital],
      )
    ).rows;

  async function insertUser(id: string, tenantId: string, papel: string, nome: string) {
    const email = `${nome.toLowerCase().replace(/\s+/g, '.')}.${suffix}@example.test`;
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em,
                             nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb, true)`,
      [id, tenantId, email, nome, papel, hashPassword(PASSWORD), JSON.stringify([niche.code])],
    );
    await setup.query(
      `INSERT INTO auth_credentials (tenant_id, usuario_id, email, password_hash, email_verificado_em)
       VALUES ($1, $2, $3, $4, now())`,
      [tenantId, id, email, hashPassword(PASSWORD)],
    );
    return email;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({ jwtSecret: 'test-secret', logger: false, pool, config });
    await app.ready();
    for (const [id, nome] of [
      [platformTenant, 'Plataforma'],
      [clientTenant, 'Cliente'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `c-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    await insertUser(team, platformTenant, 'plataforma', 'Equipe Colab');
    await insertUser(clientAdmin, clientTenant, 'admin', 'Cliente Colab');
    await insertUser(mentor, platformTenant, 'mentor', 'Mentor Colab');
    await insertUser(aluno, platformTenant, 'aluno', 'Aluno Colab');
  });

  afterAll(async () => {
    // Os editais de teste ficam no catálogo compartilhado: remove para não pesar em outras execuções.
    await setup.query(`DELETE FROM editais WHERE tenant_id = $1`, [platformTenant]).catch(() => {});
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('convite de colaborador cria conta na plataforma, com a própria área e sem Administração', async () => {
    const email = `colaborador.${suffix}@example.test`;
    const created = await call('POST', '/platform/invitations', TEAM(), {
      tipo: 'colaborador',
      nome: 'Carla Operadora',
      email,
    });
    expect(created.statusCode, created.body).toBe(201);
    const inviteToken = new URL(created.json().link as string).searchParams.get('token')!;
    const accepted = await call(
      'POST',
      '/auth/invitations/accept',
      {},
      {
        token: inviteToken,
        password: PASSWORD,
        termos_aceitos: true,
        privacidade_aceita: true,
      },
    );
    expect(accepted.statusCode, accepted.body).toBe(201);

    const login = await call('POST', '/auth/login', {}, { email, password: PASSWORD });
    expect(login.statusCode, login.body).toBe(200);
    colaboradorToken = login.json().access_token as string;
    const me = (await call('GET', '/me', bearer(colaboradorToken))).json();
    expect(me).toMatchObject({ area: 'colaborador', plataforma: false });
    expect(me.areas_permitidas).toEqual(['colaborador']);
    colaboradorId = me.id ?? me.usuario_id ?? me.sub;
    if (!colaboradorId) {
      colaboradorId = (
        await setup.query<{ id: string }>('SELECT id FROM usuarios WHERE email = $1', [email])
      ).rows[0]!.id;
    }
    const row = (
      await setup.query<{ papel: string; tenant_id: string }>(
        'SELECT papel, tenant_id FROM usuarios WHERE id = $1',
        [colaboradorId],
      )
    ).rows[0]!;
    expect(row).toMatchObject({ papel: 'colaborador', tenant_id: platformTenant });
  });

  it('o colaborador não entra em Administração, cobrança, curso nem outra empresa', async () => {
    const headers = bearer(colaboradorToken);
    for (const url of [
      '/platform/overview',
      '/platform/colaboradores',
      '/platform/companies',
      '/admin/leads',
      '/aluno/inicio',
      '/mentor/encontros',
    ]) {
      expect((await call('GET', url, headers)).statusCode, url).toBe(403);
    }
    const view = await call('PATCH', '/me/view-as', headers, { area: 'aluno' });
    expect(view.statusCode).toBe(403);
  });

  it('empresa, aluno e mentor não usam as rotas de operação', async () => {
    for (const [sub, tenant, role] of [
      [aluno, platformTenant, 'aluno'],
      [mentor, platformTenant, 'mentor'],
    ] as const) {
      const headers = bearer(sign(sub, tenant, role));
      expect((await call('GET', '/saved-searches', headers)).statusCode, role).toBe(403);
      expect((await call('GET', '/alert-rules', headers)).statusCode, role).toBe(403);
    }
    // a empresa cliente continua na própria conta: não enxerga a lista de colaboradores
    const company = bearer(sign(clientAdmin, clientTenant, 'admin'));
    expect((await call('GET', '/platform/colaboradores', company)).statusCode).toBe(403);
  });

  it('só a Administração lista os colaboradores e define os nichos de cada um', async () => {
    const listed = await call('GET', '/platform/colaboradores', TEAM());
    expect(listed.statusCode, listed.body).toBe(200);
    const mine = (listed.json().data as Array<{ id: string; nichos: string[] }>).find(
      (row) => row.id === colaboradorId,
    );
    expect(mine).toBeDefined();

    const invalid = await call('PUT', `/platform/colaboradores/${colaboradorId}/nichos`, TEAM(), {
      nichos: ['nicho-que-nao-existe'],
    });
    expect(invalid.statusCode).toBe(400);
    const empty = await call('PUT', `/platform/colaboradores/${colaboradorId}/nichos`, TEAM(), {
      nichos: [],
    });
    expect(empty.statusCode).toBe(400);
    const repeated = await call('PUT', `/platform/colaboradores/${colaboradorId}/nichos`, TEAM(), {
      nichos: [niche.code, niche.code],
    });
    expect(repeated.statusCode).toBe(400);

    const saved = await call('PUT', `/platform/colaboradores/${colaboradorId}/nichos`, TEAM(), {
      nichos: [niche.code],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const stored = (
      await setup.query<{ nicho_preferencias: string[] }>(
        'SELECT nicho_preferencias FROM usuarios WHERE id = $1',
        [colaboradorId],
      )
    ).rows[0]!;
    expect(stored.nicho_preferencias).toEqual([niche.code]);
    const audit = await setup.query(
      `SELECT 1 FROM auditoria WHERE tenant_id = $1 AND acao = 'platform.colaborador.niches_changed'`,
      [platformTenant],
    );
    expect(audit.rowCount).toBeGreaterThan(0);

    // PUT só vale para colaborador: um mentor não é alterado por essa rota
    const notCollaborator = await call('PUT', `/platform/colaboradores/${mentor}/nichos`, TEAM(), {
      nichos: [niche.code],
    });
    expect(notCollaborator.statusCode).toBe(404);
  });

  it('o colaborador não consegue trocar os próprios nichos', async () => {
    const headers = bearer(colaboradorToken);
    const patched = await call('PATCH', '/me', headers, { nichos: [otherNiche.code] });
    expect(patched.statusCode).toBe(403);
    expect(patched.json().error).toBe('niches_locked');
    const stored = (
      await setup.query<{ nicho_preferencias: string[] }>(
        'SELECT nicho_preferencias FROM usuarios WHERE id = $1',
        [colaboradorId],
      )
    ).rows[0]!;
    expect(stored.nicho_preferencias).toEqual([niche.code]);
  });

  it('o colaborador cria busca e regra com sessão ao vivo, e a regra fica na conta dele', async () => {
    const headers = bearer(colaboradorToken);
    const created = await call('POST', '/saved-searches', headers, {
      nome: `Nicho ${suffix}`,
      filtros: { nicho: [niche.code] },
    });
    expect(created.statusCode, created.body).toBe(201);
    ruleId = (
      await setup.query<{ id: string }>('SELECT id FROM alertas_regras WHERE busca_id = $1', [
        created.json().id,
      ])
    ).rows[0]!.id;
    const patched = await call('PATCH', `/alert-rules/${ruleId}`, headers, {
      tipos: ['novos', 'sessao'],
      frequencia: 'imediata',
      canais: ['in_app'],
    });
    expect(patched.statusCode, patched.body).toBe(200);
    expect(patched.json().tipos).toEqual(['novos', 'sessao']);
    // a mesma regra é invisível para a empresa cliente (outra conta)
    const company = bearer(sign(clientAdmin, clientTenant, 'admin'));
    const rules = (await call('GET', '/alert-rules', company)).json().data as Array<{ id: string }>;
    expect(rules.some((rule) => rule.id === ruleId)).toBe(false);
  });

  it('alerta de sessão: avisa 1 hora antes, 15 minutos antes e no começo, sem repetir', async () => {
    const start = new Date(Date.now() + 50 * MINUTE);
    const inserted = await setup.query<{ id: string }>(
      `INSERT INTO editais (tenant_id, fonte, id_externo, titulo, hash_conteudo, uf,
                            data_encerramento_proposta)
       VALUES ($1, 'fixture', $2, $3, $4, 'DF', $5) RETURNING id`,
      [
        platformTenant,
        `sessao-${suffix}`,
        `Pregão eletrônico para ${term} ${suffix}`,
        `h-sessao-${suffix}`,
        start,
      ],
    );
    editalId = inserted.rows[0]!.id;

    const first = await cycle(new Date());
    expect(first.details).toEqual([]);
    let rows = await sessionDeliveries();
    expect(rows.filter((row) => row.edital_id === editalId).map((row) => row.marco)).toEqual([
      'sessao60',
    ]);
    expect(rows[0]!.usuario_id).toBe(colaboradorId);

    await cycle(new Date());
    expect(await sessionDeliveries()).toHaveLength(rows.length);

    await cycle(new Date(start.getTime() - 10 * MINUTE));
    rows = await sessionDeliveries();
    expect(rows.map((row) => row.marco).sort()).toEqual(['sessao15', 'sessao60']);

    await cycle(new Date(start.getTime() + 2 * MINUTE));
    rows = await sessionDeliveries();
    expect(rows.map((row) => row.marco).sort()).toEqual(['sessao0', 'sessao15', 'sessao60']);

    await cycle(new Date(start.getTime() + 3 * MINUTE));
    expect(await sessionDeliveries()).toHaveLength(3);

    const inbox = await call('GET', '/alerts', bearer(colaboradorToken));
    expect(inbox.statusCode, inbox.body).toBe(200);
    const sessions = (inbox.json().data as Array<{ tipo: string; edital_id: string }>).filter(
      (item) => item.tipo === 'sessao' && item.edital_id === editalId,
    );
    expect(sessions).toHaveLength(3);
  });

  it('sessão fora do nicho do colaborador não gera aviso', async () => {
    const start = new Date(Date.now() + 40 * MINUTE);
    const inserted = await setup.query<{ id: string }>(
      `INSERT INTO editais (tenant_id, fonte, id_externo, titulo, hash_conteudo, uf,
                            data_encerramento_proposta)
       VALUES ($1, 'fixture', $2, $3, $4, 'DF', $5) RETURNING id`,
      [
        platformTenant,
        `fora-${suffix}`,
        `Pregão sobre ${otherNiche.terms[0]!} ${suffix}`,
        `h-fora-${suffix}`,
        start,
      ],
    );
    await cycle(new Date());
    expect(await sessionDeliveries(inserted.rows[0]!.id)).toEqual([]);
  });
});
