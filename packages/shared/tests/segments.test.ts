import { describe, expect, it } from 'vitest';
import {
  NICHE_CODES,
  SEGMENT_CATALOG,
  itemSearchExpression,
  itemTerms,
  normalizeSegmentCodes,
  segmentSearchExpression,
  segmentsOfNiches,
} from '../src/index.js';

describe('catálogo de segmentos', () => {
  it('todo nicho tem segmentos e todo segmento aponta para um nicho existente', () => {
    for (const code of NICHE_CODES) expect(segmentsOfNiches([code]).length).toBeGreaterThan(0);
    for (const segment of SEGMENT_CATALOG) {
      expect(NICHE_CODES).toContain(segment.niche);
      expect(segment.code.startsWith(`${segment.niche}/`)).toBe(true);
      expect(segment.items.length).toBeGreaterThan(0);
      for (const item of segment.items) expect(item.terms.length).toBeGreaterThan(0);
    }
  });

  it('códigos de segmento são únicos', () => {
    const codes = SEGMENT_CATALOG.map((segment) => segment.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('normaliza códigos: descarta inválidos e repetidos', () => {
    const first = SEGMENT_CATALOG[0]!.code;
    expect(normalizeSegmentCodes([first, first, 'nao/existe', ' '])).toEqual([first]);
  });

  it('gera expressão de busca com frases entre aspas', () => {
    const code = segmentsOfNiches(['uniformes-epis'])[0]!.code;
    const expression = segmentSearchExpression([code]);
    expect(expression).toMatch(/^"[^"]+"( OR "[^"]+")*$/);
    expect(segmentSearchExpression(['nao/existe'])).toBe('');
  });

  it('item do catálogo usa seus termos e texto livre vale como frase', () => {
    expect(itemTerms(['Merenda escolar'])).toContain('merenda');
    expect(itemTerms(['peça rara'])).toEqual(['peça rara']);
    expect(itemSearchExpression(['peça "rara"'])).toBe('"peça rara"');
  });
});
