import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  asaasDate,
  AsaasError,
  createAsaasClient,
  type AsaasClient,
  type AsaasPayment,
} from './asaas.js';
import { createOpaqueToken, hashOpaqueToken, PublicRateLimiter } from './auth-public.js';
import { panelBaseUrl, type RuntimeConfig } from './config.js';
import { withTenant } from './db.js';
import { isValidDocumento, onlyDigits } from './documento.js';
import { resolverCupom } from './cupom-calc.js';
import { moduloSchema, tipoDeCobrancaDoModulo } from './modulo.js';
import { sendEmail } from './email.js';
import {
  authContext,
  requireRoles,
  sendDatabaseUnavailable,
  withPlatform,
} from './request-context.js';

/**
 * Planos, cobrança (Asaas), compra do curso e assinatura das empresas.
 *
 * Regras:
 * - Sem ASAAS_API_KEY + ASAAS_WEBHOOK_TOKEN a venda fica desligada (503), nada quebra.
 * - O webhook só vale com o token certo e, antes de liberar qualquer coisa, o pagamento é
 *   conferido de novo direto no Asaas.
 * - CPF/CNPJ vai para o Asaas e não é guardado aqui (só os 4 últimos dígitos).
 */

export class BillingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Deps = { pool: Pool | undefined; config: RuntimeConfig; asaas?: AsaasClient };

const uuid = z.string().uuid();
const LIMIT_KEYS = ['buscas_salvas'] as const;

const documentoField = z
  .string()
  .trim()
  .min(11)
  .max(18)
  .refine(isValidDocumento, 'Informe um CPF ou CNPJ válido.');

const checkoutBody = z.object({
  plano: z.string().trim().min(1).max(80).optional(),
  nome: z.string().trim().min(3).max(160),
  email: z.string().trim().toLowerCase().email().max(200),
  documento: documentoField,
  termos_aceitos: z.literal(true),
  cupom: z.string().trim().max(32).optional(),
});
const claimBody = z.object({ claim: z.string().min(20).max(200) });
const assinarBody = z.object({
  plano: z.string().trim().min(1).max(80),
  documento: documentoField,
  cupom: z.string().trim().max(32).optional(),
});

const planBody = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,60}$/),
  nome: z.string().trim().min(2).max(120),
  descricao: z.string().trim().min(2).max(500),
  tipo: z.enum(['assinatura', 'curso']),
  preco_centavos: z.number().int().min(0).max(100_000_00),
  ciclo: z.enum(['mensal', 'anual', 'unico']),
  beneficios: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  limites: z.record(z.enum(LIMIT_KEYS), z.number().int().min(0).max(100_000)).default({}),
  turma_nome: z.string().trim().min(2).max(120).nullable().optional(),
  ordem: z.number().int().min(0).max(1000).default(100),
  trial_dias: z.number().int().min(0).max(60).default(0),
  ativo: z.boolean().default(false),
});

type PlanRow = {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  tipo: 'assinatura' | 'curso';
  preco_centavos: number;
  ciclo: 'mensal' | 'anual' | 'unico';
  beneficios: string[];
  limites: Record<string, number>;
  turma_nome: string | null;
  ordem: number;
  trial_dias: number;
  ativo: boolean;
};

type CobrancaRow = {
  id: string;
  tipo: 'curso' | 'assinatura';
  plano_id: string;
  empresa_tenant_id: string | null;
  empresa_id: string | null;
  comprador_nome: string;
  comprador_email: string;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  asaas_payment_id: string | null;
  status: 'pendente' | 'paga' | 'vencida' | 'reembolsada' | 'cancelada';
  valor_centavos: number;
  link_pagamento: string | null;
  pago_em: Date | null;
  liberado_em: Date | null;
  resultado_liberacao: string | null;
};

export const PLAN_COLUMNS = `id, slug, nome, descricao, tipo, preco_centavos, ciclo, beneficios, limites,
                      turma_nome, ordem, trial_dias, ativo`;

/** Situação "de verdade": teste com prazo vencido conta como expirado, sem precisar de rotina. */
export const statusEfetivoSql = (alias = ''): string => {
  const prefix = alias ? `${alias}.` : '';
  return `CASE WHEN ${prefix}status = 'trial' AND ${prefix}fim_em IS NOT NULL AND ${prefix}fim_em < now()
                THEN 'expirada' ELSE ${prefix}status END`;
};

