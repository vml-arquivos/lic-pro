import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const connectionString = process.env.TEST_DATABASE_URL;
const rlsSuite = describe.skipIf(!connectionString);

rlsSuite('isolamento RLS por tenant', () => {
  let pool: Pool;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [userA]);
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
        `INSERT INTO ana_conversas (tenant_id, usuario_id, titulo)
         VALUES ($1, $2, $3)`,
        [tenantA, userA, 'Conversa privada A'],
      );
      await client.query('COMMIT');

      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantB]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [randomUUID()]);
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
  });

  it('não permite que o tenant B leia conversas do tenant A', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantB]);
      const result = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM ana_conversas',
      );
      await client.query('COMMIT');
      expect(result.rows[0]?.count).toBe('0');
    } finally {
      client.release();
    }
  });

  it('bloqueia escrita com tenant_id de outro tenant', async () => {
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
    } finally {
      client.release();
    }
  });
});
