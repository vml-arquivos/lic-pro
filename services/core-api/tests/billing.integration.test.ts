import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AsaasClient, AsaasPayment } from '../src/asaas.js';
import { isValidCnpj, isValidCpf } from '../src/documento.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

describe('documento', () => {
  it('valida CPF e CNPJ pelos dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
  });
});

const WEBHOOK_TOKEN = 'token-do-webhook-de-teste-123';
const CPF = '529.982.247-25';

type FakePayment = AsaasPayment & { externalReference: string };

function fakeAsaas() {
  const payments = new Map<string, FakePayment>();
  const subscriptions = new Map<string, { externalReference: string; cancelled: boolean }>();
  let counter = 0;
  const client: AsaasClient = {
    async createCustomer() {
      counter += 1;
      return { id: `cus_${counter}` };
    },
    async createPayment(input) {
      counter += 1;
      const payment: FakePayment = {
        id: `pay_${counter}`,
        status: 'PENDING',
        value: input.valueCents / 100,
        dueDate: input.dueDate,
        invoiceUrl: `https://sandbox.asaas.test/i/pay_${counter}`,
        externalReference: input.externalReference,
      };
      payments.set(payment.id, payment);
      return payment;
    },
    async createSubscription(input) {
      counter += 1;
      const id = `sub_${counter}`;
      subscriptions.set(id, { externalReference: input.externalReference, cancelled: false });
      counter += 1;
      const payment: FakePayment = {
        id: `pay_${counter}`,
        status: 'PENDING',
        value: input.valueCents / 100,
        dueDate: input.nextDueDate,
        invoiceUrl: `https://sandbox.asaas.test/i/pay_${counter}`,
        subscription: id,
        externalReference: input.externalReference,
      };
      payments.set(payment.id, payment);
      return { id };
    },
    async listSubscriptionPayments(subscriptionId) {
      return [...payments.values()].filter((payment) => payment.subscription === subscriptionId);
    },
    async getPayment(paymentId) {
      const payment = payments.get(paymentId);
      if (!payment) throw new Error('pagamento desconhecido');
      return payment;
    },
    async cancelSubscription(subscriptionId) {
      const subscription = subscriptions.get(subscriptionId);
      if (subscription) subscription.cancelled = true;
    },
  };
  return { client, payments, subscriptions };
}

