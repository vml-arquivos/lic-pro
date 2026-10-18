import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!connectionString);

suite('RLS Fase 3.3 por empresa e concessão', () => {
  let pool: Pool;
  const tenantId = randomUUID();
  const adminId = randomUUID();
  const mentorId = randomUUID();
  const companyA = randomUUID();
  const companyB = randomUUID();
  const editalA = randomUUID();
  const editalB = randomUUID();
  const opportunityA = randomUUID();
  const opportunityB = randomUUID();
  const checklistA = randomUUID();
  const checklistB = randomUUID();
  const routineA = randomUUID();
  const routineB = randomUUID();

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [adminId]);
      await client.query("SELECT set_config('app.role', 'admin', true)");
      await client.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        tenantId,
        'Tenant escopo 3.3',
        `scope-${tenantId.slice(0, 8)}`,
      ]);
      await client.query(
        "INSERT INTO usuarios (id, tenant_id, email, nome, papel) VALUES ($1, $2, $3, 'Admin', 'admin'), ($4, $2, $5, 'Mentor', 'mentor')",
        [adminId, tenantId, `${adminId}@test.local`, mentorId, `${mentorId}@test.local`],
      );
      await client.query(
        "INSERT INTO empresas (id, tenant_id, cnpj, razao_social) VALUES ($1, $3, '11111111000111', 'Empresa A'), ($2, $3, '22222222000122', 'Empresa B')",
        [companyA, companyB, tenantId],
      );
      await client.query("SELECT set_config('app.empresa_id', $1, true)", [companyA]);
      await client.query(
        "INSERT INTO empresa_usuarios (tenant_id, empresa_id, usuario_id, papel) VALUES ($1, $2, $3, 'proprietario')",
        [tenantId, companyA, adminId],
      );
      await client.query(
        "INSERT INTO editais (id, tenant_id, fonte, id_externo, titulo, hash_conteudo) VALUES ($1, $3, 'fixture', $4, 'Edital A', 'scope-a'), ($2, $3, 'fixture', $5, 'Edital B', 'scope-b')",
        [editalA, editalB, tenantId, `a-${editalA}`, `b-${editalB}`],
      );
      await client.query(
        "INSERT INTO oportunidades_salvas (id, tenant_id, empresa_id, usuario_id, edital_id, status) VALUES ($1, $5, $2, $4, $6, 'salva'), ($3, $5, $7, $4, $8, 'salva')",
        [opportunityA, companyA, opportunityB, adminId, tenantId, editalA, companyB, editalB],
      );
      await client.query(
        "INSERT INTO checklists (id, tenant_id, empresa_id, oportunidade_id, titulo) VALUES ($1, $5, $2, $4, 'Checklist A'), ($3, $5, $7, $8, 'Checklist B')",
        [checklistA, companyA, opportunityA, adminId, tenantId, checklistB, companyB, opportunityB],
      );
      await client.query(
        "INSERT INTO checklist_itens (tenant_id, empresa_id, checklist_id, titulo) VALUES ($1, $2, $3, 'Item A'), ($1, $4, $5, 'Item B')",
        [tenantId, companyA, checklistA, companyB, checklistB],
      );
      await client.query(
        "INSERT INTO rotinas (id, tenant_id, empresa_id, criado_por, nome, tipo) VALUES ($1, $4, $2, $3, 'Rotina A', 'checklist'), ($5, $4, $6, $3, 'Rotina B', 'checklist')",
        [routineA, companyA, adminId, tenantId, routineB, companyB],
      );
      await client.query(
        'INSERT INTO rotina_execucoes (tenant_id, empresa_id, rotina_id) VALUES ($1, $2, $3), ($1, $4, $5)',
        [tenantId, companyA, routineA, companyB, routineB],
      );
      await client.query(
        "INSERT INTO notificacoes (tenant_id, empresa_id, usuario_id, tipo, titulo, mensagem) VALUES ($1, $2, $3, 'teste', 'A', 'A'), ($1, $4, $5, 'teste', 'B', 'B')",
        [tenantId, companyA, adminId, companyB, mentorId],
      );
      await client.query(
        "INSERT INTO concessoes_mentor (tenant_id, mentor_id, empresa_id, escopo) VALUES ($1, $2, $3, '{}'::jsonb)",
        [tenantId, mentorId, companyA],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('usuário da empresa A não lê checklist, rotina ou notificação da empresa B', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [adminId]);
      await client.query("SELECT set_config('app.role', 'admin', true)");
      await client.query("SELECT set_config('app.empresa_id', $1, true)", [companyA]);
      expect(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM checklist_itens WHERE empresa_id = $1',
            [companyB],
          )
        ).rows[0]?.count,
      ).toBe(0);
      expect(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM rotina_execucoes WHERE empresa_id = $1',
            [companyB],
          )
        ).rows[0]?.count,
      ).toBe(0);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('mentor sem concessão não lê a empresa B e pode ler somente a empresa A concedida', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [mentorId]);
      await client.query("SELECT set_config('app.role', 'mentor', true)");
      await client.query("SELECT set_config('app.empresa_id', '', true)");
      expect(
        (
          await client.query('SELECT count(*)::int AS count FROM empresas WHERE id = $1', [
            companyA,
          ])
        ).rows[0]?.count,
      ).toBe(1);
      expect(
        (
          await client.query('SELECT count(*)::int AS count FROM empresas WHERE id = $1', [
            companyB,
          ])
        ).rows[0]?.count,
      ).toBe(0);
      expect(
        (await client.query('SELECT count(*)::int AS count FROM notificacoes')).rows[0]?.count,
      ).toBe(0);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('admin pode criar e revogar uma concessão', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [adminId]);
      await client.query("SELECT set_config('app.role', 'admin', true)");
      await client.query("SELECT set_config('app.empresa_id', $1, true)", [companyA]);
      await client.query(
        'INSERT INTO concessoes_mentor (tenant_id, mentor_id, empresa_id) VALUES ($1, $2, $3)',
        [tenantId, mentorId, companyB],
      );
      await client.query(
        'UPDATE concessoes_mentor SET revogada_em = now() WHERE tenant_id = $1 AND mentor_id = $2 AND empresa_id = $3',
        [tenantId, mentorId, companyB],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });
});
