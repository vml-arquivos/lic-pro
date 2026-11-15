import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/password.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

suite('Cadastro da empresa com endereço e dados da Receita (PostgreSQL real)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  const suffix = randomUUID().slice(0, 8);
  const tenant = randomUUID();
  const owner = randomUUID();
  const who = () => ({
    authorization: `Bearer ${app.jwt.sign({ sub: owner, tenantId: tenant, role: 'admin' })}`,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({ jwtSecret: 'test-secret', logger: false, pool });
    await app.ready();
    await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
      tenant,
      'Cadastro',
      `cad-${tenant.slice(0, 8)}`,
    ]);
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em, onboarding_concluido)
       VALUES ($1, $2, $3, 'Dona Cadastro', 'admin', $4, now(), true)`,
      [owner, tenant, `cadastro.${suffix}@example.test`, hashPassword('Senha-Forte-2026!')],
    );
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await setup.end();
  });

  it('recusa CNPJ com dígito verificador errado', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: who(),
      payload: { cnpj: '11.222.333/0001-82', razao_social: 'Errada Ltda' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('salva CNPJ com máscara só com dígitos e guarda endereço e dados da Receita', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: who(),
      payload: {
        cnpj: '11.222.333/0001-81',
        razao_social: 'Empresa Exemplo Ltda',
        porte: 'pequena',
        cep: '74000-100',
        logradouro: 'Avenida Goiás',
        numero: '1200',
        bairro: 'Centro',
        cidade: 'Goiânia',
        uf: 'go',
        telefone: '(62) 3222-1111',
        email_contato: 'contato@exemplo.com.br',
        cnae_principal: '4751201',
        situacao_cadastral: 'Ativa',
        data_abertura: '2015-03-10',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const body = created.json();
    expect(body).toMatchObject({
      cnpj: '11222333000181',
      cep: '74000100',
      logradouro: 'Avenida Goiás',
      uf: 'GO',
      telefone: '6232221111',
      cnae_principal: '4751201',
    });

    const patched = await app.inject({
      method: 'PATCH',
      url: `/companies/${body.id}`,
      headers: who(),
      payload: { complemento: 'Sala 4', cep: '' },
    });
    expect(patched.statusCode, patched.body).toBe(200);
    // cep vazio não apaga o que já existe; complemento entra
    expect(patched.json()).toMatchObject({ complemento: 'Sala 4', cep: '74000100' });

    const duplicada = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: who(),
      payload: { cnpj: '11222333000181', razao_social: 'Repetida' },
    });
    expect(duplicada.statusCode).toBe(409);

    const list = await app.inject({ method: 'GET', url: '/companies', headers: who() });
    const row = (list.json().data as Array<Record<string, unknown>>).find((c) => c.id === body.id);
    expect(row).toMatchObject({ bairro: 'Centro', numero: '1200', situacao_cadastral: 'Ativa' });
  });
});