/** Token do convite do curso: derivado da cobrança, para a página de compra reexibir o acesso. */
export function deriveCourseInviteToken(config: RuntimeConfig, cobrancaId: string): string {
  return createHmac('sha256', config.jwtSecret)
    .update(`convite-curso:${cobrancaId}`)
    .digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

/** Sessão do fluxo de cobrança (checkout público e webhook): liga `app.billing_flow` só aqui. */
export async function withBilling<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.billing_flow', 'true', true)");
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function publicPlan(row: PlanRow) {
  return {
    slug: row.slug,
    nome: row.nome,
    descricao: row.descricao,
    tipo: row.tipo,
    preco_centavos: row.preco_centavos,
    ciclo: row.ciclo,
    beneficios: row.beneficios,
    trial_dias: row.trial_dias,
  };
}

export function sendBillingError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof BillingError) {
    return reply.code(error.status).send({ error: error.code, message: error.message });
  }
  if (error instanceof AsaasError) {
    return reply.code(error.status === 502 ? 502 : 400).send({
      error: 'pagamento_indisponivel',
      message:
        error.status === 502
          ? 'O serviço de pagamento está indisponível. Tente novamente em instantes.'
          : `O pagamento não pôde ser criado: ${error.message}`,
    });
  }
  throw error;
}

/**
 * Limite do plano (hoje: buscas salvas). Conta sem assinatura registrada não tem limite novo:
 * contas já existentes continuam como estavam.
 */
