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

const niche = NICHE_CATALOG[0]!;
const term = niche.terms[0]!;
const DAY = 24 * 60 * 60 * 1000;

type Linha = {
  id: string;
  titulo: string;
  posicao: number;
  analise: {
    nota: number;
    lucro_estimado: number | null;
    desconto_base: string | null;
    desconto_tipico_pct: number | null;
    componentes: { chave: string; pontos: number }[];
  };
};

suite('Análise de oportunidades: ranking, comparação e simulador (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const platformTenant = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const adminA = randomUUID();
  const alunoA = randomUUID();
  const adminB = randomUUID();
  const ids: Record<string, string> = {};
  const cnpj = `9${Date.now()}`.slice(0, 14);

  const as = (sub: string, tenantId: string, role: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, tenantId, role })}`,
  });
  const ADMIN = () => as(adminA, tenantA, 'admin');

  async function insertUser(id: string, tenantId: string, papel: string, nome: string) {
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em,
                             nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb, true)`,
      [
        id,
        tenantId,
        `${nome.toLowerCase().replace(/\s+/g, '.')}.${suffix}@example.test`,
        nome,
        papel,
        hashPassword('Senha-Forte-2026!'),
        JSON.stringify([niche.code]),
      ],
    );
  }

  async function insertEdital(key: string, fields: Record<string, unknown>) {
    const base: Record<string, unknown> = {
      tenant_id: platformTenant,
      fonte: 'fixture',
      id_externo: `${key}-${suffix}`,
      titulo: `Contratação de ${term} ${key} ${suffix}`,
      hash_conteudo: `h-${key}-${suffix}`,
      orgao: `Órgão ${suffix}`,
      ...fields,
    };
    const columns = Object.keys(base);
    const result = await setup.query<{ id: string }>(
      `INSERT INTO editais (${columns.join(', ')})
       VALUES (${columns.map((_c, index) => `$${index + 1}`).join(', ')}) RETURNING id`,
      Object.values(base),
    );
    ids[key] = result.rows[0]!.id;
  }

  async function insertItem(key: string, catmat: string, quantidade: number, valor: number) {
    await setup.query(
      `INSERT INTO itens_edital (tenant_id, edital_id, numero, descricao, unidade, quantidade,
                                 valor_unitario_estimado, catmat_catser)
       VALUES ($1, $2, '1', $3, 'UN', $4, $5, $6)`,
      [platformTenant, ids[key], `Item ${term}`, quantidade, valor, catmat],
    );
  }

  const ranking = async (query: string, headers = ADMIN()) => {
    const res = await app.inject({ method: 'GET', url: `/analise/ranking?${query}`, headers });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { itens: Linha[]; total_candidatos: number };
    return { ...body, meus: body.itens.filter((item) => item.titulo.includes(suffix)) };
  };

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
      [tenantB, 'Empresa B'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `an-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    await insertUser(adminA, tenantA, 'admin', 'Admin Analise A');
    await insertUser(alunoA, tenantA, 'aluno', 'Aluno Analise A');
    await insertUser(adminB, tenantB, 'admin', 'Admin Analise B');

    const now = Date.now();
    // Histórico: o órgão fecha 20% abaixo do estimado (3 pregões), itens a R$ 8.
    for (const key of ['h1', 'h2', 'h3']) {
      await insertEdital(key, {
        uf: 'RN',
        orgao_cnpj: cnpj,
        modalidade: 'Pregão Eletrônico',
        situacao: 'Homologada',
        valor_estimado: 100_000,
        valor_homologado: 80_000,
        data_publicacao: new Date(now - 60 * DAY),
        data_encerramento_proposta: new Date(now - 50 * DAY),
      });
      await insertItem(key, '111111', 100, 8);
    }
    // Candidato A: pequeno, do órgão com histórico, itens a R$ 10 (25% acima da mediana R$ 8).
    await insertEdital('a', {
      uf: 'RN',
      orgao_cnpj: cnpj,
      modalidade: 'Pregão Eletrônico',
      situacao: 'Divulgada',
      valor_estimado: 60_000,
      data_publicacao: new Date(now - DAY),
      data_encerramento_proposta: new Date(now + 6 * DAY),
    });
    await insertItem('a', '111111', 100, 10);
    // Candidato B: grande, outro órgão, sem histórico, prazo longo.
    await insertEdital('b', {
      uf: 'SP',
      orgao_cnpj: `${cnpj}-outro`,
      modalidade: 'Concorrência',
      situacao: 'Divulgada',
      valor_estimado: 400_000,
      data_publicacao: new Date(now - DAY),
      data_encerramento_proposta: new Date(now + 25 * DAY),
    });
    // Candidato C: dispensa pequena, encerra em 5 dias.
    await insertEdital('c', {
      uf: 'RN',
      orgao_cnpj: `${cnpj}-c`,
      modalidade: 'Dispensa',
      situacao: 'Divulgada',
      valor_estimado: 20_000,
      data_publicacao: new Date(now - DAY),
      data_encerramento_proposta: new Date(now + 5 * DAY),
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('lista só editais abertos, com nota explicável e lucro estimado', async () => {
    const { meus } = await ranking('limite=100');
    const titulos = meus.map((item) => item.titulo);
    expect(titulos.some((t) => t.includes(' a '))).toBe(true);
    expect(titulos.some((t) => / h1 /.test(t))).toBe(false); // encerrados ficam de fora
    for (const item of meus) {
      expect(item.analise.nota).toBeGreaterThanOrEqual(0);
      expect(item.analise.nota).toBeLessThanOrEqual(100);
      expect(item.analise.componentes).toHaveLength(5);
    }
  });

  it('usa o histórico do órgão para o desconto típico e o lucro', async () => {
    const { meus } = await ranking('limite=100&margem_pct=10');
    const a = meus.find((item) => item.titulo.includes(' a '))!;
    expect(a.analise.desconto_base).toBe('historico_do_orgao');
    expect(a.analise.desconto_tipico_pct).toBe(20);
    // 60.000 × 0,80 = 48.000 de valor provável; 10% de margem = 4.800
    expect(a.analise.lucro_estimado).toBe(4_800);
    const b = meus.find((item) => item.titulo.includes(' b '))!;
    expect(b.analise.desconto_base).toBe('premissa');
  });

  it('a folga de preço considera o estimado frente à mediana do catálogo', async () => {
    const { meus } = await ranking('limite=100');
    const a = meus.find((item) => item.titulo.includes(' a '))!;
    const c = meus.find((item) => item.titulo.includes(' c '))!;
    const margem = (item: Linha) =>
      item.analise.componentes.find((x) => x.chave === 'margem')!.pontos;
    // A: órgão fecha 20% abaixo (100 − 50 = 50) + estimado 25% acima da mediana (+15) = 65
    expect(margem(a)).toBe(65);
    // C: sem histórico e sem itens: neutro
    expect(margem(c)).toBe(50);
  });

  it('a ordem muda com o foco: lucrativas pelo maior lucro, fáceis pela facilidade', async () => {
    const lucrativas = (await ranking('limite=100&foco=lucrativas')).meus;
    const lucros = lucrativas.map((item) => item.analise.lucro_estimado ?? -1);
    expect(lucros).toEqual([...lucros].sort((x, y) => y - x));
    expect(lucrativas[0]!.titulo).toContain(' b '); // 400 mil × 0,9 × 15%

    const faceis = (await ranking('limite=100&foco=faceis')).meus;
    const fac = faceis.map(
      (item) => item.analise.componentes.find((x) => x.chave === 'facilidade')!.pontos,
    );
    expect(fac).toEqual([...fac].sort((x, y) => y - x));
    expect(faceis[0]!.titulo).toContain(' c '); // dispensa pequena
  });

  it('os filtros do Radar valem no ranking (estado e valor)', async () => {
    const sp = (await ranking('limite=100&uf=SP')).meus;
    expect(sp.map((item) => item.titulo.includes(' b '))).toEqual([true]);
    const pequenos = (await ranking('limite=100&valor_max=30000')).meus;
    expect(pequenos.every((item) => item.titulo.includes(' c '))).toBe(true);
  });

  it('o perfil do Radar vale sozinho no ranking e pode ser desligado', async () => {
    const outro = randomUUID();
    await insertUser(outro, tenantA, 'admin', 'Admin Perfil');
    const headers = as(outro, tenantA, 'admin');
    const salvo = await app.inject({
      method: 'PUT',
      url: '/radar/perfil',
      headers,
      payload: {
        ufs: ['SP'],
        palavras_interesse: [],
        valor_min: null,
        valor_max: null,
        modalidades: [],
      },
    });
    expect(salvo.statusCode, salvo.body).toBe(200);

    const comPerfil = await app.inject({
      method: 'GET',
      url: '/analise/ranking?limite=100',
      headers,
    });
    const corpo = comPerfil.json() as {
      itens: Linha[];
      perfil_aplicado: { usado: boolean; ufs: string[] };
      nichos: string[];
    };
    const meus = corpo.itens.filter((item) => item.titulo.includes(suffix));
    expect(corpo.perfil_aplicado).toMatchObject({ usado: true, ufs: ['SP'] });
    expect(corpo.nichos.length).toBeGreaterThan(0);
    expect(meus.map((item) => item.titulo.includes(' b '))).toEqual([true]);

    const semPerfil = await app.inject({
      method: 'GET',
      url: '/analise/ranking?limite=100&usar_perfil=false',
      headers,
    });
    const aberto = semPerfil.json() as { itens: Linha[]; perfil_aplicado: { usado: boolean } };
    expect(aberto.perfil_aplicado.usado).toBe(false);
    expect(aberto.itens.filter((item) => item.titulo.includes(suffix)).length).toBeGreaterThan(1);

    // O filtro escolhido à mão vale mais que o perfil.
    const mao = await app.inject({
      method: 'GET',
      url: '/analise/ranking?limite=100&valor_max=30000',
      headers,
    });
    const manual = mao.json() as { perfil_aplicado: { ufs: string[]; valor_max: number | null } };
    expect(manual.perfil_aplicado.valor_max).toBeNull();
  });

  it('compara de 2 a 4 editais e respeita os limites', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: `/analise/comparar?ids=${ids.a},${ids.b}&margem_pct=10`,
      headers: ADMIN(),
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const body = ok.json() as {
      editais: {
        id: string;
        historico_orgao: { amostras: number } | null;
        preco_vs_mediana: { razao: number | null } | null;
        itens_amostra: unknown[];
      }[];
    };
    expect(body.editais.map((e) => e.id)).toEqual([ids.a, ids.b]);
    expect(body.editais[0]!.historico_orgao?.amostras).toBe(3);
    expect(body.editais[0]!.preco_vs_mediana?.razao).toBe(1.25);
    expect(body.editais[0]!.itens_amostra).toHaveLength(1);

    const one = await app.inject({
      method: 'GET',
      url: `/analise/comparar?ids=${ids.a}`,
      headers: ADMIN(),
    });
    expect(one.statusCode).toBeGreaterThanOrEqual(400);
    const five = await app.inject({
      method: 'GET',
      url: `/analise/comparar?ids=${[ids.a, ids.b, ids.c, ids.h1, ids.h2].join(',')}`,
      headers: ADMIN(),
    });
    expect(five.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('só quem opera licitações usa a análise', async () => {
    const student = await app.inject({
      method: 'GET',
      url: '/analise/ranking',
      headers: as(alunoA, tenantA, 'aluno'),
    });
    expect(student.statusCode).toBe(403);
    const anon = await app.inject({ method: 'GET', url: '/analise/ranking' });
    expect(anon.statusCode).toBe(401);
    const sim = await app.inject({
      method: 'POST',
      url: '/analise/simular',
      headers: as(alunoA, tenantA, 'aluno'),
      payload: { quantidade: 1, custo_unitario: 1 },
    });
    expect(sim.statusCode).toBe(403);
  });

  it('o simulador devolve a mesma conta da tela e recusa números inválidos', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/analise/simular',
      headers: ADMIN(),
      payload: {
        quantidade: 100,
        custo_unitario: 50,
        frete_total: 500,
        outros_custos_total: 500,
        impostos_pct: 6,
        comissao_pct: 4,
        margem_minima_pct: 10,
        preco_referencia: 100,
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const json = res.json() as {
      custo_total: number;
      preco_minimo: number;
      desconto_maximo_pct: number;
    };
    expect(json.custo_total).toBe(6_000);
    expect(json.preco_minimo).toBe(75);
    expect(json.desconto_maximo_pct).toBe(25);

    const comTaxa = await app.inject({
      method: 'POST',
      url: '/analise/simular',
      headers: ADMIN(),
      payload: {
        quantidade: 100,
        custo_unitario: 50,
        frete_total: 500,
        outros_custos_total: 500,
        impostos_pct: 6,
        comissao_pct: 4,
        margem_minima_pct: 10,
        preco_referencia: 100,
        taxa_plataforma_fixa: 129,
      },
    });
    expect((comTaxa.json() as { custo_total: number }).custo_total).toBe(6_129);

    const bad = await app.inject({
      method: 'POST',
      url: '/analise/simular',
      headers: ADMIN(),
      payload: { quantidade: -1, custo_unitario: 5 },
    });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
  });
});
