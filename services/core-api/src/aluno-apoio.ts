import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { withTenant } from './db.js';
import { MATERIAIS_CATALOGO } from './materiais-catalogo.js';
import {
  audit,
  authContext,
  requireRoles,
  sendDatabaseUnavailable,
  withPlatform,
  type DbClient,
} from './request-context.js';

/**
 * Apoio ao aluno: biblioteca de materiais, diagnóstico inicial, encontros ao vivo e prazo de
 * acesso por turma. O curso em si é vendido fora; aqui fica o que acompanha o aluno depois.
 */

type Deps = { pool: Pool | undefined };

const uuid = z.string().uuid();
const STUDENT_VIEW = ['plataforma', 'aluno'] as const;
const TEACHING = ['plataforma', 'mentor'] as const;
const PLATFORM_ONLY = ['plataforma'] as const;

export const ETAPAS = [
  'comecar',
  'oportunidades',
  'documentos',
  'proposta',
  'sessao',
  'pos',
  'assessor',
  'base',
] as const;
export const TIPOS = [
  'guia',
  'checklist',
  'modelo',
  'planilha',
  'lista',
  'lei',
  'video',
  'outro',
] as const;

/** Perguntas do diagnóstico inicial, a partir do questionário de entrada do curso. */
export const DIAGNOSTICO_PERGUNTAS = [
  { id: 'ocupacao', texto: 'Qual é a sua ocupação hoje?', tipo: 'texto', obrigatoria: false },
  {
    id: 'tem_empresa',
    texto: 'Você já tem empresa?',
    tipo: 'opcoes',
    obrigatoria: true,
    opcoes: [
      ['nao', 'Ainda não'],
      ['mei', 'Sim, sou MEI'],
      ['me_epp', 'Sim, ME ou EPP'],
      ['outra', 'Sim, outro porte'],
    ],
  },
  {
    id: 'contador_certificado',
    texto: 'Você tem contador e certificado digital?',
    tipo: 'opcoes',
    obrigatoria: false,
    opcoes: [
      ['ambos', 'Tenho os dois'],
      ['so_contador', 'Só contador'],
      ['so_certificado', 'Só certificado digital'],
      ['nenhum', 'Nenhum dos dois'],
    ],
  },
  { id: 'nicho', texto: 'Qual nicho você pretende trabalhar?', tipo: 'texto', obrigatoria: true },
  {
    id: 'experiencia',
    texto: 'Você já participou de alguma licitação?',
    tipo: 'opcoes',
    obrigatoria: true,
    opcoes: [
      ['nunca', 'Nunca participei'],
      ['pouco', 'Já participei algumas vezes'],
      ['sempre', 'Participo com frequência'],
    ],
  },
  {
    id: 'lei',
    texto: 'Como está o seu conhecimento da lei de licitações?',
    tipo: 'opcoes',
    obrigatoria: false,
    opcoes: [
      ['nenhum', 'Nenhum'],
      ['basico', 'Básico'],
      ['bom', 'Bom'],
    ],
  },
  {
    id: 'dedicacao',
    texto: 'Quanto tempo por dia você pretende dedicar?',
    tipo: 'texto',
    obrigatoria: false,
  },
  {
    id: 'ajuda',
    texto: 'Mais alguém vai ajudar a tocar esse negócio?',
    tipo: 'texto',
    obrigatoria: false,
  },
  {
    id: 'desafio',
    texto: 'Qual é o seu maior desafio hoje?',
    tipo: 'texto',
    obrigatoria: false,
  },
  {
    id: 'duvida',
    texto: 'Qual é a sua maior dúvida sobre licitações?',
    tipo: 'texto',
    obrigatoria: true,
  },
  {
    id: 'como_aprende',
    texto: 'Como você prefere aprender?',
    tipo: 'opcoes',
    obrigatoria: false,
    opcoes: [
      ['videos', 'Vídeos'],
      ['leitura', 'Leitura'],
      ['pratica', 'Exercícios práticos'],
      ['ao_vivo', 'Aulas ao vivo'],
    ],
  },
  {
    id: 'prazo',
    texto: 'Tem algum prazo para alcançar os seus resultados?',
    tipo: 'texto',
    obrigatoria: false,
  },
  {
    id: 'objetivo',
    texto: 'Onde você quer chegar com as licitações?',
    tipo: 'texto',
    obrigatoria: false,
  },
] as const;

