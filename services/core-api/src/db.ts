import { Pool, type PoolClient, type QueryResultRow } from 'pg';

export type TenantContext = {
  tenantId: string;
  userId: string;
  empresaId?: string;
  role?: string;
};

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}

export async function withTenant<T>(
  pool: Pool,
  context: TenantContext,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [context.tenantId]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [context.userId]);
    await client.query("SELECT set_config('app.empresa_id', $1, true)", [context.empresaId ?? '']);
    await client.query("SELECT set_config('app.role', $1, true)", [context.role ?? '']);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function queryTenant<T extends QueryResultRow>(
  pool: Pool,
  context: TenantContext,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  return withTenant(pool, context, async (client) => {
    const result = await client.query<T>(text, values);
    return result.rows;
  });
}
