import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AsaasError, createAsaasClient, type AsaasClient } from './asaas.js';
import { PublicRateLimiter } from './auth-public.js';
import type { RuntimeConfig } from './config.js';
import { normalizeCupomCodigo, resolverCupom } from './cupom-calc.js';
import { moduloSchema, tipoDeCobrancaDoModulo } from './modulo.js';
import { withTenant } from './db.js';
import {
  audit,
  authContext,
  requireRoles,
  sendDatabaseUnavailable,
  withPlatform,
} from './request-context.js';
import { BillingError, sendBillingError, statusEfetivoSql, withBilling } from './billing.js';

/**
 * Teste grátis, cupons e gestão de assinantes (equipe da plataforma).
 * Complementa `billing.ts`; usa as mesmas regras de acesso e de banco.
 */

type Deps = { pool: Pool | undefined; config: RuntimeConfig; asaas?: AsaasClient };

const cupomBody = z
  .object({
    codigo: z
      .string()
      .trim()
      .transform(normalizeCupomCodigo)
      .pipe(z.string().regex(/^[A-Z0-9_-]{3,32}$/, 'Use de 3 a 32 letras, números, - ou _.')),
    descricao: z.string().trim().max(200).default(''),
    tipo: z.enum(['percentual', 'fixo']),
    valor: z.number().int().min(1).max(100_000_00),
    plano_slugs: z.array(z.string().trim().min(1).max(80)).max(20).nullable().default(null),
    max_usos: z.number().int().min(1).max(1_000_000).nullable().default(null),
    valido_ate: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida.')
      .nullable()
      .default(null),
    ativo: z.boolean().default(true),
  })
  .refine((body) => body.tipo !== 'percentual' || body.valor <= 95, {
    message: 'O desconto percentual vai de 1% a 95%.',
    path: ['valor'],
  });

