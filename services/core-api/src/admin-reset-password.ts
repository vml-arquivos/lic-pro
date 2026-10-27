import { Pool } from 'pg';
import { assertStrongPassword, hashPassword } from './password.js';

/**
 * Redefine a senha de uma conta pelo servidor, para quem perdeu o acesso e ainda não tem e-mail
 * de recuperação configurado.
 *
 *   MIGRATION_DATABASE_URL=... RESET_EMAIL=voce@exemplo.com RESET_PASSWORD='nova-senha-forte' \
 *     node services/core-api/dist/admin-reset-password.js
 *
 * Troque a senha de novo depois de entrar. Não revela se o e-mail existe em outra conta.
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} é obrigatório`);
  return value;
};

const run = async (): Promise<void> => {
  const email = required('RESET_EMAIL').trim().toLowerCase();
  const password = required('RESET_PASSWORD');
  assertStrongPassword(password);
  const tenantFilter = process.env.RESET_TENANT_ID?.trim() || null;
  const pool = new Pool({ connectionString: required('MIGRATION_DATABASE_URL') });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.auth_flow', 'true', true)");
    const found = await client.query<{ usuario_id: string; tenant_id: string }>(
      `SELECT usuario_id, tenant_id FROM auth_credentials
        WHERE lower(email) = $1 AND ($2::uuid IS NULL OR tenant_id = $2)`,
      [email, tenantFilter],
    );
    if (found.rows.length === 0) throw new Error(`nenhuma conta com o e-mail ${email}`);
    if (found.rows.length > 1) {
      throw new Error('o e-mail existe em mais de uma conta; informe RESET_TENANT_ID');
    }
    const account = found.rows[0]!;
    // Com uma conexão sem poder de administrador, o banco só deixa alterar a conta que está
    // "ativa" na sessão. Indica a conta alvo para o comando funcionar nos dois casos.
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [account.tenant_id]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [account.usuario_id]);
    const hash = hashPassword(password);
    await client.query(
      `UPDATE auth_credentials
          SET password_hash = $3, ativo = true,
              email_verificado_em = COALESCE(email_verificado_em, now()), updated_at = now()
        WHERE tenant_id = $1 AND usuario_id = $2`,
      [account.tenant_id, account.usuario_id, hash],
    );
    await client.query(
      `UPDATE usuarios SET password_hash = $3, ativo = true,
              email_verificado_em = COALESCE(email_verificado_em, now()), updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [account.tenant_id, account.usuario_id, hash],
    );
    await client.query('COMMIT');
    process.stdout.write(`senha de ${email} redefinida. Entre e troque a senha em Minha conta.\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'falha ao redefinir'}\n`);
  process.exitCode = 1;
});
