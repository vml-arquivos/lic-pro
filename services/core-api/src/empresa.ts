import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { CHECKLIST_MODELS, modelByCode, suggestModel } from './checklist-models.js';
import { withTenant } from './db.js';
import { nextSteps } from './next-steps.js';
import {
  audit,
  authContext,
  requireRoles,
  sendDatabaseUnavailable,
  type DbClient,
} from './request-context.js';

type Deps = { pool: Pool | undefined };

const COMPANY = ['plataforma', 'admin', 'operador'] as const;
const uuid = z.string().uuid();
const idParams = z.object({ id: uuid });

export const OPPORTUNITY_STATUS = [
  'salva',
  'triagem',
  'em_analise',
  'em_habilitacao',
  'decidida',
  'proposta',
  'arquivada',
  'ganha',
  'perdida',
] as const;
const statusSchema = z.enum(OPPORTUNITY_STATUS);
const decisionSchema = z.enum(['participar', 'nao_participar']);
const MIN_REASON = 5;

const opportunityCreate = z.object({
  empresa_id: uuid.optional(),
  edital_id: uuid,
  status: statusSchema.default('salva'),
  observacoes: z.string().max(5000).optional(),
});
const opportunityPatch = z.object({
  status: statusSchema.optional(),
  observacoes: z.string().max(5000).optional(),
  decisao: decisionSchema.optional(),
  motivo_decisao: z.string().trim().max(1000).optional(),
});
const opportunityList = z.object({
  empresa_id: uuid.optional(),
  status: statusSchema.optional(),
  decisao: decisionSchema.optional(),
});

const DOC_TYPES = [
  'contrato_social',
  'certidao_federal',
  'certidao_fgts',
  'certidao_trabalhista',
  'certidao_estadual',
  'certidao_municipal',
  'certidao_falencia',
  'balanco',
  'atestado_capacidade',
  'declaracao',
  'outro',
] as const;
const dateOnly = z.string().date();
const docBody = z.object({
  tipo: z.enum(DOC_TYPES),
  nome: z.string().trim().min(2).max(200),
  numero: z.string().trim().max(120).nullable().optional(),
  emitido_em: dateOnly.nullable().optional(),
  valido_ate: dateOnly.nullable().optional(),
  link_url: z.string().url().max(500).nullable().optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
});

const deadlineTypes = z.enum([
  'abertura_propostas',
  'encerramento_propostas',
  'esclarecimento',
  'impugnacao',
  'entrega_documentos',
  'outro',
]);
const deadlineBody = z.object({
  oportunidade_id: uuid.nullable().optional(),
  titulo: z.string().trim().min(2).max(200),
  tipo: deadlineTypes.default('outro'),
  vence_em: z.string().datetime({ offset: true }),
});
const taskBody = z.object({
  oportunidade_id: uuid.nullable().optional(),
  titulo: z.string().trim().min(2).max(200),
  descricao: z.string().trim().max(2000).nullable().optional(),
  prioridade: z.enum(['baixa', 'normal', 'alta', 'urgente']).default('normal'),
  vence_em: z.string().datetime({ offset: true }).nullable().optional(),
});
const itemBody = z.object({
  titulo: z.string().trim().min(2).max(300),
  descricao: z.string().trim().max(1000).nullable().optional(),
  obrigatorio: z.boolean().optional(),
});
const itemPatch = z.object({
  titulo: z.string().trim().min(2).max(300).optional(),
  descricao: z.string().trim().max(1000).nullable().optional(),
  obrigatorio: z.boolean().optional(),
  concluido: z.boolean().optional(),
  evidencia_url: z.string().url().max(500).nullable().optional(),
});

/** A empresa da conta (uma conta, uma empresa). Aceita escolher uma quando há mais de uma. */
async function resolveCompany(
  client: DbClient,
  request: FastifyRequest,
  explicit?: string | undefined,
): Promise<string | null> {
  const wanted = explicit ?? request.user.empresaId ?? null;
  const result = await client.query<{ id: string }>(
    `SELECT id FROM empresas
      WHERE tenant_id = $1 AND ativo AND ($2::uuid IS NULL OR id = $2)
      ORDER BY created_at LIMIT 1`,
    [request.user.tenantId, wanted],
  );
  return result.rows[0]?.id ?? null;
}

async function recordHistory(
  client: DbClient,
  request: FastifyRequest,
  row: { tenant_id: string; empresa_id: string; oportunidade_id: string },
  entry: {
    tipo: 'criada' | 'etapa' | 'decisao' | 'nota';
    de?: string | null;
    para?: string | null;
    decisao?: string | null;
    motivo?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO oportunidade_historico
       (tenant_id, empresa_id, oportunidade_id, usuario_id, tipo, de_status, para_status, decisao, motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.tenant_id,
      row.empresa_id,
      row.oportunidade_id,
      request.user.sub,
      entry.tipo,
      entry.de ?? null,
      entry.para ?? null,
      entry.decisao ?? null,
      entry.motivo ?? null,
    ],
  );
}

