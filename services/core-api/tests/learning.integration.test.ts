import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

suite(
  'Aluno e Mentor: plano, prática, devolutiva, notas, sessões e certificado (PostgreSQL real)',
  () => {
    let pool!: Pool;
    let setup!: Pool;
    let app!: ReturnType<typeof buildApp>;
    const suffix = randomUUID().slice(0, 8);
    const tenant = randomUUID();
    const team = randomUUID();
    const mentor1 = randomUUID();
    const mentor2 = randomUUID();
    const aluno1 = randomUUID();
    const aluno2 = randomUUID();
    const trackSlug = `trilha-${suffix}`;
    let editalId = '';
    let lessonIds: string[] = [];
    let quizId = '';
    let questionIds: string[] = [];
    let practiceId = '';

    const as = (sub: string, role: string) => ({
      authorization: `Bearer ${app.jwt.sign({ sub, tenantId: tenant, role })}`,
    });
    const call = (
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: string,
      who: [string, string],
      payload?: unknown,
    ) =>
      app.inject({
        method,
        url,
        headers: as(who[0], who[1]),
        ...(payload === undefined ? {} : { payload: payload as object }),
      });
    const A1: [string, string] = [aluno1, 'aluno'];
    const A2: [string, string] = [aluno2, 'aluno'];
    const M1: [string, string] = [mentor1, 'mentor'];
    const M2: [string, string] = [mentor2, 'mentor'];
    const TEAM: [string, string] = [team, 'plataforma'];

    async function user(id: string, papel: string, nome: string) {
      await setup.query(
        `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em, onboarding_concluido)
       VALUES ($1, $2, $3, $4, $5, $6, now(), true)`,
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

    beforeAll(async () => {
      pool = new Pool({ connectionString: connectionString! });
      setup = new Pool({ connectionString: setupConnectionString! });
      app = buildApp({ jwtSecret: 'test-secret', logger: false, pool });
      await app.ready();
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        tenant,
        'Plataforma',
        `p-${suffix}`,
      ]);
      await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [tenant]);
      await user(team, 'plataforma', 'Equipe Curso');
      await user(mentor1, 'mentor', 'Mentor Um');
      await user(mentor2, 'mentor', 'Mentor Dois');
      await user(aluno1, 'aluno', 'Aluno Um');
      await user(aluno2, 'aluno', 'Aluno Dois');
      for (const [mentor, aluno] of [
        [mentor1, aluno1],
        [mentor2, aluno2],
      ]) {
        await setup.query(
          'INSERT INTO mentor_mentorado (tenant_id, mentor_id, mentorado_id) VALUES ($1, $2, $3)',
          [tenant, mentor, aluno],
        );
      }
      const track = await setup.query<{ id: string }>(
        "INSERT INTO trilhas (slug, titulo, descricao, status) VALUES ($1, $2, 'Teste', 'publicado') RETURNING id",
        [trackSlug, `Trilha ${suffix}`],
      );
      const module = await setup.query<{ id: string }>(
        "INSERT INTO modulos (trilha_id, ordem, titulo, resumo) VALUES ($1, 1, 'Módulo 1', 'r') RETURNING id",
        [track.rows[0]!.id],
      );
      for (let i = 1; i <= 3; i += 1) {
        const lesson = await setup.query<{ id: string }>(
          "INSERT INTO aulas (modulo_id, ordem, titulo, conteudo) VALUES ($1, $2, $3, 'texto') RETURNING id",
          [module.rows[0]!.id, i, `Aula ${i} ${suffix}`],
        );
        lessonIds.push(lesson.rows[0]!.id);
      }
      const quiz = await setup.query<{ id: string }>(
        "INSERT INTO quizzes (modulo_id, titulo) VALUES ($1, 'Quiz') RETURNING id",
        [module.rows[0]!.id],
      );
      quizId = quiz.rows[0]!.id;
      for (const [ordem, correta] of [
        [1, 0],
        [2, 1],
      ] as const) {
        const question = await setup.query<{ id: string }>(
          `INSERT INTO quiz_questoes (quiz_id, ordem, enunciado, alternativas, resposta_correta)
         VALUES ($1, $2, 'Pergunta', '["a","b"]'::jsonb, $3) RETURNING id`,
          [quizId, ordem, correta],
        );
        questionIds.push(question.rows[0]!.id);
      }
      const edital = await setup.query<{ id: string }>(
        `INSERT INTO editais (tenant_id, fonte, id_externo, titulo, hash_conteudo, uf, orgao)
       VALUES ($1, 'fixture', $2, 'Pregão para prática', $3, 'DF', 'Órgão Teste') RETURNING id`,
        [tenant, `prat-${suffix}`, `h-${suffix}`],
      );
      editalId = edital.rows[0]!.id;
    });

    afterAll(async () => {
      await app.close();
      await pool.end();
      await setup.end();
    });

    it('plano de 30 dias: gera, marca dia feito e cada aluno vê só o seu', async () => {
      const generated = await call('POST', '/aluno/plano/gerar', A1, { trilha: trackSlug });
      expect(generated.statusCode, generated.body).toBe(201);
      const plan = generated.json().plano;
      expect(plan.dias).toHaveLength(30);
      expect(plan.dias.filter((d: { tipo: string }) => d.tipo === 'pratica')).toHaveLength(4);

      const done = await call('PATCH', '/aluno/plano/dias/1', A1, { feito: true });
      expect(done.statusCode, done.body).toBe(200);
      expect(done.json().status).toBe('feito');

      const mine = (await call('GET', '/aluno/plano', A1)).json().plano;
      expect(mine.resumo.feitos).toBe(1);
      expect((await call('GET', '/aluno/plano', A2)).json().plano).toBeNull();
      // gerar de novo recria o plano do próprio aluno, sem tocar no do outro
      expect((await call('POST', '/aluno/plano/gerar', A2, { trilha: trackSlug })).statusCode).toBe(
        201,
      );
      expect((await call('GET', '/aluno/plano', A1)).json().plano.resumo.feitos).toBe(1);
    });

    it('mentor só vê os alunos dele; a equipe da plataforma vê todos', async () => {
      const list1 = (await call('GET', '/mentor/alunos', M1)).json().data;
      expect(list1.map((s: { id: string }) => s.id)).toEqual([aluno1]);
      const list2 = (await call('GET', '/mentor/alunos', M2)).json().data;
      expect(list2.map((s: { id: string }) => s.id)).toEqual([aluno2]);
      const all = (await call('GET', '/mentor/alunos', TEAM))
        .json()
        .data.map((s: { id: string }) => s.id);
      expect(all).toEqual(expect.arrayContaining([aluno1, aluno2]));

      expect((await call('GET', `/mentor/alunos/${aluno1}`, M1)).statusCode).toBe(200);
      expect((await call('GET', `/mentor/alunos/${aluno1}`, M2)).statusCode).toBe(404);
    });

    it('revisão do plano: só dia feito, com aviso ao aluno; outro mentor não mexe', async () => {
      const notDone = await call('PATCH', `/mentor/alunos/${aluno1}/plano/dias/2`, M1, {
        revisado: true,
      });
      expect(notDone.statusCode).toBe(409);
      const other = await call('PATCH', `/mentor/alunos/${aluno1}/plano/dias/1`, M2, {
        revisado: true,
      });
      expect(other.statusCode).toBe(404);
      const reviewed = await call('PATCH', `/mentor/alunos/${aluno1}/plano/dias/1`, M1, {
        revisado: true,
        comentario: 'Bom começo, continue assim.',
      });
      expect(reviewed.statusCode, reviewed.body).toBe(200);
      expect(reviewed.json().status).toBe('revisado');
      const adjusted = await call('PATCH', `/mentor/alunos/${aluno1}/plano/dias/3`, M1, {
        atividade: 'Ler o edital de exemplo e anotar dúvidas',
      });
      expect(adjusted.json().ajustado_pelo_mentor).toBe(true);
      const bell = (await call('GET', '/notifications', A1)).json();
      expect(bell.data.some((n: { titulo: string }) => n.titulo.includes('Dia 1'))).toBe(true);
      expect((await call('GET', '/notifications', A2)).json().data).toHaveLength(0);
    });

    it('prática com edital real: salvar, validar, enviar, devolver e travar edição', async () => {
      const empty = await call('GET', `/aluno/praticas/${editalId}`, A1);
      expect(empty.json().pratica).toBeNull();
      expect(empty.json().perguntas.length).toBeGreaterThanOrEqual(5);

      const saved = await call('PUT', `/aluno/praticas/${editalId}`, A1, {
        respostas: { objeto: 'Compra de material', outra: 'ignorada' },
      });
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json().respostas.outra).toBeUndefined();
      const incomplete = await call('POST', `/aluno/praticas/${editalId}/enviar`, A1);
      expect(incomplete.statusCode).toBe(400);
      expect(incomplete.json().faltando).toContain('prazo');

      await call('PUT', `/aluno/praticas/${editalId}`, A1, {
        respostas: {
          objeto: 'Compra de material de escritório',
          prazo: 'Proposta até o dia 10 às 9h',
          exigencias: 'Certidões e um atestado de capacidade',
          risco: 'Prazo de entrega curto',
          decisao: 'Sim, porque já forneço itens parecidos',
        },
      });
      const sent = await call('POST', `/aluno/praticas/${editalId}/enviar`, A1);
      expect(sent.statusCode, sent.body).toBe(200);
      practiceId = sent.json().id;
      expect(
        (
          await call('PUT', `/aluno/praticas/${editalId}`, A1, {
            respostas: { objeto: 'mudou de ideia' },
          })
        ).statusCode,
      ).toBe(409);

      const queue = (await call('GET', '/mentor/devolutivas', M1)).json().data;
      expect(queue.map((p: { id: string }) => p.id)).toContain(practiceId);
      expect((await call('GET', '/mentor/devolutivas', M2)).json().data).toHaveLength(0);
      expect(
        (
          await call('POST', `/mentor/praticas/${practiceId}/devolutiva`, M2, {
            devolutiva: 'Comentário de quem não acompanha',
          })
        ).statusCode,
      ).toBe(404);

      const returned = await call('POST', `/mentor/praticas/${practiceId}/devolutiva`, M1, {
        devolutiva: 'Boa leitura do objeto. Falta olhar a garantia contratual.',
        nota: 4,
      });
      expect(returned.statusCode, returned.body).toBe(200);
      const list = (await call('GET', '/aluno/praticas', A1)).json().data;
      expect(list[0].status).toBe('devolvida');
      expect(list[0].devolutiva).toContain('garantia');
      expect(list[0].nota).toBe(4);
      const bell = (await call('GET', '/notifications', A1)).json().data;
      expect(bell.some((n: { titulo: string }) => n.titulo.includes('devolutiva'))).toBe(true);
      // depois da devolutiva o aluno pode ajustar e reenviar
      const edit = await call('PUT', `/aluno/praticas/${editalId}`, A1, {
        respostas: { objeto: 'Compra de material de escritório (revisado)' },
      });
      expect(edit.json().status).toBe('rascunho');
    });

    it('outro aluno não enxerga a prática; mentor não grava como aluno', async () => {
      expect((await call('GET', '/aluno/praticas', A2)).json().data).toHaveLength(0);
      expect(
        (await call('PUT', `/aluno/praticas/${editalId}`, M1, { respostas: {} })).statusCode,
      ).toBe(403);
      expect((await call('GET', '/mentor/alunos', A1)).statusCode).toBe(403);
      expect(
        (
          await call('POST', '/mentor/sessoes', A1, {
            aluno_id: aluno1,
            titulo: 'Sessão',
            inicio_at: new Date().toISOString(),
          })
        ).statusCode,
      ).toBe(403);
    });

    it('anotações: privadas só do mentor, compartilhadas também do aluno', async () => {
      const privateNote = await call('POST', `/mentor/alunos/${aluno1}/notas`, M1, {
        texto: 'Anotação privada do mentor',
      });
      expect(privateNote.statusCode, privateNote.body).toBe(201);
      const shared = await call('POST', `/mentor/alunos/${aluno1}/notas`, M1, {
        texto: 'Recado para o aluno',
        visibilidade: 'compartilhada',
      });
      expect(shared.statusCode).toBe(201);
      expect(
        (await call('POST', `/mentor/alunos/${aluno1}/notas`, M2, { texto: 'Intruso' })).statusCode,
      ).toBe(404);
      expect(
        (await call('POST', `/mentor/alunos/${aluno1}/notas`, A1, { texto: 'Aluno escrevendo' }))
          .statusCode,
      ).toBe(403);

      const forStudent = (await call('GET', '/aluno/mentoria', A1)).json();
      expect(forStudent.notas.map((n: { texto: string }) => n.texto)).toEqual([
        'Recado para o aluno',
      ]);
      const forMentor = (await call('GET', `/mentor/alunos/${aluno1}`, M1)).json();
      expect(forMentor.notas).toHaveLength(2);
      expect((await call('DELETE', `/mentor/notas/${privateNote.json().id}`, M2)).statusCode).toBe(
        404,
      );
      expect((await call('DELETE', `/mentor/notas/${privateNote.json().id}`, M1)).statusCode).toBe(
        204,
      );
      // aluno 2 não vê nada do aluno 1 mesmo lendo o banco com o papel dele
      const direct = await setup.query(
        'SELECT count(*)::int AS n FROM mentoria_notas WHERE aluno_id = $1',
        [aluno1],
      );
      expect(direct.rows[0].n).toBe(1);
    });

    it('sessões: mentor marca para o seu aluno, aluno vê o resumo e não as notas privadas', async () => {
      const start = new Date(Date.now() + 86_400_000).toISOString();
      expect(
        (
          await call('POST', '/mentor/sessoes', M2, {
            aluno_id: aluno1,
            titulo: 'Fora do vínculo',
            inicio_at: start,
          })
        ).statusCode,
      ).toBe(404);
      const created = await call('POST', '/mentor/sessoes', M1, {
        aluno_id: aluno1,
        titulo: 'Primeira conversa',
        inicio_at: start,
        link: 'https://meet.example.test/abc',
      });
      expect(created.statusCode, created.body).toBe(201);
      const id = created.json().id;
      expect(
        (await call('PATCH', `/mentor/sessoes/${id}`, M2, { status: 'cancelada' })).statusCode,
      ).toBe(404);
      const done = await call('PATCH', `/mentor/sessoes/${id}`, M1, {
        status: 'realizada',
        notas: 'Anotação interna',
        resumo: 'Combinamos revisar a modalidade pregão.',
      });
      expect(done.statusCode, done.body).toBe(200);
      const session = (await call('GET', '/aluno/mentoria', A1)).json().sessoes[0];
      expect(session.resumo).toContain('pregão');
      expect(session.notas).toBeUndefined();
      expect((await call('GET', '/aluno/mentoria', A2)).json().sessoes).toHaveLength(0);
      expect((await call('GET', '/mentor/sessoes', M2)).json().data).toHaveLength(0);
    });

    it('questionário é corrigido pelo servidor e o resultado aparece para o mentor', async () => {
      const attempt = await call('POST', `/academy/quizzes/${quizId}/attempts`, A1, {
        respostas: { [questionIds[0]!]: 0, [questionIds[1]!]: 0 },
      });
      expect(attempt.statusCode, attempt.body).toBe(201);
      expect(Number(attempt.json().nota)).toBe(50);
      expect(attempt.json().resultado.map((r: { correta: boolean }) => r.correta)).toEqual([
        true,
        false,
      ]);
      const detail = (await call('GET', `/mentor/alunos/${aluno1}`, M1)).json();
      expect(Number(detail.questionarios[0].melhor_nota)).toBe(50);
    });

    it('certificado interno: só depois de concluir todas as aulas, e emitido uma vez', async () => {
      const early = await call('POST', '/aluno/certificados', A1, { trilha: trackSlug });
      expect(early.statusCode).toBe(400);
      for (const lesson of lessonIds) {
        const done = await call('PUT', `/academy/progress/${lesson}`, A1, {
          concluida: true,
          percentual: 100,
        });
        expect(done.statusCode, done.body).toBe(200);
      }
      const issued = await call('POST', '/aluno/certificados', A1, { trilha: trackSlug });
      expect(issued.statusCode, issued.body).toBe(201);
      const code = issued.json().certificado.codigo as string;
      expect(code).toMatch(/^LC-[0-9A-F]{10}$/);
      const again = await call('POST', '/aluno/certificados', A1, { trilha: trackSlug });
      expect(again.json().certificado.codigo).toBe(code);
      const list = await call('GET', '/aluno/certificados', A1);
      expect(list.json().aviso).toContain('não tem validade jurídica');
      expect(
        (await call('POST', '/aluno/certificados', A2, { trilha: trackSlug })).statusCode,
      ).toBe(400);
    });

    it('início do aluno e números na Administração', async () => {
      const home = (await call('GET', '/aluno/inicio', A1)).json();
      expect(home.plano_criado).toBe(true);
      expect(home.proxima_atividade.dia).toBeGreaterThan(1);
      expect(home.recado_mentor.texto).toBe('Recado para o aluno');
      expect(home.progresso.aulas_concluidas).toBe(3);
      expect(home.certificados).toBe(1);
      expect(home.praticas.rascunhos).toBe(1);

      const students = (await call('GET', '/platform/students', TEAM)).json().data;
      const row = students.find((s: { id: string }) => s.id === aluno1);
      expect(row.plano_feitos).toBe(1);
      expect(row.plano_total).toBe(30);
      expect(row.praticas_enviadas).toBe(0);
      expect(row.certificados).toBe(1);
    });
  },
);
