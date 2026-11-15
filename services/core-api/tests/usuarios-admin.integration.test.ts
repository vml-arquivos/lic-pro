import { randomUUID } from 'node:crypto';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

const PASSWORD = 'Senha-Forte-2026!';
const niche = NICHE_CATALOG[0]!;

suite('Administração: usuários, ficha, edição e link de senha (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const platformTenant = randomUUID();
  const clientTenant = randomUUID();
  const team = randomUUID();
  const clientAdmin = randomUUID();
  const aluno = randomUUID();
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret',
    APP_URL: 'https://app.example.test',
    PANEL_URL_ADMIN: 'https://admin.example.test',
    PANEL_URL_EMPRESA: 'https://empresa.example.test',
    PANEL_URL_ALUNO: 'https://aluno.example.test',
  });
  const emails = {
    team: `equipe.${suffix}@example.test`,
    client: `cliente.${suffix}@example.test`,
    aluno: `aluno.${suffix}@example.test`,
  };

  const sign = (sub: string, tenantId: string, role: string) =>
    app.jwt.sign({ sub, tenantId, role });
  const bearer = (value: string) => ({ authorization: `Bearer ${value}` });
  const TEAM = () => bearer(sign(team, platformTenant, 'plataforma'));
  const CLIENT = () => bearer(sign(clientAdmin, clientTenant, 'admin'));
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

  async function insertUser(
    id: string,
    tenantId: string,
    papel: string,
    nome: string,
    email: string,
  ) {
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
  }

  async function waitFor<T>(read: () => Promise<T | null | undefined | false>): Promise<T> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const value = await read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('condição não atendida a tempo');
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({ jwtSecret: 'test-secret', logger: false, pool, config });
    await app.ready();
    for (const [id, nome] of [
      [platformTenant, 'Plataforma'],
      [clientTenant, 'Cliente Ficha'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `u-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    await insertUser(team, platformTenant, 'plataforma', 'Equipe Admin', emails.team);
    await insertUser(clientAdmin, clientTenant, 'admin', 'Dono da Empresa', emails.client);
    await insertUser(aluno, platformTenant, 'aluno', 'Aluna Teste', emails.aluno);
    await setup.query(
      `INSERT INTO empresas (tenant_id, cnpj, razao_social) VALUES ($1, '12345678000199', 'Cliente Ficha Ltda')`,
      [clientTenant],
    );
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('só a equipe da plataforma enxerga ficha, edita e gera link', async () => {
    for (const [method, url, payload] of [
      ['GET', `/platform/users/${clientAdmin}/ficha`, undefined],
      ['PATCH', `/platform/users/${clientAdmin}`, { nome: 'Outro Nome' }],
      ['POST', `/platform/users/${clientAdmin}/password-reset-link`, {}],
      ['GET', '/platform/team', undefined],
    ] as const) {
      const denied = await call(method, url, CLIENT(), payload);
      expect(denied.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('registra entrada e buscas e mostra na ficha da empresa', async () => {
    const login = await call(
      'POST',
      '/auth/login',
      {},
      { email: emails.client, password: PASSWORD },
    );
    expect(login.statusCode, login.body).toBe(200);
    await waitFor(async () => {
      const rows = await setup.query(
        `SELECT 1 FROM atividade_usuario WHERE usuario_id = $1 AND recurso = 'login'`,
        [clientAdmin],
      );
      return rows.rows[0];
    });

    const search = await call('GET', '/editais?q=notebook&uf=SP', CLIENT());
    expect(search.statusCode, search.body).toBe(200);
    await waitFor(async () => {
      const rows = await setup.query(
        `SELECT termo, filtros FROM atividade_buscas WHERE usuario_id = $1`,
        [clientAdmin],
      );
      return rows.rows[0];
    });
    // Falha de registro nunca muda a resposta; a repetição imediata não duplica a busca.
    await call('GET', '/editais?q=notebook&uf=SP', CLIENT());
    const count = await setup.query(
      `SELECT count(*)::int AS total FROM atividade_buscas WHERE usuario_id = $1`,
      [clientAdmin],
    );
    expect(count.rows[0].total).toBe(1);

    const ficha = await call('GET', `/platform/users/${clientAdmin}/ficha`, TEAM());
    expect(ficha.statusCode, ficha.body).toBe(200);
    const body = ficha.json();
    expect(body.usuario).toMatchObject({
      id: clientAdmin,
      tipo: 'empresa',
      email: emails.client,
      ativo: true,
    });
    expect(body.escopo).toBe('empresa');
    expect(body.empresa).toMatchObject({ razao_social: 'Cliente Ficha Ltda' });
    expect(body.acesso.ultimo_acesso).toBeTruthy();
    expect(body.acesso.entradas).toBeGreaterThanOrEqual(1);
    expect(body.acesso.por_recurso.map((item: { recurso: string }) => item.recurso)).toContain(
      'radar',
    );
    expect(body.buscas.recentes[0]).toMatchObject({
      origem: 'radar',
      termo: 'notebook',
      filtros: { uf: 'SP' },
    });
    expect(body.usuarios_da_empresa.map((item: { id: string }) => item.id)).toContain(clientAdmin);
  });

  it('a ficha de aluno mostra só o aluno e traz o bloco do curso', async () => {
    const ficha = await call('GET', `/platform/users/${aluno}/ficha`, TEAM());
    expect(ficha.statusCode, ficha.body).toBe(200);
    expect(ficha.json().usuario.tipo).toBe('aluno');
    expect(ficha.json().escopo).toBe('usuario');
    expect(ficha.json().curso).toMatchObject({ aulas_concluidas: 0 });
    const unknown = await call('GET', `/platform/users/${randomUUID()}/ficha`, TEAM());
    expect(unknown.statusCode).toBe(404);
  });

  it('edita nome, e-mail e nome da empresa; o login passa a usar o novo e-mail', async () => {
    const newEmail = `novo.${suffix}@example.test`;
    const edited = await call('PATCH', `/platform/users/${clientAdmin}`, TEAM(), {
      nome: 'Dona da Empresa',
      email: newEmail.toUpperCase(),
      empresa_nome: 'Cliente Renomeado Ltda',
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json()).toMatchObject({ nome: 'Dona da Empresa', email: newEmail });

    const stored = await setup.query(
      `SELECT u.nome, u.email, c.email AS credencial, t.nome AS conta, e.razao_social
         FROM usuarios u
         JOIN auth_credentials c ON c.usuario_id = u.id
         JOIN tenants t ON t.id = u.tenant_id
         JOIN empresas e ON e.tenant_id = u.tenant_id
        WHERE u.id = $1`,
      [clientAdmin],
    );
    expect(stored.rows[0]).toMatchObject({
      nome: 'Dona da Empresa',
      email: newEmail,
      credencial: newEmail,
      conta: 'Cliente Renomeado Ltda',
      razao_social: 'Cliente Renomeado Ltda',
    });
    const oldLogin = await call(
      'POST',
      '/auth/login',
      {},
      { email: emails.client, password: PASSWORD },
    );
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await call('POST', '/auth/login', {}, { email: newEmail, password: PASSWORD });
    expect(newLogin.statusCode, newLogin.body).toBe(200);
    emails.client = newEmail;
  });

  it('não deixa trocar para um e-mail que já existe, nem editar sem nada para mudar', async () => {
    const duplicated = await call('PATCH', `/platform/users/${clientAdmin}`, TEAM(), {
      email: emails.aluno,
    });
    expect(duplicated.statusCode).toBe(409);
    expect(duplicated.json().error).toBe('email_in_use');
    const empty = await call('PATCH', `/platform/users/${clientAdmin}`, TEAM(), {});
    expect(empty.statusCode).toBe(400);
    const notCompany = await call('PATCH', `/platform/users/${aluno}`, TEAM(), {
      empresa_nome: 'Não vale',
    });
    expect(notCompany.statusCode).toBe(400);
  });

  it('gera link de senha no painel certo, aceita senha de 8 e não aceita o mesmo link duas vezes', async () => {
    const generated = await call(
      'POST',
      `/platform/users/${clientAdmin}/password-reset-link`,
      TEAM(),
      {},
    );
    expect(generated.statusCode, generated.body).toBe(201);
    const link = generated.json().link as string;
    expect(link.startsWith('https://empresa.example.test/password-reset?token=')).toBe(true);
    const token = new URL(link).searchParams.get('token')!;

    const alunoLink = await call(
      'POST',
      `/platform/users/${aluno}/password-reset-link`,
      TEAM(),
      {},
    );
    expect(
      alunoLink.json().link.startsWith('https://aluno.example.test/password-reset?token='),
    ).toBe(true);

    const short = await call('POST', '/auth/password-reset', {}, { token, password: 'abc1234' });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toBe('weak_password');

    const done = await call('POST', '/auth/password-reset', {}, { token, password: 'oitocars' });
    expect(done.statusCode, done.body).toBe(200);
    const login = await call(
      'POST',
      '/auth/login',
      {},
      { email: emails.client, password: 'oitocars' },
    );
    expect(login.statusCode, login.body).toBe(200);
    const reused = await call(
      'POST',
      '/auth/password-reset',
      {},
      { token, password: 'outrasenha1' },
    );
    expect(reused.statusCode).toBe(400);

    const ficha = await call('GET', `/platform/users/${clientAdmin}/ficha`, TEAM());
    const labels = ficha.json().historico.map((item: { rotulo: string }) => item.rotulo);
    expect(labels).toContain('Administração gerou link de redefinição de senha');
    expect(labels).toContain('Definiu uma nova senha');
  });

  it('novo link substitui o anterior e conta desativada não recebe link', async () => {
    const first = await call('POST', `/platform/users/${aluno}/password-reset-link`, TEAM(), {});
    const second = await call('POST', `/platform/users/${aluno}/password-reset-link`, TEAM(), {});
    const firstToken = new URL(first.json().link).searchParams.get('token')!;
    const secondToken = new URL(second.json().link).searchParams.get('token')!;
    const old = await call(
      'POST',
      '/auth/password-reset',
      {},
      { token: firstToken, password: 'senha-nova-1' },
    );
    expect(old.statusCode).toBe(400);
    const fresh = await call(
      'POST',
      '/auth/password-reset',
      {},
      { token: secondToken, password: 'senha-nova-1' },
    );
    expect(fresh.statusCode, fresh.body).toBe(200);

    await call('PATCH', `/platform/users/${aluno}/active`, TEAM(), { ativo: false });
    const blocked = await call('POST', `/platform/users/${aluno}/password-reset-link`, TEAM(), {});
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe('user_inactive');
    await call('PATCH', `/platform/users/${aluno}/active`, TEAM(), { ativo: true });
  });

  it('lista a equipe administrativa e convida novo administrador pelo link de cadastro', async () => {
    const team$ = await call('GET', '/platform/team', TEAM());
    expect(team$.statusCode).toBe(200);
    expect(team$.json().data.map((item: { id: string }) => item.id)).toContain(team);

    const inviteEmail = `novo.admin.${suffix}@example.test`;
    const invite = await call('POST', '/platform/invitations', TEAM(), {
      tipo: 'equipe',
      nome: 'Novo Administrador',
      email: inviteEmail,
    });
    expect(invite.statusCode, invite.body).toBe(201);
    expect(invite.json().link.startsWith('https://admin.example.test/convite?token=')).toBe(true);
    const token = new URL(invite.json().link).searchParams.get('token')!;
    const accepted = await call(
      'POST',
      '/auth/invitations/accept',
      {},
      {
        token,
        password: 'admin-123',
        termos_aceitos: true,
        privacidade_aceita: true,
      },
    );
    expect(accepted.statusCode, accepted.body).toBe(201);
    const login = await call(
      'POST',
      '/auth/login',
      {},
      { email: inviteEmail, password: 'admin-123' },
    );
    expect(login.statusCode, login.body).toBe(200);
    const me = await call('GET', '/me', bearer(login.json().access_token));
    expect(me.json()).toMatchObject({ plataforma: true, area: 'administracao' });
  });
});