export function registerCompanyRoutes(app: FastifyInstance, { pool }: Deps): void {
  const guard = (request: FastifyRequest, reply: Parameters<typeof requireRoles>[0]) =>
    requireRoles(reply, request, COMPANY);

  // -------------------------------------------------------------- Pipeline

  app.get('/opportunities', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const filters = opportunityList.parse(request.query);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT o.id, o.empresa_id, o.edital_id, o.status, o.decisao, o.motivo_decisao, o.decidida_em,
                o.observacoes, o.origem, o.created_at, o.updated_at,
                e.titulo, e.orgao, e.uf, e.modalidade, e.valor_estimado, e.data_publicacao,
                e.data_encerramento_proposta,
                (SELECT min(p.vence_em) FROM prazos_agenda p
                  WHERE p.oportunidade_id = o.id AND p.status = 'aberto' AND p.vence_em >= now()) AS proximo_prazo,
                (SELECT count(*) FROM checklist_itens ci JOIN checklists c ON c.id = ci.checklist_id
                  WHERE c.oportunidade_id = o.id)::int AS checklist_itens,
                (SELECT count(*) FROM checklist_itens ci JOIN checklists c ON c.id = ci.checklist_id
                  WHERE c.oportunidade_id = o.id AND ci.concluido)::int AS checklist_concluidos
           FROM oportunidades_salvas o
           JOIN editais e ON e.id = o.edital_id
          WHERE o.tenant_id = $1
            AND ($2::uuid IS NULL OR o.empresa_id = $2)
            AND ($3::text IS NULL OR o.status = $3)
            AND ($4::text IS NULL OR o.decisao = $4)
          ORDER BY o.updated_at DESC LIMIT 500`,
        [
          request.user.tenantId,
          filters.empresa_id ?? null,
          filters.status ?? null,
          filters.decisao ?? null,
        ],
      ),
    );
    return reply.send({ data: result.rows });
  });

  app.post('/opportunities', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const body = opportunityCreate.parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const empresaId = await resolveCompany(client, request, body.empresa_id);
      if (!empresaId) return 'company' as const;
      const edital = await client.query<{
        data_abertura_proposta: string | null;
        data_encerramento_proposta: string | null;
      }>('SELECT data_abertura_proposta, data_encerramento_proposta FROM editais WHERE id = $1', [
        body.edital_id,
      ]);
      if (!edital.rows[0]) return 'edital' as const;
      const existing = await client.query<{ id: string; status: string }>(
        'SELECT id, status FROM oportunidades_salvas WHERE tenant_id = $1 AND empresa_id = $2 AND edital_id = $3',
        [request.user.tenantId, empresaId, body.edital_id],
      );
      const inserted = await client.query(
        `INSERT INTO oportunidades_salvas (tenant_id, empresa_id, usuario_id, edital_id, status, observacoes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, empresa_id, edital_id) DO UPDATE SET
           observacoes = coalesce(EXCLUDED.observacoes, oportunidades_salvas.observacoes), updated_at = now()
         RETURNING id, tenant_id, empresa_id, usuario_id, edital_id, status, decisao, observacoes, origem, created_at, updated_at`,
        [
          request.user.tenantId,
          empresaId,
          request.user.sub,
          body.edital_id,
          body.status,
          body.observacoes ?? null,
        ],
      );
      const row = inserted.rows[0];
      const scope = { tenant_id: row.tenant_id, empresa_id: empresaId, oportunidade_id: row.id };
      if (!existing.rows[0]) {
        await recordHistory(client, request, scope, { tipo: 'criada', para: row.status });
        const dates: Array<[string, string, string | null]> = [
          ['abertura_propostas', 'Abertura das propostas', edital.rows[0].data_abertura_proposta],
          [
            'encerramento_propostas',
            'Encerramento das propostas',
            edital.rows[0].data_encerramento_proposta,
          ],
        ];
        for (const [tipo, titulo, date] of dates) {
          if (!date) continue;
          await client.query(
            `INSERT INTO prazos_agenda (tenant_id, empresa_id, oportunidade_id, titulo, tipo, vence_em, fonte)
             VALUES ($1, $2, $3, $4, $5, $6, 'edital')
             ON CONFLICT (oportunidade_id, tipo) WHERE fonte = 'edital' DO NOTHING`,
            [row.tenant_id, empresaId, row.id, titulo, tipo, date],
          );
        }
      }
      await audit(client, request, 'oportunidade.saved', 'oportunidade', row.id, {
        edital_id: body.edital_id,
        empresa_id: empresaId,
      });
      return row;
    });
    if (result === 'company')
      return reply.code(409).send({
        error: 'company_required',
        message: 'Cadastre os dados da empresa antes de salvar oportunidades.',
      });
    if (result === 'edital') return reply.code(404).send({ error: 'edital_not_found' });
    return reply.code(201).send(result);
  });

  app.get('/opportunities/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const tenantId = request.user.tenantId;
      const opportunity = await client.query(
        `SELECT o.id, o.empresa_id, o.edital_id, o.status, o.decisao, o.motivo_decisao, o.decidida_em,
                o.observacoes, o.origem, o.created_at, o.updated_at,
                e.titulo, e.orgao, e.uf, e.municipio_nome, e.modalidade, e.valor_estimado, e.situacao,
                e.data_publicacao, e.data_abertura_proposta, e.data_encerramento_proposta, e.url_origem
           FROM oportunidades_salvas o JOIN editais e ON e.id = o.edital_id
          WHERE o.id = $1 AND o.tenant_id = $2`,
        [id, tenantId],
      );
      if (!opportunity.rows[0]) return null;
      const checklists = await client.query(
        `SELECT c.id, c.titulo, c.tipo,
                coalesce(json_agg(json_build_object(
                  'id', ci.id, 'titulo', ci.titulo, 'descricao', ci.descricao,
                  'obrigatorio', ci.obrigatorio, 'concluido', ci.concluido, 'evidencia_url', ci.evidencia_url
                ) ORDER BY ci.ordem, ci.id) FILTER (WHERE ci.id IS NOT NULL), '[]'::json) AS itens
           FROM checklists c LEFT JOIN checklist_itens ci ON ci.checklist_id = c.id
          WHERE c.oportunidade_id = $1 AND c.tenant_id = $2 GROUP BY c.id ORDER BY c.created_at`,
        [id, tenantId],
      );
      const deadlines = await client.query(
        `SELECT id, titulo, tipo, vence_em, status, fonte FROM prazos_agenda
          WHERE oportunidade_id = $1 AND tenant_id = $2 ORDER BY vence_em`,
        [id, tenantId],
      );
      const tasks = await client.query(
        `SELECT id, titulo, descricao, prioridade, status, vence_em FROM tarefas
          WHERE oportunidade_id = $1 AND tenant_id = $2 ORDER BY status, vence_em NULLS LAST`,
        [id, tenantId],
      );
      const history = await client.query(
        `SELECT h.id, h.tipo, h.de_status, h.para_status, h.decisao, h.motivo, h.created_at, u.nome AS autor
           FROM oportunidade_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
          WHERE h.oportunidade_id = $1 AND h.tenant_id = $2 ORDER BY h.created_at DESC, h.id`,
        [id, tenantId],
      );
      return {
        oportunidade: opportunity.rows[0],
        checklists: checklists.rows,
        prazos: deadlines.rows,
        tarefas: tasks.rows,
        historico: history.rows,
        modelo_sugerido: suggestModel(opportunity.rows[0].modalidade),
      };
    });
    if (!result) return reply.code(404).send({ error: 'opportunity_not_found' });
    return reply.send(result);
  });

  app.patch('/opportunities/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    const body = opportunityPatch.parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const current = await client.query<{
        tenant_id: string;
        empresa_id: string;
        status: string;
        decisao: string | null;
      }>(
        'SELECT tenant_id, empresa_id, status, decisao FROM oportunidades_salvas WHERE id = $1 AND tenant_id = $2',
        [id, request.user.tenantId],
      );
      const row = current.rows[0];
      if (!row) return 'missing' as const;
      const nextStatus = body.status ?? row.status;
      const deciding = nextStatus === 'decidida' || body.decisao !== undefined;
      if (nextStatus === 'decidida' || body.decisao !== undefined) {
        const decision = body.decisao ?? row.decisao;
        if (!decision || (body.motivo_decisao ?? '').trim().length < MIN_REASON)
          return 'reason' as const;
      }
      const updated = await client.query(
        `UPDATE oportunidades_salvas SET
            status = $3,
            observacoes = coalesce($4, observacoes),
            decisao = CASE WHEN $5::boolean THEN coalesce($6, decisao) ELSE decisao END,
            motivo_decisao = CASE WHEN $5::boolean THEN $7 ELSE motivo_decisao END,
            decidida_em = CASE WHEN $5::boolean THEN now() ELSE decidida_em END,
            updated_at = now()
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, empresa_id, edital_id, status, decisao, motivo_decisao, decidida_em, observacoes, updated_at`,
        [
          id,
          request.user.tenantId,
          nextStatus,
          body.observacoes ?? null,
          deciding,
          body.decisao ?? null,
          body.motivo_decisao ?? null,
        ],
      );
      const scope = { tenant_id: row.tenant_id, empresa_id: row.empresa_id, oportunidade_id: id };
      if (nextStatus !== row.status)
        await recordHistory(client, request, scope, {
          tipo: 'etapa',
          de: row.status,
          para: nextStatus,
        });
      if (deciding)
        await recordHistory(client, request, scope, {
          tipo: 'decisao',
          decisao: updated.rows[0].decisao,
          motivo: body.motivo_decisao ?? null,
          para: nextStatus,
        });
      await audit(client, request, 'oportunidade.updated', 'oportunidade', id, {
        status: nextStatus,
        decisao: updated.rows[0].decisao,
      });
      return updated.rows[0];
    });
    if (result === 'missing') return reply.code(404).send({ error: 'opportunity_not_found' });
    if (result === 'reason')
      return reply.code(400).send({
        error: 'decision_reason_required',
        message:
          'Para decidir, escolha participar ou não participar e escreva o motivo (mínimo de 5 letras).',
      });
    return reply.send(result);
  });

  app.delete('/opportunities/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const removed = await withTenant(pool, authContext(request), async (client) => {
      const result = await client.query(
        'DELETE FROM oportunidades_salvas WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, request.user.tenantId],
      );
      if (result.rows[0]) await audit(client, request, 'oportunidade.removed', 'oportunidade', id);
      return result.rows[0];
    });
    if (!removed) return reply.code(404).send({ error: 'opportunity_not_found' });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------ Checklists

  app.get('/checklist-models', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    return reply.send({
      data: CHECKLIST_MODELS.map((model) => ({
        codigo: model.codigo,
        nome: model.nome,
        descricao: model.descricao,
        itens: model.itens.length,
      })),
      aviso:
        'Modelos de apoio. Cada edital pode pedir mais ou menos: confira o edital e edite a lista.',
    });
  });

  app.post('/opportunities/:id/checklists', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    const body = z
      .object({
        modelo: z.string().max(40).default('generico'),
        titulo: z.string().trim().min(2).max(200).optional(),
      })
      .parse(request.body ?? {});
    const model = modelByCode(body.modelo);
    if (!model) return reply.code(400).send({ error: 'unknown_model' });
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const opportunity = await client.query<{ empresa_id: string }>(
        'SELECT empresa_id FROM oportunidades_salvas WHERE id = $1 AND tenant_id = $2',
        [id, request.user.tenantId],
      );
      if (!opportunity.rows[0]) return null;
      const empresaId = opportunity.rows[0].empresa_id;
      const created = await client.query<{ id: string }>(
        `INSERT INTO checklists (tenant_id, empresa_id, oportunidade_id, titulo, tipo)
         VALUES ($1, $2, $3, $4, 'habilitacao') RETURNING id`,
        [request.user.tenantId, empresaId, id, body.titulo ?? `Habilitação — ${model.nome}`],
      );
      let ordem = 0;
      for (const item of model.itens) {
        ordem += 1;
        await client.query(
          `INSERT INTO checklist_itens (tenant_id, empresa_id, checklist_id, titulo, descricao, obrigatorio, ordem)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            request.user.tenantId,
            empresaId,
            created.rows[0]!.id,
            item.titulo,
            item.descricao ?? null,
            item.obrigatorio ?? true,
            ordem,
          ],
        );
      }
      await audit(client, request, 'checklist.created', 'checklist', created.rows[0]!.id, {
        modelo: model.codigo,
      });
      return { id: created.rows[0]!.id, itens: model.itens.length };
    });
    if (!result) return reply.code(404).send({ error: 'opportunity_not_found' });
    return reply.code(201).send(result);
  });

  app.delete('/checklists/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const removed = await withTenant(pool, authContext(request), async (client) => {
      await client.query('DELETE FROM checklist_itens WHERE checklist_id = $1 AND tenant_id = $2', [
        id,
        request.user.tenantId,
      ]);
      const result = await client.query(
        'DELETE FROM checklists WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, request.user.tenantId],
      );
      return result.rows[0];
    });
    if (!removed) return reply.code(404).send({ error: 'checklist_not_found' });
    return reply.code(204).send();
  });

  app.post('/checklists/:id/items', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    const body = itemBody.parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const created = await withTenant(pool, authContext(request), async (client) => {
      const checklist = await client.query<{ empresa_id: string }>(
        'SELECT empresa_id FROM checklists WHERE id = $1 AND tenant_id = $2',
        [id, request.user.tenantId],
      );
      if (!checklist.rows[0]) return null;
      const result = await client.query(
        `INSERT INTO checklist_itens (tenant_id, empresa_id, checklist_id, titulo, descricao, obrigatorio, atualizado_por, ordem)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 (SELECT coalesce(max(ordem), 0) + 1 FROM checklist_itens WHERE checklist_id = $3))
         RETURNING id, titulo, descricao, obrigatorio, concluido, evidencia_url`,
        [
          request.user.tenantId,
          checklist.rows[0].empresa_id,
          id,
          body.titulo,
          body.descricao ?? null,
          body.obrigatorio ?? true,
          request.user.sub,
        ],
      );
      return result.rows[0];
    });
    if (!created) return reply.code(404).send({ error: 'checklist_not_found' });
    return reply.code(201).send(created);
  });

  app.patch('/checklist-items/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    const body = itemPatch.parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const updated = await withTenant(pool, authContext(request), async (client) => {
      const result = await client.query(
        `UPDATE checklist_itens SET
            titulo = coalesce($3, titulo),
            descricao = CASE WHEN $4::boolean THEN $5 ELSE descricao END,
            obrigatorio = coalesce($6, obrigatorio),
            concluido = coalesce($7, concluido),
            evidencia_url = CASE WHEN $8::boolean THEN $9 ELSE evidencia_url END,
            atualizado_por = $10, updated_at = now()
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, titulo, descricao, obrigatorio, concluido, evidencia_url`,
        [
          id,
          request.user.tenantId,
          body.titulo ?? null,
          body.descricao !== undefined,
          body.descricao ?? null,
          body.obrigatorio ?? null,
          body.concluido ?? null,
          body.evidencia_url !== undefined,
          body.evidencia_url ?? null,
          request.user.sub,
        ],
      );
      return result.rows[0];
    });
    if (!updated) return reply.code(404).send({ error: 'item_not_found' });
    return reply.send(updated);
  });

  app.delete('/checklist-items/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const removed = await withTenant(
      pool,
      authContext(request),
      async (client) =>
        (
          await client.query(
            'DELETE FROM checklist_itens WHERE id = $1 AND tenant_id = $2 RETURNING id',
            [id, request.user.tenantId],
          )
        ).rows[0],
    );
    if (!removed) return reply.code(404).send({ error: 'item_not_found' });
    return reply.code(204).send();
  });

  // ------------------------------------------------------ Agenda e tarefas

  app.get('/agenda', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const query = z
      .object({
        dias: z.coerce.number().int().min(1).max(365).default(60),
        incluir_concluidos: z
          .preprocess((v) => v === 'true' || v === true, z.boolean())
          .default(false),
      })
      .parse(request.query);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const deadlines = await client.query(
        `SELECT p.id, p.titulo, p.tipo, p.vence_em, p.status, p.fonte, p.oportunidade_id,
                e.titulo AS edital_titulo
           FROM prazos_agenda p
           LEFT JOIN oportunidades_salvas o ON o.id = p.oportunidade_id
           LEFT JOIN editais e ON e.id = o.edital_id
          WHERE p.tenant_id = $1
            AND p.vence_em <= now() + ($2::int * interval '1 day')
            AND ($3::boolean OR p.status = 'aberto')
            AND ($3::boolean OR p.vence_em >= now() - interval '7 days')
          ORDER BY p.vence_em LIMIT 500`,
        [request.user.tenantId, query.dias, query.incluir_concluidos],
      );
      const tasks = await client.query(
        `SELECT t.id, t.titulo, t.descricao, t.prioridade, t.status, t.vence_em, t.oportunidade_id,
                e.titulo AS edital_titulo
           FROM tarefas t
           LEFT JOIN oportunidades_salvas o ON o.id = t.oportunidade_id
           LEFT JOIN editais e ON e.id = o.edital_id
          WHERE t.tenant_id = $1 AND ($2::boolean OR t.status IN ('aberta', 'em_andamento'))
          ORDER BY t.vence_em NULLS LAST, t.created_at LIMIT 500`,
        [request.user.tenantId, query.incluir_concluidos],
      );
      return { prazos: deadlines.rows, tarefas: tasks.rows };
    });
    return reply.send(result);
  });

  app.post('/agenda/prazos', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const body = deadlineBody.parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const created = await withTenant(pool, authContext(request), async (client) => {
      const empresaId = await resolveCompany(client, request);
      if (!empresaId) return null;
      if (body.oportunidade_id) {
        const owned = await client.query(
          'SELECT 1 FROM oportunidades_salvas WHERE id = $1 AND tenant_id = $2 AND empresa_id = $3',
          [body.oportunidade_id, request.user.tenantId, empresaId],
        );
        if (!owned.rows[0]) return 'opportunity' as const;
      }
      const result = await client.query(
        `INSERT INTO prazos_agenda (tenant_id, empresa_id, oportunidade_id, titulo, tipo, vence_em, fonte)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual')
         RETURNING id, titulo, tipo, vence_em, status, fonte, oportunidade_id`,
        [
          request.user.tenantId,
          empresaId,
          body.oportunidade_id ?? null,
          body.titulo,
          body.tipo,
          body.vence_em,
        ],
      );
      await audit(client, request, 'agenda.deadline_created', 'prazo', result.rows[0].id);
      return result.rows[0];
    });
    if (created === null)
      return reply
        .code(409)
        .send({ error: 'company_required', message: 'Cadastre os dados da empresa primeiro.' });
    if (created === 'opportunity') return reply.code(404).send({ error: 'opportunity_not_found' });
    return reply.code(201).send(created);
  });

  app.patch('/agenda/prazos/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    const body = z
      .object({
        titulo: z.string().trim().min(2).max(200).optional(),
        vence_em: z.string().datetime({ offset: true }).optional(),
        status: z.enum(['aberto', 'concluido', 'cancelado']).optional(),
      })
      .parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const updated = await withTenant(
      pool,
      authContext(request),
      async (client) =>
        (
          await client.query(
            `UPDATE prazos_agenda SET titulo = coalesce($3, titulo), vence_em = coalesce($4, vence_em),
                  status = coalesce($5, status), updated_at = now()
            WHERE id = $1 AND tenant_id = $2 RETURNING id, titulo, tipo, vence_em, status, fonte`,
            [
              id,
              request.user.tenantId,
              body.titulo ?? null,
              body.vence_em ?? null,
              body.status ?? null,
            ],
          )
        ).rows[0],
    );
    if (!updated) return reply.code(404).send({ error: 'deadline_not_found' });
    return reply.send(updated);
  });

  app.delete('/agenda/prazos/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const removed = await withTenant(
      pool,
      authContext(request),
      async (client) =>
        (
          await client.query(
            'DELETE FROM prazos_agenda WHERE id = $1 AND tenant_id = $2 RETURNING id',
            [id, request.user.tenantId],
          )
        ).rows[0],
    );
    if (!removed) return reply.code(404).send({ error: 'deadline_not_found' });
    return reply.code(204).send();
  });

  app.post('/tasks', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const body = taskBody.parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const created = await withTenant(pool, authContext(request), async (client) => {
      const empresaId = await resolveCompany(client, request);
      if (!empresaId) return null;
      if (body.oportunidade_id) {
        const owned = await client.query(
          'SELECT 1 FROM oportunidades_salvas WHERE id = $1 AND tenant_id = $2 AND empresa_id = $3',
          [body.oportunidade_id, request.user.tenantId, empresaId],
        );
        if (!owned.rows[0]) return 'opportunity' as const;
      }
      const result = await client.query(
        `INSERT INTO tarefas (tenant_id, empresa_id, oportunidade_id, responsavel_id, titulo, descricao, prioridade, vence_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, titulo, descricao, prioridade, status, vence_em, oportunidade_id`,
        [
          request.user.tenantId,
          empresaId,
          body.oportunidade_id ?? null,
          request.user.sub,
          body.titulo,
          body.descricao ?? null,
          body.prioridade,
          body.vence_em ?? null,
        ],
      );
      await audit(client, request, 'task.created', 'tarefa', result.rows[0].id);
      return result.rows[0];
    });
    if (created === null)
      return reply
        .code(409)
        .send({ error: 'company_required', message: 'Cadastre os dados da empresa primeiro.' });
    if (created === 'opportunity') return reply.code(404).send({ error: 'opportunity_not_found' });
    return reply.code(201).send(created);
  });

  app.patch('/tasks/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    const body = z
      .object({
        titulo: z.string().trim().min(2).max(200).optional(),
        descricao: z.string().trim().max(2000).nullable().optional(),
        prioridade: z.enum(['baixa', 'normal', 'alta', 'urgente']).optional(),
        status: z.enum(['aberta', 'em_andamento', 'concluida', 'cancelada']).optional(),
        vence_em: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const updated = await withTenant(
      pool,
      authContext(request),
      async (client) =>
        (
          await client.query(
            `UPDATE tarefas SET titulo = coalesce($3, titulo),
                  descricao = CASE WHEN $4::boolean THEN $5 ELSE descricao END,
                  prioridade = coalesce($6, prioridade), status = coalesce($7, status),
                  vence_em = CASE WHEN $8::boolean THEN $9::timestamptz ELSE vence_em END, updated_at = now()
            WHERE id = $1 AND tenant_id = $2
            RETURNING id, titulo, descricao, prioridade, status, vence_em`,
            [
              id,
              request.user.tenantId,
              body.titulo ?? null,
              body.descricao !== undefined,
              body.descricao ?? null,
              body.prioridade ?? null,
              body.status ?? null,
              body.vence_em !== undefined,
              body.vence_em ?? null,
            ],
          )
        ).rows[0],
    );
    if (!updated) return reply.code(404).send({ error: 'task_not_found' });
    return reply.send(updated);
  });

  app.delete('/tasks/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const removed = await withTenant(
      pool,
      authContext(request),
      async (client) =>
        (
          await client.query('DELETE FROM tarefas WHERE id = $1 AND tenant_id = $2 RETURNING id', [
            id,
            request.user.tenantId,
          ])
        ).rows[0],
    );
    if (!removed) return reply.code(404).send({ error: 'task_not_found' });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------ Documentos

  const docSelect = `SELECT id, tipo, nome, numero, emitido_em::text, valido_ate::text, link_url, observacao, created_at,
       CASE WHEN valido_ate IS NULL THEN 'sem_validade'
            WHEN valido_ate < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'vencido'
            WHEN valido_ate <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + 30 THEN 'vencendo'
            ELSE 'valido' END AS situacao,
       CASE WHEN valido_ate IS NULL THEN NULL
            ELSE valido_ate - (now() AT TIME ZONE 'America/Sao_Paulo')::date END AS dias_restantes
     FROM empresa_documentos`;

  app.get('/empresa/documentos', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(`${docSelect} WHERE tenant_id = $1 ORDER BY valido_ate NULLS LAST, nome`, [
        request.user.tenantId,
      ]),
    );
    return reply.send({
      data: result.rows,
      tipos: DOC_TYPES,
      aviso:
        'A validade é a que você informa. O Licite Comigo não consulta certidões nos órgãos emissores.',
    });
  });

  app.post('/empresa/documentos', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const body = docBody.parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const created = await withTenant(pool, authContext(request), async (client) => {
      const empresaId = await resolveCompany(client, request);
      if (!empresaId) return null;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO empresa_documentos (tenant_id, empresa_id, tipo, nome, numero, emitido_em, valido_ate, link_url, observacao)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          request.user.tenantId,
          empresaId,
          body.tipo,
          body.nome,
          body.numero ?? null,
          body.emitido_em ?? null,
          body.valido_ate ?? null,
          body.link_url ?? null,
          body.observacao ?? null,
        ],
      );
      await audit(
        client,
        request,
        'empresa_documento.created',
        'empresa_documento',
        inserted.rows[0]!.id,
        { tipo: body.tipo },
      );
      return (await client.query(`${docSelect} WHERE id = $1`, [inserted.rows[0]!.id])).rows[0];
    });
    if (!created)
      return reply
        .code(409)
        .send({ error: 'company_required', message: 'Cadastre os dados da empresa primeiro.' });
    return reply.code(201).send(created);
  });

  app.patch('/empresa/documentos/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    const body = docBody.partial().parse(request.body ?? {});
    if (!pool) return sendDatabaseUnavailable(reply);
    const updated = await withTenant(pool, authContext(request), async (client) => {
      const result = await client.query(
        `UPDATE empresa_documentos SET
            tipo = coalesce($3, tipo), nome = coalesce($4, nome),
            numero = CASE WHEN $5::boolean THEN $6 ELSE numero END,
            emitido_em = CASE WHEN $7::boolean THEN $8::date ELSE emitido_em END,
            valido_ate = CASE WHEN $9::boolean THEN $10::date ELSE valido_ate END,
            link_url = CASE WHEN $11::boolean THEN $12 ELSE link_url END,
            observacao = CASE WHEN $13::boolean THEN $14 ELSE observacao END,
            updated_at = now()
          WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [
          id,
          request.user.tenantId,
          body.tipo ?? null,
          body.nome ?? null,
          body.numero !== undefined,
          body.numero ?? null,
          body.emitido_em !== undefined,
          body.emitido_em ?? null,
          body.valido_ate !== undefined,
          body.valido_ate ?? null,
          body.link_url !== undefined,
          body.link_url ?? null,
          body.observacao !== undefined,
          body.observacao ?? null,
        ],
      );
      if (!result.rows[0]) return null;
      await audit(client, request, 'empresa_documento.updated', 'empresa_documento', id);
      return (await client.query(`${docSelect} WHERE id = $1`, [id])).rows[0];
    });
    if (!updated) return reply.code(404).send({ error: 'document_not_found' });
    return reply.send(updated);
  });

  app.delete('/empresa/documentos/:id', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    const { id } = idParams.parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const removed = await withTenant(pool, authContext(request), async (client) => {
      const result = await client.query(
        'DELETE FROM empresa_documentos WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, request.user.tenantId],
      );
      if (result.rows[0])
        await audit(client, request, 'empresa_documento.removed', 'empresa_documento', id);
      return result.rows[0];
    });
    if (!removed) return reply.code(404).send({ error: 'document_not_found' });
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------- Início

  app.get('/empresa/inicio', async (request, reply) => {
    if (!guard(request, reply)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { tenantId, sub: userId } = request.user;
    const result = await withTenant(pool, authContext(request), async (client) => {
      const company = await client.query<{ id: string; razao_social: string }>(
        'SELECT id, razao_social FROM empresas WHERE tenant_id = $1 AND ativo ORDER BY created_at LIMIT 1',
        [tenantId],
      );
      const searches = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM buscas_salvas bs
           JOIN alertas_regras ar ON ar.busca_id = bs.id AND ar.ativa
          WHERE bs.tenant_id = $1 AND bs.ativa`,
        [tenantId],
      );
      const changes = await client.query(
        `SELECT ae.tipo, count(*)::int AS total FROM alerta_entregas ae
          WHERE ae.tenant_id = $1 AND ae.usuario_id = $2 AND ae.canal = 'in_app'
            AND ae.created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
          GROUP BY ae.tipo`,
        [tenantId, userId],
      );
      const week = await client.query(
        `SELECT p.id, p.titulo, p.tipo, p.vence_em, p.oportunidade_id, e.titulo AS edital_titulo
           FROM prazos_agenda p
           LEFT JOIN oportunidades_salvas o ON o.id = p.oportunidade_id
           LEFT JOIN editais e ON e.id = o.edital_id
          WHERE p.tenant_id = $1 AND p.status = 'aberto'
            AND p.vence_em >= now() AND p.vence_em <= now() + interval '7 days'
          ORDER BY p.vence_em LIMIT 8`,
        [tenantId],
      );
      const pipeline = await client.query<{ status: string; total: number }>(
        'SELECT status, count(*)::int AS total FROM oportunidades_salvas WHERE tenant_id = $1 GROUP BY status',
        [tenantId],
      );
      const docs = await client.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE valido_ate < (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS vencidos,
                count(*) FILTER (WHERE valido_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
                                   AND valido_ate <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + 30)::int AS vencendo,
                (SELECT nome FROM empresa_documentos x WHERE x.tenant_id = $1
                    AND x.valido_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
                    AND x.valido_ate <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + 30
                  ORDER BY x.valido_ate LIMIT 1) AS proximo_nome,
                (SELECT valido_ate - (now() AT TIME ZONE 'America/Sao_Paulo')::date FROM empresa_documentos x WHERE x.tenant_id = $1
                    AND x.valido_ate >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
                    AND x.valido_ate <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + 30
                  ORDER BY x.valido_ate LIMIT 1)::int AS proximo_dias
           FROM empresa_documentos WHERE tenant_id = $1`,
        [tenantId],
      );
      const flags = await client.query(
        `SELECT
           (SELECT count(*) FROM oportunidades_salvas WHERE tenant_id = $1 AND status IN ('salva', 'triagem')
              AND updated_at < now() - interval '7 days')::int AS salvas_paradas,
           (SELECT count(*) FROM oportunidades_salvas o WHERE o.tenant_id = $1 AND o.status = 'em_habilitacao'
              AND NOT EXISTS (SELECT 1 FROM checklists c WHERE c.oportunidade_id = o.id))::int AS sem_checklist,
           (SELECT count(*) FROM prazos_agenda WHERE tenant_id = $1 AND status = 'aberto'
              AND vence_em >= now() AND vence_em <= now() + interval '3 days')::int AS prazos_3d,
           (SELECT count(*) FROM tarefas WHERE tenant_id = $1 AND status IN ('aberta', 'em_andamento')
              AND vence_em < now())::int AS tarefas_atrasadas`,
        [tenantId],
      );
      const d = docs.rows[0] ?? {};
      const f = flags.rows[0] ?? {};
      const pipelineTotal = pipeline.rows.reduce((sum, row) => sum + row.total, 0);
      const steps = nextSteps({
        tem_empresa: Boolean(company.rows[0]),
        buscas_ativas: searches.rows[0]?.total ?? 0,
        documentos_total: d.total ?? 0,
        documentos_vencidos: d.vencidos ?? 0,
        documentos_vencendo: d.vencendo ?? 0,
        documento_proximo: d.proximo_nome
          ? { nome: d.proximo_nome, dias: d.proximo_dias ?? 0 }
          : null,
        salvas_paradas: f.salvas_paradas ?? 0,
        habilitacao_sem_checklist: f.sem_checklist ?? 0,
        prazos_ate_3_dias: f.prazos_3d ?? 0,
        tarefas_atrasadas: f.tarefas_atrasadas ?? 0,
        pipeline_total: pipelineTotal,
      });
      return {
        empresa: company.rows[0] ?? null,
        buscas_ativas: searches.rows[0]?.total ?? 0,
        hoje: Object.fromEntries(changes.rows.map((row) => [row.tipo, row.total])),
        prazos_semana: week.rows,
        pipeline: Object.fromEntries(pipeline.rows.map((row) => [row.status, row.total])),
        documentos: { total: d.total ?? 0, vencidos: d.vencidos ?? 0, vencendo: d.vencendo ?? 0 },
        proximos_passos: steps,
      };
    });
    return reply.send(result);
  });
}
