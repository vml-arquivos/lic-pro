import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MATERIAIS_CATALOGO } from '../src/materiais-catalogo.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

suite('Aluno: materiais, diagnóstico, encontros e prazo de acesso (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const tenant = randomUUID();
  const team = randomUUID();
  const mentor1 = randomUUID();
  const mentor2 = randomUUID();
  const aluno1 = randomUUID(); // turma aberta
  const aluno2 = randomUUID(); // turma com prazo vencido
  const aluno3 = randomUUID(); // sem turma
  let turmaAberta = '';
  let turmaVencida = '';
  let lessonId = '';

  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    who: [string, string],
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: who[0], tenantId: tenant, role: who[1] })}`,
      },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const A1: [string, string] = [aluno1, 'aluno'];
  const A2: [string, string] = [aluno2, 'aluno'];
  const A3: [string, string] = [aluno3, 'aluno'];
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
    await user(team, 'plataforma', 'Equipe Apoio');
    await user(mentor1, 'mentor', 'Mentor Apoio Um');
    await user(mentor2, 'mentor', 'Mentor Apoio Dois');
    await user(aluno1, 'aluno', 'Aluno Apoio Um');
    await user(aluno2, 'aluno', 'Aluno Apoio Dois');
    await user(aluno3, 'aluno', 'Aluno Apoio Tres');
    const open = await setup.query<{ id: string }>(
      `INSERT INTO turmas (tenant_id, nome, mentor_id, acesso_ate, mentoria_ate, grupo_url)
       VALUES ($1, $2, $3, '2999-12-31', '2999-12-31', 'https://chat.example.test/grupo') RETURNING id`,
      [tenant, `Aberta ${suffix}`, mentor1],
    );
    turmaAberta = open.rows[0]!.id;
    const expired = await setup.query<{ id: string }>(
      `INSERT INTO turmas (tenant_id, nome, mentor_id, acesso_ate, mentoria_ate, grupo_url)
       VALUES ($1, $2, $3, '2020-01-01', '2020-01-01', 'https://chat.example.test/velho') RETURNING id`,
      [tenant, `Vencida ${suffix}`, mentor2],
    );
    turmaVencida = expired.rows[0]!.id;
    await setup.query(
      'INSERT INTO matriculas (tenant_id, turma_id, aluno_id) VALUES ($1, $2, $3), ($1, $4, $5)',
      [tenant, turmaAberta, aluno1, turmaVencida, aluno2],
    );
    await setup.query(
      'INSERT INTO mentor_mentorado (tenant_id, mentor_id, mentorado_id) VALUES ($1, $2, $3), ($1, $4, $5)',
      [tenant, mentor1, aluno1, mentor2, aluno2],
    );
    const track = await setup.query<{ id: string }>(
      "INSERT INTO trilhas (slug, titulo, descricao, status) VALUES ($1, $2, 'Teste', 'publicado') RETURNING id",
      [`trilha-apoio-${suffix}`, `Trilha ${suffix}`],
    );
    const module = await setup.query<{ id: string }>(
      "INSERT INTO modulos (trilha_id, ordem, titulo, resumo) VALUES ($1, 1, 'Módulo 1', 'r') RETURNING id",
      [track.rows[0]!.id],
    );
    const lesson = await setup.query<{ id: string }>(
      "INSERT INTO aulas (modulo_id, ordem, titulo, conteudo) VALUES ($1, 1, 'Aula apoio', 'texto') RETURNING id",
      [module.rows[0]!.id],
    );
    lessonId = lesson.rows[0]!.id;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  describe('materiais', () => {
    it('só a equipe carrega o catálogo e a carga não repete nem sobrescreve', async () => {
      expect((await call('POST', '/platform/materiais/catalogo', A1)).statusCode).toBe(403);
      expect((await call('POST', '/platform/materiais/catalogo', M1)).statusCode).toBe(403);
      const first = await call('POST', '/platform/materiais/catalogo', TEAM);
      expect(first.statusCode).toBe(200);
      expect(first.json().inseridos).toBe(MATERIAIS_CATALOGO.length);
      const second = await call('POST', '/platform/materiais/catalogo', TEAM);
      expect(second.json().inseridos).toBe(0);
    });

    it('o aluno só vê o que tem texto ou link, e a equipe vê tudo', async () => {
      const team = await call('GET', '/platform/materiais', TEAM);
      expect(team.json().data).toHaveLength(MATERIAIS_CATALOGO.length);
      const student = await call('GET', '/aluno/materiais', A1);
      expect(student.statusCode).toBe(200);
      const ready = MATERIAIS_CATALOGO.filter((item) => item.conteudo || item.url);
      expect(student.json().data.length).toBe(ready.length);
      expect(student.json().data.every((item: { titulo: string }) => item.titulo)).toBe(true);
    });

    it('item pendente fica oculto até receber link, e o aluno abre o texto', async () => {
      const list = (await call('GET', '/platform/materiais', TEAM)).json().data as Array<{
        id: string;
        codigo: string;
        publicado: boolean;
      }>;
      const pending = list.find((item) => item.codigo === 'planilha-precificacao')!;
      const hidden = await call('GET', `/aluno/materiais/${pending.id}`, A1);
      expect(hidden.statusCode).toBe(404);
      const patched = await call('PATCH', `/platform/materiais/${pending.id}`, TEAM, {
        url: 'https://drive.example.test/planilha',
        publicado: true,
      });
      expect(patched.statusCode).toBe(200);
      const open = await call('GET', `/aluno/materiais/${pending.id}`, A1);
      expect(open.statusCode).toBe(200);
      expect(open.json().url).toBe('https://drive.example.test/planilha');
      const text = list.find((item) => item.codigo === 'termos-tecnicos')!;
      const read = await call('GET', `/aluno/materiais/${text.id}`, A1);
      expect(read.json().conteudo).toContain('LICITAÇÃO');
    });

    it('link que não é https é recusado e o aluno não escreve em materiais', async () => {
      const bad = await call('POST', '/platform/materiais', TEAM, {
        codigo: `novo-${suffix}`,
        titulo: 'Novo',
        etapa: 'comecar',
        tipo: 'guia',
        url: 'http://inseguro.example.test/x',
      });
      expect(bad.statusCode).toBe(400);
      const denied = await call('POST', '/platform/materiais', A1, {
        codigo: `novo-${suffix}`,
        titulo: 'Novo',
        etapa: 'comecar',
        tipo: 'guia',
      });
      expect(denied.statusCode).toBe(403);
      const direct = await pool.connect();
      try {
        await direct.query('BEGIN');
        await direct.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
        await direct.query("SELECT set_config('app.user_id', $1, true)", [aluno1]);
        await direct.query("SELECT set_config('app.role', 'aluno', true)");
        await expect(
          direct.query(
            "INSERT INTO materiais (tenant_id, codigo, titulo, etapa, tipo) VALUES ($1, 'x', 'x', 'base', 'guia')",
            [tenant],
          ),
        ).rejects.toThrow();
        await direct.query('ROLLBACK');
      } finally {
        direct.release();
      }
    });

    it('a trilha escolhida no diagnóstico filtra o material do assessor', async () => {
      const before = (await call('GET', '/aluno/materiais', A1)).json().data as Array<{
        para: string;
      }>;
      expect(before.some((item) => item.para === 'assessor')).toBe(true);
      const saved = await call('PUT', '/aluno/diagnostico', A1, {
        atuacao: 'fornecedor',
        respostas: {
          tem_empresa: 'mei',
          nicho: 'papelaria',
          experiencia: 'nunca',
          duvida: 'SICAF',
        },
      });
      expect(saved.statusCode).toBe(200);
      const after = (await call('GET', '/aluno/materiais', A1)).json().data as Array<{
        para: string;
      }>;
      expect(after.some((item) => item.para === 'assessor')).toBe(false);
      const all = (await call('GET', '/aluno/materiais?todos=1', A1)).json().data as Array<{
        para: string;
      }>;
      expect(all.some((item) => item.para === 'assessor')).toBe(true);
    });
  });

  describe('diagnóstico inicial', () => {
    it('exige as respostas obrigatórias e ignora perguntas desconhecidas', async () => {
      const missing = await call('PUT', '/aluno/diagnostico', A3, {
        atuacao: 'assessor',
        respostas: { nicho: 'tecnologia', inventada: 'x' },
      });
      expect(missing.statusCode).toBe(422);
      expect(missing.json().faltando).toEqual(expect.arrayContaining(['tem_empresa']));
      const bad = await call('PUT', '/aluno/diagnostico', A3, { atuacao: 'outro', respostas: {} });
      expect(bad.statusCode).toBe(400);
    });

    it('só aluno responde; o aluno lê o próprio e o mentor dele também', async () => {
      expect(
        (await call('PUT', '/aluno/diagnostico', M1, { atuacao: 'assessor', respostas: {} }))
          .statusCode,
      ).toBe(403);
      const mine = await call('GET', '/aluno/diagnostico', A1);
      expect(mine.json().diagnostico.atuacao).toBe('fornecedor');
      expect(mine.json().perguntas.length).toBeGreaterThan(5);
      const empty = await call('GET', '/aluno/diagnostico', A3);
      expect(empty.json().diagnostico).toBeNull();
      const seen = await call('GET', `/mentor/alunos/${aluno1}`, M1);
      expect(seen.statusCode).toBe(200);
      expect(seen.json().diagnostico.respostas.nicho).toBe('papelaria');
      const other = await call('GET', `/mentor/alunos/${aluno1}`, M2);
      expect(other.statusCode).toBe(404);
    });

    it('aparece no início do aluno', async () => {
      const home = await call('GET', '/aluno/inicio', A1);
      expect(home.json().diagnostico_feito).toBe(true);
      expect(home.json().atuacao).toBe('fornecedor');
      const fresh = await call('GET', '/aluno/inicio', A3);
      expect(fresh.json().diagnostico_feito).toBe(false);
    });
  });

  describe('prazo de acesso', () => {
    it('turma com prazo vencido bloqueia materiais e aulas, só para o aluno dela', async () => {
      const library = await call('GET', '/aluno/materiais', A2);
      expect(library.statusCode).toBe(403);
      expect(library.json().error).toBe('access_expired');
      const lesson = await call('GET', `/academy/lessons/${lessonId}`, A2);
      expect(lesson.statusCode).toBe(403);
      expect(lesson.json().error).toBe('access_expired');
      expect((await call('GET', `/academy/lessons/${lessonId}`, A1)).statusCode).toBe(200);
      // sem turma: nada expira
      expect((await call('GET', `/academy/lessons/${lessonId}`, A3)).statusCode).toBe(200);
      expect((await call('GET', '/aluno/materiais', A3)).statusCode).toBe(200);
      expect((await call('GET', `/academy/lessons/${lessonId}`, M1)).statusCode).toBe(200);
      expect((await call('GET', `/academy/lessons/${lessonId}`, TEAM)).statusCode).toBe(200);
    });

    it('/aluno/acesso mostra prazo e situação', async () => {
      const expired = (await call('GET', '/aluno/acesso', A2)).json();
      expect(expired.acesso_ativo).toBe(false);
      expect(expired.mentoria_ativa).toBe(false);
      const open = (await call('GET', '/aluno/acesso', A1)).json();
      expect(open.acesso_ativo).toBe(true);
      expect(open.grupo_url).toBe('https://chat.example.test/grupo');
      expect(open.turma.nome).toContain('Aberta');
      expect((await call('GET', '/aluno/acesso', A3)).json().turma).toBeNull();
    });

    it('a Administração ajusta prazos e grupo da turma', async () => {
      const patched = await call('PATCH', `/platform/classes/${turmaVencida}`, TEAM, {
        acesso_ate: '2999-01-01',
        grupo_url: 'https://chat.example.test/novo',
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().grupo_url).toBe('https://chat.example.test/novo');
      expect((await call('GET', '/aluno/materiais', A2)).statusCode).toBe(200);
      const list = (await call('GET', '/platform/classes', TEAM)).json().data as Array<{
        id: string;
        acesso_ate: string | null;
      }>;
      expect(list.find((item) => item.id === turmaVencida)?.acesso_ate).toBeTruthy();
      const cleared = await call('PATCH', `/platform/classes/${turmaVencida}`, TEAM, {
        acesso_ate: '2020-01-01',
      });
      expect(cleared.statusCode).toBe(200);
      expect((await call('GET', '/aluno/materiais', A2)).statusCode).toBe(403);
    });
  });

  describe('encontros ao vivo', () => {
    let encontroId = '';

    it('o mentor marca para a própria turma; o aluno dela vê e é avisado', async () => {
      const created = await call('POST', '/mentor/encontros', M1, {
        titulo: 'Quarta ao vivo',
        turma_id: turmaAberta,
        inicio_at: '2999-01-01T20:00:00-03:00',
        link: 'https://meet.example.test/quarta',
      });
      expect(created.statusCode).toBe(201);
      encontroId = created.json().id;
      const seen = await call('GET', '/aluno/encontros', A1);
      expect(seen.json().data.map((item: { id: string }) => item.id)).toContain(encontroId);
      expect(seen.json().grupo_url).toBe('https://chat.example.test/grupo');
      const notes = await setup.query(
        "SELECT 1 FROM notificacoes WHERE usuario_id = $1 AND tipo = 'encontro_marcado'",
        [aluno1],
      );
      expect(notes.rowCount).toBe(1);
    });

    it('aluno de outra turma não vê, e mentor de outra turma não marca nela', async () => {
      const other = await call('GET', '/aluno/encontros', A3);
      expect(other.json().data.map((item: { id: string }) => item.id)).not.toContain(encontroId);
      const blocked = await call('POST', '/mentor/encontros', M2, {
        titulo: 'Intruso',
        turma_id: turmaAberta,
        inicio_at: '2999-01-02T20:00:00-03:00',
      });
      expect(blocked.statusCode).toBe(404);
    });

    it('aluno não cria nem altera encontro', async () => {
      expect(
        (
          await call('POST', '/mentor/encontros', A1, {
            titulo: 'x',
            inicio_at: '2999-01-02T20:00:00-03:00',
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await call('PATCH', `/mentor/encontros/${encontroId}`, A1, { status: 'cancelado' }))
          .statusCode,
      ).toBe(403);
    });

    it('encontro aberto a todas as turmas aparece para todos e cancelar avisa', async () => {
      const open = await call('POST', '/mentor/encontros', TEAM, {
        titulo: 'Aula aberta',
        inicio_at: '2999-02-01T20:00:00-03:00',
      });
      expect(open.statusCode).toBe(201);
      const seen = await call('GET', '/aluno/encontros', A3);
      expect(seen.json().data.map((item: { id: string }) => item.id)).toContain(open.json().id);
      const canceled = await call('PATCH', `/mentor/encontros/${encontroId}`, M1, {
        status: 'cancelado',
      });
      expect(canceled.json().status).toBe('cancelado');
      const list = await call('GET', '/mentor/encontros', M1);
      expect(list.json().turmas.length).toBeGreaterThan(0);
    });

    it('mentoria vencida esconde o grupo e os links', async () => {
      await setup.query('UPDATE turmas SET mentoria_ate = $2 WHERE id = $1', [
        turmaAberta,
        '2020-01-01',
      ]);
      const seen = await call('GET', '/aluno/encontros', A1);
      expect(seen.json().mentoria_ativa).toBe(false);
      expect(seen.json().grupo_url).toBeNull();
      expect(seen.json().data.every((item: { link: string | null }) => item.link === null)).toBe(
        true,
      );
    });
  });
});
