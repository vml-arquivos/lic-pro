import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

suite('GET /ana/contexto (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const tenant = randomUUID();
  const admin = randomUUID();
  const aluno = randomUUID();

  const headers = (sub: string, role: string, extra: Record<string, string> = {}) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, tenantId: tenant, role })}`,
    ...extra,
  });
  const contexto = async (sub: string, role: string, extra: Record<string, string> = {}) => {
    const response = await app.inject({
      method: 'GET',
      url: '/ana/contexto',
      headers: headers(sub, role, extra),
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as {
      area: string;
      papel: string;
      nome: string | null;
      resumo: string[];
      sugestoes: string[];
    };
  };

  async function insertUser(id: string, papel: string, nome: string) {
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em,
                             nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, $4, $5, $6, now(), '["tecnologia-comunicacao"]'::jsonb, true)`,
      [
        id,
        tenant,
        `ctx.${papel}.${suffix}@example.test`,
        nome,
        papel,
        hashPassword('Senha-Forte-2026!'),
      ],
    );
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      config: loadConfig({
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret',
        DATABASE_URL: connectionString!,
        APP_URL: 'https://app.example.test',
      }),
    });
    await app.ready();
    await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
      tenant,
      'Empresa Ana',
      `ana-${tenant.slice(0, 8)}`,
    ]);
    await insertUser(admin, 'admin', 'Carla Empresa');
    await insertUser(aluno, 'aluno', 'Davi Aluno');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('exige sessão', async () => {
    const response = await app.inject({ method: 'GET', url: '/ana/contexto' });
    expect(response.statusCode).toBe(401);
  });

  it('empresa recebe contexto de empresa, com o primeiro nome e sugestões', async () => {
    const body = await contexto(admin, 'admin');
    expect(body.area).toBe('empresa');
    expect(body.nome).toBe('Carla');
    expect(body.sugestoes.length).toBeGreaterThan(0);
  });

  it('aluno recebe contexto de aluno e não consegue "ver como" outra área', async () => {
    const body = await contexto(aluno, 'aluno', { 'x-acting-as': 'administracao' });
    expect(body.area).toBe('aluno');
    expect(body.nome).toBe('Davi');
    expect(body.sugestoes.join(' ')).toContain('estudar');
  });
});
