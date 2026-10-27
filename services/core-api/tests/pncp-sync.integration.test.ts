import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { normalizePncp, pncpDate, runPncpSync } from '../src/pncp-sync.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

const sample = (id: string, extra: Record<string, unknown> = {}) => ({
  numeroControlePNCP: id,
  objetoCompra: `Serviços de limpeza e conservação predial ${id}`,
  informacaoComplementar: 'Entrega parcelada',
  modalidadeId: 6,
  modalidadeNome: 'Pregão - Eletrônico',
  modoDisputaId: 1,
  modoDisputaNome: 'Aberto',
  situacaoCompraNome: 'Divulgada no PNCP',
  valorTotalEstimado: 987654.32,
  valorTotalHomologado: null,
  dataPublicacaoPncp: '2026-10-26T10:30:00',
  dataAberturaProposta: '2026-10-27T08:00:00',
  dataEncerramentoProposta: '2026-11-05T09:00:00',
  dataAtualizacao: '2026-10-26T10:30:00',
  srp: true,
  numeroCompra: '90001/2026',
  processo: '123/2026',
  linkSistemaOrigem: 'https://compras.example.gov.br/edital/1',
  amparoLegal: { codigo: 1, nome: 'Lei 14.133/2021, Art. 28, I' },
  orgaoEntidade: {
    cnpj: '00.394.460/0001-41',
    razaoSocial: 'Prefeitura Exemplo',
    esferaId: 'M',
    poderId: 'E',
  },
  unidadeOrgao: {
    ufSigla: 'RR',
    municipioNome: 'Brasília',
    codigoUnidade: '160001',
    nomeUnidade: 'Secretaria de Teste',
    codigoIbge: '5300108',
  },
  ...extra,
});

describe('normalizePncp', () => {
  it('mapeia os campos documentados e deixa nulo o que a fonte não informou', () => {
    const item = normalizePncp(sample('X-1'))!;
    expect(item).toMatchObject({
      id_externo: 'X-1',
      orgao: 'Prefeitura Exemplo',
      uf: 'RR',
      uasg: '160001',
      modalidade: 'Pregão - Eletrônico',
      codigo_modalidade: 6,
      valor_estimado: '987654.32',
      esfera: 'Municipal',
      poder: 'Executivo',
      municipio_ibge: '5300108',
      srp: true,
      orgao_cnpj: '00394460000141',
      amparo_legal: 'Lei 14.133/2021, Art. 28, I',
    });
    // sem fuso na fonte: horário de Brasília (UTC-3)
    expect(item.data_publicacao).toBe('2026-10-26T13:30:00.000Z');
    expect(item.valor_homologado).toBeNull();
    expect(item.hash_conteudo).toMatch(/^[0-9a-f]{64}$/);
    const minimal = normalizePncp({ numeroControlePNCP: 'Y', objetoCompra: 'Objeto' })!;
    expect(minimal.uf).toBeNull();
    expect(minimal.srp).toBeNull();
    expect(minimal.data_publicacao).toBeNull();
  });

  it('descarta registro sem identificador ou sem objeto', () => {
    expect(normalizePncp({ objetoCompra: 'sem id' })).toBeNull();
    expect(normalizePncp({ numeroControlePNCP: 'sem objeto' })).toBeNull();
    expect(normalizePncp('texto')).toBeNull();
  });

  it('formata a data da janela no fuso de Brasília', () => {
    // 01:00 UTC ainda é o dia anterior em Brasília
    expect(pncpDate(new Date('2026-10-27T01:00:00Z'))).toBe('20261026');
  });
});

