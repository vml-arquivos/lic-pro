import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { withTenant } from './db.js';
import { buildPlan } from './plan-generator.js';
import { MIN_ANSWER_LENGTH, PRACTICE_QUESTIONS, missingAnswers } from './practice.js';
import {
  audit,
  authContext,
  requireRoles,
  sendDatabaseUnavailable,
  type DbClient,
} from './request-context.js';

type Deps = { pool: Pool | undefined };

const uuid = z.string().uuid();
const STUDENT_VIEW = ['plataforma', 'aluno'] as const;
const STUDENT_ONLY = ['aluno'] as const;
const TEACHING = ['plataforma', 'mentor'] as const;
const MENTOR_ONLY = ['mentor'] as const;

const answersBody = z.object({
  respostas: z.record(z.string().max(60), z.string().max(4000)),
});
const dayParams = z.object({ dia: z.coerce.number().int().min(1).max(30) });
const alunoParams = z.object({ alunoId: uuid });
const alunoDayParams = z.object({ alunoId: uuid, dia: z.coerce.number().int().min(1).max(30) });

async function notify(
  client: DbClient,
  tenantId: string,
  userId: string,
  titulo: string,
  mensagem: string,
  link: string,
  tipo: string,
): Promise<void> {
  await client.query(
    `INSERT INTO notificacoes (tenant_id, usuario_id, tipo, titulo, mensagem, dados)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [tenantId, userId, tipo, titulo, mensagem, JSON.stringify({ link })],
  );
}

/** Aulas de uma trilha, na ordem de estudo. */
async function lessonsOf(client: DbClient, trilhaId: string) {
  const result = await client.query<{ id: string; titulo: string; modulo: string }>(
    `SELECT a.id, a.titulo, m.titulo AS modulo
       FROM aulas a JOIN modulos m ON m.id = a.modulo_id
      WHERE m.trilha_id = $1
      ORDER BY m.ordem, a.ordem`,
    [trilhaId],
  );
  return result.rows;
}

async function generatePlan(
  client: DbClient,
  tenantId: string,
  alunoId: string,
  generatedBy: string,
  trilhaSlug: string | undefined,
  inicio: string,
): Promise<{ trilha_id: string | null; dias: number } | null> {
  const trilha = await client.query<{ id: string }>(
    trilhaSlug
      ? 'SELECT id FROM trilhas WHERE slug = $1'
      : 'SELECT id FROM trilhas ORDER BY created_at LIMIT 1',
    trilhaSlug ? [trilhaSlug] : [],
  );
  if (trilhaSlug && !trilha.rows[0]) return null;
  const trilhaId = trilha.rows[0]?.id ?? null;
  const plan = buildPlan(trilhaId ? await lessonsOf(client, trilhaId) : []);
  await client.query(
    `INSERT INTO planos_aluno (tenant_id, aluno_id, trilha_id, inicio, gerado_por)
     VALUES ($1, $2, $3, $4::date, $5)
     ON CONFLICT (aluno_id) DO UPDATE SET trilha_id = EXCLUDED.trilha_id, inicio = EXCLUDED.inicio,
       gerado_por = EXCLUDED.gerado_por, updated_at = now()`,
    [tenantId, alunoId, trilhaId, inicio, generatedBy],
  );
  await client.query('DELETE FROM plano_dias WHERE tenant_id = $1 AND aluno_id = $2', [
    tenantId,
    alunoId,
  ]);
  for (const day of plan) {
    await client.query(
      `INSERT INTO plano_dias (tenant_id, aluno_id, dia, objetivo, atividade, tipo, aula_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, alunoId, day.dia, day.objetivo, day.atividade, day.tipo, day.aula_id],
    );
  }
  return { trilha_id: trilhaId, dias: plan.length };
}

async function readPlan(client: DbClient, tenantId: string, alunoId: string) {
  const header = await client.query<{
    inicio: string;
    trilha_id: string | null;
    trilha: string | null;
  }>(
    `SELECT p.inicio::text AS inicio, p.trilha_id, t.titulo AS trilha
       FROM planos_aluno p LEFT JOIN trilhas t ON t.id = p.trilha_id
      WHERE p.tenant_id = $1 AND p.aluno_id = $2`,
    [tenantId, alunoId],
  );
  if (!header.rows[0]) return null;
  const days = await client.query(
    `SELECT d.dia, d.objetivo, d.atividade, d.tipo, d.aula_id, d.status, d.feito_em, d.revisado_em,
            d.comentario_mentor, d.ajustado_pelo_mentor,
            (p.inicio + (d.dia - 1))::text AS data,
            tr.slug AS trilha_slug
       FROM plano_dias d
       JOIN planos_aluno p ON p.aluno_id = d.aluno_id
       LEFT JOIN aulas a ON a.id = d.aula_id
       LEFT JOIN modulos m ON m.id = a.modulo_id
       LEFT JOIN trilhas tr ON tr.id = m.trilha_id
      WHERE d.tenant_id = $1 AND d.aluno_id = $2
      ORDER BY d.dia`,
    [tenantId, alunoId],
  );
  const feitos = days.rows.filter((d) => d.status !== 'pendente').length;
  return {
    inicio: header.rows[0].inicio,
    trilha: header.rows[0].trilha,
    dias: days.rows,
    resumo: {
      total: days.rows.length,
      feitos,
      revisados: days.rows.filter((d) => d.status === 'revisado').length,
      percentual: days.rows.length ? Math.round((feitos / days.rows.length) * 100) : 0,
    },
  };
}

