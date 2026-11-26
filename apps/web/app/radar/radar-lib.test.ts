import { describe, expect, it } from 'vitest';
import { paramsFromForm } from './radar-lib';

describe('paramsFromForm', () => {
  it('guarda vários portais e os seis filtros novos do PNCP', () => {
    const form = new FormData();
    form.append('portal', 'bnc');
    form.append('portal', 'bll-compras');
    form.append('fonte_orcamentaria', 'Federal');
    form.append('emenda', 'true');
    form.append('sigiloso', '');
    form.append('status', 'todos');
    const params = paramsFromForm(form);
    expect(params.getAll('portal')).toEqual(['bnc', 'bll-compras']);
    expect(params.get('fonte_orcamentaria')).toBe('Federal');
    expect(params.get('emenda')).toBe('true');
    expect(params.has('sigiloso')).toBe(false);
    expect(params.has('status')).toBe(false);
  });
});
