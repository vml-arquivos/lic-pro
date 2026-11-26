import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  buscarContratosDoOrgao,
  HistoricoError,
  itensParaComparar,
  linkDoContrato,
  normalizeContrato,
  registroDePreco,
} from '../src/historico-mercado.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

describe('contratos do PNCP: leitura', () => {
  it('lê fornecedor, valor, órgão, UF e monta o link público', () => {
    const registro = normalizeContrato({
      niFornecedor: '11222333000181',
      nomeRazaoSocialFornecedor: 'Papelaria Vencedora LTDA',
      valorGlobal: 15000.5,
      dataAssinatura: '2026-09-10',
      objetoContrato: 'Aquisição de papel A4',
      numeroControlePNCP: '00394460000141-2-000045/2026',
      orgaoEntidade: { razaoSocial: 'Prefeitura de Teste' },
      unidadeOrgao: { ufSigla: 'RR' },
    });
    expect(registro).toMatchObject({
      fornecedor: 'Papelaria Vencedora LTDA',
      cnpj: '11222333000181',
      valor: 15000.5,
      orgao: 'Prefeitura de Teste',
      uf: 'RR',
      origem: 'pncp-contrato',
      link: 'https://pncp.gov.br/app/contratos/00394460000141/2026/45',
    });
    expect(normalizeContrato({ valorGlobal: 10 })).toBeNull();
    expect(normalizeContrato('x')).toBeNull();
    expect(linkDoContrato('lixo')).toBeNull();
  });

  it('preço do Compras.gov.br vira registro; nome que é só número vira CNPJ', () => {
    const base = {
      preco: 10,
      quantidade: 1,
      data: null,
      unidade: null,
      uasg: 'UASG 1',
      uf: 'DF',
      municipio: null,
      descricao: 'Papel',
    };
    expect(
      registroDePreco({ ...base, fornecedor: '11222333000181', cnpj_fornecedor: null }),
    ).toMatchObject({ fornecedor: null, cnpj: '11222333000181' });
    expect(registroDePreco({ ...base, fornecedor: 'ACME', cnpj_fornecedor: null })).toMatchObject({
      fornecedor: 'ACME',
      cnpj: null,
    });
    expect(registroDePreco({ ...base, fornecedor: null, cnpj_fornecedor: null })).toBeNull();
  });

  it('escolhe itens com CATMAT, maior valor total primeiro, sem repetir código', () => {
    const item = (numero: string, catmat: string | null, valor: number, quantidade: number) => ({
      numero,
      descricao: `Item ${numero}`,
      unidade: null,
      quantidade,
      valor_unitario_estimado: valor,
      catmat_catser: catmat,
    });
    expect(
      itensParaComparar(
        [
          item('1', '1111', 10, 1),
          item('2', null, 999, 99),
          item('3', '2222', 5, 100),
          item('4', '2222', 1, 1),
          item('5', 'abc', 1, 1),
        ],
        8,
      ).map((i) => i.numero),
    ).toEqual(['3', '1']);
  });

  it('janela recusada pelo PNCP: tenta janela menor; recusa geral vira erro claro', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      const meses = urls.length;
      return meses < 2
        ? new Response('{}', { status: 400 })
        : new Response(JSON.stringify({ data: [], totalPaginas: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const resposta = await buscarContratosDoOrgao(
      { pncpBaseUrl: 'https://pncp.test/api/consulta' },
      '00394460000141',
      { meses: 12, agora: new Date('2026-11-17T12:00:00Z') },
      fetchImpl,
    );
    expect(resposta.meses).toBe(6);
    expect(urls[0]).toContain('dataInicial=20251117&dataFinal=20261117&cnpjOrgao=00394460000141');
    const recusa = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    await expect(
      buscarContratosDoOrgao({ pncpBaseUrl: 'https://x' }, '1'.repeat(14), { meses: 12 }, recusa),
    ).rejects.toBeInstanceOf(HistoricoError);
  });
});

suite('histórico de preços e concorrentes (PostgreSQL real, fontes simuladas)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  let server!: Server;
  const calls: string[] = [];
  let contratosFora = false;
  let contratosLentosMs = 0;
  let resultadosFora = false;
  const platformTenant = randomUUID();
  const clientTenant = randomUUID();
  const clientUser = randomUUID();
  const editalAberto = randomUUID();
  const editalFechado = randomUUID();
  const editalManual = randomUUID();
  const extras: string[] = [];
  const suffix = randomUUID().slice(0, 8);
  const seqAberto = Math.floor(Math.random() * 900000) + 1;
  const seqFechado = seqAberto + 1;
  const idAberto = `00394460000141-1-${String(seqAberto).padStart(6, '0')}/2026`;
  const idFechado = `00394460000141-1-${String(seqFechado).padStart(6, '0')}/2026`;
  const diasAtras = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

  beforeAll(async () => {
    server = createServer((request, response) => {
      const url = request.url ?? '';
      calls.push(url);
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (url.includes('/modulo-pesquisa-preco/1_consultarMaterial')) {
        if (url.includes('codigo=999999')) return send(500, {});
        const linha = (preco: number, dias: number, nome: string, ni: string, uf: string) => ({
          precoUnitario: preco,
          quantidade: 100,
          dataCompra: diasAtras(dias),
          nomeFornecedor: nome,
          niFornecedor: ni,
          nomeUasg: 'UASG 1',
          estado: uf,
          descricaoItem: 'Papel A4 75g',
        });
        return send(200, {
          totalPaginas: 1,
          resultado: [
            linha(18, 10, 'Papelaria Vencedora LTDA', '11222333000181', 'RR'),
            linha(20, 20, 'Papelaria Vencedora LTDA', '11222333000181', 'RR'),
            linha(22, 30, 'Distribuidora Norte SA', '55666777000199', 'RR'),
            linha(24, 40, 'Distribuidora Norte SA', '55666777000199', 'AM'),
            linha(26, 50, 'Outra Comercial ME', '77888999000100', 'DF'),
          ],
        });
      }
      if (url.includes('/v1/contratos')) {
        if (contratosFora) return send(500, {});
        if (contratosLentosMs) {
          const atraso = contratosLentosMs;
          contratosLentosMs = 0;
          return void setTimeout(() => send(200, { totalPaginas: 1, data: [] }), atraso);
        }
        const contrato = (ni: string, nome: string, objeto: string, valor: number, n: number) => ({
          niFornecedor: ni,
          nomeRazaoSocialFornecedor: nome,
          valorGlobal: valor,
          dataAssinatura: diasAtras(n),
          objetoContrato: objeto,
          numeroControlePNCP: `00394460000141-2-${String(n).padStart(6, '0')}/2026`,
          orgaoEntidade: { razaoSocial: 'Prefeitura de Teste' },
          unidadeOrgao: { ufSigla: 'RR' },
        });
        return send(200, {
          totalPaginas: 1,
          data: [
            contrato(
              '11222333000181',
              'Papelaria Vencedora LTDA',
              'Aquisição de papel A4 resma',
              1000,
              1,
            ),
            contrato(
              '11222333000181',
              'Papelaria Vencedora LTDA',
              'Fornecimento de papel A4 75g',
              2000,
              2,
            ),
            contrato('99000111000122', 'Pneus Brasil SA', 'Aquisição de pneus aro 17', 50000, 3),
          ],
        });
      }
      if (resultadosFora && url.includes('/resultados')) return send(500, {});
      if (url.includes(`/compras/2026/${seqFechado}/itens/1/resultados`)) {
        return send(200, [
          {
            valorUnitarioHomologado: 19.5,
            niFornecedor: '55666777000199',
            nomeRazaoSocialFornecedor: 'Distribuidora Norte SA',
            dataResultado: diasAtras(2),
          },
        ]);
      }
      return send(404, {});
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
        PNCP_BASE_URL: `${base}`,
        PNCP_API_BASE_URL: base,
        COMPRAS_GOV_BASE_URL: base,
      }),
    });
    await app.ready();
    for (const [id, nome] of [
      [platformTenant, 'Plataforma Histórico'],
      [clientTenant, 'Empresa Histórico'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `h-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em, nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, 'Cliente Histórico', 'admin', $4, now(), '["limpeza-conservacao"]'::jsonb, true)`,
      [
        clientUser,
        clientTenant,
        `historico.${suffix}@example.test`,
        hashPassword('Senha-Forte-2026!'),
      ],
    );
    await setup.query(
      `INSERT INTO editais (id, tenant_id, fonte, id_externo, titulo, orgao, uf, hash_conteudo, conteudo_texto, data_encerramento_propostas)
       VALUES ($1, $2, 'pncp', $3, 'Aquisição de papel A4 para a Prefeitura', 'Prefeitura de Teste', 'RR', $4, 'texto', now() + interval '10 days'),
              ($5, $2, 'pncp', $6, 'Aquisição de papel A4 para a Prefeitura', 'Prefeitura de Teste', 'RR', $7, 'texto', now() - interval '5 days'),
              ($8, $9, 'manual', $10, 'Edital da própria empresa', 'Órgão X', 'RR', $11, 'texto', NULL)`,
      [
        editalAberto,
        platformTenant,
        idAberto,
        `ha-${suffix}`,
        editalFechado,
        idFechado,
        `hf-${suffix}`,
        editalManual,
        clientTenant,
        `manual-${suffix}`,
        `hm-${suffix}`,
      ],
    );
    for (const edital of [editalAberto, editalFechado]) {
      await setup.query(
        `INSERT INTO itens_edital (tenant_id, edital_id, numero, descricao, unidade, quantidade, valor_unitario_estimado, catmat_catser)
         VALUES ($1, $2, '1', 'Papel A4 75g', 'RESMA', 100, 30, '460789'),
                ($1, $2, '2', 'Caneta azul', 'UN', 500, 2, NULL),
                ($1, $2, '3', 'Item de serviço', 'UN', 1, 100, '999999')`,
        [platformTenant, edital],
      );
    }
  });

  afterAll(async () => {
    await setup.query('DELETE FROM editais WHERE id = ANY($1)', [
      [editalAberto, editalFechado, editalManual, ...extras],
    ]);
    await app.close();
    await pool.end();
    await setup.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const headers = () => ({
    authorization: `Bearer ${app.jwt.sign({ sub: clientUser, tenantId: clientTenant, role: 'admin' })}`,
  });
  const get = (url: string) => app.inject({ method: 'GET', url, headers: headers() });

  it('exige login e edital existente', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/editais/${editalAberto}/historico-precos` }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: `/editais/${editalAberto}/concorrentes` }))
        .statusCode,
    ).toBe(401);
    expect((await get(`/editais/${randomUUID()}/historico-precos`)).statusCode).toBe(404);
    expect((await get(`/editais/${randomUUID()}/concorrentes`)).statusCode).toBe(404);
  });

  it('compara o valor estimado com o que foi pago e explica o que não dá para comparar', async () => {
    const resposta = await get(`/editais/${editalAberto}/historico-precos`);
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    const papel = corpo.itens.find((item: { catmat: string }) => item.catmat === '460789');
    expect(papel.estatistica).toMatchObject({ amostras: 5, minimo: 18, maximo: 26, mediana: 22 });
    // estimado 30 > máximo pago 26
    expect(papel.comparacao.posicao).toBe('acima_do_maximo');
    expect(papel.comparacao.texto).toContain('acima do maior preço');
    // 3 compras no mesmo estado do edital (RR): 18, 20 e 22
    expect(papel.na_uf).toMatchObject({ amostras: 3, mediana: 20 });
  });

  it('item sem CATMAT fica de fora com motivo; item cuja fonte falha mostra o motivo', async () => {
    const corpo = (await get(`/editais/${editalAberto}/historico-precos`)).json();
    expect(corpo.nao_comparados[0].motivo).toContain('Sem código CATMAT');
    const servico = corpo.itens.find((item: { catmat: string }) => item.catmat === '999999');
    expect(servico.estatistica).toBeNull();
    expect(servico.motivo).toBeTruthy();
    expect(corpo.fonte.nome).toContain('Compras.gov.br');
    expect(corpo.fonte.consultado_em).toBeTruthy();
  });

  it('edital aberto: sem lista oficial; concorrentes vêm do histórico do órgão e dos itens', async () => {
    const resposta = await get(`/editais/${editalAberto}/concorrentes`);
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.neste_edital.disponivel).toBe(false);
    expect(corpo.neste_edital.motivo).toBeTruthy();
    // contratos: papel A4 é parecido com o edital; pneus não
    expect(corpo.contratos_analisados).toBe(3);
    expect(corpo.similares.map((c: { nome: string }) => c.nome)).toEqual([
      'Papelaria Vencedora LTDA',
    ]);
    expect(corpo.similares[0]).toMatchObject({ vitorias: 2, valor_contratos: 3000 });
    expect(corpo.similares[0].exemplos[0].link).toContain('https://pncp.gov.br/app/contratos/');
    expect(corpo.do_orgao.map((c: { nome: string }) => c.nome)).toEqual([
      'Papelaria Vencedora LTDA',
      'Pneus Brasil SA',
    ]);
    // itens: agrupados por CNPJ, mais vitórias primeiro
    expect(corpo.dos_itens[0]).toMatchObject({
      nome: 'Papelaria Vencedora LTDA',
      cnpj: '11222333000181',
      vitorias: 2,
    });
    expect(corpo.dos_itens).toHaveLength(3);
    expect(corpo.fontes).toHaveLength(3);
    expect(corpo.itens_consultados).toContain('460789');
  });

  it('edital encerrado: mostra os vencedores reais já publicados no PNCP', async () => {
    const corpo = (await get(`/editais/${editalFechado}/concorrentes`)).json();
    expect(corpo.neste_edital.disponivel).toBe(true);
    expect(corpo.neste_edital.vencedores[0]).toMatchObject({
      nome: 'Distribuidora Norte SA',
      cnpj: '55666777000199',
      origens: ['pncp-resultado'],
    });
  });

  it('edital que não é do PNCP: usa só o que há de real e avisa do resto', async () => {
    const corpo = (await get(`/editais/${editalManual}/concorrentes`)).json();
    expect(corpo.similares).toEqual([]);
    expect(corpo.do_orgao).toEqual([]);
    expect(corpo.avisos.join(' ')).toContain('só existem para editais do PNCP');
  });

  it('fonte fora do ar: responde com o que tem e o aviso; sem nada, erro claro', async () => {
    const novo = async (catmat: string): Promise<string> => {
      const id = randomUUID();
      await setup.query(
        `INSERT INTO editais (id, tenant_id, fonte, id_externo, titulo, orgao, uf, hash_conteudo, conteudo_texto)
         VALUES ($1, $2, 'pncp', $3, 'Aquisição de papel A4', 'Prefeitura de Teste', 'RR', $4, 'texto')`,
        [
          id,
          platformTenant,
          // Outro órgão: o histórico do órgão dos testes anteriores já está guardado.
          `11222333000181-1-${String(seqAberto + 50 + Math.floor(Math.random() * 1000)).padStart(6, '0')}/2026`,
          `hx-${id.slice(0, 8)}`,
        ],
      );
      await setup.query(
        `INSERT INTO itens_edital (tenant_id, edital_id, numero, descricao, quantidade, valor_unitario_estimado, catmat_catser)
         VALUES ($1, $2, '1', 'Papel A4', 10, 20, $3)`,
        [platformTenant, id, catmat],
      );
      extras.push(id);
      return id;
    };
    contratosFora = true;
    try {
      const parcial = await get(`/editais/${await novo('460789')}/concorrentes`);
      expect(parcial.statusCode).toBe(200);
      expect(parcial.json().do_orgao).toEqual([]);
      expect(parcial.json().dos_itens.length).toBeGreaterThan(0);
      expect(parcial.json().avisos.join(' ')).toContain('PNCP');

      const semNada = await novo('999999');
      const total = await get(`/editais/${semNada}/concorrentes`);
      expect(total.statusCode).toBe(502);
      expect(total.json().error).toBe('fonte_indisponivel');
      const precos = await get(`/editais/${semNada}/historico-precos`);
      expect(precos.statusCode).toBe(502);
    } finally {
      contratosFora = false;
    }
  });

  it('reabrir o edital não consulta de novo as fontes oficiais', async () => {
    await get(`/editais/${editalFechado}/concorrentes`);
    await get(`/editais/${editalFechado}/historico-precos`);
    const antes = calls.length;
    const [conc, precos] = [
      await get(`/editais/${editalFechado}/concorrentes`),
      await get(`/editais/${editalFechado}/historico-precos`),
    ];
    expect(conc.statusCode).toBe(200);
    expect(precos.statusCode).toBe(200);
    expect(calls.slice(antes)).toEqual([]);
    expect(conc.json().dados).toMatchObject({ origem: 'cache', desatualizado: false });
  });

  it('dois acessos ao mesmo tempo fazem uma consulta só ao PNCP', async () => {
    const id = randomUUID();
    const cnpj = '55443322000110';
    await setup.query(
      `INSERT INTO editais (id, tenant_id, fonte, id_externo, titulo, orgao, uf, hash_conteudo, conteudo_texto, data_encerramento_propostas)
       VALUES ($1, $2, 'pncp', $3, 'Aquisição de papel A4', 'Prefeitura Nova', 'RR', $4, 'texto', now() + interval '3 days')`,
      [id, platformTenant, `${cnpj}-1-000007/2026`, `hc-${id.slice(0, 8)}`],
    );
    extras.push(id);
    await setup.query(
      `INSERT INTO itens_edital (tenant_id, edital_id, numero, descricao, quantidade, valor_unitario_estimado, catmat_catser)
       VALUES ($1, $2, '1', 'Papel A4', 10, 20, NULL)`,
      [platformTenant, id],
    );
    const antes = calls.filter((url) => url.includes('/v1/contratos')).length;
    const [a, b, c] = await Promise.all([
      get(`/editais/${id}/concorrentes`),
      get(`/editais/${id}/concorrentes`),
      get(`/editais/${id}/concorrentes`),
    ]);
    expect([a.statusCode, b.statusCode, c.statusCode]).toEqual([200, 200, 200]);
    const depois = calls.filter((url) => url.includes('/v1/contratos')).length;
    expect(depois - antes).toBe(1);
  });

  it('edital sem resultado publicado é diferente de fonte com falha', async () => {
    const aberto = await get(`/editais/${editalAberto}/concorrentes`);
    expect(aberto.json().neste_edital).toMatchObject({
      estado: 'aguardando_publicacao',
      vencedores: [],
    });

    const id = randomUUID();
    await setup.query(
      `INSERT INTO editais (id, tenant_id, fonte, id_externo, titulo, orgao, uf, hash_conteudo, conteudo_texto, data_encerramento_propostas)
       VALUES ($1, $2, 'pncp', $3, 'Aquisição de papel A4', 'Prefeitura de Teste', 'RR', $4, 'texto', now() - interval '3 days')`,
      [
        id,
        platformTenant,
        `00394460000141-1-${String(seqFechado + 700).padStart(6, '0')}/2026`,
        `hr-${id.slice(0, 8)}`,
      ],
    );
    extras.push(id);
    await setup.query(
      `INSERT INTO itens_edital (tenant_id, edital_id, numero, descricao, quantidade, valor_unitario_estimado, catmat_catser)
       VALUES ($1, $2, '1', 'Papel A4', 10, 20, NULL)`,
      [platformTenant, id],
    );
    resultadosFora = true;
    try {
      const fora = await get(`/editais/${id}/concorrentes`);
      expect(fora.statusCode).toBe(200);
      expect(fora.json().neste_edital.estado).toBe('fonte_indisponivel');
      expect(fora.json().do_orgao.length).toBeGreaterThan(0);
    } finally {
      resultadosFora = false;
    }

    const fechado = await get(`/editais/${editalFechado}/concorrentes`);
    expect(fechado.json().neste_edital).toMatchObject({
      estado: 'parcial',
      cobertura: { consultados: 3, publicados: 1, falhas: 0 },
    });
    const valores = await get(`/editais/${editalFechado}/resultados`);
    expect(valores.statusCode).toBe(200);
    expect(valores.json()).toMatchObject({ estado: 'parcial', cobertura: { publicados: 1 } });
  });
  it('fonte lenta na primeira busca: responde "carregando" e a pergunta seguinte já encontra o dado', async () => {
    process.env.PRAZO_DA_TELA_MS = '150';
    try {
      const outroEdital = randomUUID();
      extras.push(outroEdital);
      const cnpjLento = '00394460009999';
      const idLento = `${cnpjLento}-1-000777/2026`;
      await setup.query(
        `INSERT INTO editais (id, tenant_id, fonte, id_externo, titulo, orgao, uf, hash_conteudo, conteudo_texto, data_encerramento_propostas)
         VALUES ($1, $2, 'pncp', $3, 'Aquisição de papel A4 lento', 'Prefeitura Lenta', 'RR', $4, 'texto', now() + interval '5 days')`,
        [outroEdital, platformTenant, idLento, `hl-${suffix}`],
      );
      contratosLentosMs = 600;
      const primeira = await get(`/editais/${outroEdital}/concorrentes`);
      expect(primeira.statusCode).toBe(202);
      expect(primeira.json()).toMatchObject({
        estado: 'carregando',
        dados: { atualizando: true },
      });
      await new Promise((resolve) => setTimeout(resolve, 900));
      const segunda = await get(`/editais/${outroEdital}/concorrentes`);
      expect(segunda.statusCode).toBe(200);
      expect(segunda.json().blocos.contratos_do_orgao.estado).toBe('sem_registro');
    } finally {
      delete process.env.PRAZO_DA_TELA_MS;
    }
  });

  it('aquecer deixa os dados do edital guardados para a tela abrir na hora', async () => {
    const antes = calls.length;
    const resposta = await app.inject({
      method: 'POST',
      url: '/editais/aquecer',
      headers: headers(),
      payload: { ids: [editalFechado] },
    });
    expect(resposta.statusCode).toBe(202);
    expect(resposta.json()).toEqual({ aquecendo: 1 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(calls.length).toBeGreaterThanOrEqual(antes);
    const inicio = calls.length;
    const aberta = await get(`/editais/${editalFechado}/concorrentes`);
    expect(aberta.statusCode).toBe(200);
    // Contratos do órgão e preços já estavam guardados: a abertura não volta às fontes deles.
    expect(calls.slice(inicio).some((url) => url.includes('/v1/contratos'))).toBe(false);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/editais/aquecer',
          payload: { ids: [editalFechado] },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/editais/aquecer',
          headers: headers(),
          payload: { ids: [] },
        })
      ).statusCode,
    ).toBe(400);
  });
});
