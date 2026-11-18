import { beforeEach, describe, expect, it } from 'vitest';
import {
  comPoliticaDeFonte,
  contadoresDaFonte,
  esperaPedida,
  zerarContadores,
} from '../src/fonte-http.js';

const resposta = (status: number, cabecalhos: Record<string, string> = {}) =>
  new Response(status === 200 ? '{}' : '', { status, headers: cabecalhos });

describe('política das fontes oficiais', () => {
  beforeEach(() => zerarContadores());

  it('espera o tempo pedido pela fonte (429) e tenta de novo', async () => {
    const respostas = [resposta(429, { 'retry-after': '2' }), resposta(200)];
    const esperas: number[] = [];
    const fonte = comPoliticaDeFonte(
      (async () => respostas.shift()!) as unknown as typeof fetch,
      't1',
      { dormir: async (ms) => void esperas.push(ms) },
    );
    const final = await fonte('https://x.test/a');
    expect(final.status).toBe(200);
    expect(esperas).toHaveLength(1);
    expect(esperas[0]).toBeGreaterThanOrEqual(2000);
    const contagem = contadoresDaFonte('t1');
    expect(contagem.chamadas).toBe(2);
    expect(contagem.limitadas).toBe(1);
    expect(contagem.novasTentativas).toBe(1);
  });

  it('desiste depois das tentativas e devolve o último status', async () => {
    const fonte = comPoliticaDeFonte((async () => resposta(503)) as unknown as typeof fetch, 't2', {
      dormir: async () => undefined,
      novasTentativas: 2,
    });
    const final = await fonte('https://x.test/a');
    expect(final.status).toBe(503);
    expect(contadoresDaFonte('t2').chamadas).toBe(3);
  });

  it('não repete quando a resposta é definitiva (404, 400)', async () => {
    const fonte = comPoliticaDeFonte((async () => resposta(404)) as unknown as typeof fetch, 't3', {
      dormir: async () => undefined,
    });
    expect((await fonte('https://x.test/a')).status).toBe(404);
    expect(contadoresDaFonte('t3').chamadas).toBe(1);
  });

  it('repete erro de rede, mas não repete tempo esgotado', async () => {
    let n = 0;
    const rede = comPoliticaDeFonte(
      (async () => {
        n += 1;
        if (n === 1) throw new TypeError('fetch failed');
        return resposta(200);
      }) as unknown as typeof fetch,
      't4',
      { dormir: async () => undefined },
    );
    expect((await rede('https://x.test/a')).status).toBe(200);
    let m = 0;
    const abortado = comPoliticaDeFonte(
      (async () => {
        m += 1;
        throw Object.assign(new Error('abortado'), { name: 'AbortError' });
      }) as unknown as typeof fetch,
      't5',
      { dormir: async () => undefined },
    );
    await expect(abortado('https://x.test/a')).rejects.toThrow('abortado');
    expect(m).toBe(1);
  });

  it('limita as chamadas ao mesmo tempo por fonte', async () => {
    let ativas = 0;
    let maximo = 0;
    const fonte = comPoliticaDeFonte(
      (async () => {
        ativas += 1;
        maximo = Math.max(maximo, ativas);
        await new Promise((r) => setTimeout(r, 15));
        ativas -= 1;
        return resposta(200);
      }) as unknown as typeof fetch,
      't6',
      { concorrencia: 2 },
    );
    await Promise.all(Array.from({ length: 8 }, () => fonte('https://x.test/a')));
    expect(maximo).toBe(2);
    expect(contadoresDaFonte('t6').chamadas).toBe(8);
  });

  it('lê o Retry-After em segundos e em data', () => {
    expect(esperaPedida('3')).toBe(3000);
    expect(esperaPedida(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(esperaPedida(null)).toBeNull();
    expect(esperaPedida('texto')).toBeNull();
  });
});
