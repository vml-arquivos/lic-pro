import { describe, expect, it } from 'vitest';
import { AREAS, canOpenPage, requiresSession } from '../src/areas.js';
import { HUB_CTA, HUB_NODES, HUB_VISITOR } from '../src/hubs.js';

describe('rede de especialistas', () => {
  it('cada nó leva a uma página que a própria área pode abrir', () => {
    for (const area of AREAS) {
      for (const node of HUB_NODES[area]) {
        expect(canOpenPage([area], node.href), `${area} → ${node.href}`).toBe(true);
      }
    }
  });

  it('não repete destino dentro de uma área e sempre há texto no nó', () => {
    for (const area of AREAS) {
      const hrefs = HUB_NODES[area].map((node) => node.href);
      expect(new Set(hrefs).size, area).toBe(hrefs.length);
      expect(HUB_NODES[area].length, area).toBeGreaterThanOrEqual(4);
      expect(HUB_NODES[area].length, area).toBeLessThanOrEqual(12);
      for (const node of HUB_NODES[area]) {
        expect(node.label.trim()).not.toBe('');
        expect(node.caption.trim()).not.toBe('');
      }
      expect(HUB_CTA[area].text.length).toBeGreaterThan(10);
    }
  });

  it('a vitrine pública só aponta para páginas abertas ou para o login com retorno interno', () => {
    for (const node of HUB_VISITOR) {
      if (node.href.startsWith('/login')) {
        const next = new URL(node.href, 'https://app.test').searchParams.get('next');
        expect(next && next.startsWith('/') && !next.startsWith('//'), node.href).toBe(true);
        expect(requiresSession(next!), `${node.href} deveria exigir sessão`).toBe(true);
      } else {
        expect(requiresSession(node.href), `${node.href} deveria abrir sem conta`).toBe(false);
      }
    }
  });
});
