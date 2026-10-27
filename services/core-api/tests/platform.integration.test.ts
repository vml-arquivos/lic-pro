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
const nicheTerm = niche.terms[0]!;

suite('áreas, plataforma e convites (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;

  const platformTenant = randomUUID();
  const clientA = randomUUID();
  const clientB = randomUUID();
  const platformUser = randomUUID();
  const mentorUser = randomUUID();
  const adminA = randomUUID();
  const adminB = randomUUID();
  const turmaId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  const token = (sub: string, tenantId: string, role: string) =>
    app.jwt.sign({ sub, tenantId, role });

  async function insertUser(
    client: Pool,
    id: string,
    tenantId: string,
    papel: string,
    nome: string,
    extra: { nichos?: string[] } = {},
  ) {
    const email = `${nome.toLowerCase().replace(/\s+/g, '.')}.${suffix}@example.test`;
    await client.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em,
                             nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb, true)`,
      [
        id,
        tenantId,
        email,
        nome,
        papel,
        hashPassword(PASSWORD),
        JSON.stringify(extra.nichos ?? []),
      ],
    );
    await client.query(
      `INSERT INTO auth_credentials (tenant_id, usuario_id, email, password_hash, email_verificado_em)
       VALUES ($1, $2, $3, $4, now())`,
      [tenantId, id, email, hashPassword(PASSWORD)],
    );
    return email;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      config: loadConfig({
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret',
        DATABASE_URL: connectionString!,
        APP_URL: 'https://app.example.test',
      }),
    });
    await app.ready();

    for (const [id, nome] of [
      [platformTenant, 'Plataforma'],
      [clientA, 'Cliente A'],
      [clientB, 'Cliente B'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `t-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    await insertUser(setup, platformUser, platformTenant, 'plataforma', 'Equipe Produto');
    await insertUser(setup, mentorUser, platformTenant, 'mentor', 'Mentora Teste');
    await insertUser(setup, adminA, clientA, 'admin', 'Dona Empresa A', { nichos: [niche.code] });
    await insertUser(setup, adminB, clientB, 'admin', 'Dono Empresa B', { nichos: [niche.code] });
    await setup.query(
      'INSERT INTO turmas (id, tenant_id, nome, mentor_id) VALUES ($1, $2, $3, $4)',
      [turmaId, platformTenant, `Turma ${suffix}`, mentorUser],
    );
    await setup.query(
      `INSERT INTO editais (tenant_id, fonte, id_externo, titulo, hash_conteudo)
       VALUES ($1, 'fixture', $2, $3, $4)`,
      [platformTenant, `cat-${suffix}`, `Contratação de ${nicheTerm} ${suffix}`, `h-${suffix}`],
    );
    await setup.query(
      `INSERT INTO editais (tenant_id, fonte, id_externo, titulo, hash_conteudo)
       VALUES ($1, 'fixture', $2, $3, $4)`,
      [clientB, `priv-${suffix}`, `Edital privado do cliente B ${nicheTerm}`, `p-${suffix}`],
    );
    await setup.query(
      `INSERT INTO buscas_salvas (tenant_id, usuario_id, nome) VALUES ($1, $2, 'Busca B')`,
      [clientB, adminB],
    );
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  const get = (url: string, tokenValue?: string) =>
    app.inject({
      method: 'GET',
      url,
      ...(tokenValue ? { headers: { authorization: `Bearer ${tokenValue}` } } : {}),
    });

  it('cliente (admin de empresa) não acessa leads, plataforma nem auditoria geral', async () => {
    const t = token(adminA, clientA, 'admin');
    for (const url of [
      '/admin/leads',
      '/admin/users/audit',
      '/platform/overview',
      '/platform/companies',
      '/operations/ingest',
    ]) {
      expect((await get(url, t)).statusCode, url).toBe(403);
    }
  });

  it('leads: o aplicativo não lê a tabela direto e só a plataforma lista', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/public/leads',
      payload: {
        nome: 'Lead Teste',
        email: `lead.${suffix}@example.test`,
        perfil: 'iniciante',
        consentimento_lgpd: true,
      },
    });
    expect(created.statusCode).toBe(202);
    const duplicate = await app.inject({
      method: 'POST',
      url: '/public/leads',
      payload: {
        nome: 'Lead Teste',
        email: `lead.${suffix}@example.test`,
        perfil: 'iniciante',
        consentimento_lgpd: true,
      },
    });
    expect(duplicate.statusCode).toBe(202);

    await expect(pool.query('SELECT * FROM leads LIMIT 1')).rejects.toThrow(/permission denied/);

    const listed = await get('/admin/leads', token(platformUser, platformTenant, 'plataforma'));
    expect(listed.statusCode).toBe(200);
    const mine = (listed.json().data as Array<{ email: string }>).filter(
      (lead) => lead.email === `lead.${suffix}@example.test`,
    );
    expect(mine).toHaveLength(1);
  });

  it('a plataforma enxerga as contas clientes e o cliente não enxerga a outra conta', async () => {
    const listed = await get(
      '/platform/companies',
      token(platformUser, platformTenant, 'plataforma'),
    );
    expect(listed.statusCode).toBe(200);
    const ids = (listed.json().data as Array<{ tenant_id: string }>).map((row) => row.tenant_id);
    expect(ids).toContain(clientA);
    expect(ids).toContain(clientB);
    expect(ids).not.toContain(platformTenant);

    // Mesmo forçando a variável de sessão, uma conta cliente não lê outra conta.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [clientA]);
      await client.query("SELECT set_config('app.platform', 'true', true)");
      const foreign = await client.query(
        'SELECT count(*)::int AS total FROM usuarios WHERE tenant_id = $1',
        [clientB],
      );
      expect(foreign.rows[0].total).toBe(0);
      const tenants = await client.query(
        'SELECT count(*)::int AS total FROM tenants WHERE id = $1',
        [clientB],
      );
      expect(tenants.rows[0].total).toBe(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('a plataforma só altera `ativo` em conta de outro cliente', async () => {
    const t = token(platformUser, platformTenant, 'plataforma');
    const off = await app.inject({
      method: 'PATCH',
      url: `/platform/users/${adminB}/active`,
      headers: { authorization: `Bearer ${t}` },
      payload: { ativo: false },
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().ativo).toBe(false);
    const on = await app.inject({
      method: 'PATCH',
      url: `/platform/users/${adminB}/active`,
      headers: { authorization: `Bearer ${t}` },
      payload: { ativo: true },
    });
    expect(on.statusCode).toBe(200);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [platformTenant]);
      await client.query("SELECT set_config('app.platform', 'true', true)");
      await expect(
        client.query("UPDATE usuarios SET nome = 'invadido' WHERE id = $1", [adminB]),
      ).rejects.toThrow(/só pode ativar ou desativar/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }

    const self = await app.inject({
      method: 'PATCH',
      url: `/platform/users/${platformUser}/active`,
      headers: { authorization: `Bearer ${t}` },
      payload: { ativo: false },
    });
    expect(self.statusCode).toBe(409);
  });

  it('papel plataforma só existe em conta da plataforma', async () => {
    await expect(
      setup.query("UPDATE usuarios SET papel = 'plataforma' WHERE id = $1", [adminA]),
    ).rejects.toThrow(/exige conta da plataforma/);
  });

  it('catálogo compartilhado: cliente vê editais da plataforma, não os de outro cliente', async () => {
    const response = await get(
      `/editais?q=${encodeURIComponent(suffix)}`,
      token(adminA, clientA, 'admin'),
    );
    expect(response.statusCode).toBe(200);
    const titles = (response.json().data as Array<{ titulo: string }>).map((row) => row.titulo);
    expect(titles.some((title) => title.startsWith('Contratação de'))).toBe(true);
    expect(titles.some((title) => title.includes('privado do cliente B'))).toBe(false);

    const filters = await get('/catalog/filters', token(adminA, clientA, 'admin'));
    expect(filters.statusCode).toBe(200);
  });

  it('cliente não escolhe o próprio tipo de conta nem vira mentorado', async () => {
    const t = token(adminA, clientA, 'admin');
    const publico = await app.inject({
      method: 'PATCH',
      url: '/me/diagnostico',
      headers: { authorization: `Bearer ${t}` },
      payload: { publico: 'mentoria' },
    });
    expect(publico.statusCode).toBe(403);
    const perfil = await app.inject({
      method: 'PATCH',
      url: '/me/diagnostico',
      headers: { authorization: `Bearer ${t}` },
      payload: { perfil_jornada: 'mentorado' },
    });
    expect(perfil.statusCode).toBe(403);
    const ok = await app.inject({
      method: 'PATCH',
      url: '/me/diagnostico',
      headers: { authorization: `Bearer ${t}` },
      payload: { perfil_jornada: 'profissional' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('/me devolve a área calculada no servidor e o "ver como" da plataforma', async () => {
    const platform = token(platformUser, platformTenant, 'plataforma');
    const initial = (await get('/me', platform)).json();
    expect(initial).toMatchObject({ area: 'administracao', plataforma: true });
    expect(initial.areas_permitidas).toEqual(['administracao', 'empresa', 'aluno', 'mentor']);

    const switched = await app.inject({
      method: 'PATCH',
      url: '/me/view-as',
      headers: { authorization: `Bearer ${platform}` },
      payload: { area: 'aluno' },
    });
    expect(switched.statusCode).toBe(200);
    expect((await get('/me', platform)).json()).toMatchObject({
      area: 'aluno',
      papel: 'plataforma',
    });

    const client = (await get('/me', token(adminA, clientA, 'admin'))).json();
    expect(client).toMatchObject({ area: 'empresa', plataforma: false });
    expect(client.areas_permitidas).toEqual(['empresa']);
  });

  it('matrícula por convite, sem e-mail: cria aluno, matrícula e vínculo com o mentor', async () => {
    const t = token(platformUser, platformTenant, 'plataforma');
    const email = `aluno.${suffix}@example.test`;
    const created = await app.inject({
      method: 'POST',
      url: '/platform/invitations',
      headers: { authorization: `Bearer ${t}` },
      payload: { tipo: 'aluno', nome: 'Aluno Novo', email, turma_id: turmaId },
    });
    expect(created.statusCode).toBe(201);
    const { link, id } = created.json() as { link: string; id: string };
    expect(link).toMatch(/^https:\/\/app\.example\.test\/convite\?token=/);
    const inviteToken = new URL(link).searchParams.get('token')!;

    // A lista nunca devolve o token.
    const listed = await get('/platform/invitations', t);
    expect(JSON.stringify(listed.json())).not.toContain(inviteToken);

    const preview = await app.inject({
      method: 'POST',
      url: '/auth/invitations/preview',
      payload: { token: inviteToken },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ tipo: 'aluno', email });

    const weak = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      payload: {
        token: inviteToken,
        password: '123',
        termos_aceitos: true,
        privacidade_aceita: true,
      },
    });
    expect(weak.statusCode).toBe(400);

    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      payload: {
        token: inviteToken,
        password: PASSWORD,
        termos_aceitos: true,
        privacidade_aceita: true,
      },
    });
    expect(accepted.statusCode, accepted.body).toBe(201);

    const reused = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      payload: {
        token: inviteToken,
        password: PASSWORD,
        termos_aceitos: true,
        privacidade_aceita: true,
      },
    });
    expect(reused.statusCode).toBe(404);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: PASSWORD, tenant_id: platformTenant },
    });
    expect(login.statusCode).toBe(200);
    const studentToken = login.json().access_token as string;
    expect((await get('/me', studentToken)).json()).toMatchObject({
      area: 'aluno',
      papel: 'aluno',
      plataforma: false,
    });
    expect((await get('/admin/leads', studentToken)).statusCode).toBe(403);
    expect((await get('/platform/overview', studentToken)).statusCode).toBe(403);

    const students = await get('/platform/students', t);
    const row = (students.json().data as Array<Record<string, unknown>>).find(
      (item) => item.email === email,
    );
    expect(row).toMatchObject({
      turma_id: turmaId,
      mentor_id: mentorUser,
      matricula_status: 'ativa',
    });

    const invitations = (await get('/platform/invitations', t)).json().data as Array<{
      id: string;
      situacao: string;
    }>;
    expect(invitations.find((item) => item.id === id)?.situacao).toBe('aceito');
  });

  it('convite de empresa cria conta própria (cliente) sem acesso à Administração', async () => {
    const t = token(platformUser, platformTenant, 'plataforma');
    const email = `empresa.${suffix}@example.test`;
    const created = await app.inject({
      method: 'POST',
      url: '/platform/invitations',
      headers: { authorization: `Bearer ${t}` },
      payload: {
        tipo: 'empresa',
        nome: 'Responsável Nova',
        email,
        empresa_nome: 'Nova Empresa Ltda',
      },
    });
    expect(created.statusCode).toBe(201);
    const inviteToken = new URL(created.json().link as string).searchParams.get('token')!;

    const duplicate = await app.inject({
      method: 'POST',
      url: '/platform/invitations',
      headers: { authorization: `Bearer ${t}` },
      payload: {
        tipo: 'empresa',
        nome: 'Outro',
        email: `dona.empresa.a.${suffix}@example.test`,
        empresa_nome: 'X Y',
      },
    });
    expect(duplicate.statusCode).toBe(409);

    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      payload: {
        token: inviteToken,
        password: PASSWORD,
        termos_aceitos: true,
        privacidade_aceita: true,
      },
    });
    expect(accepted.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const companyToken = login.json().access_token as string;
    expect((await get('/me', companyToken)).json()).toMatchObject({
      area: 'empresa',
      plataforma: false,
    });
    expect((await get('/admin/leads', companyToken)).statusCode).toBe(403);

    const companies = (await get('/platform/companies', t)).json().data as Array<{ email: string }>;
    expect(companies.some((company) => company.email === email)).toBe(true);
  });

  it('convite revogado ou expirado não funciona; reemitir invalida o link anterior', async () => {
    const t = token(platformUser, platformTenant, 'plataforma');
    const created = await app.inject({
      method: 'POST',
      url: '/platform/invitations',
      headers: { authorization: `Bearer ${t}` },
      payload: { tipo: 'mentor', nome: 'Mentor Convidado', email: `mentor.${suffix}@example.test` },
    });
    const { id, link } = created.json() as { id: string; link: string };
    const first = new URL(link).searchParams.get('token')!;

    const reissued = await app.inject({
      method: 'POST',
      url: `/platform/invitations/${id}/reissue`,
      headers: { authorization: `Bearer ${t}` },
    });
    expect(reissued.statusCode).toBe(200);
    const second = new URL(reissued.json().link as string).searchParams.get('token')!;
    expect(second).not.toBe(first);

    const old = await app.inject({
      method: 'POST',
      url: '/auth/invitations/preview',
      payload: { token: first },
    });
    expect(old.statusCode).toBe(404);

    await app.inject({
      method: 'POST',
      url: `/platform/invitations/${id}/revoke`,
      headers: { authorization: `Bearer ${t}` },
    });
    const revoked = await app.inject({
      method: 'POST',
      url: '/auth/invitations/preview',
      payload: { token: second },
    });
    expect(revoked.statusCode).toBe(404);

    await setup.query(
      "UPDATE convites SET revogado_em = NULL, expira_em = now() - interval '1 minute' WHERE id = $1",
      [id],
    );
    const expired = await app.inject({
      method: 'POST',
      url: '/auth/invitations/preview',
      payload: { token: second },
    });
    expect(expired.statusCode).toBe(404);
  });

  it('as ações da plataforma ficam na auditoria com a área de "ver como"', async () => {
    const t = token(platformUser, platformTenant, 'plataforma');
    const response = await app.inject({
      method: 'POST',
      url: '/platform/classes',
      headers: { authorization: `Bearer ${t}`, 'x-acting-as': 'aluno' },
      payload: { nome: `Turma auditada ${suffix}`, mentor_id: mentorUser },
    });
    expect(response.statusCode).toBe(201);
    const audit = await setup.query(
      `SELECT acao, metadata FROM auditoria
        WHERE tenant_id = $1 AND acao = 'platform.class.created' ORDER BY created_at DESC LIMIT 1`,
      [platformTenant],
    );
    expect(audit.rows[0]?.metadata).toMatchObject({ acting_as: 'aluno' });
    const reads = await setup.query(
      `SELECT count(*)::int AS total FROM auditoria
        WHERE tenant_id = $1 AND acao = 'platform.companies.listed'`,
      [platformTenant],
    );
    expect(reads.rows[0].total).toBeGreaterThan(0);
    // A tela de Auditoria lê o mesmo registro pela API.
    const listed = await get('/admin/users/audit', t);
    expect(listed.statusCode).toBe(200);
    expect(
      listed.json().data.some((row: { acao: string }) => row.acao === 'platform.class.created'),
    ).toBe(true);
  });

  it('visão geral e fontes funcionam com dados reais', async () => {
    const t = token(platformUser, platformTenant, 'plataforma');
    const overview = await get('/platform/overview', t);
    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({
      empresas_clientes: { total: expect.any(Number) },
      curso: { turmas_ativas: expect.any(Number) },
      editais: { total: expect.any(Number) },
    });
    for (const url of ['/platform/students', '/platform/mentors', '/platform/classes']) {
      expect((await get(url, t)).statusCode, url).toBe(200);
    }
  });
});
