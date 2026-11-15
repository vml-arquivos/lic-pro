import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AsaasClient, AsaasPayment } from '../src/asaas.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

const CPF = '529.982.247-25';

suite('teste grátis, cupons, assinantes e diagnóstico (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  let server!: Server;
  const payments: AsaasPayment[] = [];
  let pingFails = false;
  const asaas: AsaasClient = {
    async createCustomer() {
      return { id: 'cus_x' };
    },
    async createPayment(input) {
      const payment: AsaasPayment = {
        id: `pay_${randomUUID().slice(0, 8)}`,
        status: 'PENDING',
        value: input.valueCents / 100,
        invoiceUrl: 'https://sandbox.asaas.test/i/x',
        externalReference: input.externalReference,
      };
      payments.push(payment);
      return payment;
    },
    async createSubscription() {
      return { id: 'sub_x' };
    },
    async listSubscriptionPayments() {
      return [];
    },
    async getPayment() {
      throw new Error('não usado');
    },
    async cancelSubscription() {},
    async ping() {
      if (pingFails) throw new Error('chave recusada');
    },
  };

  const suffix = randomUUID().slice(0, 8);
  const platformTenant = randomUUID();
  const clientTenant = randomUUID();
  const platformUser = randomUUID();
  const clientAdmin = randomUUID();
  const editalPncp = randomUUID();
  const slugAss = `tx-ass-${suffix}`;
  const slugCurso = `tx-curso-${suffix}`;
  const team = () => ({
    authorization: `Bearer ${app.jwt.sign({ sub: platformUser, tenantId: platformTenant, role: 'plataforma' })}`,
  });
  const company = () => ({
    authorization: `Bearer ${app.jwt.sign({ sub: clientAdmin, tenantId: clientTenant, role: 'admin' })}`,
  });
  const putPlan = (body: Record<string, unknown>) =>
    app.inject({ method: 'PUT', url: '/admin/planos', headers: team(), payload: body });
  const putCupom = (body: Record<string, unknown>) =>
    app.inject({ method: 'PUT', url: '/admin/cupons', headers: team(), payload: body });
  const validar = (codigo: string, plano: string) =>
    app.inject({ method: 'POST', url: '/public/cupom/validar', payload: { codigo, plano } });
  const minha = async () =>
    (
      await app.inject({ method: 'GET', url: '/billing/minha-assinatura', headers: company() })
    ).json();
  const checkout = (extra: Record<string, unknown>, email: string) =>
    app.inject({
      method: 'POST',
      url: '/public/checkout/curso',
      payload: {
        plano: slugCurso,
        nome: 'Aluna Cupom',
        email,
        documento: CPF,
        termos_aceitos: true,
        ...extra,
      },
    });

  beforeAll(async () => {
    server = createServer((request, response) => {
      const url = request.url ?? '';
      const send = (body: unknown) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (url.includes('/v1/contratacoes/publicacao'))
        return send({ data: [{}, {}], totalRegistros: 2 });
      if (url.includes('/itens'))
        return send([
          { numeroItem: 1, descricao: 'Papel A4', quantidade: 10, catalogoCodigoItem: '460789' },
        ]);
      if (url.includes('/arquivos')) return send([]);
      if (url.includes('modulo-pesquisa-preco')) {
        const today = new Date().toISOString().slice(0, 10);
        return send({
          resultado: [20, 22, 24].map((preco) => ({
            precoUnitario: preco,
            quantidade: 1,
            dataCompra: today,
            estado: 'DF',
            descricaoItem: 'Papel A4',
          })),
          totalPaginas: 1,
        });
      }
      response.writeHead(404);
      response.end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      asaas,
      config: loadConfig({
        NODE_ENV: 'test',
        APP_URL: 'http://app.example.test',
        PNCP_BASE_URL: `${base}/api/consulta`,
        PNCP_API_BASE_URL: `${base}/pncp-api/v1`,
        COMPRAS_GOV_BASE_URL: base,
      }),
    });
    await app.ready();
    for (const [id, nome] of [
      [platformTenant, 'Plataforma Extras'],
      [clientTenant, 'Empresa Extras'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `x-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    for (const [id, tenant, papel, nome] of [
      [platformUser, platformTenant, 'plataforma', 'Equipe Extras'],
      [clientAdmin, clientTenant, 'admin', 'Dona Extras'],
    ] as const) {
      await setup.query(
        `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em,
                               nicho_preferencias, onboarding_concluido)
         VALUES ($1, $2, $3, $4, $5, $6, now(), '["limpeza-conservacao"]'::jsonb, true)`,
        [
          id,
          tenant,
          `${papel}.${suffix}@example.test`,
          nome,
          papel,
          hashPassword('Senha-Forte-2026!'),
        ],
      );
    }
    await setup.query(
      `INSERT INTO editais (id, tenant_id, fonte, id_externo, titulo, orgao, uf, hash_conteudo, conteudo_texto)
       VALUES ($1, $2, 'pncp', $3, 'Compra de papel', 'Órgão', 'RR', $4, 'texto')`,
      [
        editalPncp,
        platformTenant,
        `00394460000141-1-${Math.floor(Math.random() * 900000) + 1}/2026`,
        `h-${suffix}`,
      ],
    );
  });

  afterAll(async () => {
    await setup.query(
      'DELETE FROM cobranca_pagamentos WHERE cobranca_id IN (SELECT id FROM cobrancas WHERE comprador_email LIKE $1)',
      [`%.${suffix}@example.test`],
    );
    await setup.query('DELETE FROM cobrancas WHERE comprador_email LIKE $1', [
      `%.${suffix}@example.test`,
    ]);
    await setup.query('DELETE FROM cupons WHERE codigo LIKE $1', [`TX%${suffix.toUpperCase()}`]);
    await setup.query('DELETE FROM assinaturas WHERE tenant_id = $1', [clientTenant]);
    await setup.query('DELETE FROM buscas_salvas WHERE tenant_id = $1', [clientTenant]);
    await setup.query('DELETE FROM planos WHERE slug = ANY($1)', [[slugAss, slugCurso]]);
    await setup.query('DELETE FROM editais WHERE id = $1', [editalPncp]);
    await app.close();
    await pool.end();
    await setup.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('só a equipe usa os recursos de administração', async () => {
    for (const [method, url] of [
      ['GET', '/admin/assinantes'],
      ['GET', '/admin/cupons'],
      ['PUT', '/admin/cupons'],
      ['POST', '/admin/integracoes/testar'],
    ] as const) {
      const response = await app.inject({ method, url, headers: company(), payload: {} });
      expect(response.statusCode).toBe(403);
    }
  });

  it('teste grátis: começa uma vez, vale o limite do plano e expira sozinho', async () => {
    const plan = await putPlan({
      slug: slugAss,
      nome: 'Plano Extras',
      descricao: 'Plano de teste.',
      tipo: 'assinatura',
      preco_centavos: 9900,
      ciclo: 'mensal',
      beneficios: ['Radar'],
      limites: { buscas_salvas: 1 },
      ordem: 900,
      trial_dias: 7,
      ativo: false,
    });
    expect(plan.statusCode).toBe(200);
    const closed = await app.inject({
      method: 'POST',
      url: '/billing/teste-gratis',
      headers: company(),
      payload: { plano: slugAss },
    });
    expect(closed.statusCode).toBe(404);
    expect(closed.json().error).toBe('plano_sem_teste');

    await putPlan({
      slug: slugAss,
      nome: 'Plano Extras',
      descricao: 'Plano de teste.',
      tipo: 'assinatura',
      preco_centavos: 9900,
      ciclo: 'mensal',
      beneficios: ['Radar'],
      limites: { buscas_salvas: 1 },
      ordem: 900,
      trial_dias: 7,
      ativo: true,
    });
    expect((await minha()).pode_testar).toBe(true);
    const planos = (await app.inject({ method: 'GET', url: '/public/planos' })).json().planos;
    expect(planos.find((p: { slug: string }) => p.slug === slugAss).trial_dias).toBe(7);

    const started = await app.inject({
      method: 'POST',
      url: '/billing/teste-gratis',
      headers: company(),
      payload: { plano: slugAss },
    });
    expect(started.statusCode).toBe(201);
    const again = await app.inject({
      method: 'POST',
      url: '/billing/teste-gratis',
      headers: company(),
      payload: { plano: slugAss },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('ja_teve_assinatura');

    const info = await minha();
    expect(info.pode_testar).toBe(false);
    expect(info.assinatura).toMatchObject({ status: 'trial', slug: slugAss });
    expect(info.assinatura.limites.buscas_salvas).toBe(1);

    const save = (nome: string) =>
      app.inject({
        method: 'POST',
        url: '/saved-searches',
        headers: company(),
        payload: { nome, filtros: {} },
      });
    expect((await save('Busca A')).statusCode).toBe(201);
    const over = await save('Busca B');
    expect(over.statusCode).toBe(402);
    expect(over.json().error).toBe('limite_do_plano');

    // O teste vence: sem rotina nenhuma, a conta passa a valer como expirada.
    await setup.query(
      "UPDATE assinaturas SET fim_em = now() - interval '1 day' WHERE tenant_id = $1",
      [clientTenant],
    );
    expect((await minha()).assinatura.status).toBe('expirada');
    const blocked = await save('Busca C');
    expect(blocked.statusCode).toBe(402);
    expect(blocked.json().error).toBe('assinatura_inativa');
  });

  it('a equipe lista assinantes, estende o teste, cancela e reativa', async () => {
    const list = await app.inject({ method: 'GET', url: '/admin/assinantes', headers: team() });
    expect(list.statusCode).toBe(200);
    const mine = list
      .json()
      .assinantes.find((row: { tenant_id: string }) => row.tenant_id === clientTenant);
    expect(mine).toMatchObject({
      status: 'expirada',
      plano: 'Plano Extras',
      contato: `admin.${suffix}@example.test`,
    });
    expect(list.json().resumo.total).toBeGreaterThanOrEqual(1);

    const adjust = (acao: string, dias?: number) =>
      app.inject({
        method: 'POST',
        url: `/admin/assinaturas/${mine.id}/ajustar`,
        headers: team(),
        payload: dias ? { acao, dias } : { acao },
      });
    expect((await adjust('estender')).statusCode).toBe(400); // sem dias
    expect((await adjust('estender', 5)).statusCode).toBe(200);
    const extended = (await minha()).assinatura;
    expect(extended.status).toBe('trial');
    expect(new Date(extended.fim_em).getTime()).toBeGreaterThan(Date.now() + 4 * 86_400_000);

    expect((await adjust('cancelar')).statusCode).toBe(200);
    expect((await minha()).assinatura.status).toBe('cancelada');
    // cancelada não é "teste": não dá para estender
    expect((await adjust('estender', 5)).statusCode).toBe(409);
    expect((await adjust('reativar')).statusCode).toBe(200);
    expect((await minha()).assinatura.status).toBe('ativa');

    const missing = await app.inject({
      method: 'POST',
      url: `/admin/assinaturas/${randomUUID()}/ajustar`,
      headers: team(),
      payload: { acao: 'cancelar' },
    });
    expect(missing.statusCode).toBe(404);
    const audit = await setup.query(
      "SELECT count(*)::int AS n FROM auditoria WHERE acao = 'billing.assinatura.ajustada' AND tenant_id = $1",
      [platformTenant],
    );
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(4);
  });

  it('cupons: valida, aplica o desconto na cobrança e respeita limite, plano e validade', async () => {
    await putPlan({
      slug: slugCurso,
      nome: 'Curso Extras',
      descricao: 'Curso de teste.',
      tipo: 'curso',
      preco_centavos: 20000,
      ciclo: 'unico',
      beneficios: [],
      limites: {},
      turma_nome: 'Turma Extras',
      ordem: 901,
      ativo: true,
    });
    const code = (name: string) => `TX${name}${suffix.toUpperCase()}`;
    const percent = await putCupom({
      codigo: code('P10').toLowerCase(),
      tipo: 'percentual',
      valor: 10,
      plano_slugs: [slugCurso],
    });
    expect(percent.statusCode).toBe(200);
    expect(percent.json().codigo).toBe(code('P10'));
    expect(
      (await putCupom({ codigo: code('BAD'), tipo: 'percentual', valor: 96 })).statusCode,
    ).toBe(400);

    const preview = (await validar(code('P10').toLowerCase(), slugCurso)).json();
    expect(preview).toMatchObject({
      valido: true,
      desconto_centavos: 2000,
      valor_original_centavos: 20000,
      valor_final_centavos: 18000,
    });
    expect((await validar(code('P10'), slugAss)).json().valido).toBe(false); // outro plano
    expect((await validar('NAOEXISTE', slugCurso)).json().valido).toBe(false);

    // desconto que deixa o valor abaixo do mínimo do Asaas (R$ 5,00)
    await putCupom({ codigo: code('FULL'), tipo: 'fixo', valor: 19800, plano_slugs: null });
    const floor = (await validar(code('FULL'), slugCurso)).json();
    expect(floor.valido).toBe(false);
    expect(floor.mensagem).toContain('R$ 5,00');

    // vencido
    await putCupom({
      codigo: code('OLD'),
      tipo: 'fixo',
      valor: 1000,
      valido_ate: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect((await validar(code('OLD'), slugCurso)).json().valido).toBe(false);

    // uso único: a primeira compra pega o desconto, a segunda já não vale
    await putCupom({ codigo: code('ONE'), tipo: 'fixo', valor: 5000, max_usos: 1 });
    const bought = await checkout({ cupom: code('ONE') }, `um.${suffix}@example.test`);
    expect(bought.statusCode).toBe(201);
    expect(payments.at(-1)?.value).toBe(150);
    const row = await setup.query(
      'SELECT valor_centavos, desconto_centavos, cupom_codigo FROM cobrancas WHERE comprador_email = $1',
      [`um.${suffix}@example.test`],
    );
    expect(row.rows[0]).toMatchObject({
      valor_centavos: 15000,
      desconto_centavos: 5000,
      cupom_codigo: code('ONE'),
    });
    expect((await validar(code('ONE'), slugCurso)).json().valido).toBe(false);
    const rejected = await checkout({ cupom: code('ONE') }, `dois.${suffix}@example.test`);
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error).toBe('cupom_invalido');

    // sem cupom, preço cheio
    expect((await checkout({}, `tres.${suffix}@example.test`)).statusCode).toBe(201);
    expect(payments.at(-1)?.value).toBe(200);

    const list = (
      await app.inject({ method: 'GET', url: '/admin/cupons', headers: team() })
    ).json();
    const one = list.cupons.find((c: { codigo: string }) => c.codigo === code('ONE'));
    expect(one).toMatchObject({ usos: 1, pagos: 0, max_usos: 1 });

    // desativar tira o cupom de circulação
    await putCupom({ codigo: code('P10'), tipo: 'percentual', valor: 10, ativo: false });
    expect((await validar(code('P10'), slugCurso)).json().valido).toBe(false);
  });

  it('diagnóstico das integrações mostra o estado de cada fonte', async () => {
    const run = async () =>
      (
        await app.inject({ method: 'POST', url: '/admin/integracoes/testar', headers: team() })
      ).json();
    const ok = await run();
    const byId = Object.fromEntries(ok.testes.map((t: { id: string }) => [t.id, t])) as Record<
      string,
      { estado: string; detalhe: string }
    >;
    expect(byId.pncp_lista?.estado).toBe('ok');
    expect(byId.pncp_detalhes?.estado).toBe('ok');
    expect(byId.pncp_detalhes?.detalhe).toContain('1 item');
    expect(byId.compras_precos?.estado).toBe('ok');
    expect(byId.compras_precos?.detalhe).toContain('3 preço');
    expect(byId.asaas?.estado).toBe('ok');
    expect(byId.email?.estado).toBe('nao_configurado');

    pingFails = true;
    const failed = await run();
    const asaasTest = failed.testes.find((t: { id: string }) => t.id === 'asaas');
    expect(asaasTest.estado).toBe('falha');
    expect(asaasTest.detalhe).toContain('chave recusada');
    pingFails = false;
  });
});
