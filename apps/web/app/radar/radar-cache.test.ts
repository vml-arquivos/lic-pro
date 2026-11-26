import { describe, expect, it } from 'vitest';
import {
  FRESCO_MS,
  VALIDADE_MS,
  chaveDaLista,
  esquecerListas,
  guardarLista,
  guardarScroll,
  lerLista,
} from './radar-cache';
import type { ListResponse } from './radar-lib';

const lista = (total: number) =>
  ({
    data: [],
    total,
    page: 1,
    page_size: 10,
    total_pages: 1,
    facetas: {},
  }) as unknown as ListResponse;

describe('cache da lista do Farol', () => {
  it('gera a mesma chave para a mesma busca, em qualquer ordem', () => {
    const a = chaveDaLista('u1', new URLSearchParams('uf=SP&q=notebook&page=2'));
    const b = chaveDaLista('u1', new URLSearchParams('page=2&q=notebook&uf=SP'));
    expect(a).toBe(b);
  });

  it('não mistura contas nem buscas diferentes', () => {
    const base = new URLSearchParams('q=notebook');
    expect(chaveDaLista('u1', base)).not.toBe(chaveDaLista('u2', base));
    expect(chaveDaLista('u1', base)).not.toBe(chaveDaLista('u1', new URLSearchParams('q=mesa')));
    expect(chaveDaLista('u1', new URLSearchParams('page=1'))).not.toBe(
      chaveDaLista('u1', new URLSearchParams('page=2')),
    );
  });

  it('devolve a lista guardada com a idade e a posição da tela', () => {
    esquecerListas();
    const chave = chaveDaLista('u1', new URLSearchParams('q=a'));
    guardarLista(chave, lista(7), 1_000);
    guardarScroll(chave, 420.4);
    const lida = lerLista(chave, 1_000 + 10_000);
    expect(lida?.dados.total).toBe(7);
    expect(lida?.idade).toBe(10_000);
    expect(lida?.scroll).toBe(420);
    expect(lida!.idade < FRESCO_MS).toBe(true);
  });

  it('descarta a lista depois da validade', () => {
    esquecerListas();
    const chave = chaveDaLista('u1', new URLSearchParams('q=b'));
    guardarLista(chave, lista(1), 0);
    expect(lerLista(chave, VALIDADE_MS + 1)).toBeNull();
    expect(lerLista(chave, 1)).toBeNull();
  });

  it('guarda no máximo 24 buscas, apagando as mais antigas', () => {
    esquecerListas();
    for (let i = 0; i < 30; i += 1) {
      guardarLista(chaveDaLista('u1', new URLSearchParams(`q=${i}`)), lista(i), 5);
    }
    expect(lerLista(chaveDaLista('u1', new URLSearchParams('q=0')), 6)).toBeNull();
    expect(lerLista(chaveDaLista('u1', new URLSearchParams('q=29')), 6)?.dados.total).toBe(29);
  });
});