export async function assertPlanAllows(
  client: PoolClient,
  tenantId: string,
  key: (typeof LIMIT_KEYS)[number],
  currentCount: number,
): Promise<void> {
  const result = await client.query<{ status: string; limites_snapshot: Record<string, unknown> }>(
    `SELECT ${statusEfetivoSql()} AS status, limites_snapshot FROM assinaturas
      WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [tenantId],
  );
  const row = result.rows[0];
  if (!row) return;
  if (row.status === 'cancelada' || row.status === 'expirada') {
    throw new BillingError(
      402,
      'assinatura_inativa',
      'Sua assinatura ou teste grátis terminou. Escolha um plano em Assinatura para criar novas buscas.',
    );
  }
  const limit = row.limites_snapshot?.[key];
  if (typeof limit === 'number' && currentCount >= limit) {
    throw new BillingError(
      402,
      'limite_do_plano',
      `Seu plano permite até ${limit} buscas salvas. Mude de plano para criar mais.`,
    );
  }
}

type Fulfilment = { email?: { to: string; nome: string; link: string } };

/** Libera o que foi comprado. Chamar dentro da transação, com a cobrança já marcada como paga. */
async function fulfil(
  client: PoolClient,
  config: RuntimeConfig,
  c: CobrancaRow,
): Promise<Fulfilment> {
  if (c.tipo === 'assinatura') {
    await client.query('SELECT billing_definir_assinatura($1, $2)', [c.id, 'ativa']);
    return {};
  }
  const token = deriveCourseInviteToken(config, c.id);
  const result = await client.query<{ resultado: string }>(
    'SELECT billing_liberar_curso($1, $2) AS resultado',
    [c.id, hashOpaqueToken(token)],
  );
  if (result.rows[0]?.resultado === 'convite') {
    const base = panelBaseUrl(config, 'aluno');
    return {
      email: {
        to: c.comprador_email,
        nome: c.comprador_nome,
        link: `${base}/convite?token=${token}`,
      },
    };
  }
  return {};
}

async function sendAccessEmail(config: RuntimeConfig, fulfilment: Fulfilment): Promise<void> {
  if (!fulfilment.email) return;
  try {
    await sendEmail(config, {
      to: fulfilment.email.to,
      subject: 'Pagamento confirmado — crie seu acesso ao curso',
      text: `Olá, ${fulfilment.email.nome}.\n\nSeu pagamento foi confirmado. Crie sua senha e acesse o curso pelo link abaixo. Ele vale por 7 dias e só pode ser usado uma vez.\n\n${fulfilment.email.link}\n`,
    });
  } catch {
    // O link continua disponível na página da compra.
  }
}

const PAID_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);

const webhookBody = z
  .object({
    id: z.string().max(200).optional(),
    event: z.string().min(1).max(100),
    payment: z
      .object({
        id: z.string().min(1).max(100),
        status: z.string().max(60).optional(),
        value: z.number().optional(),
        dueDate: z.string().max(20).optional(),
        paymentDate: z.string().max(40).nullable().optional(),
        subscription: z.string().max(100).nullable().optional(),
        externalReference: z.string().max(100).nullable().optional(),
      })
      .passthrough()
      .optional(),
    subscription: z
      .object({
        id: z.string().min(1).max(100),
        externalReference: z.string().max(100).nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

async function findCobranca(
  client: PoolClient,
  refs: { externalReference?: string | null; paymentId?: string; subscriptionId?: string | null },
): Promise<CobrancaRow | null> {
  const select = `SELECT id, tipo, plano_id, empresa_tenant_id, empresa_id, comprador_nome, comprador_email,
                         asaas_customer_id, asaas_subscription_id, asaas_payment_id, status, valor_centavos,
                         link_pagamento, pago_em, liberado_em, resultado_liberacao FROM cobrancas`;
  if (refs.externalReference && uuid.safeParse(refs.externalReference).success) {
    const found = await client.query<CobrancaRow>(`${select} WHERE id = $1 FOR UPDATE`, [
      refs.externalReference,
    ]);
    if (found.rows[0]) return found.rows[0];
  }
  if (refs.subscriptionId) {
    const found = await client.query<CobrancaRow>(
      `${select} WHERE asaas_subscription_id = $1 FOR UPDATE`,
      [refs.subscriptionId],
    );
    if (found.rows[0]) return found.rows[0];
  }
  if (refs.paymentId) {
    const found = await client.query<CobrancaRow>(
      `${select} WHERE asaas_payment_id = $1 FOR UPDATE`,
      [refs.paymentId],
    );
    if (found.rows[0]) return found.rows[0];
  }
  return null;
}

export function registerBillingRoutes(app: FastifyInstance, deps: Deps): void {
  const { pool, config } = deps;
  const limiter = new PublicRateLimiter(8);
  const claimLimiter = new PublicRateLimiter(60);
  let asaasClient = deps.asaas;
  const asaas = (): AsaasClient => {
    if (!config.billingEnabled && !deps.asaas) {
      throw new BillingError(
        503,
        'billing_not_configured',
        'A venda ainda não está habilitada. Fale com a equipe.',
      );
    }
    asaasClient ??= createAsaasClient(config);
    return asaasClient;
  };
  const billingOn = (): boolean => config.billingEnabled || Boolean(deps.asaas);

  // -------------------------------------------------------------------------
  // Público: planos à venda, checkout do curso, acompanhamento da compra e webhook.
  // -------------------------------------------------------------------------
  app.get('/public/planos', async (_request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const rows = await withBilling(
      pool,
      async (client) =>
        (
          await client.query<PlanRow>(
            `SELECT ${PLAN_COLUMNS} FROM planos WHERE ativo ORDER BY ordem, nome`,
          )
        ).rows,
    );
    return reply.send({
      vendas_ativas: billingOn(),
      site_url: config.siteUrl ?? null,
      planos: rows.map(publicPlan),
    });
  });

  app.post('/public/checkout/curso', async (request, reply) => {
    limiter.check(`checkout:${request.ip}`);
    const body = checkoutBody.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    try {
      const client = asaas();
      const claim = createOpaqueToken();
      const created = await withBilling(pool, async (db) => {
        const plan = (
          await db.query<PlanRow>(
            `SELECT ${PLAN_COLUMNS} FROM planos
              WHERE tipo = 'curso' AND ativo AND ($1::text IS NULL OR slug = $1)
              ORDER BY ordem LIMIT 1`,
            [body.plano ?? null],
          )
        ).rows[0];
        if (!plan || plan.preco_centavos <= 0) {
          throw new BillingError(404, 'plano_indisponivel', 'Este curso não está à venda agora.');
        }
        const already = await db.query(
          `SELECT 1 FROM cobrancas WHERE tipo = 'curso' AND plano_id = $1 AND status = 'paga'
              AND lower(comprador_email) = $2 LIMIT 1`,
          [plan.id, body.email],
        );
        if (already.rows[0]) {
          throw new BillingError(
            409,
            'curso_ja_comprado',
            'Este e-mail já comprou o curso. Entre com sua conta ou use "Esqueci a senha".',
          );
        }
        const coupon = body.cupom ? await resolverCupom(db, body.cupom, plan) : null;
        if (coupon && !coupon.ok) throw new BillingError(400, 'cupom_invalido', coupon.mensagem);
        const applied = coupon?.ok ? coupon.cupom : null;
        const valor = applied?.valor_final_centavos ?? plan.preco_centavos;
        const id = randomUUID();
        await db.query(
          `INSERT INTO cobrancas (id, tipo, plano_id, comprador_nome, comprador_email, documento_final,
                                  claim_hash, valor_centavos, cupom_codigo, desconto_centavos)
           VALUES ($1, 'curso', $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            plan.id,
            body.nome,
            body.email,
            onlyDigits(body.documento).slice(-4),
            hashOpaqueToken(claim),
            valor,
            applied?.codigo ?? null,
            applied?.desconto_centavos ?? 0,
          ],
        );
        return { id, plan, valor };
      });

      let payment: AsaasPayment;
      try {
        const customer = await client.createCustomer({
          name: body.nome,
          email: body.email,
          cpfCnpj: onlyDigits(body.documento),
          externalReference: created.id,
        });
        payment = await client.createPayment({
          customer: customer.id,
          valueCents: created.valor,
          dueDate: asaasDate(new Date(), 3),
          description: created.plan.nome,
          externalReference: created.id,
        });
        await withBilling(pool, (db) =>
          db.query(
            `UPDATE cobrancas SET asaas_customer_id = $2, asaas_payment_id = $3, link_pagamento = $4,
                    updated_at = now() WHERE id = $1`,
            [created.id, customer.id, payment.id, payment.invoiceUrl ?? null],
          ),
        );
      } catch (error) {
        await withBilling(pool, (db) =>
          db.query(
            `UPDATE cobrancas SET status = 'cancelada', ultimo_evento = 'checkout_falhou', updated_at = now()
              WHERE id = $1`,
            [created.id],
          ),
        );
        throw error;
      }
      const base = panelBaseUrl(config, 'aluno');
      return reply.code(201).send({
        claim,
        acompanhar_url: `${base}/compra?c=${claim}`,
        link_pagamento: payment.invoiceUrl ?? null,
      });
    } catch (error) {
      return sendBillingError(reply, error);
    }
  });

  app.post('/public/compra', async (request, reply) => {
    claimLimiter.check(`compra:${request.ip}`);
    const { claim } = claimBody.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const view = await withBilling(pool, async (db) => {
      await db.query("SELECT set_config('app.auth_flow', 'true', true)");
      const found = await db.query<CobrancaRow & { plano_nome: string }>(
        `SELECT c.id, c.tipo, c.plano_id, c.status, c.link_pagamento, c.liberado_em, c.resultado_liberacao,
                c.comprador_email, c.comprador_nome, c.valor_centavos, p.nome AS plano_nome
           FROM cobrancas c JOIN planos p ON p.id = c.plano_id
          WHERE c.claim_hash = $1 AND c.tipo = 'curso'`,
        [hashOpaqueToken(claim)],
      );
      const row = found.rows[0];
      if (!row) return null;
      const email = row.comprador_email.replace(/^(.).*(@.*)$/, '$1***$2');
      const base = {
        status: row.status,
        plano: row.plano_nome,
        email,
        valor_centavos: row.valor_centavos,
        link_pagamento:
          row.status === 'pendente' || row.status === 'vencida' ? row.link_pagamento : null,
        resultado: row.resultado_liberacao,
      };
      if (row.status === 'paga' && row.resultado_liberacao === 'convite') {
        const token = deriveCourseInviteToken(config, row.id);
        const invite = await db.query<{
          usado_em: Date | null;
          revogado_em: Date | null;
          valido: boolean;
        }>(
          `SELECT usado_em, revogado_em, (expira_em > now()) AS valido FROM convites WHERE token_hash = $1`,
          [hashOpaqueToken(token)],
        );
        const state = invite.rows[0];
        if (state?.usado_em) return { ...base, resultado: 'conta_criada', acesso_url: null };
        if (state && !state.revogado_em && state.valido) {
          const origin = panelBaseUrl(config, 'aluno');
          return { ...base, acesso_url: `${origin}/convite?token=${token}` };
        }
        return { ...base, resultado: 'convite_expirado', acesso_url: null };
      }
      return { ...base, acesso_url: null };
    });
    if (!view) return reply.code(404).send({ error: 'compra_nao_encontrada' });
    return reply.send(view);
  });

  app.post('/webhooks/asaas', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    if (!config.asaasWebhookToken) {
      return reply.code(503).send({ error: 'billing_not_configured' });
    }
    const header = request.headers['asaas-access-token'];
    const received = Array.isArray(header) ? header[0] : header;
    if (!received || !safeEqual(received, config.asaasWebhookToken)) {
      return reply.code(401).send({ error: 'invalid_token' });
    }
    const parsed = webhookBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
    const event = parsed.data;
    const payment = event.payment;
    const key =
      event.id ??
      `${event.event}:${payment?.id ?? event.subscription?.id ?? 'x'}:${payment?.status ?? ''}`;

    let fulfilment: Fulfilment = {};
    const outcome = await withBilling(pool, async (db) => {
      const fresh = await db.query(
        'INSERT INTO cobranca_eventos (chave, evento) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING chave',
        [key, event.event.slice(0, 100)],
      );
      if (!fresh.rows[0]) return 'duplicado';

      const cobranca = await findCobranca(db, {
        externalReference:
          payment?.externalReference ?? event.subscription?.externalReference ?? null,
        ...(payment ? { paymentId: payment.id } : {}),
        subscriptionId: payment?.subscription ?? event.subscription?.id ?? null,
      });
      if (!cobranca) return 'ignorado';
      await db.query('UPDATE cobrancas SET ultimo_evento = $2, updated_at = now() WHERE id = $1', [
        cobranca.id,
        event.event.slice(0, 100),
      ]);

      switch (event.event) {
        case 'PAYMENT_CONFIRMED':
        case 'PAYMENT_RECEIVED':
        case 'PAYMENT_APPROVED_BY_RISK_ANALYSIS': {
          if (!payment) return 'ignorado';
          // Confere direto no Asaas: o webhook sozinho não libera acesso.
          const confirmed = await asaas().getPayment(payment.id);
          if (!PAID_STATUSES.has(confirmed.status)) return 'nao_confirmado';
          const valueCents = Math.round((confirmed.value ?? payment.value ?? 0) * 100);
          await db.query(
            `INSERT INTO cobranca_pagamentos (cobranca_id, asaas_payment_id, status, valor_centavos, vencimento, pago_em)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
             ON CONFLICT (asaas_payment_id) DO UPDATE SET status = EXCLUDED.status,
               pago_em = COALESCE(cobranca_pagamentos.pago_em, EXCLUDED.pago_em), updated_at = now()`,
            [
              cobranca.id,
              confirmed.id,
              confirmed.status,
              valueCents,
              confirmed.dueDate ?? null,
              confirmed.paymentDate ?? null,
            ],
          );
          await db.query(
            `UPDATE cobrancas SET status = 'paga', pago_em = COALESCE(pago_em, now()),
                    asaas_payment_id = COALESCE(asaas_payment_id, $2), updated_at = now()
              WHERE id = $1 AND status <> 'reembolsada'`,
            [cobranca.id, confirmed.id],
          );
          const current = await findCobranca(db, { externalReference: cobranca.id });
          if (current && current.status === 'paga') fulfilment = await fulfil(db, config, current);
          return 'pago';
        }
        case 'PAYMENT_OVERDUE': {
          if (cobranca.tipo === 'assinatura') {
            await db.query(
              "UPDATE cobrancas SET status = 'vencida', updated_at = now() WHERE id = $1 AND status <> 'cancelada'",
              [cobranca.id],
            );
            await db.query('SELECT billing_definir_assinatura($1, $2)', [cobranca.id, 'past_due']);
          } else if (cobranca.status === 'pendente') {
            await db.query(
              "UPDATE cobrancas SET status = 'vencida', updated_at = now() WHERE id = $1",
              [cobranca.id],
            );
          }
          return 'vencida';
        }
        case 'PAYMENT_REFUNDED':
        case 'PAYMENT_CHARGEBACK_REQUESTED': {
          if (payment) {
            await db.query(
              "UPDATE cobranca_pagamentos SET status = 'REFUNDED', updated_at = now() WHERE asaas_payment_id = $1",
              [payment.id],
            );
          }
          await db.query(
            "UPDATE cobrancas SET status = 'reembolsada', updated_at = now() WHERE id = $1",
            [cobranca.id],
          );
          if (cobranca.tipo === 'assinatura') {
            await db.query('SELECT billing_definir_assinatura($1, $2)', [cobranca.id, 'cancelada']);
          }
          return 'reembolsada';
        }
        case 'PAYMENT_DELETED': {
          if (cobranca.status === 'pendente') {
            await db.query(
              "UPDATE cobrancas SET status = 'cancelada', updated_at = now() WHERE id = $1",
              [cobranca.id],
            );
          }
          return 'cancelada';
        }
        case 'SUBSCRIPTION_DELETED':
        case 'SUBSCRIPTION_INACTIVATED': {
          if (cobranca.tipo === 'assinatura') {
            await db.query(
              "UPDATE cobrancas SET status = 'cancelada', updated_at = now() WHERE id = $1",
              [cobranca.id],
            );
            await db.query('SELECT billing_definir_assinatura($1, $2)', [cobranca.id, 'cancelada']);
          }
          return 'cancelada';
        }
        default:
          return 'ignorado';
      }
    });
    await sendAccessEmail(config, fulfilment);
    return reply.send({ ok: true, resultado: outcome });
  });

  // -------------------------------------------------------------------------
  // Empresa: ver e contratar assinatura.
  // -------------------------------------------------------------------------
  app.get('/billing/minha-assinatura', async (request, reply) => {
    if (!requireRoles(reply, request, ['admin', 'operador'])) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const tenantId = request.user.tenantId;
    const subscription = await withTenant(
      pool,
      authContext(request),
      async (client) =>
        (
          await client.query(
            `SELECT ${statusEfetivoSql('a')} AS status,
                  a.inicio_em, a.fim_em, a.limites_snapshot AS limites,
                  p.slug, p.nome, p.preco_centavos, p.ciclo
             FROM assinaturas a JOIN planos p ON p.id = a.plano_id
            WHERE a.tenant_id = $1 ORDER BY a.created_at DESC LIMIT 1`,
            [tenantId],
          )
        ).rows[0] ?? null,
    );
    const pending =
      request.user.role === 'admin'
        ? await withBilling(
            pool,
            async (db) =>
              (
                await db.query(
                  `SELECT c.status, c.link_pagamento, p.nome AS plano
                   FROM cobrancas c JOIN planos p ON p.id = c.plano_id
                  WHERE c.tipo = 'assinatura' AND c.empresa_tenant_id = $1
                    AND c.status IN ('pendente', 'vencida')
                  ORDER BY c.created_at DESC LIMIT 1`,
                  [tenantId],
                )
              ).rows[0] ?? null,
          )
        : null;
    const plans = await withBilling(
      pool,
      async (db) =>
        (
          await db.query<PlanRow>(
            `SELECT ${PLAN_COLUMNS} FROM planos WHERE ativo AND tipo = 'assinatura' ORDER BY ordem, nome`,
          )
        ).rows,
    );
    return reply.send({
      vendas_ativas: billingOn(),
      assinatura: subscription,
      pode_testar: !subscription,
      pagamento_pendente: pending,
      planos: plans.map(publicPlan),
    });
  });

  app.post('/billing/assinar', async (request, reply) => {
    if (!requireRoles(reply, request, ['admin'])) return reply;
    const body = assinarBody.parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    try {
      const client = asaas();
      const tenantId = request.user.tenantId;
      const user = await withTenant(
        pool,
        authContext(request),
        async (db) =>
          (
            await db.query<{ nome: string; email: string }>(
              'SELECT nome, email FROM usuarios WHERE tenant_id = $1 AND id = $2',
              [tenantId, request.user.sub],
            )
          ).rows[0],
      );
      if (!user) return reply.code(404).send({ error: 'user_not_found' });

      const created = await withBilling(pool, async (db) => {
        const plan = (
          await db.query<PlanRow>(
            `SELECT ${PLAN_COLUMNS} FROM planos WHERE slug = $1 AND tipo = 'assinatura' AND ativo`,
            [body.plano],
          )
        ).rows[0];
        if (!plan || plan.preco_centavos <= 0 || plan.ciclo === 'unico') {
          throw new BillingError(404, 'plano_indisponivel', 'Este plano não está disponível.');
        }
        const open = (
          await db.query<{
            id: string;
            plano_id: string;
            status: string;
            link_pagamento: string | null;
          }>(
            `SELECT id, plano_id, status, link_pagamento FROM cobrancas
              WHERE tipo = 'assinatura' AND empresa_tenant_id = $1
                AND status IN ('pendente', 'paga', 'vencida') AND asaas_subscription_id IS NOT NULL
              ORDER BY created_at DESC LIMIT 1`,
            [tenantId],
          )
        ).rows[0];
        if (open) {
          if (open.plano_id === plan.id && open.status === 'pendente') {
            return { reuse: { link: open.link_pagamento }, plan, id: open.id, valor: 0 };
          }
          throw new BillingError(
            409,
            'assinatura_existente',
            'Sua conta já tem uma assinatura. Cancele a atual antes de contratar outro plano.',
          );
        }
        const coupon = body.cupom ? await resolverCupom(db, body.cupom, plan) : null;
        if (coupon && !coupon.ok) throw new BillingError(400, 'cupom_invalido', coupon.mensagem);
        const applied = coupon?.ok ? coupon.cupom : null;
        const valor = applied?.valor_final_centavos ?? plan.preco_centavos;
        const id = randomUUID();
        await db.query(
          `INSERT INTO cobrancas (id, tipo, plano_id, empresa_tenant_id, empresa_id, usuario_id, comprador_nome,
                                  comprador_email, documento_final, valor_centavos, cupom_codigo, desconto_centavos)
           VALUES ($1, 'assinatura', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            plan.id,
            tenantId,
            request.user.empresaId ?? null,
            request.user.sub,
            user.nome,
            user.email.toLowerCase(),
            onlyDigits(body.documento).slice(-4),
            valor,
            applied?.codigo ?? null,
            applied?.desconto_centavos ?? 0,
          ],
        );
        return { reuse: null, plan, id, valor };
      });
      if (created.reuse) return reply.send({ link_pagamento: created.reuse.link });

      let link: string | null = null;
      try {
        const customer = await client.createCustomer({
          name: user.nome,
          email: user.email,
          cpfCnpj: onlyDigits(body.documento),
          externalReference: created.id,
        });
        const subscription = await client.createSubscription({
          customer: customer.id,
          valueCents: created.valor,
          nextDueDate: asaasDate(new Date(), 1),
          cycle: created.plan.ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
          description: `Licite Comigo — ${created.plan.nome}`,
          externalReference: created.id,
        });
        const first = (await client.listSubscriptionPayments(subscription.id))[0];
        link = first?.invoiceUrl ?? null;
        await withBilling(pool, (db) =>
          db.query(
            `UPDATE cobrancas SET asaas_customer_id = $2, asaas_subscription_id = $3,
                    asaas_payment_id = $4, link_pagamento = $5, updated_at = now() WHERE id = $1`,
            [created.id, customer.id, subscription.id, first?.id ?? null, link],
          ),
        );
      } catch (error) {
        await withBilling(pool, (db) =>
          db.query(
            `UPDATE cobrancas SET status = 'cancelada', ultimo_evento = 'checkout_falhou', updated_at = now()
              WHERE id = $1`,
            [created.id],
          ),
        );
        throw error;
      }
      return reply.code(201).send({ link_pagamento: link });
    } catch (error) {
      return sendBillingError(reply, error);
    }
  });

  app.post('/billing/cancelar', async (request, reply) => {
    if (!requireRoles(reply, request, ['admin'])) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    try {
      const tenantId = request.user.tenantId;
      const target = await withBilling(
        pool,
        async (db) =>
          (
            await db.query<{ id: string; asaas_subscription_id: string | null }>(
              `SELECT id, asaas_subscription_id FROM cobrancas
              WHERE tipo = 'assinatura' AND empresa_tenant_id = $1
                AND status IN ('pendente', 'paga', 'vencida')
              ORDER BY created_at DESC LIMIT 1`,
              [tenantId],
            )
          ).rows[0],
      );
      if (!target) return reply.code(404).send({ error: 'assinatura_nao_encontrada' });
      if (target.asaas_subscription_id) {
        try {
          await asaas().cancelSubscription(target.asaas_subscription_id);
        } catch (error) {
          // Já removida no Asaas não deve impedir o cancelamento local.
          if (!(error instanceof AsaasError) || error.status >= 500) throw error;
        }
      }
      await withBilling(pool, async (db) => {
        await db.query(
          "UPDATE cobrancas SET status = 'cancelada', ultimo_evento = 'cancelada_pelo_cliente', updated_at = now() WHERE id = $1",
          [target.id],
        );
        await db.query('SELECT billing_definir_assinatura($1, $2)', [target.id, 'cancelada']);
      });
      return reply.send({ ok: true });
    } catch (error) {
      return sendBillingError(reply, error);
    }
  });

  // -------------------------------------------------------------------------
  // Administração: planos e financeiro.
  // -------------------------------------------------------------------------
  app.register(async (admin) => {
    admin.addHook('preHandler', async (request, reply) => {
      if (request.user.role !== 'plataforma') return reply.code(403).send({ error: 'forbidden' });
      if (!pool) return sendDatabaseUnavailable(reply);
    });

    admin.get('/admin/planos', async (request) =>
      withPlatform(pool!, request, 'billing.planos.read', async (client) => {
        const { modulo } = z.object({ modulo: moduloSchema.optional() }).parse(request.query);
        return {
          vendas_ativas: billingOn(),
          planos: (
            await client.query<PlanRow>(
              `SELECT ${PLAN_COLUMNS} FROM planos WHERE ($1::text IS NULL OR tipo = $1) ORDER BY ordem, nome`,
              [tipoDeCobrancaDoModulo(modulo)],
            )
          ).rows,
        };
      }),
    );

    admin.put('/admin/planos', async (request, reply) => {
      const body = planBody.parse(request.body);
      if (body.ativo && body.preco_centavos <= 0) {
        return reply.code(400).send({
          error: 'preco_obrigatorio',
          message: 'Defina um preço maior que zero para ativar o plano.',
        });
      }
      const saved = await withPlatform(
        pool!,
        request,
        'billing.plano.saved',
        async (client) =>
          (
            await client.query<PlanRow>(
              `INSERT INTO planos (slug, nome, descricao, tipo, preco_centavos, ciclo, beneficios, limites,
                                   turma_nome, ordem, trial_dias, ativo)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12)
               ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao,
                 tipo = EXCLUDED.tipo, preco_centavos = EXCLUDED.preco_centavos, ciclo = EXCLUDED.ciclo,
                 beneficios = EXCLUDED.beneficios, limites = EXCLUDED.limites, turma_nome = EXCLUDED.turma_nome,
                 ordem = EXCLUDED.ordem, trial_dias = EXCLUDED.trial_dias, ativo = EXCLUDED.ativo,
                 updated_at = now()
               RETURNING ${PLAN_COLUMNS}`,
              [
                body.slug,
                body.nome,
                body.descricao,
                body.tipo,
                body.preco_centavos,
                body.ciclo,
                JSON.stringify(body.beneficios),
                JSON.stringify(body.limites),
                body.turma_nome ?? null,
                body.ordem,
                body.trial_dias,
                body.ativo,
              ],
            )
          ).rows[0],
        { slug: body.slug, ativo: body.ativo },
      );
      return reply.send(saved);
    });

    admin.get('/admin/financeiro', async (request) =>
      withPlatform(pool!, request, 'billing.financeiro.read', async (client) => {
        // Cada módulo enxerga só o próprio dinheiro: `curso` (venda do curso) ou `profissional`
        // (assinaturas das empresas). Sem o parâmetro, soma os dois (comportamento anterior).
        const { modulo } = z.object({ modulo: moduloSchema.optional() }).parse(request.query);
        const tipo = tipoDeCobrancaDoModulo(modulo);
        const one = async (sql: string, params: unknown[] = []) =>
          (await client.query(sql, params)).rows[0];
        const receita = await one(
          `SELECT
             COALESCE(sum(pg.valor_centavos) FILTER (WHERE pg.pago_em >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'), 0)::bigint AS mes_centavos,
             COALESCE(sum(pg.valor_centavos) FILTER (WHERE pg.pago_em > now() - interval '30 days'), 0)::bigint AS d30_centavos,
             COALESCE(sum(pg.valor_centavos), 0)::bigint AS total_centavos,
             count(*)::int AS pagamentos
             FROM cobranca_pagamentos pg JOIN cobrancas c ON c.id = pg.cobranca_id
            WHERE pg.status IN ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'MANUAL')
              AND ($1::text IS NULL OR c.tipo = $1)`,
          [tipo],
        );
        const assinaturas = await one(
          `SELECT count(*) FILTER (WHERE c.status = 'paga')::int AS ativas,
                  count(*) FILTER (WHERE c.status = 'vencida')::int AS em_atraso,
                  count(*) FILTER (WHERE c.status = 'pendente')::int AS aguardando_pagamento,
                  COALESCE(sum(CASE WHEN c.status = 'paga' THEN
                    CASE WHEN p.ciclo = 'anual' THEN c.valor_centavos / 12.0 ELSE c.valor_centavos END END), 0)::bigint AS mrr_centavos
             FROM cobrancas c JOIN planos p ON p.id = c.plano_id WHERE c.tipo = 'assinatura'
              AND ($1::text IS NULL OR c.tipo = $1)`,
          [tipo],
        );
        const curso = await one(
          `SELECT count(*) FILTER (WHERE status = 'paga')::int AS vendidos,
                  count(*) FILTER (WHERE status = 'paga' AND pago_em > now() - interval '30 days')::int AS vendidos_30d,
                  count(*) FILTER (WHERE status IN ('pendente', 'vencida'))::int AS aguardando,
                  count(*) FILTER (WHERE status = 'paga' AND resultado_liberacao = 'revisar')::int AS a_revisar
             FROM cobrancas WHERE tipo = 'curso' AND ($1::text IS NULL OR tipo = $1)`,
          [tipo],
        );
        const funil = await one(
          `SELECT count(*)::int AS criadas,
                  count(*) FILTER (WHERE status = 'paga')::int AS pagas
             FROM cobrancas WHERE created_at > now() - interval '30 days' AND status <> 'cancelada'
              AND ($1::text IS NULL OR tipo = $1)`,
          [tipo],
        );
        const meses = (
          await client.query(
            `SELECT to_char(date_trunc('month', pg.pago_em AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS mes,
                    sum(pg.valor_centavos)::bigint AS centavos, count(*)::int AS pagamentos
               FROM cobranca_pagamentos pg JOIN cobrancas c ON c.id = pg.cobranca_id
              WHERE pg.status IN ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'MANUAL')
                AND pg.pago_em >= date_trunc('month', now()) - interval '5 months'
                AND ($1::text IS NULL OR c.tipo = $1)
              GROUP BY 1 ORDER BY 1`,
            [tipo],
          )
        ).rows;
        const recentes = (
          await client.query(
            `SELECT c.id, c.tipo, c.status, c.comprador_nome, c.comprador_email, c.valor_centavos,
                    c.created_at, c.pago_em, c.resultado_liberacao, p.nome AS plano
               FROM cobrancas c JOIN planos p ON p.id = c.plano_id
              WHERE ($1::text IS NULL OR c.tipo = $1)
              ORDER BY c.created_at DESC LIMIT 25`,
            [tipo],
          )
        ).rows;
        const base = (config.apiUrl ?? '').replace(/\/+$/, '');
        return {
          cobranca: {
            ligada: billingOn(),
            ambiente: config.asaasEnv,
            webhook_url: base ? `${base}/webhooks/asaas` : null,
          },
          receita,
          assinaturas,
          curso,
          funil_30d: funil,
          receita_por_mes: meses,
          recentes,
        };
      }),
    );

    // Pagamento fora do Asaas (Pix direto, por exemplo): a equipe confirma e libera o acesso.
    admin.post('/admin/cobrancas/:id/liberar-manual', async (request, reply) => {
      const { id } = z.object({ id: uuid }).parse(request.params);
      let fulfilment: Fulfilment = {};
      const result = await withPlatform(
        pool!,
        request,
        'billing.cobranca.manual',
        async (client) => {
          const cobranca = await findCobranca(client, { externalReference: id });
          if (!cobranca) return 'nao_encontrada' as const;
          if (cobranca.status === 'paga') return 'ja_paga' as const;
          if (cobranca.status === 'reembolsada' || cobranca.status === 'cancelada')
            return 'invalida' as const;
          await client.query(
            `INSERT INTO cobranca_pagamentos (cobranca_id, asaas_payment_id, status, valor_centavos, pago_em)
           VALUES ($1, $2, 'MANUAL', $3, now()) ON CONFLICT (asaas_payment_id) DO NOTHING`,
            [cobranca.id, `manual-${cobranca.id}`, cobranca.valor_centavos],
          );
          await client.query(
            `UPDATE cobrancas SET status = 'paga', pago_em = now(), ultimo_evento = 'liberacao_manual', updated_at = now()
            WHERE id = $1`,
            [cobranca.id],
          );
          const current = await findCobranca(client, { externalReference: cobranca.id });
          if (current) fulfilment = await fulfil(client, config, current);
          return 'ok' as const;
        },
      );
      if (result === 'nao_encontrada')
        return reply.code(404).send({ error: 'cobranca_nao_encontrada' });
      if (result === 'ja_paga') return reply.code(409).send({ error: 'cobranca_ja_paga' });
      if (result === 'invalida') return reply.code(409).send({ error: 'cobranca_invalida' });
      await sendAccessEmail(config, fulfilment);
      return reply.send({ ok: true });
    });
  });
}
