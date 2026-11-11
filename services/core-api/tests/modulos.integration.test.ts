import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

/**
 * Módulo Curso × módulo Profissional: dinheiro, leads, cupons e planos de um módulo nunca
 * aparecem no outro, e a equipe pode "ver como" a Administração da mentoria.
 */
suite('Módulos Curso e Profissional (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const platformTenant = randomUUID();
  const team = randomUUID();
  const aluno = randomUUID();
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret',
    APP_URL: 'https://app.example.test',
    PANEL_URL_ALUNO: 'https://mentoria.example.test',
  });

  const bearer = (role: string, sub: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, tenantId: platformTenant, role })}`,
  });
  const TEAM = () => bearer('plataforma', team);
  const call = (
    method: 'GET' | 'PUT' | 'PATCH',
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

  async function planId(slug: string): Promise<string> {
    const rows = await setup.query<{ id: string }>('SELECT id FROM planos WHERE slug = $1', [slug]);
    return rows.rows[0]!.id;
  }

  async function addCharge(tipo: 'curso' | 'assinatura', slug: string, cents: number, who: string) {
    const id = randomUUID();
    await setup.query(
      `INSERT INTO cobrancas (id, tipo, plano_id, comprador_nome, comprador_email, status,
                              valor_centavos, pago_em)
       VALUES ($1, $2, $3, $4, $5, 'paga', $6, now())`,
      [id, tipo, await planId(slug), who, `${who.toLowerCase()}.${suffix}@example.test`, cents],
    );
    await setup.query(
      `INSERT INTO cobranca_pagamentos (cobranca_id, asaas_payment_id, status, valor_centavos, pago_em)
       VALUES ($1, $2, 'CONFIRMED', $3, now())`,
      [id, `pay-${id}`, cents],
    );
  }

  async function addLead(perfil: 'empresario' | 'mentorado' | 'iniciante', who: string) {
    await setup.query(
      `INSERT INTO leads (nome, email, perfil, consentimento_lgpd, consentimento_versao,
                          consentimento_em)
       VALUES ($1, $2, $3, true, 'test', now())`,
      [who, `${who.toLowerCase()}.${suffix}@example.test`, perfil],
    );
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({ jwtSecret: 'test-secret', logger: false, pool, config });
    await app.ready();
    await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
      platformTenant,
      'Plataforma',
      `m-${platformTenant.slice(0, 8)}`,
    ]);
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    for (const [id, papel, email] of [
      [team, 'plataforma', `equipe.${suffix}@example.test`],
      [aluno, 'aluno', `aluno.${suffix}@example.test`],
    ] as const) {
      await setup.query(
        `INSERT INTO usuarios (id, tenant_id, email, nome, papel, email_verificado_em)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [id, platformTenant, email, `Usuário ${papel}`, papel],
      );
    }
    await addCharge('curso', 'curso-licite-comigo', 19_700, 'Compradora');
    await addCharge('assinatura', 'empresa-essencial', 9_900, 'Empresa');
    await addLead('mentorado', 'LeadAluno');
    await addLead('iniciante', 'LeadIniciante');
    await addLead('empresario', 'LeadEmpresa');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('o financeiro de cada módulo só soma o próprio dinheiro', async () => {
    const read = async (modulo?: string) => {
      const res = await call(
        'GET',
        `/admin/financeiro${modulo ? `?modulo=${modulo}` : ''}`,
        TEAM(),
      );
      expect(res.statusCode, res.body).toBe(200);
      return res.json() as {
        receita: { total_centavos: string; pagamentos: number };
        assinaturas: { ativas: number };
        curso: { vendidos: number };
        recentes: { tipo: string }[];
      };
    };
    const all = await read();
    const curso = await read('curso');
    const prof = await read('profissional');

    expect(curso.recentes.length).toBeGreaterThan(0);
    expect(curso.recentes.every((row) => row.tipo === 'curso')).toBe(true);
    expect(prof.recentes.length).toBeGreaterThan(0);
    expect(prof.recentes.every((row) => row.tipo === 'assinatura')).toBe(true);

    expect(curso.assinaturas.ativas).toBe(0);
    expect(prof.curso.vendidos).toBe(0);
    expect(Number(curso.receita.total_centavos) + Number(prof.receita.total_centavos)).toBe(
      Number(all.receita.total_centavos),
    );
    expect(curso.receita.pagamentos + prof.receita.pagamentos).toBe(all.receita.pagamentos);
    expect(Number(curso.receita.total_centavos)).toBeGreaterThanOrEqual(19_700);
    expect(Number(prof.receita.total_centavos)).toBeGreaterThanOrEqual(9_900);
  });

  it('recusa módulo desconhecido e só a equipe lê', async () => {
    const invalid = await call('GET', '/admin/financeiro?modulo=outro', TEAM());
    expect(invalid.statusCode).toBeGreaterThanOrEqual(400);
    const student = await call('GET', '/admin/financeiro?modulo=curso', bearer('aluno', aluno));
    expect(student.statusCode).toBe(403);
  });

  it('os planos de cada módulo ficam em listas separadas', async () => {
    const list = async (modulo: string) =>
      (await call('GET', `/admin/planos?modulo=${modulo}`, TEAM())).json() as {
        planos: { slug: string; tipo: string }[];
      };
    const curso = await list('curso');
    const prof = await list('profissional');
    expect(curso.planos.map((plan) => plan.slug)).toContain('curso-licite-comigo');
    expect(curso.planos.every((plan) => plan.tipo === 'curso')).toBe(true);
    expect(prof.planos.length).toBeGreaterThan(0);
    expect(prof.planos.every((plan) => plan.tipo === 'assinatura')).toBe(true);
  });

  it('os leads de alunos e de empresas não se misturam', async () => {
    const read = async (modulo: string) =>
      (
        (await call('GET', `/admin/leads?modulo=${modulo}`, TEAM())).json() as {
          data: { perfil: string; email: string }[];
        }
      ).data.filter((lead) => lead.email.endsWith(`.${suffix}@example.test`));
    const curso = await read('curso');
    const prof = await read('profissional');
    expect(curso.map((lead) => lead.perfil).sort()).toEqual(['iniciante', 'mentorado']);
    expect(prof.map((lead) => lead.perfil)).toEqual(['empresario']);
  });

  it('a visão geral conta só as contas e os leads do módulo', async () => {
    const read = async (modulo: string) =>
      (await call('GET', `/platform/overview?modulo=${modulo}`, TEAM())).json() as {
        contas_por_papel: { papel: string }[];
        leads: { total: number };
      };
    const curso = await read('curso');
    const prof = await read('profissional');
    for (const row of curso.contas_por_papel) expect(['aluno', 'mentor']).toContain(row.papel);
    for (const row of prof.contas_por_papel) expect(['aluno', 'mentor']).not.toContain(row.papel);
    expect(curso.leads.total).toBeGreaterThanOrEqual(2);
    expect(prof.leads.total).toBeGreaterThanOrEqual(1);
  });

  it('cupom criado em um módulo só vale para planos dele e só aparece nele', async () => {
    const codigo = `CURSO${suffix.toUpperCase()}`.replace(/[^A-Z0-9]/g, '');
    const body = {
      codigo,
      descricao: 'Teste',
      tipo: 'percentual',
      valor: 10,
      plano_slugs: null,
      max_usos: null,
      valido_ate: null,
      ativo: true,
    };
    const created = await call('PUT', '/admin/cupons?modulo=curso', TEAM(), body);
    expect(created.statusCode, created.body).toBe(200);

    const stored = await setup.query<{ plano_slugs: string[] | null }>(
      'SELECT plano_slugs FROM cupons WHERE codigo = $1',
      [codigo],
    );
    expect(stored.rows[0]!.plano_slugs).toEqual(['curso-licite-comigo']);

    const list = async (modulo: string) =>
      (await call('GET', `/admin/cupons?modulo=${modulo}`, TEAM())).json() as {
        cupons: { codigo: string }[];
        planos: { slug: string }[];
      };
    const curso = await list('curso');
    const prof = await list('profissional');
    expect(curso.cupons.map((cupom) => cupom.codigo)).toContain(codigo);
    expect(prof.cupons.map((cupom) => cupom.codigo)).not.toContain(codigo);
    expect(curso.planos.map((plan) => plan.slug)).toEqual(['curso-licite-comigo']);
    expect(prof.planos.map((plan) => plan.slug)).not.toContain('curso-licite-comigo');

    const crossed = await call('PUT', '/admin/cupons?modulo=profissional', TEAM(), {
      ...body,
      codigo: `${codigo}X`,
      plano_slugs: ['curso-licite-comigo'],
    });
    expect(crossed.statusCode).toBe(400);
    expect((crossed.json() as { error: string }).error).toBe('plano_de_outro_modulo');
  });

  it('a equipe pode "ver como" a Administração da mentoria, e ela vem em /me', async () => {
    const set = await call('PATCH', '/me/view-as', TEAM(), { area: 'curso' });
    expect(set.statusCode, set.body).toBe(200);
    const me = await call('GET', '/me', TEAM());
    const json = me.json() as { area: string; areas_permitidas: string[] };
    expect(json.area).toBe('curso');
    expect(json.areas_permitidas).toContain('curso');
    expect(json.areas_permitidas).toContain('administracao');
    await call('PATCH', '/me/view-as', TEAM(), { area: 'administracao' });

    const student = await call('GET', '/me', bearer('aluno', aluno));
    expect((student.json() as { areas_permitidas: string[] }).areas_permitidas).toEqual(['aluno']);
  });

  it('avisa quando há migrations por aplicar e só a equipe vê', async () => {
    const res = await call('GET', '/platform/migracoes', TEAM());
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ pendente: false, motivo: 'em_dia' });
    const student = await call('GET', '/platform/migracoes', bearer('aluno', aluno));
    expect(student.statusCode).toBe(403);
  });
});
