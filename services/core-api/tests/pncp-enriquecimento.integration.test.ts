import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import {
  camposDoItem,
  enriquecerEditais,
  urlDaBuscaDeEditais,
} from '../src/pncp-enriquecimento.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

describe('campos extras do PNCP: leitura', () => {
  it('lê os seis campos e junta o normativo base quando vem em lista', () => {
    expect(
      camposDoItem({
        numero_controle_pncp: '00394460005887-1-000082/2026',
        fonte_orcamentaria_nome: 'Recursos próprios',
        possui_emenda_parlamentar: true,
        normativo_base_nome: ['Lei 14.133/2021', 'Decreto 10.947'],
        criterio_julgamento_nome: 'Menor preço',
        indicador_orcamento_sigiloso: 'N',
        possui_nfe: false,
      }),
    ).toEqual({
      id_externo: '00394460005887-1-000082/2026',
      fonte_orcamentaria: 'Recursos próprios',
      emenda_parlamentar: true,
      normativo_base: 'Lei 14.133/2021, Decreto 10.947',
      criterio_julgamento: 'Menor preço',
      orcamento_sigiloso: false,
      possui_nfe: false,
    });
  });

  it('campo ausente fica nulo e item sem número do PNCP é descartado', () => {
    expect(camposDoItem({ numero_contratacao: '00394460005887-1-000082/2026' })).toMatchObject({
      id_externo: '00394460005887-1-000082/2026',
      fonte_orcamentaria: null,
      emenda_parlamentar: null,
      orcamento_sigiloso: null,
    });
    expect(camposDoItem({ fonte_orcamentaria_nome: 'X' })).toBeNull();
    expect(camposDoItem({ numero_controle_pncp: 'lixo' })).toBeNull();
    expect(camposDoItem(null)).toBeNull();
  });

  it('monta a URL da busca de editais', () => {
    const url = urlDaBuscaDeEditais(
      { pncpBaseUrl: 'https://pncp.gov.br/api/consulta' },
      { pagina: 2, status: 'recebendo_proposta' },
    );
    expect(url).toContain('https://pncp.gov.br/api/search/?');
    expect(url).toContain('tipos_documento=edital');
    expect(url).toContain('status=recebendo_proposta');
    expect(url).toContain('pagina=2');
  });
});

