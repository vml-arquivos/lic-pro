import { describe, expect, it } from 'vitest';
import { buildPlan, planDate, studyDays } from '../src/plan-generator.js';
import { missingAnswers } from '../src/practice.js';

const lessons = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    titulo: `Aula ${i + 1}`,
    modulo: `Módulo ${Math.floor(i / 3) + 1}`,
  }));

describe('plano de 30 dias', () => {
  it('sempre tem 30 dias, com prática nos dias 7, 14, 21 e 28 e revisão no fim', () => {
    const plan = buildPlan(lessons(10));
    expect(plan).toHaveLength(30);
    expect(plan.filter((d) => d.tipo === 'pratica').map((d) => d.dia)).toEqual([7, 14, 21, 28]);
    expect(plan[28]!.tipo).toBe('revisao');
    expect(plan[29]!.tipo).toBe('revisao');
    expect(studyDays()).toHaveLength(24);
  });

  it('usa todas as aulas, em ordem, sem repetir', () => {
    for (const total of [1, 5, 24, 40]) {
      const plan = buildPlan(lessons(total));
      const text = plan
        .filter((d) => d.tipo === 'aula')
        .map((d) => d.atividade)
        .join(' · ');
      for (let i = 1; i <= total; i += 1) expect(text).toContain(`Aula ${i}`);
      expect(text.split(' · ')).toHaveLength(total);
      const order = text.split(' · ').map((t) => Number(t.replace('Aula ', '')));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });

  it('sem aulas publicadas, os dias de estudo ficam livres', () => {
    const plan = buildPlan([]);
    expect(plan.filter((d) => d.tipo === 'livre')).toHaveLength(24);
  });

  it('calcula a data de cada dia a partir do início', () => {
    expect(planDate('2026-10-26', 1)).toBe('2026-10-26');
    expect(planDate('2026-10-26', 7)).toBe('2026-11-01');
  });
});

describe('prática com edital', () => {
  it('exige respostas com conteúdo antes de enviar', () => {
    expect(missingAnswers({})).toHaveLength(5);
    expect(
      missingAnswers({
        objeto: 'Compra de material de escritório',
        prazo: 'Proposta até dia 10',
        exigencias: 'Certidões e atestado',
        risco: 'Prazo de entrega curto',
        decisao: 'Sim, porque sei fornecer',
      }),
    ).toEqual([]);
    expect(missingAnswers({ objeto: 'curto' })).toContain('objeto');
  });
});
