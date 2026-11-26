import { describe, expect, it } from 'vitest';
import { montarListaDePortais } from '../src/portais-routes.js';

describe('montarListaDePortais', () => {
  it('uma linha por portal, com abertas e valor, e os conhecidos sem edital com zero', () => {
    const lista = montarListaDePortais([
      {
        slug: 'bll-compras',
        nome: 'BLL - Bolsa de Licitações e Leilões',
        total: 15,
        abertas: 9,
        encerram_3_dias: 2,
        valor_abertas: 1500.5,
      },
      { slug: 'sistema-da-prefeitura-x', nome: 'Sistema da Prefeitura X', total: 3, abertas: 1 },
    ]);
    const bll = lista.find((p) => p.slug === 'bll-compras')!;
    expect(bll).toMatchObject({
      total: 15,
      abertas: 9,
      encerram_3_dias: 2,
      valor_abertas: 1500.5,
      conhecido: true,
    });
    expect(lista[0]!.slug).toBe('bll-compras');
    const proprio = lista.find((p) => p.slug === 'sistema-da-prefeitura-x')!;
    expect(proprio).toMatchObject({
      conhecido: false,
      total: 3,
      abertas: 1,
      encerram_3_dias: 0,
      site: null,
      nome: 'Sistema da Prefeitura X',
    });
    expect(lista.find((p) => p.slug === 'bnc')).toMatchObject({
      total: 0,
      abertas: 0,
      conhecido: true,
    });
    expect(new Set(lista.map((p) => p.slug)).size).toBe(lista.length);
  });
});