suite('cobrança, curso e assinatura (PostgreSQL real, Asaas simulado)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const asaas = fakeAsaas();
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_URL: 'http://app.example.test',
    ASAAS_API_KEY: 'chave-de-teste',
    ASAAS_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
  });

  const platformTenant = randomUUID();
  const clientTenant = randomUUID();
  const platformUser = randomUUID();
  const clientAdmin = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const buyerEmail = `aluna.${suffix}@example.test`;
  const manualEmail = `manual.${suffix}@example.test`;
  const token = (sub: string, tenantId: string, role: string) =>
    app.jwt.sign({ sub, tenantId, role });
  const team = () => ({
    authorization: `Bearer ${token(platformUser, platformTenant, 'plataforma')}`,
  });
  const company = () => ({ authorization: `Bearer ${token(clientAdmin, clientTenant, 'admin')}` });
  const hook = (event: string, payment: Partial<FakePayment> & { id: string }, id = randomUUID()) =>
    app.inject({
      method: 'POST',
      url: '/webhooks/asaas',
      headers: { 'asaas-access-token': WEBHOOK_TOKEN },
      payload: { id, event, payment },
    });

  const planBody = (extra: Record<string, unknown>) => ({
    slug: 'curso-licite-comigo',
    nome: 'Curso Licite Comigo',
    descricao: 'Aprenda a vender para o governo.',
    tipo: 'curso',
    preco_centavos: 49700,
    ciclo: 'unico',
    beneficios: ['Trilhas', 'Mentoria'],
    limites: {},
    turma_nome: 'Curso Licite Comigo',
    ordem: 10,
    ativo: true,
    ...extra,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({ jwtSecret: 'test-secret', logger: false, pool, config, asaas: asaas.client });
    await app.ready();
    for (const [id, nome] of [
      [platformTenant, 'Plataforma Cobrança'],
      [clientTenant, 'Empresa Cobrança'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `b-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    for (const [id, tenant, papel, nome] of [
      [platformUser, platformTenant, 'plataforma', 'Equipe Cobranca'],
      [clientAdmin, clientTenant, 'admin', 'Dona Empresa'],
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
    const mine = `SELECT id FROM cobrancas WHERE comprador_email LIKE '%.${suffix}@example.test' OR empresa_tenant_id = '${clientTenant}'`;
    await setup.query(`DELETE FROM cobranca_pagamentos WHERE cobranca_id IN (${mine})`);
    await setup.query(`DELETE FROM cobrancas WHERE id IN (${mine})`);
    await setup.query(`DELETE FROM assinaturas WHERE tenant_id = $1`, [clientTenant]);
    await setup.query(
      `UPDATE planos SET ativo = false, limites = '{}'::jsonb WHERE slug LIKE 'curso-licite%' OR slug LIKE 'empresa-%'`,
    );
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('plano só aparece depois de ativado pela equipe e exige preço', async () => {
    const before = await app.inject({ method: 'GET', url: '/public/planos' });
    expect(before.statusCode).toBe(200);
    expect(before.json().planos).toEqual([]);

    const denied = await app.inject({
      method: 'PUT',
      url: '/admin/planos',
      headers: company(),
      payload: planBody({}),
    });
    expect(denied.statusCode).toBe(403);

    const free = await app.inject({
      method: 'PUT',
      url: '/admin/planos',
      headers: team(),
      payload: planBody({ preco_centavos: 0 }),
    });
    expect(free.statusCode).toBe(400);

    const saved = await app.inject({
      method: 'PUT',
      url: '/admin/planos',
      headers: team(),
      payload: planBody({}),
    });
    expect(saved.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/public/planos' });
    expect(after.json().planos).toHaveLength(1);
    expect(after.json().planos[0]).toMatchObject({
      slug: 'curso-licite-comigo',
      preco_centavos: 49700,
    });
  });

  let claim = '';
  let courseCobranca = '';
  it('checkout do curso: valida documento e devolve link de pagamento e acompanhamento', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/public/checkout/curso',
      payload: {
        nome: 'Aluna Teste',
        email: buyerEmail,
        documento: '111.111.111-11',
        termos_aceitos: true,
      },
    });
    expect(bad.statusCode).toBe(400);

    const response = await app.inject({
      method: 'POST',
      url: '/public/checkout/curso',
      payload: { nome: 'Aluna Teste', email: buyerEmail, documento: CPF, termos_aceitos: true },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.link_pagamento).toContain('sandbox.asaas.test');
    expect(body.acompanhar_url).toContain('/compra?c=');
    claim = body.claim;

    const row = await setup.query(
      `SELECT id, status, documento_final, asaas_payment_id, valor_centavos FROM cobrancas WHERE comprador_email = $1`,
      [buyerEmail],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]).toMatchObject({
      status: 'pendente',
      documento_final: '4725',
      valor_centavos: 49700,
    });
    courseCobranca = row.rows[0].id;

    const status = await app.inject({ method: 'POST', url: '/public/compra', payload: { claim } });
    expect(status.json()).toMatchObject({ status: 'pendente', acesso_url: null });
    expect(status.json().link_pagamento).toContain('sandbox.asaas.test');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/public/compra',
          payload: { claim: 'x'.repeat(30) },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('webhook: recusa token errado e não libera pagamento que o Asaas não confirma', async () => {
    const paymentId = (
      await setup.query('SELECT asaas_payment_id FROM cobrancas WHERE id = $1', [courseCobranca])
    ).rows[0].asaas_payment_id;
    const wrong = await app.inject({
      method: 'POST',
      url: '/webhooks/asaas',
      headers: { 'asaas-access-token': 'errado' },
      payload: { event: 'PAYMENT_RECEIVED', payment: { id: paymentId } },
    });
    expect(wrong.statusCode).toBe(401);

    // O webhook diz "recebido", mas no Asaas o pagamento ainda está pendente.
    const forged = await hook('PAYMENT_RECEIVED', {
      id: paymentId,
      externalReference: courseCobranca,
    });
    expect(forged.statusCode).toBe(200);
    expect(forged.json().resultado).toBe('nao_confirmado');
    const state = await setup.query('SELECT status, liberado_em FROM cobrancas WHERE id = $1', [
      courseCobranca,
    ]);
    expect(state.rows[0]).toMatchObject({ status: 'pendente', liberado_em: null });
  });

  it('pagamento confirmado libera o convite do aluno; a conta é criada e a compra não repete', async () => {
    const paymentId = (
      await setup.query('SELECT asaas_payment_id FROM cobrancas WHERE id = $1', [courseCobranca])
    ).rows[0].asaas_payment_id;
    asaas.payments.get(paymentId)!.status = 'RECEIVED';
    const eventId = randomUUID();
    const paid = await hook(
      'PAYMENT_RECEIVED',
      { id: paymentId, externalReference: courseCobranca },
      eventId,
    );
    expect(paid.json().resultado).toBe('pago');
    // mesmo evento de novo: ignorado
    expect((await hook('PAYMENT_RECEIVED', { id: paymentId }, eventId)).json().resultado).toBe(
      'duplicado',
    );
    // outro evento do mesmo pagamento (cartão manda os dois): não duplica convite nem receita
    expect(
      (await hook('PAYMENT_CONFIRMED', { id: paymentId, externalReference: courseCobranca })).json()
        .resultado,
    ).toBe('pago');

    const row = await setup.query(
      'SELECT status, resultado_liberacao, liberado_em FROM cobrancas WHERE id = $1',
      [courseCobranca],
    );
    expect(row.rows[0]).toMatchObject({ status: 'paga', resultado_liberacao: 'convite' });
    expect(row.rows[0].liberado_em).not.toBeNull();
    const payments = await setup.query(
      'SELECT count(*)::int AS n FROM cobranca_pagamentos WHERE cobranca_id = $1',
      [courseCobranca],
    );
    expect(payments.rows[0].n).toBe(1);
    const invites = await setup.query(
      `SELECT count(*)::int AS n FROM convites WHERE lower(email) = $1 AND revogado_em IS NULL`,
      [buyerEmail],
    );
    expect(invites.rows[0].n).toBe(1);

    const view = (
      await app.inject({ method: 'POST', url: '/public/compra', payload: { claim } })
    ).json();
    expect(view.status).toBe('paga');
    expect(view.acesso_url).toContain('/convite?token=');
    const inviteToken = new URL(view.acesso_url).searchParams.get('token')!;

    const accept = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      payload: {
        token: inviteToken,
        password: 'Senha-Forte-2026!',
        termos_aceitos: true,
        privacidade_aceita: true,
      },
    });
    expect(accept.statusCode).toBe(201);
    const student = await setup.query(
      `SELECT u.id, u.papel::text AS papel,
              (SELECT count(*)::int FROM matriculas m WHERE m.aluno_id = u.id) AS matriculas
         FROM usuarios u WHERE lower(u.email) = $1`,
      [buyerEmail],
    );
    expect(student.rows[0]).toMatchObject({ papel: 'aluno', matriculas: 1 });
    expect(
      (await app.inject({ method: 'POST', url: '/public/compra', payload: { claim } })).json()
        .resultado,
    ).toBe('conta_criada');

    const again = await app.inject({
      method: 'POST',
      url: '/public/checkout/curso',
      payload: { nome: 'Aluna Teste', email: buyerEmail, documento: CPF, termos_aceitos: true },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('curso_ja_comprado');
  });

  it('equipe libera pagamento feito fora do Asaas (Pix direto) e a receita soma', async () => {
    const checkout = await app.inject({
      method: 'POST',
      url: '/public/checkout/curso',
      payload: { nome: 'Pix Direto', email: manualEmail, documento: CPF, termos_aceitos: true },
    });
    expect(checkout.statusCode).toBe(201);
    const id = (
      await setup.query('SELECT id FROM cobrancas WHERE comprador_email = $1', [manualEmail])
    ).rows[0].id;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/admin/cobrancas/${id}/liberar-manual`,
          headers: company(),
        })
      ).statusCode,
    ).toBe(403);
    const ok = await app.inject({
      method: 'POST',
      url: `/admin/cobrancas/${id}/liberar-manual`,
      headers: team(),
    });
    expect(ok.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/admin/cobrancas/${id}/liberar-manual`,
          headers: team(),
        })
      ).statusCode,
    ).toBe(409);
    const row = await setup.query(
      'SELECT status, resultado_liberacao FROM cobrancas WHERE id = $1',
      [id],
    );
    expect(row.rows[0]).toMatchObject({ status: 'paga', resultado_liberacao: 'convite' });

    const finance = await app.inject({ method: 'GET', url: '/admin/financeiro', headers: team() });
    expect(finance.statusCode).toBe(200);
    const data = finance.json();
    expect(data.cobranca).toMatchObject({ ligada: true, ambiente: 'sandbox' });
    expect(Number(data.receita.total_centavos)).toBeGreaterThanOrEqual(99400);
    expect(data.curso.vendidos).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(data.receita_por_mes)).toBe(true);
    expect(data.recentes.length).toBeGreaterThan(0);
    expect(
      (await app.inject({ method: 'GET', url: '/admin/financeiro', headers: company() }))
        .statusCode,
    ).toBe(403);
  });

  it('assinatura da empresa: contrata, ativa pelo webhook, aplica limite e cancela', async () => {
    const plan = await app.inject({
      method: 'PUT',
      url: '/admin/planos',
      headers: team(),
      payload: planBody({
        slug: 'empresa-essencial',
        nome: 'Essencial',
        tipo: 'assinatura',
        ciclo: 'mensal',
        preco_centavos: 9700,
        limites: { buscas_salvas: 1 },
        turma_nome: null,
      }),
    });
    expect(plan.statusCode).toBe(200);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/billing/assinar',
          headers: team(),
          payload: { plano: 'empresa-essencial', documento: CPF },
        })
      ).statusCode,
    ).toBe(403);
    const subscribe = await app.inject({
      method: 'POST',
      url: '/billing/assinar',
      headers: company(),
      payload: { plano: 'empresa-essencial', documento: CPF },
    });
    expect(subscribe.statusCode).toBe(201);
    expect(subscribe.json().link_pagamento).toContain('sandbox.asaas.test');
    // pedir de novo devolve o mesmo link, sem criar outra assinatura
    const repeat = await app.inject({
      method: 'POST',
      url: '/billing/assinar',
      headers: company(),
      payload: { plano: 'empresa-essencial', documento: CPF },
    });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json().link_pagamento).toBe(subscribe.json().link_pagamento);
    expect(asaas.subscriptions.size).toBe(1);

    const cobranca = (
      await setup.query(
        `SELECT id, asaas_payment_id, asaas_subscription_id FROM cobrancas WHERE empresa_tenant_id = $1`,
        [clientTenant],
      )
    ).rows[0];
    asaas.payments.get(cobranca.asaas_payment_id)!.status = 'CONFIRMED';
    const paid = await hook('PAYMENT_CONFIRMED', {
      id: cobranca.asaas_payment_id,
      subscription: cobranca.asaas_subscription_id,
    });
    expect(paid.json().resultado).toBe('pago');

    const mine = await app.inject({
      method: 'GET',
      url: '/billing/minha-assinatura',
      headers: company(),
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().assinatura).toMatchObject({
      status: 'ativa',
      slug: 'empresa-essencial',
      limites: { buscas_salvas: 1 },
    });
    expect(mine.json().pagamento_pendente).toBeNull();

    const save = (nome: string) =>
      app.inject({
        method: 'POST',
        url: '/saved-searches',
        headers: company(),
        payload: { nome, filtros: {} },
      });
    expect((await save('Primeira')).statusCode).toBe(201);
    expect((await save('Primeira')).statusCode).toBe(201); // atualizar a mesma não conta
    const over = await save('Segunda');
    expect(over.statusCode).toBe(402);
    expect(over.json().error).toBe('limite_do_plano');

    // mensalidade seguinte em atraso: continua com acesso, mas o status aparece
    const overdue = await hook('PAYMENT_OVERDUE', {
      id: `pay_next_${suffix}`,
      subscription: cobranca.asaas_subscription_id,
    });
    expect(overdue.json().resultado).toBe('vencida');
    expect(
      (
        await app.inject({ method: 'GET', url: '/billing/minha-assinatura', headers: company() })
      ).json().assinatura.status,
    ).toBe('past_due');

    // pagamento da mensalidade atrasada recupera a assinatura
    const lateId = `pay_late_${suffix}`;
    asaas.payments.set(lateId, {
      id: lateId,
      status: 'RECEIVED',
      value: 97,
      subscription: cobranca.asaas_subscription_id,
      externalReference: cobranca.id,
    });
    expect(
      (
        await hook('PAYMENT_RECEIVED', { id: lateId, subscription: cobranca.asaas_subscription_id })
      ).json().resultado,
    ).toBe('pago');
    expect(
      (
        await app.inject({ method: 'GET', url: '/billing/minha-assinatura', headers: company() })
      ).json().assinatura.status,
    ).toBe('ativa');

    const cancel = await app.inject({
      method: 'POST',
      url: '/billing/cancelar',
      headers: company(),
    });
    expect(cancel.statusCode).toBe(200);
    expect(asaas.subscriptions.get(cobranca.asaas_subscription_id)!.cancelled).toBe(true);
    const status = await app.inject({
      method: 'GET',
      url: '/billing/minha-assinatura',
      headers: company(),
    });
    expect(status.json().assinatura.status).toBe('cancelada');
    const blocked = await save('Terceira');
    expect(blocked.statusCode).toBe(402);
    expect(blocked.json().error).toBe('assinatura_inativa');
  });

  it('isola cobranças: uma empresa não lê as de outra', async () => {
    const otherTenant = randomUUID();
    await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
      otherTenant,
      'Outra',
      `o-${otherTenant.slice(0, 8)}`,
    ]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [otherTenant]);
      await client.query("SELECT set_config('app.role', 'admin', true)");
      const seen = await client.query('SELECT count(*)::int AS n FROM cobrancas');
      expect(seen.rows[0].n).toBe(0);
      const payments = await client.query('SELECT count(*)::int AS n FROM cobranca_pagamentos');
      expect(payments.rows[0].n).toBe(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    await setup.query('DELETE FROM tenants WHERE id = $1', [otherTenant]);
  });

  it('sem chave do Asaas a venda fica desligada, sem quebrar', async () => {
    const off = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      config: loadConfig({ NODE_ENV: 'test', APP_URL: 'http://app.example.test' }),
    });
    await off.ready();
    const response = await off.inject({
      method: 'POST',
      url: '/public/checkout/curso',
      payload: {
        nome: 'Sem Chave',
        email: `sem.${suffix}@example.test`,
        documento: CPF,
        termos_aceitos: true,
      },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe('billing_not_configured');
    const webhook = await off.inject({
      method: 'POST',
      url: '/webhooks/asaas',
      payload: { event: 'X' },
    });
    expect(webhook.statusCode).toBe(503);
    expect((await off.inject({ method: 'GET', url: '/public/planos' })).json().vendas_ativas).toBe(
      false,
    );
    await off.close();
  });
});
