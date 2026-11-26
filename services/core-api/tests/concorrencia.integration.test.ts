import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  agruparFornecedores,
  lerContratosDoPncp,
  normalizarContratoPublico,
  resumirFornecedor,
  urlDaBuscaDeContratos,
} from '../src/concorrencia.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

const item = (ni: string, nome: string, valor: number, uf: string, dias: number, seq: number) => ({
  item_url: `/contratos/00394460005887/2026/${seq}`,
  description: 'Aquisição de papel A4',
  numero_controle_pncp: `00394460005887-2-${String(seq).padStart(6, '0')}/2026`,
  orgao_nome: 'Prefeitura de Teste',
  uf,
  municipio_nome: 'Boa Vista',
  fornecedor_ni: ni,
  fornecedor_nome: nome,
  valor_global: valor,
  data_assinatura: new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10),
  data_publicacao_pncp: new Date(Date.now() - dias * 86_400_000).toISOString(),
});

describe('contratos públicos do PNCP: leitura', () => {
  it('normaliza o contrato e monta o link público', () => {
    const contrato = normalizarContratoPublico(
      item('11222333000181', 'Papelaria LTDA', 1500, 'RR', 1, 45),
    );
    expect(contrato).toMatchObject({
      cnpj: '11222333000181',
      fornecedor: 'Papelaria LTDA',
      valor: 1500,
      uf: 'RR',
      link: 'https://pncp.gov.br/app/contratos/00394460005887/2026/45',
    });
    expect(normalizarContratoPublico({ valor_global: 10 })).toBeNull();
    expect(normalizarContratoPublico('x')).toBeNull();
  });

  it('monta a URL da busca com o CNPJ e o estado sem misturar parâmetros', () => {
    const url = urlDaBuscaDeContratos(
      { pncpBaseUrl: 'https://pncp.gov.br/api/consulta' },
      { q: 'papel a4 & caneta', uf: 'RR', pagina: 2 },
    );
    expect(url.startsWith('https://pncp.gov.br/api/search/?')).toBe(true);
    expect(url).toContain('tipos_documento=contrato');
    expect(url).toContain('pagina=2');
    expect(url).toContain('ufs=RR');
    expect(url).toContain('q=papel+a4+%26+caneta');
  });

  it('resume um fornecedor e agrupa fornecedores de um assunto', () => {
    const contratos = [
      item('11222333000181', 'A', 1000, 'RR', 1, 1),
      item('11222333000181', 'A', 3000, 'AM', 400, 2),
      item('55666777000199', 'B', 500, 'RR', 2, 3),
    ].map((linha) => normalizarContratoPublico(linha)!);
    const resumo = resumirFornecedor(contratos.slice(0, 2));
    expect(resumo.contratos).toBe(2);
    expect(resumo.valor_total).toBe(4000);
    expect(resumo.maior_contrato).toBe(3000);
    expect(resumo.por_uf.map((linha) => linha.uf).sort()).toEqual(['AM', 'RR']);
    const grupos = agruparFornecedores(contratos);
    expect(grupos[0]).toMatchObject({ cnpj: '11222333000181', contratos: 2, valor_total: 4000 });
    expect(grupos[1]).toMatchObject({ cnpj: '55666777000199', contratos: 1 });
  });

  it('com CNPJ, descarta contratos de outros fornecedores; falha na 1ª página vira erro claro', async () => {
    const corpo = {
      total: 2,
      items: [
        item('11222333000181', 'A', 1000, 'RR', 1, 1),
        item('99000111000122', 'Outro', 9, 'RR', 1, 2),
      ],
    };
    const ok = (async () =>
      new Response(JSON.stringify(corpo), { status: 200 })) as unknown as typeof fetch;
    const lido = await lerContratosDoPncp(
      { pncpBaseUrl: 'https://x/api/consulta' },
      { q: '11222333000181', paginas: 3, cnpj: '11222333000181' },
      ok,
    );
    expect(lido.contratos).toHaveLength(1);
    expect(lido.parcial).toBe(false);
    const falha = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    await expect(
      lerContratosDoPncp({ pncpBaseUrl: 'https://x/api/consulta' }, { q: 'a', paginas: 1 }, falha),
    ).rejects.toMatchObject({ code: 'fonte_indisponivel' });
  });
});