suite('coleta do PNCP (PostgreSQL real, fonte simulada)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const platformTenant = randomUUID();
  const clientTenant = randomUUID();
  const platformUser = randomUUID();
  const clientUser = randomUUID();
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret',
    PNCP_SYNC_MODALIDADES: '6',
  });
  const ids = [`PNCP-${suffix}-1`, `PNCP-${suffix}-2`, `PNCP-${suffix}-3`];

  /** Fonte simulada: `publicacao` com 2 páginas para a modalidade 6; `atualizacao` vazia. */
  function fakeSource(state: {
    calls: string[];
    fail?: boolean;
    overrides?: Record<string, unknown>;
  }) {
    return (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      state.calls.push(url.pathname + url.search);
      if (state.fail) return new Response('erro', { status: 500 });
      const feed = url.pathname.endsWith('/publicacao');
      const page = Number(url.searchParams.get('pagina'));
      if (!feed)
        return Response.json({ data: [], totalPaginas: 0, paginasRestantes: 0, numeroPagina: 1 });
      const pages: Record<number, unknown[]> = {
        1: [sample(ids[0]!, state.overrides), sample(ids[1]!)],
        2: [sample(ids[2]!), { objetoCompra: 'registro sem id' }],
      };
      return Response.json({
        data: pages[page] ?? [],
        totalPaginas: 2,
        paginasRestantes: page >= 2 ? 0 : 1,
        numeroPagina: page,
      });
    }) as typeof fetch;
  }

  const deps = (state: Parameters<typeof fakeSource>[0]) => ({
    pool,
    config,
    tenantId: platformTenant,
    fetchImpl: fakeSource(state),
    sleep: async () => undefined,
    pauseMs: 0,
  });

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
    for (const [id, tenant, papel, nome] of [
      [platformUser, platformTenant, 'plataforma', 'Equipe Coleta'],
      [clientUser, clientTenant, 'admin', 'Dona Cliente'],
    ] as const) {
      await setup.query(
        `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em,
                               nicho_preferencias, onboarding_concluido)
         VALUES ($1, $2, $3, $4, $5, $6, now(), '["limpeza-conservacao"]'::jsonb, true)`,
        [
          id,
          tenant,
          `${nome.toLowerCase().replace(/\s+/g, '.')}.${suffix}@example.test`,
          nome,
          papel,
          hashPassword('Senha-Forte-2026!'),
        ],
      );
    }
  });

  afterAll(async () => {
    // O catálogo é compartilhado entre as suítes: não deixa edital de teste para trás.
    await setup.query('DELETE FROM editais WHERE tenant_id = $1', [platformTenant]);
    await setup.query('DELETE FROM coleta_pncp_execucoes');
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('grava as duas páginas, ignora registro sem id e não duplica na segunda rodada', async () => {
    const state = { calls: [] as string[] };
    const first = await runPncpSync(deps(state), { origem: 'manual', dias: 2 });
    expect(first).toMatchObject({
      status: 'ok',
      lidos: 4,
      inseridos: 3,
      atualizados: 0,
      ignorados: 1,
      erros: 0,
    });
    expect(state.calls.some((call) => call.includes('/atualizacao'))).toBe(true);
    expect(state.calls[0]).toContain('codigoModalidadeContratacao=6');
    expect(state.calls[0]).toContain('tamanhoPagina=50');

    const second = await runPncpSync(deps(state), { origem: 'agendada', dias: 2 });
    expect(second).toMatchObject({ status: 'ok', inseridos: 0, atualizados: 0 });
    const count = await setup.query(
      `SELECT count(*)::int AS total FROM editais WHERE tenant_id = $1 AND fonte = 'pncp' AND id_externo = ANY($2)`,
      [platformTenant, ids],
    );
    expect(count.rows[0].total).toBe(3);
  });

  it('atualiza só o que mudou na fonte e registra a rodada', async () => {
    const changed = await runPncpSync(
      deps({ calls: [], overrides: { situacaoCompraNome: 'Suspensa' } }),
      {
        origem: 'manual',
        dias: 1,
      },
    );
    expect(changed).toMatchObject({ status: 'ok', inseridos: 0, atualizados: 1 });
    const row = await setup.query(
      `SELECT situacao FROM editais WHERE tenant_id = $1 AND id_externo = $2`,
      [platformTenant, ids[0]],
    );
    expect(row.rows[0].situacao).toBe('Suspensa');
    const runs = await setup.query(
      `SELECT status, inseridos FROM coleta_pncp_execucoes WHERE status <> 'rodando' ORDER BY iniciado_em DESC LIMIT 1`,
    );
    expect(runs.rows[0].status).toBe('ok');
  });

  it('as empresas enxergam o catálogo coletado e não escrevem nele', async () => {
    const seen = await app.inject({
      method: 'GET',
      url: `/editais?q=limpeza&page_size=50`,
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: clientUser, tenantId: clientTenant, role: 'admin' })}`,
      },
    });
    expect(seen.statusCode).toBe(200);
    const external = (seen.json() as { data: Array<{ id_externo: string }> }).data.map(
      (item) => item.id_externo,
    );
    expect(external).toEqual(expect.arrayContaining(ids));

    await expect(
      pool.query(
        `INSERT INTO editais (tenant_id, fonte, id_externo, titulo, hash_conteudo) VALUES ($1, 'x', 'y', 'z', 'h')`,
        [clientTenant],
      ),
    ).rejects.toThrow(/permission denied/);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [clientTenant]);
      await expect(
        client.query(`SELECT * FROM coleta_gravar_editais('[]'::jsonb)`),
      ).rejects.toThrow(/apenas a conta da plataforma/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('falha da fonte não derruba: a rodada termina em erro e fica registrada', async () => {
    const result = await runPncpSync(deps({ calls: [], fail: true }), {
      origem: 'agendada',
      dias: 1,
    });
    expect(result.status).toBe('erro');
    expect(result.erros).toBeGreaterThan(0);
    expect(result.ultimo_erro).toContain('HTTP 500');
  });

  it('sem conta da plataforma avisa em vez de gravar', async () => {
    const result = await runPncpSync(
      { ...deps({ calls: [] }), tenantId: randomUUID() },
      { origem: 'manual' },
    );
    expect(result.status).toBe('sem_catalogo');
  });

  it('só a equipe da plataforma vê o estado e dispara a coleta', async () => {
    const asClient = {
      authorization: `Bearer ${app.jwt.sign({ sub: clientUser, tenantId: clientTenant, role: 'admin' })}`,
    };
    const asTeam = {
      authorization: `Bearer ${app.jwt.sign({ sub: platformUser, tenantId: platformTenant, role: 'plataforma' })}`,
    };
    expect(
      (await app.inject({ method: 'GET', url: '/admin/coleta/status', headers: asClient }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/admin/coleta/run',
          headers: asClient,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const status = await app.inject({
      method: 'GET',
      url: '/admin/coleta/status',
      headers: asTeam,
    });
    expect(status.statusCode).toBe(200);
    const body = status.json() as {
      ligada: boolean;
      modalidades: Array<{ codigo: number }>;
      catalogo: { total: number };
      execucoes: unknown[];
    };
    expect(body.ligada).toBe(true);
    expect(body.modalidades[0]!.codigo).toBe(6);
    expect(body.catalogo.total).toBeGreaterThanOrEqual(3);
    expect(body.execucoes.length).toBeGreaterThan(0);
  });
});
