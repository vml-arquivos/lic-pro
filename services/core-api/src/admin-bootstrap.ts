import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword, assertStrongPassword } from './password.js';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} é obrigatório`);
  return value;
};

const slugify = (value: string): string => {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
  return slug || 'licite-comigo';
};

const run = async (): Promise<void> => {
  const databaseUrl = required('MIGRATION_DATABASE_URL');
  const tenantName = required('BOOTSTRAP_TENANT_NAME').trim();
  const adminEmail = required('BOOTSTRAP_ADMIN_EMAIL').trim().toLowerCase();
  const adminPassword = required('BOOTSTRAP_ADMIN_PASSWORD');
  assertStrongPassword(adminPassword);
  if (!tenantName || !adminEmail.includes('@')) throw new Error('tenant ou e-mail inválido');

  const termsVersion = process.env.TERMS_VERSION ?? '2026-10-17-draft';
  const privacyVersion = process.env.PRIVACY_VERSION ?? '2026-10-17-draft';
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.auth_flow', 'true', true)");
    const slug = slugify(tenantName);
    const tenantResult = await client.query<{ id: string }>(
      'SELECT id FROM tenants WHERE slug = $1 LIMIT 1',
      [slug],
    );
    const tenantId = tenantResult.rows[0]?.id ?? randomUUID();
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    if (!tenantResult.rows[0]) {
      await client.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        tenantId,
        tenantName,
        slug,
      ]);
    }

    const credential = await client.query<{ usuario_id: string }>(
      'SELECT usuario_id FROM auth_credentials WHERE tenant_id = $1 AND lower(email) = lower($2) LIMIT 1',
      [tenantId, adminEmail],
    );
    const userId = credential.rows[0]?.usuario_id ?? randomUUID();
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    if (!credential.rows[0]) {
      await client.query(
        `INSERT INTO usuarios
           (id, tenant_id, email, nome, papel, perfil_jornada, onboarding_concluido,
            password_hash, publico, email_verificado_em, termos_versao, termos_aceitos_em,
            politica_versao, politica_aceita_em)
         VALUES ($1, $2, $3, $4, 'admin', 'profissional', true, $5, 'empresa', now(), $6, now(), $7, now())`,
        [
          userId,
          tenantId,
          adminEmail,
          'Administrador',
          hashPassword(adminPassword),
          termsVersion,
          privacyVersion,
        ],
      );
      await client.query(
        `INSERT INTO auth_credentials (tenant_id, usuario_id, email, password_hash, email_verificado_em)
         VALUES ($1, $2, $3, $4, now())`,
        [tenantId, userId, adminEmail, hashPassword(adminPassword)],
      );
    } else {
      await client.query(
        `UPDATE auth_credentials
            SET password_hash = $3, ativo = true, email_verificado_em = COALESCE(email_verificado_em, now()), updated_at = now()
          WHERE tenant_id = $1 AND usuario_id = $2`,
        [tenantId, userId, hashPassword(adminPassword)],
      );
      await client.query(
        `UPDATE usuarios SET papel = 'admin', ativo = true, email_verificado_em = COALESCE(email_verificado_em, now()), updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, userId],
      );
    }
    await client.query('COMMIT');
    process.stdout.write(`bootstrap concluído para ${adminEmail} no tenant ${tenantId}\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'falha no bootstrap'}\n`);
  process.exitCode = 1;
});
