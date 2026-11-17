import { describe, expect, it } from 'vitest';
import { montarListaDePortais } from '../src/portais-routes.js';

describe('montarListaDePortais', () => {
  it('junta variações do mesmo portal, soma e mantém os conhecidos com zero', () => {
    const lista = montarListaDePortais([
      { valor: 'BLL Compras', total: 10 },
      { valor: 'BLL - Bolsa de Licitações e Leilões', total: 5 },
      { valor: 'Sistema da Prefeitura X', total: 3 },
    ]);
    const bll = lista.find((p) => p.slug === 'bll-compras')!;
    expect(bll.total).toBe(15);
    expect(lista[0]!.slug).toBe('bll-compras');
    const proprio = lista.find((p) => p.slug === 'sistema-da-prefeitura-x')!;
    expect(proprio).toMatchObject({ conhecido: false, total: 3, site: null });
    expect(lista.find((p) => p.slug === 'bnc')).toMatchObject({ total: 0, conhecido: true });
    expect(new Set(lista.map((p) => p.slug)).size).toBe(lista.length);
  });
});
