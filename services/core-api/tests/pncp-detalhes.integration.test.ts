import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { normalizeDocumento, normalizeItem, parseNumeroControle } from '../src/pncp-detalhes.js';
import { buildApp } from '../src/server.js';

const connectionString = process.env.TEST_DATABASE_URL;
const setupConnectionString = process.env.TEST_ADMIN_DATABASE_URL;
const suite = describe.skipIf(!connectionString || !setupConnectionString);

describe('detalhes do PNCP: leitura', () => {
  it('separa o número de controle', () => {
    expect(parseNumeroControle('00394460000141-1-000123/2026')).toEqual({
      cnpj: '00394460000141',
      sequencial: '123',
      ano: '2026',
    });
    expect(parseNumeroControle('lixo')).toBeNull();
  });

  it('item e documento: campo ausente fica nulo, link precisa ser https', () => {
    expect(
      normalizeItem({
        numeroItem: 1,
        descricao: 'Papel A4',
        tipoBeneficioNome: 'Participação exclusiva de ME/EPP',
      }),
    ).toMatchObject({
      numero: '1',
      beneficio: 'Participação exclusiva de ME/EPP',
      quantidade: null,
    });
    expect(normalizeItem({ numeroItem: 2 })).toBeNull();
    expect(
      normalizeDocumento({ titulo: 'Edital', url: 'http://inseguro/x' }, 'https://b'),
    ).toBeNull();
    expect(
      normalizeDocumento({ titulo: 'Edital', sequencialDocumento: 4 }, 'https://b'),
    ).toMatchObject({
      url: 'https://b/arquivos/4',
      nome_arquivo: 'Edital',
    });
    expect(normalizeDocumento({ url: 'https://x/y', statusAtivo: false }, 'https://b')).toBeNull();
  });
});

