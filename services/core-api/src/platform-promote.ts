import { Pool } from 'pg';

/**
 * Passo operacional, uma vez por instalação: transforma uma conta existente em conta da
 * plataforma (equipe do Licite Comigo) sem alterar senha nem dados.
 *
 *   MIGRATION_DATABASE_URL=... PLATFORM_ADMIN_EMAIL=voce@exemplo.com \
 *     node services/core-api/dist/platform-promote.js
 *
 * Idempotente. Depois de rodar, saia e entre de novo para o acesso refletir o novo papel.
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} é obrigatório`);
  return value;
};

const run = async (): Promise<void> => {
  const email = required('PLATFORM_ADMIN_EMAIL').trim().toLowerCase();
  const tenantFilter = process.env.PLATFORM_TENANT_ID?.trim() || null;
  const pool = new Pool({ connectionString: required('MIGRATION_DATABASE_URL') });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.auth_flow', 'true', true)");
    const found = await client.query<{ id: string; tenant_id: string; papel: string }>(
      `SELECT id, tenant_id, papel::text AS papel FROM usuarios
        WHERE lower(email) = $1 AND ativo AND ($2::uuid IS NULL OR tenant_id = $2)`,
      [email, tenantFilter],
    );
    if (found.rows.length === 0) throw new Error(`nenhuma conta ativa com o e-mail ${email}`);
    if (found.rows.length > 1) {
      throw new Error(
        'o e-mail existe em mais de uma conta; informe PLATFORM_TENANT_ID com a conta correta',
      );
    }
    const account = found.rows[0]!;
    await client.query('INSERT INTO plataforma_tenants (id) VALUES ($1) ON CONFLICT DO NOTHING', [
      account.tenant_id,
    ]);
    await client.query(
      "UPDATE usuarios SET papel = 'plataforma', updated_at = now() WHERE id = $1",
      [account.id],
    );
    await client.query('COMMIT');
    process.stdout.write(
      `conta ${email} agora é da plataforma (antes: ${account.papel}) no tenant ${account.tenant_id}. Saia e entre de novo.\n`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'falha ao promover conta'}\n`);
  process.exitCode = 1;
});