function today(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

export function registerLearningRoutes(app: FastifyInstance, { pool }: Deps): void {
  // Aula com o conteúdo, vizinhas na trilha, questionário do módulo e progresso de quem lê.
  app.get('/academy/lessons/:aulaId', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const { aulaId } = z.object({ aulaId: uuid }).parse(request.params);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const lesson = await client.query<{ trilha_id: string }>(
        `SELECT a.id, a.titulo, a.tipo, a.conteudo, a.video_url, a.status,
                m.id AS modulo_id, m.titulo AS modulo, m.trilha_id,
                tr.slug AS trilha_slug, tr.titulo AS trilha
           FROM aulas a JOIN modulos m ON m.id = a.modulo_id JOIN trilhas tr ON tr.id = m.trilha_id
          WHERE a.id = $1`,
        [aulaId],
      );
      if (!lesson.rows[0]) return null;
      const order = await lessonsOf(client, lesson.rows[0].trilha_id);
      const index = order.findIndex((item) => item.id === aulaId);
      const quiz = await client.query(
        `SELECT q.id, q.titulo FROM quizzes q
           JOIN aulas a ON a.modulo_id = q.modulo_id WHERE a.id = $1 LIMIT 1`,
        [aulaId],
      );
      const progress = await client.query(
        `SELECT concluida, percentual FROM progresso_aula
          WHERE tenant_id = $1 AND usuario_id = $2 AND aula_id = $3`,
        [request.user.tenantId, request.user.sub, aulaId],
      );
      return {
        ...lesson.rows[0],
        anterior: index > 0 ? order[index - 1] : null,
        proxima: index >= 0 && index < order.length - 1 ? order[index + 1] : null,
        quiz: quiz.rows[0] ?? null,
        progresso: progress.rows[0] ?? { concluida: false, percentual: 0 },
      };
    });
    if (!result) return reply.code(404).send({ error: 'lesson_not_found' });
    return reply.send(result);
  });

  // ---------------------------------------------------------------- Aluno

  app.get('/aluno/inicio', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { tenantId, sub: userId } = request.user;
    const result = await withTenant(pool, authContext(request), async (client) => {
      const progresso = await client.query(
        `SELECT (SELECT count(*) FROM aulas)::int AS aulas_total,
                count(*) FILTER (WHERE concluida)::int AS aulas_concluidas
           FROM progresso_aula WHERE tenant_id = $1 AND usuario_id = $2`,
        [tenantId, userId],
      );
      const partial = await client.query(
        `SELECT a.id AS aula_id, a.titulo, tr.slug AS trilha_slug, pa.percentual
           FROM progresso_aula pa
           JOIN aulas a ON a.id = pa.aula_id JOIN modulos m ON m.id = a.modulo_id
           JOIN trilhas tr ON tr.id = m.trilha_id
          WHERE pa.tenant_id = $1 AND pa.usuario_id = $2 AND NOT pa.concluida
          ORDER BY pa.updated_at DESC LIMIT 1`,
        [tenantId, userId],
      );
      const next = partial.rows[0]
        ? null
        : await client.query(
            `SELECT a.id AS aula_id, a.titulo, tr.slug AS trilha_slug, 0 AS percentual
               FROM aulas a JOIN modulos m ON m.id = a.modulo_id JOIN trilhas tr ON tr.id = m.trilha_id
              WHERE NOT EXISTS (SELECT 1 FROM progresso_aula pa
                                 WHERE pa.aula_id = a.id AND pa.usuario_id = $1 AND pa.concluida)
              ORDER BY tr.created_at, m.ordem, a.ordem LIMIT 1`,
            [userId],
          );
      const plano = await client.query(
        `SELECT d.dia, d.objetivo, d.atividade, d.tipo, (p.inicio + (d.dia - 1))::text AS data
           FROM plano_dias d JOIN planos_aluno p ON p.aluno_id = d.aluno_id
          WHERE d.tenant_id = $1 AND d.aluno_id = $2 AND d.status = 'pendente'
          ORDER BY d.dia LIMIT 1`,
        [tenantId, userId],
      );
      const semana = await client.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE d.status <> 'pendente')::int AS feitos
           FROM plano_dias d JOIN planos_aluno p ON p.aluno_id = d.aluno_id
          WHERE d.tenant_id = $1 AND d.aluno_id = $2
            AND (p.inicio + (d.dia - 1)) BETWEEN date_trunc('week', $3::date)::date
                AND (date_trunc('week', $3::date)::date + 6)`,
        [tenantId, userId, today()],
      );
      const temPlano = await client.query(
        'SELECT 1 FROM planos_aluno WHERE tenant_id = $1 AND aluno_id = $2',
        [tenantId, userId],
      );
      const recado = await client.query(
        `SELECT n.texto, n.created_at, u.nome AS mentor
           FROM mentoria_notas n JOIN usuarios u ON u.id = n.mentor_id
          WHERE n.tenant_id = $1 AND n.aluno_id = $2 AND n.visibilidade = 'compartilhada'
          ORDER BY n.created_at DESC LIMIT 1`,
        [tenantId, userId],
      );
      const sessao = await client.query(
        `SELECT id, titulo, inicio_at, link FROM mentorias_sessao
          WHERE tenant_id = $1 AND aluno_id = $2 AND status = 'agendada' AND inicio_at >= now()
          ORDER BY inicio_at LIMIT 1`,
        [tenantId, userId],
      );
      const praticas = await client.query(
        `SELECT count(*) FILTER (WHERE status = 'devolvida')::int AS devolvidas,
                count(*) FILTER (WHERE status = 'enviada')::int AS aguardando,
                count(*) FILTER (WHERE status = 'rascunho')::int AS rascunhos
           FROM praticas_edital WHERE tenant_id = $1 AND aluno_id = $2`,
        [tenantId, userId],
      );
      const certificados = await client.query(
        'SELECT count(*)::int AS total FROM certificados_internos WHERE tenant_id = $1 AND aluno_id = $2',
        [tenantId, userId],
      );
      return {
        progresso: progresso.rows[0] ?? { aulas_total: 0, aulas_concluidas: 0 },
        continuar: partial.rows[0] ?? next?.rows[0] ?? null,
        plano_criado: Boolean(temPlano.rows[0]),
        proxima_atividade: plano.rows[0] ?? null,
        meta_semana: semana.rows[0] ?? { total: 0, feitos: 0 },
        recado_mentor: recado.rows[0] ?? null,
        proxima_sessao: sessao.rows[0] ?? null,
        praticas: praticas.rows[0],
        certificados: certificados.rows[0]?.total ?? 0,
      };
    });
    return reply.send(result);
  });

  app.get('/aluno/progresso', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { tenantId, sub: userId } = request.user;
    const result = await withTenant(pool, authContext(request), async (client) => {
      const lessons = await client.query(
        `SELECT tr.slug AS trilha_slug, a.id AS aula_id, coalesce(pa.concluida, false) AS concluida,
                coalesce(pa.percentual, 0)::int AS percentual
           FROM aulas a JOIN modulos m ON m.id = a.modulo_id JOIN trilhas tr ON tr.id = m.trilha_id
           LEFT JOIN progresso_aula pa ON pa.aula_id = a.id AND pa.usuario_id = $2 AND pa.tenant_id = $1`,
        [tenantId, userId],
      );
      const quizzes = await client.query(
        `SELECT q.id AS quiz_id, q.modulo_id, max(qt.nota)::float AS melhor_nota, count(qt.id)::int AS tentativas
           FROM quizzes q
           LEFT JOIN quiz_tentativas qt ON qt.quiz_id = q.id AND qt.usuario_id = $2 AND qt.tenant_id = $1
          GROUP BY q.id`,
        [tenantId, userId],
      );
      return { aulas: lessons.rows, quizzes: quizzes.rows };
    });
    return reply.send(result);
  });

  app.get('/aluno/plano', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const plan = await withTenant(pool, authContext(request), (client) =>
      readPlan(client, request.user.tenantId, request.user.sub),
    );
    return reply.send({ plano: plan });
  });

  app.post('/aluno/plano/gerar', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const body = z
      .object({ trilha: z.string().max(120).optional(), inicio: z.string().date().optional() })
      .parse(request.body ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      const generated = await generatePlan(
        client,
        request.user.tenantId,
        request.user.sub,
        request.user.sub,
        body.trilha,
        body.inicio ?? today(),
      );
      if (generated)
        await audit(client, request, 'plan.generated', 'plano_aluno', request.user.sub);
      return generated ? readPlan(client, request.user.tenantId, request.user.sub) : null;
    });
    if (!result) return reply.code(404).send({ error: 'track_not_found' });
    return reply.code(201).send({ plano: result });
  });

  app.patch('/aluno/plano/dias/:dia', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { dia } = dayParams.parse(request.params);
    const body = z.object({ feito: z.boolean() }).parse(request.body ?? {});
    const updated = await withTenant(pool, authContext(request), async (client) => {
      const result = await client.query(
        `UPDATE plano_dias SET
            status = CASE WHEN $4::boolean THEN (CASE WHEN status = 'revisado' THEN 'revisado' ELSE 'feito' END) ELSE 'pendente' END,
            feito_em = CASE WHEN $4::boolean THEN coalesce(feito_em, now()) ELSE NULL END,
            revisado_em = CASE WHEN $4::boolean THEN revisado_em ELSE NULL END,
            updated_at = now()
          WHERE tenant_id = $1 AND aluno_id = $2 AND dia = $3
          RETURNING dia, status, feito_em`,
        [request.user.tenantId, request.user.sub, dia, body.feito],
      );
      if (result.rows[0])
        await audit(client, request, 'plan.day_updated', 'plano_dia', request.user.sub, {
          dia,
          feito: body.feito,
        });
      return result.rows[0];
    });
    if (!updated) return reply.code(404).send({ error: 'plan_day_not_found' });
    return reply.send(updated);
  });

  app.get('/aluno/praticas', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT p.id, p.edital_id, p.status, p.enviada_em, p.devolvida_em, p.nota, p.devolutiva,
                p.updated_at, e.titulo, e.orgao, e.uf, e.modalidade
           FROM praticas_edital p JOIN editais e ON e.id = p.edital_id
          WHERE p.tenant_id = $1 AND p.aluno_id = $2
          ORDER BY p.updated_at DESC LIMIT 100`,
        [request.user.tenantId, request.user.sub],
      ),
    );
    return reply.send({ data: result.rows });
  });

  app.get('/aluno/praticas/:editalId', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { editalId } = z.object({ editalId: uuid }).parse(request.params);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const edital = await client.query(
        `SELECT id, titulo, orgao, uf, municipio_nome, modalidade, situacao, valor_estimado,
                data_encerramento_proposta, url_origem, fonte, conteudo_texto
           FROM editais WHERE id = $1`,
        [editalId],
      );
      if (!edital.rows[0]) return null;
      const practice = await client.query(
        `SELECT id, status, respostas, enviada_em, devolutiva, nota, devolvida_em, updated_at
           FROM praticas_edital WHERE tenant_id = $1 AND aluno_id = $2 AND edital_id = $3`,
        [request.user.tenantId, request.user.sub, editalId],
      );
      return { edital: edital.rows[0], pratica: practice.rows[0] ?? null };
    });
    if (!result) return reply.code(404).send({ error: 'edital_not_found' });
    return reply.send({
      ...result,
      perguntas: PRACTICE_QUESTIONS,
      minimo_caracteres: MIN_ANSWER_LENGTH,
    });
  });

  app.put('/aluno/praticas/:editalId', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { editalId } = z.object({ editalId: uuid }).parse(request.params);
    const body = answersBody.parse(request.body ?? {});
    const known = new Set<string>(PRACTICE_QUESTIONS.map((q) => q.id));
    const respostas = Object.fromEntries(
      Object.entries(body.respostas).filter(([key]) => known.has(key)),
    );
    const saved = await withTenant(pool, authContext(request), async (client) => {
      const exists = await client.query('SELECT 1 FROM editais WHERE id = $1', [editalId]);
      if (!exists.rows[0]) return 'missing' as const;
      const current = await client.query<{ status: string }>(
        'SELECT status FROM praticas_edital WHERE tenant_id = $1 AND aluno_id = $2 AND edital_id = $3',
        [request.user.tenantId, request.user.sub, editalId],
      );
      if (current.rows[0]?.status === 'enviada') return 'locked' as const;
      const result = await client.query(
        `INSERT INTO praticas_edital (tenant_id, aluno_id, edital_id, respostas)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (aluno_id, edital_id) DO UPDATE SET
           respostas = EXCLUDED.respostas,
           status = CASE WHEN praticas_edital.status = 'devolvida' THEN 'rascunho' ELSE praticas_edital.status END,
           updated_at = now()
         RETURNING id, status, respostas, updated_at`,
        [request.user.tenantId, request.user.sub, editalId, JSON.stringify(respostas)],
      );
      return result.rows[0];
    });
    if (saved === 'missing') return reply.code(404).send({ error: 'edital_not_found' });
    if (saved === 'locked')
      return reply.code(409).send({
        error: 'practice_locked',
        message: 'Esta prática já foi enviada e aguarda o mentor.',
      });
    return reply.send(saved);
  });

  app.post('/aluno/praticas/:editalId/enviar', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { editalId } = z.object({ editalId: uuid }).parse(request.params);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const current = await client.query<{
        id: string;
        status: string;
        respostas: Record<string, unknown>;
      }>(
        'SELECT id, status, respostas FROM praticas_edital WHERE tenant_id = $1 AND aluno_id = $2 AND edital_id = $3',
        [request.user.tenantId, request.user.sub, editalId],
      );
      const row = current.rows[0];
      if (!row) return { error: 'practice_not_found' as const };
      if (row.status === 'enviada') return { error: 'practice_locked' as const };
      const missing = missingAnswers(row.respostas);
      if (missing.length) return { error: 'practice_incomplete' as const, missing };
      await client.query(
        `UPDATE praticas_edital SET status = 'enviada', enviada_em = now(), updated_at = now() WHERE id = $1`,
        [row.id],
      );
      const mentors = await client.query<{ mentor_id: string }>(
        `SELECT mentor_id FROM mentor_mentorado WHERE tenant_id = $1 AND mentorado_id = $2 AND status = 'ativo'
         UNION
         SELECT t.mentor_id FROM matriculas m JOIN turmas t ON t.id = m.turma_id
          WHERE m.tenant_id = $1 AND m.aluno_id = $2 AND m.status = 'ativa' AND t.mentor_id IS NOT NULL`,
        [request.user.tenantId, request.user.sub],
      );
      for (const mentor of mentors.rows) {
        await notify(
          client,
          request.user.tenantId,
          mentor.mentor_id,
          'Nova prática para devolutiva',
          'Um aluno enviou uma prática com edital real.',
          '/mentor/devolutivas',
          'pratica_enviada',
        );
      }
      await audit(client, request, 'practice.submitted', 'pratica_edital', row.id);
      return { ok: true as const, id: row.id };
    });
    if ('error' in result) {
      const code =
        result.error === 'practice_not_found'
          ? 404
          : result.error === 'practice_locked'
            ? 409
            : 400;
      const message =
        result.error === 'practice_incomplete'
          ? 'Responda todas as perguntas obrigatórias (mínimo de 10 letras cada) antes de enviar.'
          : undefined;
      return reply.code(code).send({
        error: result.error,
        ...(message ? { message } : {}),
        ...('missing' in result ? { faltando: result.missing } : {}),
      });
    }
    return reply.send(result);
  });

  app.get('/aluno/mentoria', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { tenantId, sub: userId } = request.user;
    const result = await withTenant(pool, authContext(request), async (client) => {
      const mentors = await client.query(
        `SELECT DISTINCT u.id, u.nome FROM usuarios u WHERE u.tenant_id = $1 AND u.id IN (
           SELECT mentor_id FROM mentor_mentorado WHERE tenant_id = $1 AND mentorado_id = $2 AND status = 'ativo'
           UNION SELECT t.mentor_id FROM matriculas m JOIN turmas t ON t.id = m.turma_id
                  WHERE m.tenant_id = $1 AND m.aluno_id = $2 AND m.status = 'ativa')`,
        [tenantId, userId],
      );
      const sessions = await client.query(
        `SELECT s.id, s.titulo, s.status, s.inicio_at, s.fim_at, s.link, s.resumo, u.nome AS mentor
           FROM mentorias_sessao s JOIN usuarios u ON u.id = s.mentor_id
          WHERE s.tenant_id = $1 AND s.aluno_id = $2
          ORDER BY s.inicio_at DESC NULLS LAST LIMIT 50`,
        [tenantId, userId],
      );
      const notes = await client.query(
        `SELECT n.id, n.texto, n.created_at, u.nome AS mentor
           FROM mentoria_notas n JOIN usuarios u ON u.id = n.mentor_id
          WHERE n.tenant_id = $1 AND n.aluno_id = $2 AND n.visibilidade = 'compartilhada'
          ORDER BY n.created_at DESC LIMIT 50`,
        [tenantId, userId],
      );
      return { mentores: mentors.rows, sessoes: sessions.rows, notas: notes.rows };
    });
    return reply.send(result);
  });

  app.get('/aluno/certificados', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_VIEW)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { tenantId, sub: userId } = request.user;
    const result = await withTenant(pool, authContext(request), async (client) => {
      const tracks = await client.query(
        `SELECT tr.id, tr.slug, tr.titulo,
                count(a.id)::int AS aulas_total,
                count(a.id) FILTER (WHERE pa.concluida)::int AS aulas_concluidas,
                c.codigo, c.emitido_em
           FROM trilhas tr
           LEFT JOIN modulos m ON m.trilha_id = tr.id
           LEFT JOIN aulas a ON a.modulo_id = m.id
           LEFT JOIN progresso_aula pa ON pa.aula_id = a.id AND pa.usuario_id = $2 AND pa.tenant_id = $1
           LEFT JOIN certificados_internos c ON c.trilha_id = tr.id AND c.aluno_id = $2 AND c.tenant_id = $1
          GROUP BY tr.id, c.codigo, c.emitido_em
          ORDER BY tr.titulo`,
        [tenantId, userId],
      );
      const person = await client.query<{ nome: string }>(
        'SELECT nome FROM usuarios WHERE id = $1',
        [userId],
      );
      return { aluno: person.rows[0]?.nome ?? '', trilhas: tracks.rows };
    });
    return reply.send({
      ...result,
      aviso:
        'Certificado interno do Licite Comigo. Comprova a conclusão do conteúdo na plataforma e não tem validade jurídica nem equivale a diploma ou habilitação.',
    });
  });

  app.post('/aluno/certificados', async (request, reply) => {
    if (!requireRoles(reply, request, STUDENT_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { trilha } = z.object({ trilha: z.string().min(1).max(120) }).parse(request.body ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      const track = await client.query<{ id: string }>('SELECT id FROM trilhas WHERE slug = $1', [
        trilha,
      ]);
      if (!track.rows[0]) return { error: 'track_not_found' as const };
      const counts = await client.query<{ total: number; feitas: number }>(
        `SELECT count(a.id)::int AS total,
                count(a.id) FILTER (WHERE pa.concluida)::int AS feitas
           FROM aulas a JOIN modulos m ON m.id = a.modulo_id
           LEFT JOIN progresso_aula pa ON pa.aula_id = a.id AND pa.usuario_id = $2 AND pa.tenant_id = $3
          WHERE m.trilha_id = $1`,
        [track.rows[0].id, request.user.sub, request.user.tenantId],
      );
      const { total = 0, feitas = 0 } = counts.rows[0] ?? {};
      if (total === 0 || feitas < total)
        return { error: 'track_not_finished' as const, total, feitas };
      const code = `LC-${randomBytes(5).toString('hex').toUpperCase()}`;
      const saved = await client.query(
        `INSERT INTO certificados_internos (tenant_id, aluno_id, trilha_id, codigo, aulas_total)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (aluno_id, trilha_id) DO UPDATE SET aulas_total = EXCLUDED.aulas_total
         RETURNING codigo, emitido_em, aulas_total`,
        [request.user.tenantId, request.user.sub, track.rows[0].id, code, total],
      );
      await audit(client, request, 'certificate.issued', 'trilha', track.rows[0].id);
      return { ok: true as const, certificado: saved.rows[0] };
    });
    if ('error' in result) {
      if (result.error === 'track_not_found') return reply.code(404).send({ error: result.error });
      return reply.code(400).send({
        error: result.error,
        message: `Conclua todas as aulas da trilha para emitir o certificado (${result.feitas} de ${result.total}).`,
      });
    }
    return reply.code(201).send(result);
  });

  // --------------------------------------------------------------- Mentor

  const studentScope = `
    ($2::text = 'admin' OR EXISTS (
       SELECT 1 FROM mentor_mentorado mm
        WHERE mm.tenant_id = $1 AND mm.mentor_id = $3 AND mm.mentorado_id = u.id AND mm.status = 'ativo')
     OR EXISTS (
       SELECT 1 FROM matriculas m JOIN turmas t ON t.id = m.turma_id
        WHERE m.tenant_id = $1 AND t.mentor_id = $3 AND m.aluno_id = u.id AND m.status = 'ativa'))`;
  const roleOf = (role: string) => (role === 'plataforma' ? 'admin' : role);

  app.get('/mentor/alunos', async (request, reply) => {
    if (!requireRoles(reply, request, TEACHING)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT u.id, u.nome, u.email, u.onboarding_concluido,
                (SELECT count(*) FROM progresso_aula pa WHERE pa.usuario_id = u.id AND pa.concluida)::int AS aulas_concluidas,
                (SELECT count(*) FROM aulas)::int AS aulas_total,
                (SELECT max(updated_at) FROM progresso_aula pa WHERE pa.usuario_id = u.id) AS ultimo_progresso,
                (SELECT count(*) FROM plano_dias d WHERE d.aluno_id = u.id AND d.status <> 'pendente')::int AS plano_feitos,
                (SELECT count(*) FROM plano_dias d WHERE d.aluno_id = u.id)::int AS plano_total,
                (SELECT count(*) FROM plano_dias d WHERE d.aluno_id = u.id AND d.status = 'feito')::int AS plano_a_revisar,
                (SELECT count(*) FROM praticas_edital p WHERE p.aluno_id = u.id AND p.status = 'enviada')::int AS praticas_a_devolver,
                (SELECT min(s.inicio_at) FROM mentorias_sessao s WHERE s.aluno_id = u.id AND s.status = 'agendada' AND s.inicio_at >= now()) AS proxima_sessao
           FROM usuarios u
          WHERE u.tenant_id = $1 AND u.papel = 'aluno' AND u.ativo AND ${studentScope}
          ORDER BY u.nome`,
        [request.user.tenantId, roleOf(request.user.role), request.user.sub],
      ),
    );
    return reply.send({ data: result.rows });
  });

  async function assertStudent(
    client: DbClient,
    request: { user: { tenantId: string; sub: string; role: string } },
    alunoId: string,
  ) {
    const found = await client.query<{ id: string; nome: string; email: string }>(
      `SELECT u.id, u.nome, u.email FROM usuarios u
        WHERE u.tenant_id = $1 AND u.id = $4 AND u.papel = 'aluno' AND ${studentScope}`,
      [request.user.tenantId, roleOf(request.user.role), request.user.sub, alunoId],
    );
    return found.rows[0] ?? null;
  }

  app.get('/mentor/alunos/:alunoId', async (request, reply) => {
    if (!requireRoles(reply, request, TEACHING)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { alunoId } = alunoParams.parse(request.params);
    const result = await withTenant(pool, authContext(request), async (client) => {
      const student = await assertStudent(client, request, alunoId);
      if (!student) return null;
      const tenantId = request.user.tenantId;
      const lessons = await client.query(
        `SELECT tr.titulo AS trilha, m.titulo AS modulo, a.titulo AS aula,
                coalesce(pa.concluida, false) AS concluida, coalesce(pa.percentual, 0)::int AS percentual,
                pa.updated_at
           FROM aulas a JOIN modulos m ON m.id = a.modulo_id JOIN trilhas tr ON tr.id = m.trilha_id
           LEFT JOIN progresso_aula pa ON pa.aula_id = a.id AND pa.usuario_id = $2 AND pa.tenant_id = $1
          ORDER BY tr.titulo, m.ordem, a.ordem`,
        [tenantId, alunoId],
      );
      const quizzes = await client.query(
        `SELECT q.titulo, max(qt.nota)::float AS melhor_nota, count(qt.id)::int AS tentativas
           FROM quizzes q JOIN quiz_tentativas qt ON qt.quiz_id = q.id AND qt.usuario_id = $2 AND qt.tenant_id = $1
          GROUP BY q.id ORDER BY q.titulo`,
        [tenantId, alunoId],
      );
      const plan = await readPlan(client, tenantId, alunoId);
      const practices = await client.query(
        `SELECT p.id, p.edital_id, p.status, p.respostas, p.enviada_em, p.devolutiva, p.nota, p.devolvida_em,
                e.titulo, e.orgao
           FROM praticas_edital p JOIN editais e ON e.id = p.edital_id
          WHERE p.tenant_id = $1 AND p.aluno_id = $2 AND p.status <> 'rascunho'
          ORDER BY p.enviada_em DESC NULLS LAST`,
        [tenantId, alunoId],
      );
      const notes = await client.query(
        `SELECT id, texto, visibilidade, created_at FROM mentoria_notas
          WHERE tenant_id = $1 AND aluno_id = $2 ORDER BY created_at DESC LIMIT 100`,
        [tenantId, alunoId],
      );
      const sessions = await client.query(
        `SELECT id, titulo, status, inicio_at, fim_at, link, notas, resumo FROM mentorias_sessao
          WHERE tenant_id = $1 AND aluno_id = $2 ORDER BY inicio_at DESC NULLS LAST LIMIT 50`,
        [tenantId, alunoId],
      );
      const certificates = await client.query(
        `SELECT c.codigo, c.emitido_em, t.titulo FROM certificados_internos c JOIN trilhas t ON t.id = c.trilha_id
          WHERE c.tenant_id = $1 AND c.aluno_id = $2`,
        [tenantId, alunoId],
      );
      return {
        aluno: student,
        aulas: lessons.rows,
        questionarios: quizzes.rows,
        plano: plan,
        praticas: practices.rows,
        notas: notes.rows,
        sessoes: sessions.rows,
        certificados: certificates.rows,
        perguntas: PRACTICE_QUESTIONS,
      };
    });
    if (!result) return reply.code(404).send({ error: 'student_not_found' });
    return reply.send(result);
  });

  app.post('/mentor/alunos/:alunoId/plano/gerar', async (request, reply) => {
    if (!requireRoles(reply, request, MENTOR_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { alunoId } = alunoParams.parse(request.params);
    const body = z
      .object({ trilha: z.string().max(120).optional(), inicio: z.string().date().optional() })
      .parse(request.body ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      if (!(await assertStudent(client, request, alunoId))) return 'missing' as const;
      const generated = await generatePlan(
        client,
        request.user.tenantId,
        alunoId,
        request.user.sub,
        body.trilha,
        body.inicio ?? today(),
      );
      if (!generated) return 'track' as const;
      await notify(
        client,
        request.user.tenantId,
        alunoId,
        'Seu plano de 30 dias está pronto',
        'O mentor montou o seu plano. Veja o dia de hoje.',
        '/plano-30-dias',
        'plano_gerado',
      );
      await audit(client, request, 'plan.generated_by_mentor', 'plano_aluno', alunoId);
      return readPlan(client, request.user.tenantId, alunoId);
    });
    if (result === 'missing') return reply.code(404).send({ error: 'student_not_found' });
    if (result === 'track') return reply.code(404).send({ error: 'track_not_found' });
    return reply.code(201).send({ plano: result });
  });

  app.patch('/mentor/alunos/:alunoId/plano/dias/:dia', async (request, reply) => {
    if (!requireRoles(reply, request, MENTOR_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { alunoId, dia } = alunoDayParams.parse(request.params);
    const body = z
      .object({
        objetivo: z.string().trim().min(3).max(300).optional(),
        atividade: z.string().trim().min(3).max(1000).optional(),
        comentario: z.string().trim().max(1000).optional(),
        revisado: z.boolean().optional(),
      })
      .parse(request.body ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      if (!(await assertStudent(client, request, alunoId))) return 'missing' as const;
      const updated = await client.query(
        `UPDATE plano_dias SET
            objetivo = coalesce($4, objetivo), atividade = coalesce($5, atividade),
            comentario_mentor = coalesce($6, comentario_mentor),
            ajustado_pelo_mentor = ajustado_pelo_mentor OR ($4::text IS NOT NULL OR $5::text IS NOT NULL),
            status = CASE WHEN $7::boolean IS TRUE THEN 'revisado' ELSE status END,
            revisado_em = CASE WHEN $7::boolean IS TRUE THEN now() ELSE revisado_em END,
            revisado_por = CASE WHEN $7::boolean IS TRUE THEN $8 ELSE revisado_por END,
            updated_at = now()
          WHERE tenant_id = $1 AND aluno_id = $2 AND dia = $3
            AND ($7::boolean IS NOT TRUE OR status IN ('feito', 'revisado'))
          RETURNING dia, objetivo, atividade, status, comentario_mentor, ajustado_pelo_mentor`,
        [
          request.user.tenantId,
          alunoId,
          dia,
          body.objetivo ?? null,
          body.atividade ?? null,
          body.comentario ?? null,
          body.revisado ?? null,
          request.user.sub,
        ],
      );
      if (!updated.rows[0]) return 'day' as const;
      if (body.revisado || body.comentario) {
        await notify(
          client,
          request.user.tenantId,
          alunoId,
          `Dia ${dia} do plano revisado`,
          body.comentario ?? 'O mentor revisou este dia.',
          '/plano-30-dias',
          'plano_revisado',
        );
      }
      await audit(client, request, 'plan.day_reviewed', 'plano_dia', alunoId, { dia });
      return updated.rows[0];
    });
    if (result === 'missing') return reply.code(404).send({ error: 'student_not_found' });
    if (result === 'day')
      return reply.code(409).send({
        error: 'plan_day_not_ready',
        message: 'Só dá para revisar um dia que o aluno marcou como feito.',
      });
    return reply.send(result);
  });

  app.get('/mentor/devolutivas', async (request, reply) => {
    if (!requireRoles(reply, request, TEACHING)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const status = z
      .enum(['enviada', 'devolvida'])
      .default('enviada')
      .parse((request.query as { status?: string }).status);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT p.id, p.aluno_id, u.nome AS aluno, p.edital_id, e.titulo, e.orgao, p.status, p.respostas,
                p.enviada_em, p.devolutiva, p.nota, p.devolvida_em
           FROM praticas_edital p
           JOIN usuarios u ON u.id = p.aluno_id
           JOIN editais e ON e.id = p.edital_id
          WHERE p.tenant_id = $1 AND p.status = $4 AND ${studentScope}
          ORDER BY coalesce(p.devolvida_em, p.enviada_em) DESC LIMIT 100`,
        [request.user.tenantId, roleOf(request.user.role), request.user.sub, status],
      ),
    );
    return reply.send({ data: result.rows, perguntas: PRACTICE_QUESTIONS });
  });

  app.post('/mentor/praticas/:id/devolutiva', async (request, reply) => {
    if (!requireRoles(reply, request, MENTOR_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z
      .object({
        devolutiva: z.string().trim().min(10).max(4000),
        nota: z.number().int().min(1).max(5).optional(),
      })
      .parse(request.body ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      const found = await client.query<{ aluno_id: string; status: string }>(
        'SELECT aluno_id, status FROM praticas_edital WHERE tenant_id = $1 AND id = $2',
        [request.user.tenantId, id],
      );
      const row = found.rows[0];
      if (!row || !(await assertStudent(client, request, row.aluno_id))) return 'missing' as const;
      if (row.status === 'rascunho') return 'draft' as const;
      await client.query(
        `UPDATE praticas_edital SET status = 'devolvida', devolutiva = $3, nota = $4,
                devolvida_por = $5, devolvida_em = now(), updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [request.user.tenantId, id, body.devolutiva, body.nota ?? null, request.user.sub],
      );
      await notify(
        client,
        request.user.tenantId,
        row.aluno_id,
        'Você recebeu uma devolutiva',
        'O mentor comentou a sua prática com edital real.',
        '/praticar',
        'devolutiva',
      );
      await audit(client, request, 'practice.returned', 'pratica_edital', id);
      return 'ok' as const;
    });
    if (result === 'missing') return reply.code(404).send({ error: 'practice_not_found' });
    if (result === 'draft')
      return reply.code(409).send({
        error: 'practice_not_submitted',
        message: 'O aluno ainda não enviou esta prática.',
      });
    return reply.send({ ok: true });
  });

  app.post('/mentor/alunos/:alunoId/notas', async (request, reply) => {
    if (!requireRoles(reply, request, MENTOR_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { alunoId } = alunoParams.parse(request.params);
    const body = z
      .object({
        texto: z.string().trim().min(1).max(4000),
        visibilidade: z.enum(['privada', 'compartilhada']).default('privada'),
      })
      .parse(request.body ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      if (!(await assertStudent(client, request, alunoId))) return null;
      const saved = await client.query(
        `INSERT INTO mentoria_notas (tenant_id, mentor_id, aluno_id, texto, visibilidade)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, texto, visibilidade, created_at`,
        [request.user.tenantId, request.user.sub, alunoId, body.texto, body.visibilidade],
      );
      if (body.visibilidade === 'compartilhada') {
        await notify(
          client,
          request.user.tenantId,
          alunoId,
          'Recado do mentor',
          body.texto.slice(0, 140),
          '/mentoria',
          'nota_mentor',
        );
      }
      await audit(client, request, 'mentor_note.created', 'mentoria_nota', saved.rows[0].id, {
        visibilidade: body.visibilidade,
      });
      return saved.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'student_not_found' });
    return reply.code(201).send(result);
  });

  app.delete('/mentor/notas/:id', async (request, reply) => {
    if (!requireRoles(reply, request, MENTOR_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const removed = await withTenant(pool, authContext(request), async (client) => {
      const result = await client.query(
        'DELETE FROM mentoria_notas WHERE tenant_id = $1 AND id = $2 AND mentor_id = $3 RETURNING id',
        [request.user.tenantId, id, request.user.sub],
      );
      if (result.rows[0]) await audit(client, request, 'mentor_note.deleted', 'mentoria_nota', id);
      return result.rows[0];
    });
    if (!removed) return reply.code(404).send({ error: 'note_not_found' });
    return reply.code(204).send();
  });

  const sessionBody = z.object({
    aluno_id: uuid,
    titulo: z.string().trim().min(3).max(200),
    inicio_at: z.string().datetime({ offset: true }),
    fim_at: z.string().datetime({ offset: true }).optional(),
    link: z.string().url().max(500).optional(),
  });

  app.get('/mentor/sessoes', async (request, reply) => {
    if (!requireRoles(reply, request, TEACHING)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const result = await withTenant(pool, authContext(request), async (client) =>
      client.query(
        `SELECT s.id, s.aluno_id, u.nome AS aluno, s.titulo, s.status, s.inicio_at, s.fim_at, s.link, s.notas, s.resumo
           FROM mentorias_sessao s JOIN usuarios u ON u.id = s.aluno_id
          WHERE s.tenant_id = $1 AND ($2::text = 'admin' OR s.mentor_id = $3)
          ORDER BY s.inicio_at DESC NULLS LAST LIMIT 200`,
        [request.user.tenantId, roleOf(request.user.role), request.user.sub],
      ),
    );
    return reply.send({ data: result.rows });
  });

  app.post('/mentor/sessoes', async (request, reply) => {
    if (!requireRoles(reply, request, MENTOR_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const body = sessionBody.parse(request.body ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      if (!(await assertStudent(client, request, body.aluno_id))) return null;
      const saved = await client.query(
        `INSERT INTO mentorias_sessao (tenant_id, mentor_id, aluno_id, titulo, inicio_at, fim_at, link)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, aluno_id, titulo, status, inicio_at, fim_at, link`,
        [
          request.user.tenantId,
          request.user.sub,
          body.aluno_id,
          body.titulo,
          body.inicio_at,
          body.fim_at ?? null,
          body.link ?? null,
        ],
      );
      await notify(
        client,
        request.user.tenantId,
        body.aluno_id,
        'Sessão de mentoria marcada',
        body.titulo,
        '/mentoria',
        'sessao_marcada',
      );
      await audit(client, request, 'mentor_session.created', 'mentoria_sessao', saved.rows[0].id);
      return saved.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'student_not_found' });
    return reply.code(201).send(result);
  });

  app.patch('/mentor/sessoes/:id', async (request, reply) => {
    if (!requireRoles(reply, request, MENTOR_ONLY)) return reply;
    if (!pool) return sendDatabaseUnavailable(reply);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z
      .object({
        status: z.enum(['agendada', 'realizada', 'cancelada']).optional(),
        inicio_at: z.string().datetime({ offset: true }).optional(),
        fim_at: z.string().datetime({ offset: true }).optional(),
        link: z.string().url().max(500).optional(),
        notas: z.string().max(4000).optional(),
        resumo: z.string().max(4000).optional(),
      })
      .parse(request.body ?? {});
    const result = await withTenant(pool, authContext(request), async (client) => {
      const updated = await client.query(
        `UPDATE mentorias_sessao SET
            status = coalesce($4, status), inicio_at = coalesce($5, inicio_at), fim_at = coalesce($6, fim_at),
            link = coalesce($7, link), notas = coalesce($8, notas), resumo = coalesce($9, resumo), updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND mentor_id = $3
          RETURNING id, aluno_id, titulo, status, inicio_at, fim_at, link, notas, resumo`,
        [
          request.user.tenantId,
          id,
          request.user.sub,
          body.status ?? null,
          body.inicio_at ?? null,
          body.fim_at ?? null,
          body.link ?? null,
          body.notas ?? null,
          body.resumo ?? null,
        ],
      );
      const row = updated.rows[0];
      if (row && (body.resumo || body.status === 'cancelada' || body.inicio_at)) {
        await notify(
          client,
          request.user.tenantId,
          row.aluno_id,
          body.status === 'cancelada' ? 'Sessão cancelada' : 'Sessão de mentoria atualizada',
          row.titulo,
          '/mentoria',
          'sessao_atualizada',
        );
      }
      if (row) await audit(client, request, 'mentor_session.updated', 'mentoria_sessao', id);
      return row;
    });
    if (!result) return reply.code(404).send({ error: 'session_not_found' });
    return reply.send(result);
  });
}