suite('concorrência e acompanhamento (PostgreSQL real, PNCP simulado)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  let server!: Server;
  let fora = false;
  const platformTenant = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const cnpj = '11222333000181';

  beforeAll(async () => {
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '', 'http://x');
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (!url.pathname.startsWith('/api/search')) return send(404, {});
      if (fora) return send(500, {});
      const q = url.searchParams.get('q') ?? '';
      if (q === cnpj) {
        return send(200, {
          total: 2,
          items: [
            item(cnpj, 'Papelaria Vencedora LTDA', 2000, 'RR', 0, 11),
            item(cnpj, 'Papelaria Vencedora LTDA', 1000, 'AM', 30, 12),
          ],
        });
      }
      return send(200, {
        total: 3,
        items: [
          item(cnpj, 'Papelaria Vencedora LTDA', 2000, 'RR', 1, 21),
          item('55666777000199', 'Distribuidora Norte SA', 500, 'RR', 2, 22),
          item(cnpj, 'Papelaria Vencedora LTDA', 700, 'RR', 3, 23),
        ],
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    // O cache das fontes agora fica no banco: cada execução parte do zero.
    await setup.query('DELETE FROM cache_fontes');
    app = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      config: loadConfig({
        NODE_ENV: 'test',
        PNCP_BASE_URL: `${base}/api/consulta`,
        PNCP_API_BASE_URL: base,
        COMPRAS_GOV_BASE_URL: base,
      }),
    });
    await app.ready();
    for (const [id, nome] of [
      [platformTenant, 'Plataforma Concorrência'],
      [tenantA, 'Empresa A Concorrência'],
      [tenantB, 'Empresa B Concorrência'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `c-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    for (const [id, tenant, nome] of [
      [userA, tenantA, 'A'],
      [userB, tenantB, 'B'],
    ] as const) {
      await setup.query(
        `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em, onboarding_concluido)
         VALUES ($1, $2, $3, $4, 'admin', $5, now(), true)`,
        [
          id,
          tenant,
          `conc.${nome}.${suffix}@example.test`,
          `Cliente ${nome}`,
          hashPassword('Senha-Forte-2026!'),
        ],
      );
    }
  });

  afterAll(async () => {
    await setup.query('DELETE FROM fornecedores_acompanhados WHERE tenant_id = ANY($1)', [
      [tenantA, tenantB],
    ]);
    await app.close();
    await pool.end();
    await setup.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const headers = (sub: string, tenantId: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, tenantId, role: 'admin' })}`,
  });
  const comoA = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: headers(userA, tenantA),
      ...(payload ? { payload: payload as object } : {}),
    });
  const comoB = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: headers(userB, tenantB),
      ...(payload ? { payload: payload as object } : {}),
    });

  it('exige login', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/concorrencia/fornecedor?cnpj=${cnpj}` }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/fornecedores-acompanhados' })).statusCode,
    ).toBe(401);
  });

  it('consulta por CNPJ: resumo, contratos e fonte', async () => {
    const resposta = await comoA('GET', `/concorrencia/fornecedor?cnpj=11.222.333/0001-81`);
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.nome).toBe('Papelaria Vencedora LTDA');
    expect(corpo.resumo).toMatchObject({ contratos: 2, valor_total: 3000, maior_contrato: 2000 });
    expect(corpo.contratos[0].link).toContain('https://pncp.gov.br/app/contratos/');
    expect(corpo.dados.consultado_em).toBeTruthy();
    expect(
      (await comoA('GET', '/concorrencia/fornecedor?cnpj=123')).statusCode,
    ).toBeGreaterThanOrEqual(400);
  });

  it('consulta por assunto: agrupa quem mais aparece', async () => {
    const resposta = await comoA('GET', '/concorrencia/mercado?q=papel%20a4&uf=rr');
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.fornecedores[0]).toMatchObject({ cnpj, contratos: 2, valor_total: 2700 });
    expect(corpo.fornecedores[1]).toMatchObject({ cnpj: '55666777000199', contratos: 1 });
    expect((await comoA('GET', '/concorrencia/mercado?q=ab')).statusCode).toBeGreaterThanOrEqual(
      400,
    );
  });

  it('acompanhar: cria, não repete, mostra contrato novo e cada empresa vê só a sua lista', async () => {
    const criado = await comoA('POST', '/fornecedores-acompanhados', {
      cnpj,
      nome: 'Papelaria Vencedora LTDA',
    });
    expect(criado.statusCode).toBe(201);
    expect((await comoA('POST', '/fornecedores-acompanhados', { cnpj })).statusCode).toBe(409);
    expect(
      (await comoA('POST', '/fornecedores-acompanhados', { cnpj: '123' })).statusCode,
    ).toBeGreaterThanOrEqual(400);

    const lista = (await comoA('GET', '/fornecedores-acompanhados')).json();
    expect(lista.data).toHaveLength(1);
    expect(lista.data[0].disponivel).toBe(true);
    expect(lista.data[0].ultimo_contrato.link).toContain('pncp.gov.br');
    expect((await comoB('GET', '/fornecedores-acompanhados')).json().data).toHaveLength(0);

    // passou a ser visto: nada novo depois de agora
    const id = lista.data[0].id;
    expect((await comoB('POST', `/fornecedores-acompanhados/${id}/visto`)).statusCode).toBe(404);
    expect((await comoA('POST', `/fornecedores-acompanhados/${id}/visto`)).statusCode).toBe(204);
    expect((await comoA('GET', '/fornecedores-acompanhados')).json().data[0].contratos_novos).toBe(
      0,
    );

    expect((await comoB('DELETE', `/fornecedores-acompanhados/${id}`)).statusCode).toBe(404);
    expect((await comoA('DELETE', `/fornecedores-acompanhados/${id}`)).statusCode).toBe(204);
    expect((await comoA('GET', '/fornecedores-acompanhados')).json().data).toHaveLength(0);
  });

  it('fonte fora do ar: a lista continua e marca o fornecedor como indisponível', async () => {
    expect(
      (await comoA('POST', '/fornecedores-acompanhados', { cnpj: '55666777000199' })).statusCode,
    ).toBe(201);
    fora = true;
    const consulta = await comoA('GET', '/concorrencia/mercado?q=cimento%20fora');
    expect(consulta.statusCode).toBe(502);
    expect(consulta.json().message).toContain('PNCP');
    const lista = (await comoA('GET', '/fornecedores-acompanhados')).json();
    expect(lista.data).toHaveLength(1);
    fora = false;
  });

  it('fonte de dados e consultas ativas respondem', async () => {
    const fontes = await comoA('GET', '/fontes-de-dados');
    expect(fontes.statusCode).toBe(200);
    expect(fontes.json().fontes.length).toBeGreaterThanOrEqual(3);
    const ativas = await comoA('GET', '/consultas-ativas');
    expect(ativas.statusCode).toBe(200);
    expect(Array.isArray(ativas.json().data)).toBe(true);
  });
});
