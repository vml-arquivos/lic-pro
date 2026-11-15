import { randomUUID } from 'node:crypto';
import { SEGMENT_CATALOG, segmentsOfNiches } from '@licitecomigo/shared';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

const DAY = 24 * 60 * 60 * 1000;
// Dois segmentos do mesmo nicho (Tecnologia): software e redes.
const software = SEGMENT_CATALOG.find(
  (s) => s.code === 'tecnologia-comunicacao/software-e-sistemas',
)!;
const redes = SEGMENT_CATALOG.find(
  (s) => s.code === 'tecnologia-comunicacao/redes-e-telecomunicacoes',
)!;

suite('Segmentos e produtos/serviços na busca (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const platformTenant = randomUUID();
  const tenantA = randomUUID();
  const adminA = randomUUID();
  const alunoA = randomUUID();

  const as = (sub: string, role: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, tenantId: tenantA, role })}`,
  });
  const mine = (rows: Array<Record<string, unknown>>) =>
    rows
      .filter((row) => String(row.id_externo).endsWith(suffix))
      .map((row) => String(row.id_externo).split('-')[0])
      .sort();
  const list = async (query: string, role = 'admin', sub = adminA) => {
    const response = await app.inject({
      method: 'GET',
      url: `/editais?${query}&page_size=100`,
      headers: as(sub, role),
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as { data: Array<Record<string, unknown>> };
  };

  async function insertUser(id: string, papel: string, niches: string[]) {
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em,
                             nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb, true)`,
      [
        id,
        tenantA,
        `seg.${papel}.${suffix}@example.test`,
        `Seg ${papel}`,
        papel,
        hashPassword('Senha-Forte-2026!'),
        JSON.stringify(niches),
      ],
    );
  }

  async function insertEdital(key: string, titulo: string) {
    await setup.query(
      `INSERT INTO editais (tenant_id, fonte, id_externo, titulo, hash_conteudo,
                            data_encerramento_proposta, data_publicacao)
       VALUES ($1, 'fixture', $2, $3, $4, $5, now())`,
      [
        platformTenant,
        `${key}-${suffix}`,
        titulo,
        `h-${key}-${suffix}`,
        new Date(Date.now() + 5 * DAY),
      ],
    );
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
      [tenantA, 'Empresa A'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `sg-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    await insertUser(adminA, 'admin', ['tecnologia-comunicacao', 'saude-assistencia']);
    await insertUser(alunoA, 'aluno', ['saude-assistencia']);
    await insertEdital('soft', 'Contratação de licença de software de gestão pública');
    await insertEdital('rede', 'Aquisição de roteador e cabeamento estruturado para escola');
    await insertEdital('maca', 'Compra de cama hospitalar e maca para a unidade de saúde');
    await insertEdital('raro', 'Serviço de restauração de órgão de tubos com apoio de informática');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('segmento restringe ao que o segmento descreve, dentro do nicho', async () => {
    expect(mine((await list(`segmento=${encodeURIComponent(software.code)}`)).data)).toEqual([
      'soft',
    ]);
    expect(mine((await list(`segmento=${encodeURIComponent(redes.code)}`)).data)).toEqual(['rede']);
    // mais de um segmento = união
    const both = await list(
      `segmento=${encodeURIComponent(software.code)}&segmento=${encodeURIComponent(redes.code)}`,
    );
    expect(mine(both.data)).toEqual(['rede', 'soft']);
  });

  it('produto/serviço do catálogo e texto livre funcionam, e se somam ao segmento', async () => {
    expect(mine((await list('item=Licenças de software')).data)).toEqual(['soft']);
    expect(mine((await list('item=restauração de órgão')).data)).toEqual(['raro']);
    expect(
      mine(
        (await list(`segmento=${encodeURIComponent(redes.code)}&item=Licenças de software`)).data,
      ),
    ).toEqual([]);
  });

  it('segmento inválido é rejeitado e aluno não sai do próprio nicho', async () => {
    const bad = await app.inject({
      method: 'GET',
      url: '/editais?segmento=nao/existe',
      headers: as(adminA, 'admin'),
    });
    expect(bad.statusCode).toBe(400);
    const outside = await app.inject({
      method: 'GET',
      url: `/editais?segmento=${encodeURIComponent(software.code)}`,
      headers: as(alunoA, 'aluno'),
    });
    expect(outside.statusCode).toBe(403);
    const inside = await app.inject({
      method: 'GET',
      url: `/editais?segmento=${encodeURIComponent(segmentsOfNiches(['saude-assistencia'])[0]!.code)}`,
      headers: as(alunoA, 'aluno'),
    });
    expect(inside.statusCode).toBe(200);
  });

  it('perfil guarda segmentos e itens e a nota de compatibilidade os usa', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/radar/perfil',
      headers: as(adminA, 'admin'),
      payload: {
        segmentos: [software.code, 'nao/existe'],
        itens: ['Licenças de software'],
      },
    });
    expect(put.statusCode).toBe(200);
    const get = await app.inject({
      method: 'GET',
      url: '/radar/perfil',
      headers: as(adminA, 'admin'),
    });
    expect(get.json().perfil.segmentos).toEqual([software.code]);
    expect(get.json().perfil.itens).toEqual(['Licenças de software']);
    const ranked = await list('ordem=compat');
    const first = ranked.data.find((row) => String(row.id_externo).endsWith(suffix))!;
    expect(String(first.id_externo).startsWith('soft')).toBe(true);
    const criteria = (first.compat_detalhe as Array<{ criterio: string }>).map((c) => c.criterio);
    expect(criteria).toContain('segmento');
    expect(criteria).toContain('itens');
  });

  it('catálogo guiado traz segmentos, itens e contagem de abertas', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/catalog/segmentos?nicho=tecnologia-comunicacao',
      headers: as(adminA, 'admin'),
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      contado: boolean;
      data: Array<{ nicho: string; segmentos: Array<{ code: string; abertas: number | null }> }>;
    };
    expect(body.contado).toBe(true);
    expect(body.data.map((n) => n.nicho)).toEqual(['tecnologia-comunicacao']);
    const soft = body.data[0]!.segmentos.find((s) => s.code === software.code)!;
    expect(soft.abertas).toBeGreaterThanOrEqual(1);

    // aluno: só o próprio nicho, mesmo pedindo outro
    const aluno = await app.inject({
      method: 'GET',
      url: '/catalog/segmentos?nicho=tecnologia-comunicacao',
      headers: as(alunoA, 'aluno'),
    });
    expect(aluno.statusCode).toBe(200);
    expect(aluno.json().data.map((n: { nicho: string }) => n.nicho)).toEqual(['saude-assistencia']);
  });
});