suite('detalhes do edital (PostgreSQL real, PNCP simulado)', () => {
  let pool!: Pool;
  let setup!: Pool;
  let app!: ReturnType<typeof buildApp>;
  let server!: Server;
  const calls: string[] = [];
  const platformTenant = randomUUID();
  const clientTenant = randomUUID();
  const clientUser = randomUUID();
  const editalPncp = randomUUID();
  const editalManual = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const idExterno = `00394460000141-1-${String(Math.floor(Math.random() * 900000) + 1).padStart(6, '0')}/2026`;
  const [, , sequencialRaw] = /^(\d{14})-1-(\d+)\/2026$/.exec(idExterno) ?? [];
  const sequencial = String(Number(sequencialRaw ?? '1'));

  beforeAll(async () => {
    server = createServer((request, response) => {
      calls.push(request.url ?? '');
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if ((request.url ?? '').includes(`/compras/2026/${sequencial}/itens`)) {
        return send(200, [
          {
            numeroItem: 1,
            descricao: 'Papel A4 75g',
            unidadeMedida: 'RESMA',
            quantidade: 100,
            valorUnitarioEstimado: 25.5,
            catalogoCodigoItem: '460789',
            tipoBeneficioNome: 'Participação exclusiva de ME/EPP',
            situacaoCompraItemNome: 'Em andamento',
          },
          { numeroItem: 2, descricao: 'Caneta azul', quantidade: 500 },
          { descricao: 'sem número' },
        ]);
      }
      if ((request.url ?? '').includes(`/compras/2026/${sequencial}/arquivos`)) {
        return send(200, [
          {
            titulo: 'Edital.pdf',
            tipoDocumentoNome: 'Edital',
            url: 'https://pncp.example.test/arquivos/1',
          },
          { titulo: 'Anexo', sequencialDocumento: 2 },
        ]);
      }
      return send(404, {});
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    pool = new Pool({ connectionString: connectionString! });
    setup = new Pool({ connectionString: setupConnectionString! });
    app = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      pool,
      config: loadConfig({ NODE_ENV: 'test', PNCP_API_BASE_URL: base }),
    });
    await app.ready();
    for (const [id, nome] of [
      [platformTenant, 'Plataforma Detalhes'],
      [clientTenant, 'Empresa Detalhes'],
    ] as const) {
      await setup.query('INSERT INTO tenants (id, nome, slug) VALUES ($1, $2, $3)', [
        id,
        nome,
        `d-${id.slice(0, 8)}`,
      ]);
    }
    await setup.query('INSERT INTO plataforma_tenants (id) VALUES ($1)', [platformTenant]);
    await setup.query(
      `INSERT INTO usuarios (id, tenant_id, email, nome, papel, password_hash, email_verificado_em, nicho_preferencias, onboarding_concluido)
       VALUES ($1, $2, $3, 'Cliente Detalhes', 'admin', $4, now(), '["limpeza-conservacao"]'::jsonb, true)`,
      [
        clientUser,
        clientTenant,
        `detalhes.${suffix}@example.test`,
        hashPassword('Senha-Forte-2026!'),
      ],
    );
    await setup.query(
      `INSERT INTO editais (id, tenant_id, fonte, id_externo, titulo, orgao, uf, hash_conteudo, conteudo_texto)
       VALUES ($1, $2, 'pncp', $3, 'Compra de material de escritório', 'Órgão Teste', 'RR', $4, 'texto'),
              ($5, $6, 'manual', $7, 'Edital da própria empresa', 'Órgão X', 'RR', $8, 'texto')`,
      [
        editalPncp,
        platformTenant,
        idExterno,
        `h-${suffix}`,
        editalManual,
        clientTenant,
        `manual-${suffix}`,
        `m-${suffix}`,
      ],
    );
  });

  afterAll(async () => {
    await setup.query('DELETE FROM editais WHERE id = ANY($1)', [[editalPncp, editalManual]]);
    await app.close();
    await pool.end();
    await setup.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const headers = () => ({
    authorization: `Bearer ${app.jwt.sign({ sub: clientUser, tenantId: clientTenant, role: 'admin' })}`,
  });
  const refresh = (id: string, payload: unknown = {}) =>
    app.inject({
      method: 'POST',
      url: `/editais/${id}/detalhes/atualizar`,
      headers: headers(),
      payload: payload as object,
    });

  it('busca itens e documentos no PNCP, grava no catálogo e a empresa passa a ver', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/editais/${editalPncp}/detalhes/atualizar`,
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
    const response = await refresh(editalPncp);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ atualizado: true, itens: 2, documentos: 1 });

    const items = await setup.query(
      'SELECT numero, beneficio, catmat_catser, unidade FROM itens_edital WHERE edital_id = $1 ORDER BY numero',
      [editalPncp],
    );
    expect(items.rows).toHaveLength(2);
    expect(items.rows[0]).toMatchObject({
      numero: '1',
      beneficio: 'Participação exclusiva de ME/EPP',
      catmat_catser: '460789',
    });
    const docs = await setup.query(
      'SELECT nome_arquivo, url FROM edital_documentos WHERE edital_id = $1 ORDER BY nome_arquivo',
      [editalPncp],
    );
    // o anexo sem link próprio usa a base da fonte (http no teste) e por isso é descartado: só https entra
    expect(docs.rows.map((row) => row.nome_arquivo)).toEqual(['Edital.pdf']);
    expect(docs.rows.every((row) => String(row.url).startsWith('https://'))).toBe(true);

    // a empresa lê pelo detalhe do Radar
    const detail = await app.inject({
      method: 'GET',
      url: `/editais/${editalPncp}`,
      headers: headers(),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().itens).toHaveLength(2);
    expect(detail.json().documentos ?? detail.json().documents).toBeDefined();
  });

  it('repetir logo depois não chama o PNCP de novo, a menos que force', async () => {
    const before = calls.length;
    const again = await refresh(editalPncp);
    expect(again.json()).toMatchObject({ atualizado: false, motivo: 'recente' });
    expect(calls.length).toBe(before);
    const forced = await refresh(editalPncp, { force: true });
    expect(forced.json().atualizado).toBe(true);
    expect(calls.length).toBeGreaterThan(before);
    const count = await setup.query(
      'SELECT count(*)::int AS n FROM itens_edital WHERE edital_id = $1',
      [editalPncp],
    );
    expect(count.rows[0].n).toBe(2);
  });

  it('não mexe em edital que não é do PNCP nem do catálogo', async () => {
    const manual = await refresh(editalManual);
    expect(manual.statusCode).toBe(422);
    expect(manual.json().error).toBe('fonte_sem_detalhes');
    expect((await refresh(randomUUID())).statusCode).toBe(404);
  });
});