const REQUIRED = DIAGNOSTICO_PERGUNTAS.filter((q) => q.obrigatoria).map((q) => q.id);
const QUESTION_IDS = new Set<string>(DIAGNOSTICO_PERGUNTAS.map((q) => q.id));

const diagnosticoBody = z.object({
  atuacao: z.enum(['fornecedor', 'assessor']),
  respostas: z.record(z.string().max(40), z.string().max(2000)),
});

const materialBody = z.object({
  codigo: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Use letras minúsculas, números e hífen.'),
  titulo: z.string().trim().min(2).max(200),
  descricao: z.string().trim().max(600).nullable().optional(),
  etapa: z.enum(ETAPAS),
  tipo: z.enum(TIPOS),
  para: z.enum(['todos', 'fornecedor', 'assessor']).default('todos'),
  url: z.string().url().startsWith('https://').max(1000).nullable().optional(),
  conteudo: z.string().max(100_000).nullable().optional(),
  ordem: z.number().int().min(1).max(9999).optional(),
  publicado: z.boolean().optional(),
});
const materialPatch = materialBody.partial();

const encontroBody = z.object({
  titulo: z.string().trim().min(2).max(200),
  descricao: z.string().trim().max(1000).nullable().optional(),
  turma_id: uuid.nullable().optional(),
  inicio_at: z.string().datetime({ offset: true }),
  fim_at: z.string().datetime({ offset: true }).nullable().optional(),
  link: z.string().url().startsWith('https://').max(500).nullable().optional(),
});
const encontroPatch = encontroBody
  .partial()
  .extend({ status: z.enum(['agendado', 'realizado', 'cancelado']).optional() });

