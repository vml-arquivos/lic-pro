import type { PoolClient } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { esquecerColunasOpcionais, temCamposPncp } from '../src/colunas-opcionais.js';

const cliente = (total: number) => {
  const query = vi.fn().mockResolvedValue({ rows: [{ total }] });
  return { client: { query } as unknown as PoolClient, query };
};

describe('colunas opcionais (migration atrasada)', () => {
  afterEach(() => {
    esquecerColunasOpcionais();
    vi.useRealTimers();
  });

  it('migration pendente: diz que não há colunas e só pergunta de novo depois de um tempo', async () => {
    vi.useFakeTimers();
    const { client, query } = cliente(0);
    expect(await temCamposPncp(client)).toBe(false);
    expect(await temCamposPncp(client)).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(31_000);
    expect(await temCamposPncp(client)).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('colunas presentes: confirma uma vez e não pergunta mais', async () => {
    const { client, query } = cliente(6);
    expect(await temCamposPncp(client)).toBe(true);
    expect(await temCamposPncp(client)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('só parte das colunas: continua como pendente', async () => {
    const { client } = cliente(3);
    expect(await temCamposPncp(client)).toBe(false);
  });
});