export function registerBillingExtras(app: FastifyInstance, deps: Deps): void {
  const { pool, config } = deps;
  const validateLimiter = new PublicRateLimiter(20);
  let asaasClient = deps.asaas;
  const asaasOrNull = (): AsaasClient | null => {
    if (!config.billingEnabled && !deps.asaas) return null;
    asaasClient ??= createAsaasClient(config);
    return asaasClient;
  };

  // Pré-visualização do cupom (público: o visitante vê o valor antes de pagar).
  app.post('/public/cupom/validar', async (request, reply) => {
    validateLimiter.check(`cupom:${request.ip}`);
    const body = z
      .object({ codigo: z.string().trim().min(1).max(40), plano: z.string().trim().min(1).max(80) })
      .parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withBilling(pool, async (db) => {
      const plan = (
        await db.query<{ slug: string; preco_centavos: number }>(
          'SELECT slug, preco_centavos FROM planos WHERE slug = $1 AND ativo',
          [body.plano],
        )
      ).rows[0];
      if (!plan) return { ok: false as const, mensagem: 'Plano indisponível.' };
      const resolved = await resolverCupom(db, body.codigo, plan);
      return resolved.ok
        ? { ok: true as const, cupom: resolved.cupom, valor_original_centavos: plan.preco_centavos }
        : resolved;
    });
    if (!result.ok) return reply.send({ valido: false, mensagem: result.mensagem });
    return reply.send({
      valido: true,
      codigo: result.cupom.codigo,
      descricao: result.cupom.descricao,
      desconto_centavos: result.cupom.desconto_centavos,
      valor_original_centavos: result.valor_original_centavos,
      valor_final_centavos: result.cupom.valor_final_centavos,
    });
  });

  // Empresa começa o teste grátis (uma vez por conta, sem cartão e sem cobrança).
  app.post('/billing/teste-gratis', async (request, reply) => {
    if (!requireRoles(reply, request, ['admin'])) return reply;
    const body = z.object({ plano: z.string().trim().min(1).max(80) }).parse(request.body);
    if (!pool) return sendDatabaseUnavailable(reply);
    try {
      const result = await withTenant(pool, authContext(request), async (client) => {
        const row = (
          await client.query<{ r: string }>('SELECT billing_iniciar_teste($1) AS r', [body.plano])
        ).rows[0];
        if (row?.r === 'ok') {
          await audit(client, request, 'billing.trial.started', 'assinatura', null, {
            plano: body.plano,
          });
        }
        return row?.r ?? 'plano_sem_teste';
      });
      if (result === 'plano_sem_teste') {
        throw new BillingError(404, 'plano_sem_teste', 'Este plano não tem teste grátis.');
      }
      if (result === 'ja_teve_assinatura') {
        throw new BillingError(
          409,
          'ja_teve_assinatura',
          'Esta conta já usou o teste grátis ou já tem plano.',
        );
      }
      return reply.code(201).send({ ok: true });
    } catch (error) {
      return sendBillingError(reply, error);
    }
  });

  app.register(async (admin) => {
    admin.addHook('preHandler', async (request, reply) => {
      if (request.user.role !== 'plataforma') return reply.code(403).send({ error: 'forbidden' });
      if (!pool) return sendDatabaseUnavailable(reply);
    });

    admin.get('/admin/assinantes', async (request) =>
      withPlatform(pool!, request, 'billing.assinantes.read', async (client) => {
        const rows = (
          await client.query(
            `SELECT a.id, a.tenant_id, t.nome AS cliente,
                    (SELECT e.razao_social FROM empresas e WHERE e.tenant_id = a.tenant_id
                      ORDER BY e.created_at LIMIT 1) AS empresa,
                    (SELECT u.email FROM usuarios u WHERE u.tenant_id = a.tenant_id AND u.papel::text = 'admin'
                      ORDER BY u.created_at LIMIT 1) AS contato,
                    p.nome AS plano, p.preco_centavos, p.ciclo,
                    ${statusEfetivoSql('a')} AS status,
                    a.inicio_em, a.fim_em,
                    (SELECT COALESCE(sum(cp.valor_centavos), 0)::bigint
                       FROM cobranca_pagamentos cp JOIN cobrancas c ON c.id = cp.cobranca_id
                      WHERE c.empresa_tenant_id = a.tenant_id
                        AND cp.status IN ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'MANUAL')) AS pago_centavos,
                    (SELECT c.cupom_codigo FROM cobrancas c
                      WHERE c.empresa_tenant_id = a.tenant_id AND c.tipo = 'assinatura'
                      ORDER BY c.created_at DESC LIMIT 1) AS cupom
               FROM assinaturas a
               JOIN tenants t ON t.id = a.tenant_id
               JOIN planos p ON p.id = a.plano_id
              ORDER BY a.created_at DESC LIMIT 300`,
          )
        ).rows as Array<{ status: string; fim_em: Date | null }>;
        const now = Date.now();
        const count = (status: string) => rows.filter((row) => row.status === status).length;
        return {
          resumo: {
            total: rows.length,
            ativas: count('ativa'),
            em_teste: count('trial'),
            teste_vencendo_3d: rows.filter(
              (row) =>
                row.status === 'trial' &&
                row.fim_em !== null &&
                new Date(row.fim_em).getTime() - now < 3 * 86_400_000,
            ).length,
            em_atraso: count('past_due'),
            encerradas: count('cancelada') + count('expirada'),
          },
          assinantes: rows,
        };
      }),
    );

    admin.post('/admin/assinaturas/:id/ajustar', async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z
        .object({
          acao: z.enum(['estender', 'cancelar', 'reativar']),
          dias: z.number().int().min(1).max(365).optional(),
        })
        .parse(request.body);
      const result = await withPlatform(
        pool!,
        request,
        'billing.assinatura.ajustada',
        async (client) => {
          if (body.acao === 'cancelar') {
            const sub = (
              await client.query<{ tenant_id: string }>(
                'SELECT tenant_id FROM assinaturas WHERE id = $1',
                [id],
              )
            ).rows[0];
            if (sub) {
              const charge = (
                await client.query<{ id: string; asaas_subscription_id: string | null }>(
                  `SELECT id, asaas_subscription_id FROM cobrancas
                    WHERE tipo = 'assinatura' AND empresa_tenant_id = $1
                      AND status IN ('pendente', 'paga', 'vencida')
                    ORDER BY created_at DESC LIMIT 1`,
                  [sub.tenant_id],
                )
              ).rows[0];
              if (charge?.asaas_subscription_id) {
                const gateway = asaasOrNull();
                if (gateway) {
                  try {
                    await gateway.cancelSubscription(charge.asaas_subscription_id);
                  } catch (error) {
                    if (!(error instanceof AsaasError) || error.status >= 500) throw error;
                  }
                }
              }
              if (charge) {
                await client.query(
                  `UPDATE cobrancas SET status = 'cancelada', ultimo_evento = 'cancelada_pela_equipe',
                          updated_at = now() WHERE id = $1`,
                  [charge.id],
                );
              }
            }
          }
          return (
            await client.query<{ r: string }>('SELECT admin_ajustar_assinatura($1, $2, $3) AS r', [
              id,
              body.acao,
              body.dias ?? null,
            ])
          ).rows[0]?.r;
        },
        { acao: body.acao, dias: body.dias ?? null, assinatura: id },
      );
      if (result === 'nao_encontrada')
        return reply.code(404).send({ error: 'assinatura_nao_encontrada' });
      if (result === 'dias_invalidos') {
        return reply
          .code(400)
          .send({ error: 'dias_invalidos', message: 'Informe de 1 a 365 dias.' });
      }
      if (result === 'so_teste') {
        return reply.code(409).send({
          error: 'so_teste',
          message: 'Só é possível estender um teste grátis ou uma assinatura expirada.',
        });
      }
      return reply.send({ ok: true });
    });

    admin.get('/admin/cupons', async (request) =>
      withPlatform(pool!, request, 'billing.cupons.read', async (client) => {
        // Cada módulo vê os cupons dos próprios planos. Cupom antigo "para todos os planos"
        // (sem lista) aparece nos dois, para nenhum se perder.
        const { modulo } = z.object({ modulo: moduloSchema.optional() }).parse(request.query);
        const tipo = tipoDeCobrancaDoModulo(modulo);
        return {
          cupons: (
            await client.query(
              `SELECT c.id, c.codigo, c.descricao, c.tipo, c.valor, c.plano_slugs, c.max_usos, c.valido_ate,
                      c.ativo, c.created_at,
                      (SELECT count(*)::int FROM cobrancas b
                        WHERE b.cupom_codigo = c.codigo AND b.status IN ('pendente', 'paga')) AS usos,
                      (SELECT count(*)::int FROM cobrancas b
                        WHERE b.cupom_codigo = c.codigo AND b.status = 'paga') AS pagos
                 FROM cupons c
                WHERE ($1::text IS NULL OR c.plano_slugs IS NULL
                       OR c.plano_slugs && COALESCE((SELECT array_agg(slug) FROM planos WHERE tipo = $1), '{}'::text[]))
                ORDER BY c.created_at DESC LIMIT 200`,
              [tipo],
            )
          ).rows,
          planos: (
            await client.query<{ slug: string; nome: string }>(
              'SELECT slug, nome FROM planos WHERE ($1::text IS NULL OR tipo = $1) ORDER BY ordem, nome',
              [tipo],
            )
          ).rows,
        };
      }),
    );

    admin.put('/admin/cupons', async (request, reply) => {
      const body = cupomBody.parse(request.body);
      const { modulo } = z.object({ modulo: moduloSchema.optional() }).parse(request.query);
      const tipoModulo = tipoDeCobrancaDoModulo(modulo);
      if (tipoModulo) {
        // Cupom criado dentro de um módulo só vale para planos daquele módulo.
        const doModulo = await withPlatform(
          pool!,
          request,
          'billing.cupom.escopo',
          async (client) =>
            (
              await client.query<{ slug: string }>('SELECT slug FROM planos WHERE tipo = $1', [
                tipoModulo,
              ])
            ).rows.map((row) => row.slug),
        );
        if (!body.plano_slugs || body.plano_slugs.length === 0) {
          body.plano_slugs = doModulo;
        } else if (body.plano_slugs.some((slug) => !doModulo.includes(slug))) {
          return reply.code(400).send({
            error: 'plano_de_outro_modulo',
            message: 'O cupom só pode valer para planos deste módulo.',
          });
        }
      }
      const saved = await withPlatform(
        pool!,
        request,
        'billing.cupom.saved',
        async (client) =>
          (
            await client.query(
              `INSERT INTO cupons (codigo, descricao, tipo, valor, plano_slugs, max_usos, valido_ate, ativo)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao, tipo = EXCLUDED.tipo,
                 valor = EXCLUDED.valor, plano_slugs = EXCLUDED.plano_slugs, max_usos = EXCLUDED.max_usos,
                 valido_ate = EXCLUDED.valido_ate, ativo = EXCLUDED.ativo, updated_at = now()
               RETURNING id, codigo, tipo, valor, ativo`,
              [
                body.codigo,
                body.descricao,
                body.tipo,
                body.valor,
                body.plano_slugs && body.plano_slugs.length ? body.plano_slugs : null,
                body.max_usos,
                body.valido_ate,
                body.ativo,
              ],
            )
          ).rows[0],
        { codigo: body.codigo, ativo: body.ativo },
      );
      return reply.send(saved);
    });
  });
}
