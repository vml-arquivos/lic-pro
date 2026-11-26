import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clienteDoBanco } from '../src/cache-banco.js';
import { CacheCompartilhado } from '../src/cache-compartilhado.js';

const connectionString = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!connectionString);

suite('cache das fontes guardado no banco (PostgreSQL real)', () => {
  let pool!: Pool;
  const prefixo = `teste:${randomUUID().slice(0, 8)}:`;

  beforeAll(() => {
    pool = new Pool({ connectionString: connectionString! });
  });
  afterAll(async () => {
    await pool.query('DELETE FROM cache_fontes WHERE chave LIKE $1', [`${prefixo}%`]);
    await pool.end();
  });

  it('guarda, lê, vence e apaga', async () => {
    const cliente = clienteDoBanco(pool, () => 1);
    expect(await cliente.get(`${prefixo}a`)).toBeNull();
    expect(await cliente.set(`${prefixo}a`, 'um', { PX: 60_000 })).toBe('OK');
    expect(await cliente.get(`${prefixo}a`)).toBe('um');
    await cliente.set(`${prefixo}a`, 'dois', { PX: 60_000 });
    expect(await cliente.get(`${prefixo}a`)).toBe('dois');
    await cliente.set(`${prefixo}vence`, 'x', { PX: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await cliente.get(`${prefixo}vence`)).toBeNull();
    await cliente.del(`${prefixo}a`);
    expect(await cliente.get(`${prefixo}a`)).toBeNull();
  });

  it('a trava (NX) só entrega a uma instância e libera quando vence', async () => {
    const cliente = clienteDoBanco(pool, () => 1);
    expect(await cliente.set(`${prefixo}trava`, 'dono-1', { NX: true, PX: 60_000 })).toBe('OK');
    expect(await cliente.set(`${prefixo}trava`, 'dono-2', { NX: true, PX: 60_000 })).toBeNull();
    expect(await cliente.get(`${prefixo}trava`)).toBe('dono-1');
    await cliente.set(`${prefixo}curta`, 'a', { NX: true, PX: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await cliente.set(`${prefixo}curta`, 'b', { NX: true, PX: 60_000 })).toBe('OK');
  });

  it('o dado sobrevive a reinício: outra instância do cache lê o que a primeira guardou', async () => {
    const pedido = {
      validadeMs: 60_000,
      retencaoMs: 600_000,
      buscar: async () => ({ valor: { n: 1 } }),
    };
    const primeira = new CacheCompartilhado(undefined, {
      cliente: clienteDoBanco(pool),
      prefixo,
    });
    expect((await primeira.obter('reinicio', pedido)).origem).toBe('fonte');
    const depoisDoDeploy = new CacheCompartilhado(undefined, {
      cliente: clienteDoBanco(pool),
      prefixo,
    });
    let consultas = 0;
    const lido = await depoisDoDeploy.obter('reinicio', {
      ...pedido,
      buscar: async () => {
        consultas += 1;
        return { valor: { n: 2 } };
      },
    });
    expect(lido).toMatchObject({ origem: 'cache', valor: { n: 1 } });
    expect(consultas).toBe(0);
  });

  it('banco sem a tabela não derruba a consulta: cai para a memória', async () => {
    const quebrado = {
      get: async () => {
        throw new Error('relation "cache_fontes" does not exist');
      },
      set: async () => {
        throw new Error('relation "cache_fontes" does not exist');
      },
      del: async () => {
        throw new Error('x');
      },
    };
    const cache = new CacheCompartilhado(undefined, { cliente: quebrado });
    const resultado = await cache.obter('sem-tabela', {
      validadeMs: 60_000,
      retencaoMs: 600_000,
      buscar: async () => ({ valor: 7 }),
    });
    expect(resultado.valor).toBe(7);
  });
});
