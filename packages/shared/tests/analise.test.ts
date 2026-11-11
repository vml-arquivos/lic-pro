import { describe, expect, it } from 'vitest';
import {
  analisarOportunidade,
  chaveDeOrdem,
  simularProposta,
  type EntradaAnalise,
} from '../src/analise.js';

const agora = new Date('2026-11-10T12:00:00Z');
const base: EntradaAnalise = {
  valor_estimado: 100_000,
  encerra_em: '2026-11-17T12:00:00Z',
  agora,
  uf: 'RN',
  uf_empresa: 'RN',
  modalidade: 'Pregão Eletrônico',
  srp: false,
  itens: 3,
  compat: 80,
  perfil_valor_min: null,
  perfil_valor_max: null,
  historico_orgao: { amostras: 8, economia: 0.1 },
  preco_vs_mediana: { itens: 3, razao: 1.2 },
  margem_pct: 15,
};

describe('analisarOportunidade', () => {
  it('dá nota alta quando tudo favorece e explica cada critério', () => {
    const r = analisarOportunidade(base);
    expect(r.nota).toBeGreaterThanOrEqual(80);
    expect(r.componentes.map((c) => c.chave)).toEqual([
      'aderencia',
      'prazo',
      'valor',
      'facilidade',
      'margem',
    ]);
    for (const c of r.componentes) {
      expect(c.pontos).toBeGreaterThanOrEqual(0);
      expect(c.pontos).toBeLessThanOrEqual(100);
      expect(c.detalhe.length).toBeGreaterThan(5);
    }
    expect(r.confianca).toBe('alta');
  });

  it('calcula o valor provável e o lucro com o desconto do histórico do órgão', () => {
    const r = analisarOportunidade(base);
    expect(r.desconto_base).toBe('historico_do_orgao');
    expect(r.desconto_tipico_pct).toBe(10);
    expect(r.valor_provavel).toBe(90_000);
    expect(r.lucro_estimado).toBe(13_500);
  });

  it('sem histórico suficiente usa a premissa de 10% e diz que é premissa', () => {
    const r = analisarOportunidade({ ...base, historico_orgao: { amostras: 2, economia: 0.5 } });
    expect(r.desconto_base).toBe('premissa');
    expect(r.desconto_tipico_pct).toBe(10);
    expect(r.confianca).not.toBe('alta');
  });

  it('prazo encerrado zera o critério e avisa', () => {
    const r = analisarOportunidade({ ...base, encerra_em: '2026-11-01T00:00:00Z' });
    expect(r.componentes.find((c) => c.chave === 'prazo')!.pontos).toBe(0);
    expect(r.sinais.some((s) => s.tipo === 'atencao' && /encerrado/i.test(s.texto))).toBe(true);
  });

  it('sem valor estimado não inventa lucro', () => {
    const r = analisarOportunidade({ ...base, valor_estimado: null });
    expect(r.lucro_estimado).toBeNull();
    expect(r.valor_provavel).toBeNull();
    expect(r.desconto_tipico_pct).toBeNull();
  });

  it('órgão que fecha muito abaixo do estimado reduz a folga de preço', () => {
    const folgado = analisarOportunidade({
      ...base,
      historico_orgao: { amostras: 9, economia: 0.02 },
    });
    const apertado = analisarOportunidade({
      ...base,
      historico_orgao: { amostras: 9, economia: 0.35 },
    });
    const pontos = (r: ReturnType<typeof analisarOportunidade>) =>
      r.componentes.find((c) => c.chave === 'margem')!.pontos;
    expect(pontos(folgado)).toBeGreaterThan(pontos(apertado));
  });

  it('inexigibilidade é difícil e dispensa é mais fácil que pregão', () => {
    const fac = (modalidade: string) =>
      analisarOportunidade({
        ...base,
        modalidade,
        valor_estimado: 500_000,
        uf_empresa: null,
      }).componentes.find((c) => c.chave === 'facilidade')!.pontos;
    expect(fac('Inexigibilidade')).toBeLessThan(fac('Pregão Eletrônico'));
    expect(fac('Dispensa')).toBeGreaterThan(fac('Pregão Eletrônico'));
  });

  it('a faixa de valor do perfil manda; fora dela a nota cai', () => {
    const dentro = analisarOportunidade({
      ...base,
      perfil_valor_min: 50_000,
      perfil_valor_max: 200_000,
    });
    const fora = analisarOportunidade({
      ...base,
      perfil_valor_min: 500_000,
      perfil_valor_max: 900_000,
    });
    const valor = (r: ReturnType<typeof analisarOportunidade>) =>
      r.componentes.find((c) => c.chave === 'valor')!.pontos;
    expect(valor(dentro)).toBe(100);
    expect(valor(fora)).toBeLessThan(100);
  });

  it('a ordem muda conforme o foco', () => {
    const grande = analisarOportunidade({ ...base, valor_estimado: 400_000, compat: 40 });
    const facil = analisarOportunidade({ ...base, valor_estimado: 60_000, compat: 90 });
    expect(chaveDeOrdem('lucrativas', grande)[0]).toBeGreaterThan(
      chaveDeOrdem('lucrativas', facil)[0],
    );
    expect(chaveDeOrdem('faceis', facil)[0]).toBeGreaterThanOrEqual(
      chaveDeOrdem('faceis', grande)[0],
    );
  });
});

