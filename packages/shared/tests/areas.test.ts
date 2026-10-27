import { describe, expect, it } from 'vitest';
import {
  AREAS,
  AREA_MENUS,
  PAGE_RULES,
  canOpenPage,
  flatMenu,
  pageAreas,
  requiresSession,
} from '../src/areas.js';

describe('menus por área', () => {
  it('cada item de menu leva a uma página que a própria área pode abrir', () => {
    for (const area of AREAS) {
      for (const item of flatMenu(area)) {
        expect(canOpenPage([area], item.href), `${area} → ${item.href}`).toBe(true);
      }
    }
  });

  it('nenhum menu mistura itens de outra área', () => {
    const adminOnly = flatMenu('administracao')
      .map((item) => item.href)
      .filter((href) => href.startsWith('/admin') || href === '/leads');
    for (const area of ['empresa', 'aluno', 'mentor'] as const) {
      const hrefs = flatMenu(area).map((item) => item.href);
      for (const href of adminOnly)
        expect(hrefs, `${area} não deve listar ${href}`).not.toContain(href);
    }
    expect(flatMenu('empresa').map((item) => item.href)).not.toContain('/mentor');
    expect(flatMenu('aluno').map((item) => item.href)).not.toContain('/buscas-salvas');
    expect(flatMenu('aluno').map((item) => item.href)).not.toContain('/alertas');
    expect(flatMenu('mentor').map((item) => item.href)).not.toContain('/radar');
  });

  it('não há itens repetidos dentro de um menu', () => {
    for (const area of AREAS) {
      const hrefs = flatMenu(area).map((item) => item.href);
      expect(new Set(hrefs).size, area).toBe(hrefs.length);
    }
  });

  it('todo grupo tem ao menos um item', () => {
    for (const area of AREAS) {
      for (const group of AREA_MENUS[area]) expect(group.items.length).toBeGreaterThan(0);
    }
  });
});

describe('Empresa: agenda e documentos', () => {
  it('estão no menu da Empresa e fechadas para Aluno e Mentor', () => {
    const hrefs = flatMenu('empresa').map((item) => item.href);
    expect(hrefs).toEqual(expect.arrayContaining(['/agenda', '/documentos', '/oportunidades']));
    for (const path of ['/agenda', '/documentos', '/oportunidades/abc']) {
      expect(canOpenPage(['empresa'], path), path).toBe(true);
      expect(canOpenPage(['administracao'], path), path).toBe(true);
      expect(canOpenPage(['aluno'], path), path).toBe(false);
      expect(canOpenPage(['mentor'], path), path).toBe(false);
    }
  });
});

describe('regras de página', () => {
  it('a regra mais específica vence e /mentor não captura /mentorado', () => {
    expect(pageAreas('/academia')).toEqual(AREAS);
    expect(pageAreas('/academia/mentor')).toEqual(['administracao', 'mentor']);
    expect(pageAreas('/academia/trilhas/x/aulas/y')).toEqual(AREAS);
    expect(pageAreas('/mentorado')).toBeNull();
    expect(pageAreas('/mentor')).toEqual(['administracao', 'mentor']);
  });

  it('só a Administração abre /admin e /leads', () => {
    for (const path of ['/admin', '/admin/alunos', '/leads']) {
      expect(canOpenPage(['administracao'], path)).toBe(true);
      for (const area of ['empresa', 'aluno', 'mentor'] as const) {
        expect(canOpenPage([area], path), `${area} ${path}`).toBe(false);
      }
    }
  });

  it('quem tem todas as áreas (equipe) abre qualquer página protegida', () => {
    for (const rule of PAGE_RULES) expect(canOpenPage([...AREAS], rule.prefix)).toBe(true);
  });

  it('empresa e aluno enxergam o Radar; mentor não', () => {
    expect(canOpenPage(['empresa'], '/radar/abc')).toBe(true);
    expect(canOpenPage(['aluno'], '/radar')).toBe(true);
    expect(canOpenPage(['mentor'], '/radar')).toBe(false);
  });

  it('páginas sem regra ficam abertas e o Radar não exige sessão', () => {
    expect(canOpenPage(['aluno'], '/login')).toBe(true);
    expect(requiresSession('/login')).toBe(false);
    expect(requiresSession('/radar')).toBe(false);
    expect(requiresSession('/admin')).toBe(true);
    expect(requiresSession('/conta')).toBe(true);
  });
});

describe('páginas do curso e da mentoria', () => {
  it('só o aluno (e a equipe) abre plano, prática, mentoria e certificado', () => {
    for (const path of [
      '/plano-30-dias',
      '/praticar',
      '/praticar/abc',
      '/mentoria',
      '/certificado',
    ]) {
      expect(canOpenPage(['aluno'], path), path).toBe(true);
      expect(canOpenPage(['administracao'], path), path).toBe(true);
      expect(canOpenPage(['empresa'], path), path).toBe(false);
      expect(canOpenPage(['mentor'], path), path).toBe(false);
    }
  });

  it('devolutivas e sessões são do mentor, não do aluno', () => {
    for (const path of ['/mentor/devolutivas', '/mentor/sessoes', '/mentor/alunos/abc']) {
      expect(canOpenPage(['mentor'], path), path).toBe(true);
      expect(canOpenPage(['aluno'], path), path).toBe(false);
    }
  });

  it('a página pública de cancelar e-mails não pede login nem área', () => {
    expect(requiresSession('/cancelar-alertas')).toBe(false);
    expect(canOpenPage([], '/cancelar-alertas')).toBe(true);
  });
});
