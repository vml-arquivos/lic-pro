import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  consultarPrecos,
  normalizePreco,
  PrecosError,
  statsOf,
  withoutExtremes,
} from '../src/precos.js';
import { buildApp } from '../src/server.js';

describe('preços de referência: cálculo', () => {
  it('estatísticas básicas', () => {
    expect(statsOf([])).toBeNull();
    expect(statsOf([10, 20, 30, 40])).toEqual({
      amostras: 4,
      minimo: 10,
      maximo: 40,
      media: 25,
      mediana: 25,
      p25: 17.5,
      p75: 32.5,
    });
  });

  it('remove extremos só com amostra suficiente', () => {
    expect(withoutExtremes([1, 2, 1000])).toEqual({ kept: [1, 2, 1000], removed: 0 });
    const result = withoutExtremes([10, 11, 12, 10, 11, 12, 11, 10, 5000]);
    expect(result.removed).toBe(1);
    expect(result.kept).not.toContain(5000);
  });

  it('lê campos com nomes alternativos e descarta linha sem preço', () => {
    expect(
      normalizePreco({ valorUnitario: '1.234,56', dataResultado: '2026-09-01', estado: 'DF' }),
    ).toMatchObject({
      preco: 1234.56,
      uf: 'DF',
    });
    expect(normalizePreco({ precoUnitario: 0 })).toBeNull();
    expect(normalizePreco({ nomeFornecedor: 'X' })).toBeNull();
    expect(normalizePreco('texto')).toBeNull();
  });
});

const NOW = new Date('2026-11-06T12:00:00-03:00');
const row = (preco: number, data: string, uf = 'DF') => ({
  precoUnitario: preco,
  quantidade: 10,
  dataCompra: data,
  nomeFornecedor: 'Fornecedor Exemplo',
  nomeUasg: 'UASG 1',
  estado: uf,
  descricaoItem: 'Papel A4',
  siglaUnidadeFornecimento: 'RESMA',
});

describe('consulta ao Compras.gov.br (fonte simulada)', () => {
  let server!: Server;
  let baseUrl = '';
  const calls: string[] = [];
  let mode: 'novo' | 'antigo' | 'erro' | 'limite' = 'novo';

  beforeAll(async () => {
    server = createServer((request, response) => {
      calls.push(request.url ?? '');
      const url = new URL(request.url ?? '', 'http://x');
      const respond = (status: number, body: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (mode === 'erro') return respond(500, {});
      if (mode === 'limite') return respond(429, {});
      if (mode === 'antigo' && url.searchParams.has('tipo'))
        return respond(400, { erro: 'parametro' });
      const page = Number(url.searchParams.get('pagina') ?? '1');
      return respond(200, {
        resultado:
          page === 1
            ? [
                row(20, '2026-10-01'),
                row(22, '2026-09-10'),
                row(24, '2026-08-15', 'SP'),
                row(999, '2020-01-01'),
              ]
            : [row(21, '2026-07-01')],
        totalPaginas: 2,
        totalRegistros: 5,
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const deps = () => ({ config: { comprasBaseUrl: baseUrl }, now: () => NOW });

  it('calcula referência na janela pedida, ignora o que é antigo e junta as páginas', async () => {
    mode = 'novo';
    calls.length = 0;
    const result = await consultarPrecos(deps(), { catmat: '460789', meses: 12 });
    expect(calls[0]).toContain('tipo=codigoItemCatalogo');
    expect(calls[0]).toContain('codigo=460789');
    expect(result.fonte.paginas).toBe(2);
    expect(result.todas).toMatchObject({ amostras: 4, minimo: 20, maximo: 24 });
    expect(result.itens.map((item) => item.preco)).toEqual([20, 22, 24, 21]);
    expect(result.descricao).toBe('Papel A4');
  });

  it('filtra por UF', async () => {
    mode = 'novo';
    const result = await consultarPrecos(deps(), { catmat: '460789', meses: 12, uf: 'DF' });
    expect(result.todas?.amostras).toBe(3);
    expect(result.uf).toBe('DF');
  });

  it('cai para a assinatura antiga quando a nova é recusada', async () => {
    mode = 'antigo';
    calls.length = 0;
    const result = await consultarPrecos(deps(), { catmat: '460789', meses: 12 });
    expect(calls.some((call) => call.includes('codigoItemCatalogo=460789'))).toBe(true);
    expect(result.todas?.amostras).toBe(4);
  });

  it('erros viram mensagem clara', async () => {
    mode = 'erro';
    await expect(consultarPrecos(deps(), { catmat: '460789', meses: 12 })).rejects.toBeInstanceOf(
      PrecosError,
    );
    mode = 'limite';
    await expect(consultarPrecos(deps(), { catmat: '460789', meses: 12 })).rejects.toMatchObject({
      code: 'fonte_limitada',
    });
    await expect(
      consultarPrecos(
        { config: { comprasBaseUrl: 'http://127.0.0.1:9' }, now: () => NOW },
        { catmat: '460789', meses: 12 },
      ),
    ).rejects.toMatchObject({ code: 'fonte_indisponivel' });
  });

  it('rota exige login e valida o código', async () => {
    mode = 'novo';
    const app = buildApp({
      jwtSecret: 'test-secret',
      logger: false,
      config: loadConfig({ NODE_ENV: 'test', COMPRAS_GOV_BASE_URL: baseUrl }),
    });
    await app.ready();
    expect(
      (await app.inject({ method: 'GET', url: '/precos/referencia?catmat=460789' })).statusCode,
    ).toBe(401);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({
        sub: '00000000-0000-4000-8000-000000000001',
        tenantId: '00000000-0000-4000-8000-000000000002',
        role: 'admin',
      })}`,
    };
    expect(
      (await app.inject({ method: 'GET', url: '/precos/referencia?catmat=abc', headers }))
        .statusCode,
    ).toBe(400);
    const ok = await app.inject({
      method: 'GET',
      url: '/precos/referencia?catmat=460789&meses=24',
      headers,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().todas.amostras).toBeGreaterThan(0);
    await app.close();
  });
});
