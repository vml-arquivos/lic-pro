import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);
const PASSWORD = 'Senha-Forte-2026!';

suite('Acesso master e funções bloqueadas da equipe (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const tenant = randomUUID();
  const master = randomUUID();
  const outroMaster = randomUUID();
  const testador = randomUUID();
  const aluno = randomUUID();
  const emailDe = (nome: string) => `${nome}.${suffix}@example.test`;
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret',
    DATABASE_URL: connectionString!,
    APP_URL: 'https://app.example.test',
    SUPERADMIN_EMAILS: ` ${emailDe('master').toUpperCase()}, ${emailDe('outro')} `,
  });

  const as = (sub: string, role = 'plataforma') => ({
    authorization: `Bearer ${app.jwt.sign({ sub, tenantId: tenant, role })}`,
  });
  const call = (
    method: 'GET' | 'POST' | 'PATCH',
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

  async function addUser(id: string, papel: string, nome: string) {
    const email = emailDe(nome);
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [id, tenant, email, nome, papel, hashPassword(PASSWORD)],
    );
    await setup.query(
      `INSERT INTO auth_credentials (tenant_id, usuario_id, email, password_hash, email_verificado_em)
       VALUES ($1, $2, $3, $4, now())`,
      [tenant, id, email, hashPassword(PASSWORD)],
    );
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({ jwtSecret: 'test-secret', logger: false, pool, config });
    await app.ready();
    await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
      tenant,
      'Plataforma',
      `acc-${tenant.slice(0, 8)}`,
    ]);
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [tenant]);
    await addUser(master, 'plataforma', 'master');
    await addUser(outroMaster, 'plataforma', 'outro');
    await addUser(testador, 'plataforma', 'testador');
    await addUser(aluno, 'aluno', 'aluno');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('o /me mostra quem é superadmin e as funções bloqueadas', async () => {
    const dono = (await call('GET', '/me', as(master))).json() as Record<string, unknown>;
    expect(dono).toMatchObject({
      superadmin: true,
      gestao_equipe: true,
      acessos_bloqueados: [],
      escopo_equipe: 'tudo',
    });
    const teste = (await call('GET', '/me', as(testador))).json() as Record<string, unknown>;
    expect(teste).toMatchObject({
      superadmin: false,
      gestao_equipe: false,
      acessos_bloqueados: [],
    });
    const estudante = (await call('GET', '/me', as(aluno, 'aluno'))).json() as Record<
      string,
      unknown
    >;
    expect(estudante).toMatchObject({
      superadmin: false,
      gestao_equipe: false,
      acessos_bloqueados: [],
    });
  });

  it('só o superadmin vê e mexe na equipe', async () => {
    const lista = await call('GET', '/platform/team', as(master));
    expect(lista.statusCode).toBe(200);
    const corpo = lista.json() as {
      ha_superadmin: boolean;
      data: Array<{ email: string; superadmin: boolean; acessos_bloqueados: string[] }>;
    };
    expect(corpo.ha_superadmin).toBe(true);
    expect(corpo.data.find((p) => p.email === emailDe('master'))?.superadmin).toBe(true);
    expect(corpo.data.find((p) => p.email === emailDe('testador'))).toMatchObject({
      superadmin: false,
      acessos_bloqueados: [],
    });
    expect((await call('GET', '/platform/team', as(testador))).statusCode).toBe(403);
    expect(
      (await call('PATCH', `/platform/users/${testador}/acessos`, as(testador), { bloqueados: [] }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await call('POST', '/platform/invitations', as(testador), {
          tipo: 'equipe',
          nome: 'Outro Teste',
          email: emailDe('naopode'),
        })
      ).statusCode,
    ).toBe(403);
    // o testador continua usando o resto do painel normalmente
    expect((await call('GET', '/portais', as(testador))).statusCode).toBe(200);
  });

  it('o superadmin bloqueia funções e o bloqueio vale na hora, na tela e na API', async () => {
    const salvo = await call('PATCH', `/platform/users/${testador}/acessos`, as(master), {
      bloqueados: ['/precos', '/radar', '/radar', '/inventada'],
    });
    expect(salvo.statusCode, salvo.body).toBe(200);
    expect(salvo.json()).toEqual({ id: testador, acessos_bloqueados: ['/precos', '/radar'] });

    const me = (await call('GET', '/me', as(testador))).json() as { acessos_bloqueados: string[] };
    expect(me.acessos_bloqueados).toEqual(['/precos', '/radar']);

    const negado = await call('GET', '/precos/itens', as(testador));
    expect(negado.statusCode).toBe(403);
    expect(negado.json()).toEqual({ error: 'acesso_bloqueado' });
    // o que não foi marcado segue liberado, e o superadmin nunca é limitado
    expect((await call('GET', '/portais', as(testador))).statusCode).toBe(200);
    expect((await call('GET', '/precos/itens', as(master))).statusCode).toBe(200);

    const lista = (await call('GET', '/platform/team', as(master))).json() as {
      data: Array<{ email: string; acessos_bloqueados: string[] }>;
    };
    expect(lista.data.find((p) => p.email === emailDe('testador'))?.acessos_bloqueados).toEqual([
      '/precos',
      '/radar',
    ]);

    // liberar de novo
    await call('PATCH', `/platform/users/${testador}/acessos`, as(master), { bloqueados: [] });
    expect((await call('GET', '/precos/itens', as(testador))).statusCode).toBe(200);
  });

  it('protege o superadmin e contas que não são da equipe', async () => {
    const proprio = await call('PATCH', `/platform/users/${master}/acessos`, as(master), {
      bloqueados: ['/radar'],
    });
    expect(proprio.statusCode).toBe(400);
    const outro = await call('PATCH', `/platform/users/${outroMaster}/acessos`, as(master), {
      bloqueados: ['/radar'],
    });
    expect(outro.statusCode).toBe(409);
    const estudante = await call('PATCH', `/platform/users/${aluno}/acessos`, as(master), {
      bloqueados: ['/radar'],
    });
    expect(estudante.statusCode).toBe(404);
    const semLogin = await app.inject({
      method: 'PATCH',
      url: `/platform/users/${testador}/acessos`,
      payload: { bloqueados: [] },
    });
    expect(semLogin.statusCode).toBe(401);
  });

  it('convite de equipe já nasce com as funções bloqueadas e o login vale em qualquer painel', async () => {
    const email = emailDe('convidado');
    const criado = await call('POST', '/platform/invitations', as(master), {
      tipo: 'equipe',
      nome: 'Convidado Teste',
      email,
      acessos_bloqueados: ['/admin/financeiro', '/gestao/financeiro', '/nao-existe'],
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const token = new URL((criado.json() as { link: string }).link).searchParams.get('token')!;
    const aceito = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      payload: { token, password: PASSWORD, termos_aceitos: true, privacidade_aceita: true },
    });
    expect(aceito.statusCode, aceito.body).toBe(201);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: PASSWORD, tenant_id: tenant },
    });
    expect(login.statusCode, login.body).toBe(200);
    const bearer = {
      authorization: `Bearer ${(login.json() as { access_token: string }).access_token}`,
    };
    const me = (await call('GET', '/me', bearer)).json() as {
      papel: string;
      acessos_bloqueados: string[];
      areas_permitidas: string[];
    };
    expect(me.papel).toBe('plataforma');
    expect(me.acessos_bloqueados).toEqual(['/admin/financeiro', '/gestao/financeiro']);
    expect(me.areas_permitidas).toEqual(
      expect.arrayContaining(['administracao', 'curso', 'empresa']),
    );
    expect((await call('GET', '/admin/financeiro', bearer)).statusCode).toBe(403);
    expect((await call('GET', '/admin/assinantes', bearer)).statusCode).toBe(200);
  });
});
