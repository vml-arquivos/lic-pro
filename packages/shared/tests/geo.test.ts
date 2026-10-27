import { describe, expect, it } from 'vitest';
import { REGIOES, UFS, regiaoDaUf, ufsDaRegiao } from '../src/geo.js';

describe('geografia', () => {
  it('tem as 27 unidades da federação, cada uma em uma só região', () => {
    expect(UFS).toHaveLength(27);
    expect(new Set(UFS).size).toBe(27);
    for (const uf of UFS) expect(regiaoDaUf(uf), uf).not.toBeNull();
  });
  it('resolve região e UFs da região', () => {
    expect(regiaoDaUf('df')).toBe('centro-oeste');
    expect(regiaoDaUf('SP')).toBe('sudeste');
    expect(regiaoDaUf('XX')).toBeNull();
    expect(ufsDaRegiao(['sul'])).toEqual(['PR', 'RS', 'SC']);
    expect(ufsDaRegiao(REGIOES)).toHaveLength(27);
  });
});
