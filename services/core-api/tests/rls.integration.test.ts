import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const rlsSuite = describe.skipIf(!connectionString || !setupConnectionString);

rlsSuite('isolamento RLS efetivo por tenant com role de aplicação', () => {
  let pool!: Pool;
  let setupPool!: Pool;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const empresaA = randomUUID();
  const editalA = randomUUID();
  const itemA = randomUUID();
  const oportunidadeA = randomUUID();
  const conversaA = randomUUID();

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setupPool = new Pool({ connectionString: setupConnectionString! });

    const appClient = await pool.connect();
    try {
      const role = await appClient.query<{
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>(
        `SELECT rolname, rolsuper, rolbypassrls
           FROM pg_roles
          WHERE rolname = current_user`,
      );
      expect(role.rows[0]?.rolname).toBe(process.env.TEST_APP_ROLE ?? 'licite_core');
      expect(role.rows[0]?.rolsuper).toBe(false);
      expect(role.rows[0]?.rolbypassrls).toBe(false);
    } finally {
      appClient.release();
    }

    const client = await setupPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        tenantA,
        'Tenant A integração',
        `tenant-a-${tenantA.slice(0, 8)}`,
      ]);
      await client.query(
        `INSERT INTO usuarios (id, tenant_id, email, nome, papel)
         VALUES ($1, $2, $3, $4, 'admin')`,
        [userA, tenantA, `admin-${tenantA}@example.test`, 'Admin A'],
      );
      await client.query(
        `INSERT INTO empresas (id, tenant_id, cnpj, razao_social)
         VALUES ($1, $2, '12345678000199', 'Empresa A')`,
        [empresaA, tenantA],
      );
      await client.query(
        `INSERT INTO empresa_usuarios (tenant_id, empresa_id, usuario_id, papel)
         VALUES ($1, $2, $3, 'proprietario')`,
        [tenantA, empresaA, userA],
      );
      await client.query(
        `INSERT INTO editais
          (id, tenant_id, fonte, id_externo, titulo, hash_conteudo)
         VALUES ($1, $2, 'fixture', $3, 'Edital A', 'hash-a')`,
        [editalA, tenantA, `edital-${editalA}`],
      );
      await client.query(
        `INSERT INTO itens_edital (id, tenant_id, edital_id, numero, descricao)
         VALUES ($1, $2, $3, '1', 'Item A')`,
        [itemA, tenantA, editalA],
      );
      await client.query(
        `INSERT INTO edital_chunks (tenant_id, edital_id, pagina, conteudo)
         VALUES ($1, $2, 1, 'Trecho privado A')`,
        [tenantA, editalA],
      );
      await client.query(
        `INSERT INTO analises_ia (tenant_id, edital_id, resultado, modelo, prompt_version)
         VALUES ($1, $2, '{"resumo":"A"}'::jsonb, 'fixture', 'test')`,
        [tenantA, editalA],
      );
      await client.query(
        `INSERT INTO oportunidades_salvas (id, tenant_id, empresa_id, usuario_id, edital_id, status)
         VALUES ($1, $2, $3, $4, $5, 'salva')`,
        [oportunidadeA, tenantA, empresaA, userA, editalA],
      );
      await client.query(
        `INSERT INTO ana_conversas (id, tenant_id, usuario_id, titulo)
         VALUES ($1, $2, $3, 'Conversa privada A')`,
        [conversaA, tenantA, userA],
      );
      await client.query(
        `INSERT INTO ana_mensagens (tenant_id, conversa_id, tipo, conteudo)
         VALUES ($1, $2, 'usuario', 'Mensagem A')`,
        [tenantA, conversaA],
      );
      await client.query(
        `INSERT INTO ana_tool_calls (tenant_id, conversa_id, ferramenta, nivel)
         VALUES ($1, $2, 'explicar_conceito', 'leitura')`,
        [tenantA, conversaA],
      );
      await client.query('COMMIT');

      await client.query('BEGIN');
      await client.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        tenantB,
        'Tenant B integração',
        `tenant-b-${tenantB.slice(0, 8)}`,
      ]);
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
    await setupPool.end();
  });

  it('não permite que tenant B leia dados sensíveis de tenant A', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantB]);
      const tables = [
        'editais',
        'itens_edital',
        'edital_chunks',
        'analises_ia',
        'ana_conversas',
        'ana_mensagens',
        'ana_tool_calls',
        'empresas',
        'empresa_usuarios',
        'oportunidades_salvas',
        'lances_log',
      ];
      for (const table of tables) {
        const result = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${table}`,
        );
        expect(result.rows[0]?.count, table).toBe('0');
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('bloqueia escrita cross-tenant e mutação de lances_log', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantB]);
      await expect(
        client.query(
          `INSERT INTO ana_conversas (tenant_id, usuario_id, titulo)
           VALUES ($1, $2, $3)`,
          [tenantA, userA, 'Tentativa indevida'],
        ),
      ).rejects.toThrow();
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(
        client.query('UPDATE lances_log SET decisao = $1', ['enviar']),
      ).rejects.toThrow();
      await expect(client.query('DELETE FROM lances_log')).rejects.toThrow();
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
