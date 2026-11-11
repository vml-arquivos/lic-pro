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

suite(
  'Escopo da equipe: administrador só da mentoria ou só do Painel admin (PostgreSQL real)',
  () => {
    let pool!: Pool;
    let setup!: Pool;
    let app!: ReturnType<typeof buildApp>;
    const suffix = randomUUID().slice(0, 8);
    const platformTenant = randomUUID();
    const owner = randomUUID();
    const cursoAdmin = randomUUID();
    const profAdmin = randomUUID();
    const aluno = randomUUID();
    const empresa = randomUUID();
    const config = loadConfig({
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
      DATABASE_URL: connectionString!,
      APP_URL: 'https://app.example.test',
      PANEL_URL_ADMIN: 'https://admin.example.test',
      PANEL_URL_ALUNO: 'https://aluno.example.test',
      PANEL_URL_CURSO: 'https://mentoria.example.test',
    });

    const as = (sub: string, role = 'plataforma') => ({
      authorization: `Bearer ${app.jwt.sign({ sub, tenantId: platformTenant, role })}`,
    });
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

    async function addUser(id: string, papel: string, nome: string, escopo?: string) {
      const email = `${nome}.${suffix}@example.test`;
      await setup.query(
        `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [id, platformTenant, email, nome, papel, hashPassword(PASSWORD)],
      );
      await setup.query(
        `INSERT INTO auth_credentials (tenant_id, usuario_id, email, password_hash, email_verificado_em)
       VALUES ($1, $2, $3, $4, now())`,
        [platformTenant, id, email, hashPassword(PASSWORD)],
      );
      if (escopo)
        await setup.query('UPDATE usuarios SET escopo_equipe = $2 WHERE id = $1', [id, escopo]);
      return email;
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: connectionString! });
      setup = new Pool({ connectionString: setupConnectionString! });
      app = buildApp({ jwtSecret: 'test-secret', logger: false, pool, config });
      await app.ready();
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        platformTenant,
        'Plataforma',
        `esc-${platformTenant.slice(0, 8)}`,
      ]);
      await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
      await addUser(owner, 'plataforma', 'dono');
      await addUser(cursoAdmin, 'plataforma', 'curso', 'curso');
      await addUser(profAdmin, 'plataforma', 'prof', 'profissional');
      await addUser(aluno, 'aluno', 'aluno');
      await addUser(empresa, 'admin', 'empresa');
    });

    afterAll(async () => {
      await app.close();
      await pool.end();
      await setup.end();
    });

    it('o /me do administrador da mentoria só traz as áreas do curso e abre em "curso"', async () => {
      const me = (await call('GET', '/me', as(cursoAdmin))).json() as {
        area: string;
        areas_permitidas: string[];
        escopo_equipe: string;
      };
      expect(me.escopo_equipe).toBe('curso');
      expect(me.area).toBe('curso');
      expect([...me.areas_permitidas].sort()).toEqual(['aluno', 'curso', 'mentor']);

      const dono = (await call('GET', '/me', as(owner))).json() as {
        areas_permitidas: string[];
        escopo_equipe: string;
      };
      expect(dono.escopo_equipe).toBe('tudo');
      expect(dono.areas_permitidas).toContain('administracao');

      const prof = (await call('GET', '/me', as(profAdmin))).json() as {
        area: string;
        areas_permitidas: string[];
      };
      expect(prof.area).toBe('administracao');
      expect(prof.areas_permitidas).not.toContain('curso');
    });

    it('"ver como" fica dentro do escopo', async () => {
      expect(
        (await call('PATCH', '/me/view-as', as(cursoAdmin), { area: 'administracao' })).statusCode,
      ).toBe(403);
      expect(
        (await call('PATCH', '/me/view-as', as(cursoAdmin), { area: 'aluno' })).statusCode,
      ).toBe(200);
      expect(
        (await call('PATCH', '/me/view-as', as(profAdmin), { area: 'curso' })).statusCode,
      ).toBe(403);
      expect((await call('PATCH', '/me/view-as', as(owner), { area: 'curso' })).statusCode).toBe(
        200,
      );
      await call('PATCH', '/me/view-as', as(owner), { area: 'administracao' });
    });

    it('o administrador da mentoria lê o curso e não lê o que é do Painel admin', async () => {
      const A = as(cursoAdmin);
      expect((await call('GET', '/admin/financeiro?modulo=curso', A)).statusCode).toBe(200);
      expect((await call('GET', '/platform/overview?modulo=curso', A)).statusCode).toBe(200);
      expect((await call('GET', '/platform/students', A)).statusCode).toBe(200);
      expect((await call('GET', '/platform/classes', A)).statusCode).toBe(200);
      expect((await call('GET', '/platform/migracoes', A)).statusCode).toBe(200);
      for (const url of [
        '/admin/financeiro?modulo=profissional',
        '/admin/financeiro',
        '/admin/leads?modulo=profissional',
        '/admin/assinantes',
        '/platform/companies',
        '/platform/team',
        '/operations/ingest',
        '/admin/users/audit',
      ]) {
        const res = await call('GET', url, A);
        expect(res.statusCode, url).toBe(403);
        expect((res.json() as { error: string }).error).toBe('escopo_da_equipe');
      }
    });

    it('o administrador do Painel admin não lê o curso', async () => {
      const P = as(profAdmin);
      expect((await call('GET', '/admin/financeiro?modulo=profissional', P)).statusCode).toBe(200);
      expect((await call('GET', '/platform/companies', P)).statusCode).toBe(200);
      for (const url of [
        '/admin/financeiro?modulo=curso',
        '/platform/students',
        '/platform/classes',
        '/platform/team',
      ]) {
        expect((await call('GET', url, P)).statusCode, url).toBe(403);
      }
    });

    it('não mexe em conta de outro painel nem na equipe (nem para tomar a conta do dono)', async () => {
      const A = as(cursoAdmin);
      expect((await call('GET', `/platform/users/${owner}/ficha`, A)).statusCode).toBe(403);
      expect(
        (await call('POST', `/platform/users/${owner}/password-reset-link`, A)).statusCode,
      ).toBe(403);
      expect(
        (await call('PATCH', `/platform/users/${empresa}`, A, { nome: 'Outro' })).statusCode,
      ).toBe(403);
      expect((await call('GET', `/platform/users/${aluno}/ficha`, A)).statusCode).toBe(200);
      expect((await call('GET', `/platform/users/${aluno}/ficha`, as(profAdmin))).statusCode).toBe(
        403,
      );
      expect(
        (await call('GET', `/platform/users/${empresa}/ficha`, as(profAdmin))).statusCode,
      ).toBe(200);
    });

    it('convites: cada escopo convida só o próprio público, e ninguém restrito cria equipe', async () => {
      const mentor = (suffix2: string) => ({
        tipo: 'mentor',
        nome: 'Mentora Teste',
        email: `mentora.${suffix2}.${suffix}@example.test`,
      });
      expect(
        (await call('POST', '/platform/invitations', as(cursoAdmin), mentor('a'))).statusCode,
      ).toBe(201);
      for (const tipo of ['empresa', 'colaborador', 'equipe']) {
        const res = await call('POST', '/platform/invitations', as(cursoAdmin), {
          tipo,
          nome: 'Fulano Teste',
          email: `${tipo}.${suffix}@example.test`,
          empresa_nome: 'Empresa Teste',
        });
        expect(res.statusCode, tipo).toBe(403);
      }
      const equipeProf = await call('POST', '/platform/invitations', as(profAdmin), {
        tipo: 'equipe',
        nome: 'Quer Escalar',
        email: `escalar.${suffix}@example.test`,
      });
      expect(equipeProf.statusCode).toBe(403);

      const lista = (await call('GET', '/platform/invitations', as(cursoAdmin))).json() as {
        data: { tipo: string }[];
      };
      expect(lista.data.length).toBeGreaterThan(0);
      expect(lista.data.every((invite) => ['aluno', 'mentor'].includes(invite.tipo))).toBe(true);
    });

    it('convite de equipe com escopo "curso" abre no Painel da mentoria e cria conta restrita', async () => {
      const email = `novo.curso.${suffix}@example.test`;
      const created = await call('POST', '/platform/invitations', as(owner), {
        tipo: 'equipe',
        nome: 'Admin da Mentoria',
        email,
        escopo: 'curso',
      });
      expect(created.statusCode, created.body).toBe(201);
      const { link } = created.json() as { link: string };
      expect(link.startsWith('https://mentoria.example.test/convite?token=')).toBe(true);
      const token = new URL(link).searchParams.get('token')!;

      const accepted = await app.inject({
        method: 'POST',
        url: '/auth/invitations/accept',
        payload: { token, password: PASSWORD, termos_aceitos: true, privacidade_aceita: true },
      });
      expect(accepted.statusCode, accepted.body).toBe(201);

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: PASSWORD, tenant_id: platformTenant },
      });
      expect(login.statusCode, login.body).toBe(200);
      const bearer = {
        authorization: `Bearer ${(login.json() as { access_token: string }).access_token}`,
      };
      const me = (await call('GET', '/me', bearer)).json() as {
        papel: string;
        escopo_equipe: string;
        area: string;
        areas_permitidas: string[];
      };
      expect(me).toMatchObject({ papel: 'plataforma', escopo_equipe: 'curso', area: 'curso' });
      expect(me.areas_permitidas).not.toContain('administracao');
      expect((await call('GET', '/admin/assinantes', bearer)).statusCode).toBe(403);
      expect((await call('GET', '/admin/financeiro?modulo=curso', bearer)).statusCode).toBe(200);
    });

    it('convite de equipe sem escopo continua dando acesso total, e o link vai para o Painel admin', async () => {
      const created = await call('POST', '/platform/invitations', as(owner), {
        tipo: 'equipe',
        nome: 'Outro Admin',
        email: `total.${suffix}@example.test`,
      });
      expect(created.statusCode, created.body).toBe(201);
      expect(
        (created.json() as { link: string }).link.startsWith('https://admin.example.test/convite'),
      ).toBe(true);
    });

    it('só quem tem acesso total muda o escopo de alguém, e nunca o próprio', async () => {
      const changed = await call('PATCH', `/platform/users/${profAdmin}/escopo`, as(owner), {
        escopo_equipe: 'curso',
      });
      expect(changed.statusCode, changed.body).toBe(200);
      expect(
        ((await call('GET', '/me', as(profAdmin))).json() as { escopo_equipe: string })
          .escopo_equipe,
      ).toBe('curso');

      expect(
        (
          await call('PATCH', `/platform/users/${owner}/escopo`, as(owner), {
            escopo_equipe: 'curso',
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await call('PATCH', `/platform/users/${owner}/escopo`, as(cursoAdmin), {
            escopo_equipe: 'tudo',
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await call('PATCH', `/platform/users/${aluno}/escopo`, as(owner), {
            escopo_equipe: 'curso',
          })
        ).statusCode,
      ).toBe(404);

      const team = (await call('GET', '/platform/team', as(owner))).json() as {
        data: { id: string; escopo_equipe: string }[];
      };
      expect(team.data.find((row) => row.id === cursoAdmin)?.escopo_equipe).toBe('curso');
      expect(team.data.find((row) => row.id === owner)?.escopo_equipe).toBe('tudo');
    });
  },
);
