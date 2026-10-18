import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server.js';
import { loadConfig } from '../src/config.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

suite('histórico da Ana', () => {
  let pool!: Pool;
  let setupPool!: Pool;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const conversationA = randomUUID();
  const conversationB = randomUUID();
  const conversationOtherTenant = randomUUID();
  let app!: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setupPool = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      config: loadConfig({
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret',
        DATABASE_URL: connectionString!,
      }),
    });

    const client = await setupPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        tenantA,
        'Tenant histórico A',
        `history-a-${tenantA.slice(0, 8)}`,
      ]);
      await client.query(
        `INSERT INTO usuarios (id, tenant_id, email, nome, papel)
         VALUES ($1, $2, $3, $4, 'aluno'), ($5, $2, $6, $7, 'aluno')`,
        [
          userA,
          tenantA,
          `a-${userA}@example.test`,
          'User A',
          userB,
          `b-${userB}@example.test`,
          'User B',
        ],
      );
      await client.query(
        `INSERT INTO ana_conversas (id, tenant_id, usuario_id, titulo)
         VALUES ($1, $2, $3, 'Conversa A'), ($4, $2, $5, 'Conversa B')`,
        [conversationA, tenantA, userA, conversationB, userB],
      );
      await client.query(
        `INSERT INTO ana_mensagens (tenant_id, conversa_id, tipo, conteudo)
         VALUES ($1, $2, 'usuario', 'Mensagem privada A')`,
        [tenantA, conversationA],
      );
      await client.query('COMMIT');

      await client.query('BEGIN');
      await client.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        tenantB,
        'Tenant histórico B',
        `history-b-${tenantB.slice(0, 8)}`,
      ]);
      const userOtherTenant = randomUUID();
      await client.query(
        `INSERT INTO usuarios (id, tenant_id, email, nome, papel)
         VALUES ($1, $2, $3, $4, 'aluno')`,
        [userOtherTenant, tenantB, `other-${userOtherTenant}@example.test`, 'Other Tenant'],
      );
      await client.query(
        `INSERT INTO ana_conversas (id, tenant_id, usuario_id, titulo)
         VALUES ($1, $2, $3, 'Conversa outro tenant')`,
        [conversationOtherTenant, tenantB, userOtherTenant],
      );
      await client.query('COMMIT');
      await app.ready();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setupPool.end();
  });

  it('lista e apaga somente conversas do usuário autenticado', async () => {
    const token = app.jwt.sign({ sub: userA, tenantId: tenantA, role: 'aluno' });
    const headers = { authorization: `Bearer ${token}` };

    const list = await app.inject({ method: 'GET', url: '/ana/conversations', headers });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0].id).toBe(conversationA);

    const otherUserConversation = await app.inject({
      method: 'DELETE',
      url: `/ana/conversations/${conversationB}`,
      headers,
    });
    expect(otherUserConversation.statusCode).toBe(404);

    const otherTenantConversation = await app.inject({
      method: 'DELETE',
      url: `/ana/conversations/${conversationOtherTenant}`,
      headers,
    });
    expect(otherTenantConversation.statusCode).toBe(404);

    const messages = await app.inject({
      method: 'GET',
      url: `/ana/conversations/${conversationA}/messages`,
      headers,
    });
    expect(messages.statusCode).toBe(200);
    expect(messages.json().data[0].conteudo).toBe('Mensagem privada A');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/ana/conversations/${conversationA}`,
      headers,
    });
    expect(deleted.statusCode).toBe(204);
  });
});
