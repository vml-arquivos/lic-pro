import { describe, expect, it } from 'vitest';
import { CHECKLIST_MODELS, modelByCode, suggestModel } from '../src/checklist-models.js';
import { nextSteps, type StepInput } from '../src/next-steps.js';

const base: StepInput = {
  tem_empresa: true,
  buscas_ativas: 1,
  documentos_total: 3,
  documentos_vencidos: 0,
  documentos_vencendo: 0,
  documento_proximo: null,
  salvas_paradas: 0,
  habilitacao_sem_checklist: 0,
  prazos_ate_3_dias: 0,
  tarefas_atrasadas: 0,
  pipeline_total: 2,
};

describe('próximos passos da empresa', () => {
  it('sem pendência, não sugere nada além do que falta de verdade', () => {
    expect(nextSteps(base)).toEqual([]);
  });

  it('conta nova começa pelos dados da empresa', () => {
    const steps = nextSteps({ ...base, tem_empresa: false, buscas_ativas: 0, pipeline_total: 0 });
    expect(steps[0]?.codigo).toBe('empresa');
  });

  it('documento vencido e prazo curto vêm antes de sugestões de rotina', () => {
    const steps = nextSteps({
      ...base,
      documentos_vencidos: 1,
      prazos_ate_3_dias: 2,
      salvas_paradas: 4,
      buscas_ativas: 0,
    });
    const codes = steps.map((s) => s.codigo);
    expect(codes.indexOf('docs_vencidos')).toBeLessThan(codes.indexOf('salvas'));
    expect(codes.indexOf('prazos')).toBeLessThan(codes.indexOf('salvas'));
    expect(codes).toContain('busca');
  });

  it('documento a vencer cita o nome e os dias', () => {
    const steps = nextSteps({
      ...base,
      documentos_vencendo: 1,
      documento_proximo: { nome: 'Certidão FGTS', dias: 6 },
    });
    expect(steps.find((s) => s.codigo === 'docs_vencendo')?.texto).toContain(
      'Certidão FGTS vence em 6 dia(s)',
    );
  });
});

describe('modelos de checklist', () => {
  it('tem modelos com itens e escolhe pela modalidade', () => {
    expect(CHECKLIST_MODELS.length).toBeGreaterThanOrEqual(3);
    for (const model of CHECKLIST_MODELS) expect(model.itens.length).toBeGreaterThan(3);
    expect(modelByCode('generico')).toBeDefined();
    expect(modelByCode('nao-existe')).toBeUndefined();
    expect(suggestModel('Pregão - Eletrônico')).toBe('pregao');
    expect(suggestModel(null)).toBe('generico');
  });
});