function today(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

export type AlunoAcesso = {
  turma: { id: string; nome: string } | null;
  acesso_ate: string | null;
  mentoria_ate: string | null;
  grupo_url: string | null;
  acesso_ativo: boolean;
  mentoria_ativa: boolean;
};

function dateText(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Situação do acesso do aluno logado. Quem não é aluno (equipe vendo como aluno) nunca expira. */
export async function readStudentAccess(client: DbClient): Promise<AlunoAcesso> {
  const result = await client.query<{
    turma_id: string;
    turma_nome: string;
    acesso_ate: unknown;
    mentoria_ate: unknown;
    grupo_url: string | null;
  }>('SELECT turma_id, turma_nome, acesso_ate, mentoria_ate, grupo_url FROM aluno_acesso()');
  const rows = result.rows;
  if (!rows.length) {
    return {
      turma: null,
      acesso_ate: null,
      mentoria_ate: null,
      grupo_url: null,
      acesso_ativo: true,
      mentoria_ativa: true,
    };
  }
  const now = today();
  // Com mais de uma turma, vale o prazo mais longo: a matrícula que ainda dá acesso.
  const open = (field: 'acesso_ate' | 'mentoria_ate') =>
    rows.some((row) => !dateText(row[field]) || dateText(row[field])! >= now);
  const latest = (field: 'acesso_ate' | 'mentoria_ate') => {
    const dates = rows.map((row) => dateText(row[field]));
    if (dates.some((value) => value === null)) return null;
    return (dates as string[]).sort().at(-1) ?? null;
  };
  const main = rows[0]!;
  return {
    turma: { id: main.turma_id, nome: main.turma_nome },
    acesso_ate: latest('acesso_ate'),
    mentoria_ate: latest('mentoria_ate'),
    grupo_url: rows.find((row) => row.grupo_url)?.grupo_url ?? null,
    acesso_ativo: open('acesso_ate'),
    mentoria_ativa: open('mentoria_ate'),
  };
}

export function registerStudentSupportRoutes(app: FastifyInstance, { pool }: Deps): void {
  const isStudent = (request: { user: { role: string } }) => request.user.role === 'aluno';

  app.get('/aluno/acesso', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const access = await readStudentAccess(client);
      const diagnostico = await client.query<{ atuacao: string; concluido_em: string }>(
        'SELECT atuacao, concluido_em FROM diagnosticos_aluno WHERE tenant_id = $1 AND aluno_id = $2',
        [request.user.tenantId, request.user.sub],
      );
      return {
        ...access,
        diagnostico: {
          feito: Boolean(diagnostico.rows[0]),
          atuacao: diagnostico.rows[0]?.atuacao ?? null,
        },
      };
    });
    return reply.send(result);
  });

  // ---------------------------------------------------------------- Diagnóstico inicial

  app.get('/aluno/diagnostico', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const saved = await withTenant(pool, authContext(request), async (client) =>
      client.query<{ atuacao: string; respostas: Record<string, string>; concluido_em: string }>(
        `SELECT atuacao, respostas, concluido_em FROM diagnosticos_aluno
          WHERE tenant_id = $1 AND aluno_id = $2`,
        [request.user.tenantId, request.user.sub],
      ),
    );
    return reply.send({ perguntas: DIAGNOSTICO_PERGUNTAS, diagnostico: saved.rows[0] ?? null });
  });

  app.put('/aluno/diagnostico', async (request, reply) => {
    if (!requireRoles(reply, request, ['aluno'])) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const body = diagnosticoBody.parse(request.body ?? {});
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(body.respostas)) {
      if (QUESTION_IDS.has(key) && value.trim()) answers[key] = value.trim();
    }
    const missing = REQUIRED.filter((id) => !answers[id]);
    if (missing.length)
      return reply.code(422).send({ error: 'missing_answers', faltando: missing });
    await withTenant(pool, authContext(request), async (client) => {
      await client.query(
        `INSERT INTO diagnosticos_aluno (tenant_id, aluno_id, atuacao, respostas)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (aluno_id) DO UPDATE
           SET atuacao = EXCLUDED.atuacao, respostas = EXCLUDED.respostas,
               concluido_em = now(), updated_at = now()`,
        [request.user.tenantId, request.user.sub, body.atuacao, JSON.stringify(answers)],
      );
      await audit(client, request, 'student.diagnostico.saved', 'diagnostico_aluno', null);
    });
    return reply.send({ ok: true, atuacao: body.atuacao });
  });

  // ---------------------------------------------------------------- Materiais (aluno)

  async function studentLibraryGate(
    client: DbClient,
    request: { user: { role: string; tenantId: string; sub: string } },
  ) {
    const access = await readStudentAccess(client);
    if (isStudent(request) && !access.acesso_ativo) return { blocked: access.acesso_ate } as const;
    const diagnostico = await client.query<{ atuacao: string }>(
      'SELECT atuacao FROM diagnosticos_aluno WHERE tenant_id = $1 AND aluno_id = $2',
      [request.user.tenantId, request.user.sub],
    );
    return { blocked: null, atuacao: diagnostico.rows[0]?.atuacao ?? null } as const;
  }

  app.get('/aluno/materiais', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const query = z.object({ todos: z.enum(['1']).optional() }).parse(request.query ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      const gate = await studentLibraryGate(client, request);
      if (gate.blocked !== null) return { blocked: gate.blocked };
      const atuacao = query.todos ? null : gate.atuacao;
      const rows = await client.query(
        `SELECT id, titulo, descricao, etapa, tipo, para, url, (conteudo IS NOT NULL) AS tem_conteudo, ordem
           FROM materiais
          WHERE tenant_id = $1 AND publicado AND (conteudo IS NOT NULL OR url IS NOT NULL)
            AND ($2::text IS NULL OR para IN ('todos', $2))
          ORDER BY etapa, ordem, titulo`,
        [request.user.tenantId, atuacao],
      );
      return { blocked: null, atuacao: gate.atuacao, data: rows.rows };
    });
    if (result.blocked !== null) {
      return reply.code(403).send({ error: 'access_expired', acesso_ate: result.blocked });
    }
    return reply.send({ atuacao: result.atuacao, data: result.data });
  });

  app.get('/aluno/materiais/:id', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const gate = await studentLibraryGate(client, request);
      if (gate.blocked !== null) return { blocked: gate.blocked };
      const found = await client.query(
        `SELECT id, titulo, descricao, etapa, tipo, para, url, conteudo
           FROM materiais
          WHERE tenant_id = $1 AND id = $2 AND publicado AND (conteudo IS NOT NULL OR url IS NOT NULL)`,
        [request.user.tenantId, id],
      );
      return { blocked: null, material: found.rows[0] ?? null };
    });
    if (result.blocked !== null) {
      return reply.code(403).send({ error: 'access_expired', acesso_ate: result.blocked });
    }
    if (!result.material) return reply.code(404).send({ error: 'material_not_found' });
    return reply.send(result.material);
  });

  // ---------------------------------------------------------------- Encontros (aluno)

  app.get('/aluno/encontros', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const access = await readStudentAccess(client);
      const rows = await client.query(
        `SELECT e.id, e.titulo, e.descricao, e.inicio_at, e.fim_at, e.link, e.status, t.nome AS turma
           FROM encontros e LEFT JOIN turmas t ON t.id = e.turma_id
          WHERE e.tenant_id = $1
          ORDER BY e.inicio_at DESC LIMIT 100`,
        [request.user.tenantId],
      );
      return { access, rows: rows.rows };
    });
    const mentoriaFechada = isStudent(request) && !result.access.mentoria_ativa;
    return reply.send({
      grupo_url: mentoriaFechada ? null : result.access.grupo_url,
      mentoria_ativa: result.access.mentoria_ativa,
      mentoria_ate: result.access.mentoria_ate,
      data: mentoriaFechada
        ? result.rows.map(({ link: _link, ...rest }) => ({ ...rest, link: null }))
        : result.rows,
    });
  });

  // ---------------------------------------------------------------- Encontros (equipe)

  app.get('/mentor/encontros', async (request, reply) => {
    if (!requireRoles(reply, request, TEACHING)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const rows = await client.query(
        `SELECT e.id, e.titulo, e.descricao, e.inicio_at, e.fim_at, e.link, e.status, e.turma_id,
                t.nome AS turma
           FROM encontros e LEFT JOIN turmas t ON t.id = e.turma_id
          WHERE e.tenant_id = $1
          ORDER BY e.inicio_at DESC LIMIT 200`,
        [request.user.tenantId],
      );
      const classes = await client.query(
        `SELECT id, nome FROM turmas WHERE tenant_id = $1 AND status = 'ativa' ORDER BY nome`,
        [request.user.tenantId],
      );
      return { data: rows.rows, turmas: classes.rows };
    });
    return reply.send(result);
  });

  app.post('/mentor/encontros', async (request, reply) => {
    if (!requireRoles(reply, request, TEACHING)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const body = encontroBody.parse(request.body ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      if (body.turma_id) {
        const turma = await client.query('SELECT 1 FROM turmas WHERE tenant_id = $1 AND id = $2', [
          request.user.tenantId,
          body.turma_id,
        ]);
        if (!turma.rows[0]) return null;
      }
      const saved = await client.query(
        `INSERT INTO encontros (tenant_id, turma_id, titulo, descricao, inicio_at, fim_at, link, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, turma_id, titulo, descricao, inicio_at, fim_at, link, status`,
        [
          request.user.tenantId,
          body.turma_id ?? null,
          body.titulo,
          body.descricao ?? null,
          body.inicio_at,
          body.fim_at ?? null,
          body.link ?? null,
          request.user.sub,
        ],
      );
      await notifyEncontro(client, request.user.tenantId, body.turma_id ?? null, {
        titulo: 'Novo encontro ao vivo',
        mensagem: body.titulo,
        tipo: 'encontro_marcado',
      });
      await audit(client, request, 'encontro.created', 'encontro', saved.rows[0].id);
      return saved.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'class_not_found' });
    return reply.code(201).send(result);
  });

  app.patch('/mentor/encontros/:id', async (request, reply) => {
    if (!requireRoles(reply, request, TEACHING)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = encontroPatch.parse(request.body ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE encontros SET
            titulo = coalesce($3, titulo), descricao = coalesce($4, descricao),
            inicio_at = coalesce($5, inicio_at), fim_at = coalesce($6, fim_at),
            link = coalesce($7, link), status = coalesce($8, status), updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, turma_id, titulo, descricao, inicio_at, fim_at, link, status`,
        [
          request.user.tenantId,
          id,
          body.titulo ?? null,
          body.descricao ?? null,
          body.inicio_at ?? null,
          body.fim_at ?? null,
          body.link ?? null,
          body.status ?? null,
        ],
      );
      const row = updated.rows[0];
      if (row && (body.status === 'cancelado' || body.inicio_at)) {
        await notifyEncontro(client, request.user.tenantId, row.turma_id, {
          titulo: body.status === 'cancelado' ? 'Encontro cancelado' : 'Encontro remarcado',
          mensagem: row.titulo,
          tipo: 'encontro_atualizado',
        });
      }
      if (row) await audit(client, request, 'encontro.updated', 'encontro', id);
      return row ?? null;
    });
    if (!result) return reply.code(404).send({ error: 'encontro_not_found' });
    return reply.send(result);
  });

  // ---------------------------------------------------------------- Materiais (Administração)

  app.get('/platform/materiais', async (request, reply) => {
    if (!requireRoles(reply, request, PLATFORM_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const rows = await withPlatform(pool, request, 'platform.materiais.listed', async (client) =>
      client.query(
        `SELECT id, codigo, titulo, descricao, etapa, tipo, para, url,
                (conteudo IS NOT NULL) AS tem_conteudo, ordem, publicado, updated_at
           FROM materiais WHERE tenant_id = $1 ORDER BY etapa, ordem, titulo`,
        [request.user.tenantId],
      ),
    );
    return reply.send({ data: rows.rows });
  });

  app.get('/platform/materiais/:id', async (request, reply) => {
    if (!requireRoles(reply, request, PLATFORM_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const found = await withPlatform(pool, request, 'platform.material.read', async (client) =>
      client.query(
        `SELECT id, codigo, titulo, descricao, etapa, tipo, para, url, conteudo, ordem, publicado
           FROM materiais WHERE tenant_id = $1 AND id = $2`,
        [request.user.tenantId, id],
      ),
    );
    if (!found.rows[0]) return reply.code(404).send({ error: 'material_not_found' });
    return reply.send(found.rows[0]);
  });

  app.post('/platform/materiais', async (request, reply) => {
    if (!requireRoles(reply, request, PLATFORM_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const body = materialBody.parse(request.body ?? {});
    try {
      const saved = await withPlatform(pool, request, 'platform.material.created', async (client) =>
        client.query(
          `INSERT INTO materiais (tenant_id, codigo, titulo, descricao, etapa, tipo, para, url, conteudo, ordem, publicado)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            request.user.tenantId,
            body.codigo,
            body.titulo,
            body.descricao ?? null,
            body.etapa,
            body.tipo,
            body.para,
            body.url ?? null,
            body.conteudo ?? null,
            body.ordem ?? 100,
            body.publicado ?? true,
          ],
        ),
      );
      return reply.code(201).send(saved.rows[0]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'already_exists' });
      }
      throw error;
    }
  });

  app.patch('/platform/materiais/:id', async (request, reply) => {
    if (!requireRoles(reply, request, PLATFORM_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = materialPatch.parse(request.body ?? {});
    const has = (key: keyof typeof body) => body[key] !== undefined;
    const updated = await withPlatform(
      pool,
      request,
      'platform.material.updated',
      async (client) =>
        client.query(
          `UPDATE materiais SET
            titulo = coalesce($3, titulo),
            descricao = CASE WHEN $4::boolean THEN $5 ELSE descricao END,
            etapa = coalesce($6, etapa), tipo = coalesce($7, tipo), para = coalesce($8, para),
            url = CASE WHEN $9::boolean THEN $10 ELSE url END,
            conteudo = CASE WHEN $11::boolean THEN $12 ELSE conteudo END,
            ordem = coalesce($13, ordem), publicado = coalesce($14, publicado), updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id`,
          [
            request.user.tenantId,
            id,
            body.titulo ?? null,
            has('descricao'),
            body.descricao ?? null,
            body.etapa ?? null,
            body.tipo ?? null,
            body.para ?? null,
            has('url'),
            body.url ?? null,
            has('conteudo'),
            body.conteudo ?? null,
            body.ordem ?? null,
            body.publicado ?? null,
          ],
        ),
      { material_id: id },
    );
    if (!updated.rows[0]) return reply.code(404).send({ error: 'material_not_found' });
    return reply.send({ ok: true });
  });

  app.delete('/platform/materiais/:id', async (request, reply) => {
    if (!requireRoles(reply, request, PLATFORM_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const removed = await withPlatform(
      pool,
      request,
      'platform.material.deleted',
      async (client) =>
        client.query('DELETE FROM materiais WHERE tenant_id = $1 AND id = $2 RETURNING id', [
          request.user.tenantId,
          id,
        ]),
      { material_id: id },
    );
    if (!removed.rows[0]) return reply.code(404).send({ error: 'material_not_found' });
    return reply.send({ ok: true });
  });

  // Carrega o catálogo inicial sem mexer no que já existe (nada é sobrescrito).
  app.post('/platform/materiais/catalogo', async (request, reply) => {
    if (!requireRoles(reply, request, PLATFORM_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const inserted = await withPlatform(
      pool,
      request,
      'platform.materiais.catalog_loaded',
      async (client) => {
        let count = 0;
        for (const item of MATERIAIS_CATALOGO) {
          const result = await client.query(
            `INSERT INTO materiais (tenant_id, codigo, titulo, descricao, etapa, tipo, para, url, conteudo, ordem, publicado)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (tenant_id, codigo) DO NOTHING`,
            [
              request.user.tenantId,
              item.codigo,
              item.titulo,
              item.descricao,
              item.etapa,
              item.tipo,
              item.para,
              item.url,
              item.conteudo,
              item.ordem,
              Boolean(item.conteudo || item.url),
            ],
          );
          count += result.rowCount ?? 0;
        }
        return count;
      },
    );
    return reply.send({ inseridos: inserted, total: MATERIAIS_CATALOGO.length });
  });
}

/** Avisa os alunos ativos da turma (ou de todas, quando o encontro é aberto). */
async function notifyEncontro(
  client: DbClient,
  tenantId: string,
  turmaId: string | null,
  info: { titulo: string; mensagem: string; tipo: string },
): Promise<void> {
  await client.query(
    `INSERT INTO notificacoes (tenant_id, usuario_id, tipo, titulo, mensagem, dados)
     SELECT $1, m.aluno_id, $3, $4, $5, '{"link":"/encontros"}'::jsonb
       FROM matriculas m
      WHERE m.tenant_id = $1 AND m.status = 'ativa' AND ($2::uuid IS NULL OR m.turma_id = $2)
      GROUP BY m.aluno_id`,
    [tenantId, turmaId, info.tipo, info.titulo, info.mensagem],
  );
}