suite('enriquecimento dos editais (PostgreSQL real, fonte simulada)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const platformTenant = randomUUID();
  const clientTenant = randomUUID();
  const clientUser = randomUUID();
  const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret' });
  const seq = Math.floor(Math.random() * 800000) + 100000;
  const idA = `00394460005887-1-${seq}/2026`;
  const idB = `00394460005887-1-${seq + 1}/2026`;
  const idFora = `00394460005887-1-${seq + 2}/2026`;
  const idSoPorNumero = `00394460005887-1-${seq + 3}/2026`;
  const idSumido = `00394460005887-1-${seq + 4}/2026`;
  const chamadas: string[] = [];

  const fonte = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    chamadas.push(url.search);
    if (!url.searchParams.get('status')) return new Response('status obrigatório', { status: 400 });
    const q = url.searchParams.get('q');
    if (q) {
      const itens =
        q === idSoPorNumero
          ? [
              {
                numero_controle_pncp: idSoPorNumero,
                fonte_orcamentaria_nome: 'Federal',
                possui_emenda_parlamentar: false,
                normativo_base_nome: ['Lei 14.133/2021'],
                criterio_julgamento_nome: [null],
                indicador_orcamento_sigiloso: false,
                possui_nfe: null,
              },
            ]
          : [];
      return Response.json({ items: itens, total: itens.length });
    }
    const recebendo = url.searchParams.get('status') === 'recebendo_proposta';
    const items = recebendo
      ? [
          {
            numero_controle_pncp: idA,
            fonte_orcamentaria_nome: 'Recursos próprios',
            possui_emenda_parlamentar: false,
            normativo_base_nome: ['Lei 14.133/2021'],
            criterio_julgamento_nome: 'Menor preço',
            indicador_orcamento_sigiloso: false,
            possui_nfe: false,
          },
          {
            numero_controle_pncp: idB,
            fonte_orcamentaria_nome: 'Transferência federal',
            possui_emenda_parlamentar: true,
            normativo_base_nome: ['Lei 14.133/2021'],
            criterio_julgamento_nome: 'Maior desconto',
            indicador_orcamento_sigiloso: true,
            possui_nfe: true,
          },
        ]
      : [{ numero_controle_pncp: idFora, fonte_orcamentaria_nome: 'Outra' }];
    return Response.json({ items, total: items.length });
  }) as typeof fetch;

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({ jwtSecret: 'test-secret', logger: false, pool, config });
    await app.ready();
    for (const [id, nome] of [
      [platformTenant, 'Plataforma Enriquecimento'],
      [clientTenant, 'Cliente Enriquecimento'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `e-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em,
                             nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, 'Dona Enriquecimento', 'admin', $4, now(), '["limpeza-conservacao"]'::jsonb, true)`,
      [clientUser, clientTenant, `enriq.${suffix}@example.test`, hashPassword('Senha-Forte-2026!')],
    );
    for (const [id, n] of [
      [idA, 'A'],
      [idB, 'B'],
      [idSoPorNumero, 'C'],
      [idSumido, 'D'],
    ] as const) {
      await setup.query(
        `INSERT INTO editais (tenant_id, fonte, id_externo, titulo, orgao, uf, hash_conteudo, conteudo_texto, data_encerramento_proposta)
         VALUES ($1, 'pncp', $2, $3, 'Prefeitura de Teste', 'RR', $4, 'texto', now() + interval '5 days')`,
        [
          platformTenant,
          id,
          `Serviços de limpeza e conservação predial ${n} ${suffix}`,
          `h-${n}-${suffix}`,
        ],
      );
    }
  });

  afterAll(async () => {
    await setup.query('DELETE FROM editais WHERE tenant_id = $1', [platformTenant]);
    await app.close();
    await pool.end();
    await setup.end();
  });

  const token = () => app.jwt.sign({ sub: clientUser, tenantId: clientTenant, role: 'admin' });
  const buscar = (query: string) =>
    app.inject({
      method: 'GET',
      url: `/editais?${query}`,
      headers: { authorization: `Bearer ${token()}` },
    });

  it('grava os campos só nos editais que já existem e marca a data', async () => {
    const r = await enriquecerEditais(
      { pool, config, fetchImpl: fonte, sleep: async () => undefined, tenantId: platformTenant },
      { paginas: 2 },
    );
    expect(r).toMatchObject({ skipped: false, erros: 0, gravados: 4 });
    expect(chamadas[0]).toContain('status=recebendo_proposta');
    expect(chamadas.every((c) => /status=[a-z_]+/.test(c))).toBe(true);
    const linhas = await setup.query(
      `SELECT id_externo, fonte_orcamentaria, emenda_parlamentar, normativo_base,
              criterio_julgamento, orcamento_sigiloso, possui_nfe, enriquecido_em
         FROM editais WHERE tenant_id = $1 ORDER BY id_externo`,
      [platformTenant],
    );
    expect(linhas.rows).toHaveLength(4);
    const c = linhas.rows.find((l) => l.id_externo === idSoPorNumero);
    expect(c).toMatchObject({ fonte_orcamentaria: 'Federal', criterio_julgamento: null });
    expect(c.enriquecido_em).toBeTruthy();
    const d = linhas.rows.find((l) => l.id_externo === idSumido);
    expect(d.fonte_orcamentaria).toBeNull();
    expect(d.enriquecido_em).toBeTruthy();
    const b = linhas.rows.find((l) => l.id_externo === idB);
    expect(b).toMatchObject({
      fonte_orcamentaria: 'Transferência federal',
      emenda_parlamentar: true,
      criterio_julgamento: 'Maior desconto',
      orcamento_sigiloso: true,
      possui_nfe: true,
    });
    expect(b.enriquecido_em).toBeTruthy();
  });

  it('a busca filtra pelos seis campos e a lista de opções traz os valores reais', async () => {
    const porEmenda = (await buscar('emenda=true&status=todos&page_size=50')).json();
    const ids = porEmenda.data.map((e: { id_externo: string }) => e.id_externo);
    expect(ids).toContain(idB);
    expect(ids).not.toContain(idA);
    const semSigilo = (await buscar('sigiloso=false&status=todos&page_size=50')).json();
    expect(semSigilo.data.map((e: { id_externo: string }) => e.id_externo)).toContain(idA);
    const porFonte = (
      await buscar('fonte_orcamentaria=Recursos%20pr%C3%B3prios&status=todos&page_size=50')
    ).json();
    expect(porFonte.data.map((e: { id_externo: string }) => e.id_externo)).toEqual([idA]);
    const porCriterio = (
      await buscar('criterio_julgamento=Menor%20pre%C3%A7o&status=todos')
    ).json();
    expect(porCriterio.data.map((e: { id_externo: string }) => e.id_externo)).toContain(idA);
    const nfe = (await buscar('nfe=true&status=todos')).json();
    expect(nfe.data.map((e: { id_externo: string }) => e.id_externo)).toEqual([idB]);

    const opcoes = await app.inject({
      method: 'GET',
      url: '/catalog/filters',
      headers: { authorization: `Bearer ${token()}` },
    });
    expect(opcoes.json().criterio_julgamento).toContain('Maior desconto');
    expect(opcoes.json().fonte_orcamentaria).toContain('Recursos próprios');
  });

  it('fonte fora do ar não derruba a rodada e não apaga o que já foi gravado', async () => {
    const fora = (async () => new Response('erro', { status: 500 })) as unknown as typeof fetch;
    const r = await enriquecerEditais(
      { pool, config, fetchImpl: fora, sleep: async () => undefined, tenantId: platformTenant },
      { paginas: 1 },
    );
    expect(r.gravados).toBe(0);
    expect(r.erros).toBeGreaterThan(0);
    const { rows } = await setup.query(
      'SELECT count(*)::int AS n FROM editais WHERE tenant_id = $1 AND enriquecido_em IS NOT NULL',
      [platformTenant],
    );
    expect(rows[0].n).toBe(4);
  });
});
