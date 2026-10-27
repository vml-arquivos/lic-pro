import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/password.js';
import { modelByCode } from '../src/checklist-models.js';
import { runReminderCycle } from '../src/reminders.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

suite(
  'Empresa: oportunidades, checklists, agenda, documentos e lembretes (PostgreSQL real)',
  () => {
    let pool!: Pool;
    let setup!: Pool;
    let app!: ReturnType<typeof buildApp>;
    const suffix = randomUUID().slice(0, 8);
    const platformTenant = randomUUID();
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const ownerA = randomUUID();
    const operatorA = randomUUID();
    const ownerB = randomUUID();
    const student = randomUUID();
    let empresaA = '';
    let editalId = '';
    let editalSemDatas = '';
    const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

    const call = (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      who: { sub: string; tenantId: string; role: string },
      payload?: unknown,
    ) =>
      app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${app.jwt.sign(who)}` },
        ...(payload === undefined ? {} : { payload: payload as object }),
      });
    const A = { sub: ownerA, tenantId: tenantA, role: 'admin' };
    const OP = { sub: operatorA, tenantId: tenantA, role: 'operador' };
    const B = { sub: ownerB, tenantId: tenantB, role: 'admin' };
    const ALUNO = { sub: student, tenantId: tenantA, role: 'aluno' };

    async function user(id: string, tenant: string, papel: string, nome: string) {
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
      for (const [id, nome] of [
        [platformTenant, 'Plataforma'],
        [tenantA, 'Empresa A'],
        [tenantB, 'Empresa B'],
      ] as const) {
        await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
          id,
          nome,
          `e-${id.slice(0, 8)}`,
        ]);
      }
      await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
      await user(ownerA, tenantA, 'admin', 'Dona A');
      await user(operatorA, tenantA, 'operador', 'Operador A');
      await user(student, tenantA, 'aluno', 'Aluno A');
      await user(ownerB, tenantB, 'admin', 'Dona B');
      const company = await setup.query<{ id: string }>(
        `INSERT INTO empresas (tenant_id, cnpj, razao_social) VALUES ($1, $2, $3) RETURNING id`,
        [
          tenantA,
          String(Math.floor(Math.random() * 1e14)).padStart(14, '0'),
          `Empresa A ${suffix}`,
        ],
      );
      empresaA = company.rows[0]!.id;
      await setup.query(
        `INSERT INTO empresa_usuarios (tenant_id, empresa_id, usuario_id, papel) VALUES ($1, $2, $3, 'proprietario')`,
        [tenantA, empresaA, ownerA],
      );
      const edital = await setup.query<{ id: string }>(
        `INSERT INTO editais (tenant_id, fonte, id_externo, titulo, hash_conteudo, uf, orgao, modalidade,
                            data_abertura_proposta, data_encerramento_proposta)
       VALUES ($1, 'fixture', $2, 'Pregão eletrônico de teste', $3, 'DF', 'Órgão Teste', 'Pregão', $4, $5) RETURNING id`,
        [platformTenant, `emp-${suffix}`, `h-emp-${suffix}`, inDays(1), inDays(2)],
      );
      editalId = edital.rows[0]!.id;
      const semDatas = await setup.query<{ id: string }>(
        `INSERT INTO editais (tenant_id, fonte, id_externo, titulo, hash_conteudo, uf)
       VALUES ($1, 'fixture', $2, 'Edital sem datas', $3, 'SP') RETURNING id`,
        [platformTenant, `emp2-${suffix}`, `h-emp2-${suffix}`],
      );
      editalSemDatas = semDatas.rows[0]!.id;
    });

    afterAll(async () => {
      await app.close();
      await pool.end();
      await setup.end();
    });

    let oppId = '';
    let checklistId = '';

    it('salva a oportunidade, cria o histórico e os prazos do edital sem duplicar', async () => {
      const saved = await call('POST', '/opportunities', A, { edital_id: editalId });
      expect(saved.statusCode, saved.body).toBe(201);
      oppId = saved.json().id;
      expect(saved.json().status).toBe('salva');
      // salvar de novo não duplica nada
      const again = await call('POST', '/opportunities', A, { edital_id: editalId });
      expect(again.json().id).toBe(oppId);

      const detail = (await call('GET', `/opportunities/${oppId}`, A)).json();
      expect(detail.historico).toHaveLength(1);
      expect(detail.historico[0].tipo).toBe('criada');
      expect(detail.prazos.map((p: { tipo: string }) => p.tipo).sort()).toEqual([
        'abertura_propostas',
        'encerramento_propostas',
      ]);
      expect(detail.modelo_sugerido).toBe('pregao');

      const noDates = await call('POST', '/opportunities', A, { edital_id: editalSemDatas });
      const d2 = (await call('GET', `/opportunities/${noDates.json().id}`, A)).json();
      expect(d2.prazos).toHaveLength(0);
      expect(
        (await call('POST', '/opportunities', A, { edital_id: randomUUID() })).statusCode,
      ).toBe(404);
    });

    it('decidir exige decisão e motivo; registra no histórico', async () => {
      const noReason = await call('PATCH', `/opportunities/${oppId}`, A, { status: 'decidida' });
      expect(noReason.statusCode).toBe(400);
      expect(noReason.json().error).toBe('decision_reason_required');
      const short = await call('PATCH', `/opportunities/${oppId}`, A, {
        status: 'decidida',
        decisao: 'participar',
        motivo_decisao: 'ok',
      });
      expect(short.statusCode).toBe(400);

      const moved = await call('PATCH', `/opportunities/${oppId}`, A, { status: 'em_analise' });
      expect(moved.statusCode).toBe(200);
      const decided = await call('PATCH', `/opportunities/${oppId}`, A, {
        status: 'decidida',
        decisao: 'participar',
        motivo_decisao: 'Objeto dentro do nosso ramo e prazo viável',
      });
      expect(decided.statusCode, decided.body).toBe(200);
      expect(decided.json().decisao).toBe('participar');
      expect(decided.json().decidida_em).toBeTruthy();

      const detail = (await call('GET', `/opportunities/${oppId}`, A)).json();
      const types = detail.historico.map((h: { tipo: string }) => h.tipo);
      expect(types).toEqual(expect.arrayContaining(['criada', 'etapa', 'decisao']));
      const decisao = detail.historico.find((h: { tipo: string }) => h.tipo === 'decisao');
      expect(decisao.motivo).toContain('ramo');

      const filtered = (await call('GET', '/opportunities?decisao=participar', A)).json().data;
      expect(filtered.map((o: { id: string }) => o.id)).toContain(oppId);
      expect((await call('GET', '/opportunities?status=ganha', A)).json().data).toHaveLength(0);
    });

    it('checklist a partir de modelo, marcar itens, adicionar e remover', async () => {
      const models = (await call('GET', '/checklist-models', A)).json();
      expect(models.data.length).toBeGreaterThanOrEqual(3);
      expect(models.aviso).toContain('confira o edital');
      expect(
        (await call('POST', `/opportunities/${oppId}/checklists`, A, { modelo: 'inexistente' }))
          .statusCode,
      ).toBe(400);

      const created = await call('POST', `/opportunities/${oppId}/checklists`, A, {
        modelo: 'pregao',
      });
      expect(created.statusCode, created.body).toBe(201);
      checklistId = created.json().id;
      expect(created.json().itens).toBeGreaterThan(5);

      const detail = (await call('GET', `/opportunities/${oppId}`, A)).json();
      const list = detail.checklists[0];
      expect(list.itens).toHaveLength(created.json().itens);
      expect(list.itens.map((entry: { titulo: string }) => entry.titulo)).toEqual(
        modelByCode('pregao')!.itens.map((entry) => entry.titulo),
      );
      const item = list.itens[0];
      const done = await call('PATCH', `/checklist-items/${item.id}`, OP, {
        concluido: true,
        evidencia_url: 'https://exemplo.test/certidao',
      });
      expect(done.statusCode, done.body).toBe(200);
      expect(done.json().concluido).toBe(true);

      const extra = await call('POST', `/checklists/${checklistId}/items`, A, {
        titulo: 'Item da empresa',
        obrigatorio: false,
      });
      expect(extra.statusCode).toBe(201);
      expect((await call('DELETE', `/checklist-items/${extra.json().id}`, A)).statusCode).toBe(204);

      const board = (await call('GET', '/opportunities', A))
        .json()
        .data.find((o: { id: string }) => o.id === oppId);
      expect(board.checklist_itens).toBe(created.json().itens);
      expect(board.checklist_concluidos).toBe(1);
    });

    it('agenda: prazo manual, tarefa, concluir e remover', async () => {
      const deadline = await call('POST', '/agenda/prazos', A, {
        oportunidade_id: oppId,
        titulo: 'Enviar esclarecimentos',
        tipo: 'esclarecimento',
        vence_em: inDays(5),
      });
      expect(deadline.statusCode, deadline.body).toBe(201);
      const task = await call('POST', '/tasks', A, {
        oportunidade_id: oppId,
        titulo: 'Montar proposta',
        prioridade: 'alta',
        vence_em: inDays(6),
      });
      expect(task.statusCode, task.body).toBe(201);

      const agenda = (await call('GET', '/agenda?dias=30', A)).json();
      expect(agenda.prazos.length).toBeGreaterThanOrEqual(3);
      expect(agenda.tarefas.map((t: { id: string }) => t.id)).toContain(task.json().id);
      // lista em ordem de vencimento
      const dates = agenda.prazos.map((p: { vence_em: string }) => Date.parse(p.vence_em));
      expect([...dates].sort((a, b) => a - b)).toEqual(dates);

      expect(
        (await call('PATCH', `/tasks/${task.json().id}`, A, { status: 'concluida' })).json().status,
      ).toBe('concluida');
      expect(
        (await call('GET', '/agenda', A)).json().tarefas.map((t: { id: string }) => t.id),
      ).not.toContain(task.json().id);
      expect(
        (await call('PATCH', `/agenda/prazos/${deadline.json().id}`, A, { status: 'concluido' }))
          .statusCode,
      ).toBe(200);
      expect((await call('DELETE', `/agenda/prazos/${deadline.json().id}`, A)).statusCode).toBe(
        204,
      );
      expect(
        (
          await call('POST', '/agenda/prazos', A, {
            oportunidade_id: randomUUID(),
            titulo: 'x1',
            vence_em: inDays(2),
          })
        ).statusCode,
      ).toBe(404);
    });

    it('documentos: situação calculada pela validade informada', async () => {
      const today = new Date();
      const day = (offset: number) =>
        new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
      const make = (nome: string, valido_ate: string | null) =>
        call('POST', '/empresa/documentos', A, { tipo: 'certidao_federal', nome, valido_ate });
      const vencido = (await make('Certidão vencida', day(-3))).json();
      const vencendo = (await make('Certidão vencendo', day(10))).json();
      const valido = (await make('Certidão válida', day(90))).json();
      const semValidade = (await make('Contrato social', null)).json();
      expect(vencido.situacao).toBe('vencido');
      expect(vencendo.situacao).toBe('vencendo');
      expect(valido.situacao).toBe('valido');
      expect(semValidade.situacao).toBe('sem_validade');
      expect(vencendo.dias_restantes).toBeGreaterThanOrEqual(9);

      const edited = await call('PATCH', `/empresa/documentos/${vencido.id}`, A, {
        valido_ate: day(120),
      });
      expect(edited.json().situacao).toBe('valido');
      const list = await call('GET', '/empresa/documentos', A);
      expect(list.json().aviso).toContain('não consulta certidões');
      expect(list.json().data).toHaveLength(4);
      expect((await call('DELETE', `/empresa/documentos/${semValidade.id}`, A)).statusCode).toBe(
        204,
      );
    });

    it('início da empresa resume o dia e sugere próximos passos', async () => {
      const home = (await call('GET', '/empresa/inicio', A)).json();
      expect(home.empresa.id).toBe(empresaA);
      expect(home.documentos.vencendo).toBe(1);
      expect(home.documentos.total).toBe(3);
      expect(home.pipeline.decidida).toBe(1);
      expect(home.prazos_semana.length).toBeGreaterThanOrEqual(2);
      expect(home.proximos_passos.map((s: { codigo: string }) => s.codigo)).toEqual(
        expect.arrayContaining(['prazos', 'docs_vencendo']),
      );
    });

    it('lembretes: aviso no sino só para a dona, uma vez por item', async () => {
      const first = await runReminderCycle(pool);
      expect(first.erros).toBe(0);
      const bell = (await call('GET', '/notifications', A)).json();
      const items = (bell.data ?? bell.notificacoes ?? bell) as Array<{
        titulo?: string;
        mensagem?: string;
        dados?: { link?: string };
      }>;
      const text = JSON.stringify(items);
      expect(text).toContain('Abertura das propostas');
      expect(text).toContain(`/oportunidades/${oppId}`);
      expect(text).toContain('Certidão vencendo');

      const count = async () =>
        (
          await setup.query(
            'SELECT count(*)::int AS n FROM lembretes_enviados WHERE usuario_id = $1',
            [ownerA],
          )
        ).rows[0].n as number;
      const before = await count();
      expect(before).toBeGreaterThanOrEqual(3);
      await runReminderCycle(pool);
      expect(await count()).toBe(before);
      // quem não é a dona da conta não recebe
      expect(
        (
          await setup.query(
            'SELECT count(*)::int AS n FROM lembretes_enviados WHERE usuario_id = $1',
            [operatorA],
          )
        ).rows[0].n,
      ).toBe(0);
    });

    it('isolamento entre contas e papéis fora da empresa', async () => {
      expect((await call('GET', `/opportunities/${oppId}`, B)).statusCode).toBe(404);
      expect((await call('GET', '/opportunities', B)).json().data).toHaveLength(0);
      expect(
        (await call('PATCH', `/opportunities/${oppId}`, B, { status: 'ganha' })).statusCode,
      ).toBe(404);
      expect((await call('DELETE', `/opportunities/${oppId}`, B)).statusCode).toBe(404);
      expect((await call('GET', '/empresa/documentos', B)).json().data).toHaveLength(0);
      expect((await call('GET', '/agenda', B)).json().prazos).toHaveLength(0);
      expect((await call('POST', '/opportunities', B, { edital_id: editalId })).statusCode).toBe(
        409,
      );
      for (const url of [
        '/opportunities',
        '/agenda',
        '/empresa/documentos',
        '/empresa/inicio',
        '/checklist-models',
      ]) {
        expect((await call('GET', url, ALUNO)).statusCode, url).toBe(403);
      }
    });

    it('remover a oportunidade leva junto checklist, prazos e histórico', async () => {
      expect((await call('DELETE', `/opportunities/${oppId}`, A)).statusCode).toBe(204);
      for (const table of ['checklists', 'prazos_agenda', 'oportunidade_historico', 'tarefas']) {
        const rows = await setup.query(
          `SELECT count(*)::int AS n FROM ${table} WHERE oportunidade_id = $1`,
          [oppId],
        );
        expect(rows.rows[0].n, table).toBe(0);
      }
    });
  },
);