describe('simularProposta', () => {
  const entrada = {
    quantidade: 100,
    custo_unitario: 50,
    frete_total: 500,
    outros_custos_total: 500,
    impostos_pct: 6,
    comissao_pct: 4,
    margem_minima_pct: 10,
    preco_referencia: 100,
    preco_mercado: null,
  };

  it('calcula custo total, ponto de equilíbrio e preço mínimo com margem', () => {
    const r = simularProposta(entrada);
    expect(r.custo_total).toBe(6_000);
    // 6000 / (100 * 0,90) = 66,67
    expect(r.preco_equilibrio).toBeCloseTo(66.67, 2);
    // 6000 / (100 * (1 - 0,10 - 0,10)) = 75
    expect(r.preco_minimo).toBe(75);
    expect(r.desconto_maximo_pct).toBe(25);
  });

  it('os cenários batem com a conta: lucro = receita − encargos − custo', () => {
    const r = simularProposta(entrada);
    const c10 = r.cenarios.find((c) => c.desconto_pct === 10)!;
    expect(c10.preco_unitario).toBe(90);
    expect(c10.receita).toBe(9_000);
    expect(c10.impostos_e_comissao).toBe(900);
    expect(c10.lucro).toBe(2_100);
    expect(c10.margem_pct).toBe(23.3);
    expect(c10.atinge_margem_minima).toBe(true);
    const c30 = r.cenarios.find((c) => c.desconto_pct === 30)!;
    expect(c30.atinge_margem_minima).toBe(false);
  });

  it('avisa quando o preço de referência não cobre a margem mínima', () => {
    const r = simularProposta({ ...entrada, custo_unitario: 95 });
    expect(r.avisos.join(' ')).toMatch(/não cobre/);
    expect(r.desconto_maximo_pct).toBe(0);
  });

  it('avisa quando impostos e comissão consomem tudo', () => {
    const r = simularProposta({ ...entrada, impostos_pct: 60, comissao_pct: 40 });
    expect(r.preco_minimo).toBeNull();
    expect(r.preco_equilibrio).toBeNull();
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('compara o preço mínimo com o de mercado', () => {
    const r = simularProposta({ ...entrada, preco_mercado: 90 });
    expect(r.leitura_mercado?.diferenca_pct).toBeLessThan(0);
    const caro = simularProposta({ ...entrada, preco_mercado: 60 });
    expect(caro.leitura_mercado?.diferenca_pct).toBeGreaterThan(0);
  });

  it('sem preço de referência não gera cenários e pede o dado', () => {
    const r = simularProposta({ ...entrada, preco_referencia: null });
    expect(r.cenarios).toEqual([]);
    expect(r.avisos.join(' ')).toMatch(/preço de referência/);
  });
});
