import { describe, expect, it } from 'vitest';
import { calcularPiso, planoDeLances, proximoLance, validarPlano } from './robo-lib';

const base = { custo: 800, margemMinima: 10, inicial: 1000, decremento: 50 };

describe('robô de lances', () => {
  it('o piso é o custo mais a margem mínima', () => {
    expect(calcularPiso(800, 10)).toBe(880);
    expect(calcularPiso(800, 0)).toBe(800);
  });

  it('monta a sequência do primeiro lance até o piso, sem passar dele', () => {
    const plano = planoDeLances(base);
    expect(plano.map((lance) => lance.valor)).toEqual([1000, 950, 900]);
    expect(plano[0]).toMatchObject({ ordem: 1, lucro: 200, margem: 25 });
    expect(plano.at(-1)!.valor).toBeGreaterThanOrEqual(880);
  });

  it('plano inválido não gera lances e diz o motivo', () => {
    expect(planoDeLances({ ...base, decremento: 0 })).toEqual([]);
    expect(validarPlano({ ...base, custo: 0, inicial: 0 }).map((erro) => erro.campo)).toEqual([
      'custo',
      'inicial',
    ]);
  });

  it('primeiro lance abaixo do piso: nenhum lance', () => {
    expect(planoDeLances({ ...base, inicial: 850 })).toEqual([]);
  });

  it('próximo lance cobre o mercado; perto do piso vai ao piso; abaixo disso, para', () => {
    expect(proximoLance(1000, base)).toMatchObject({ tipo: 'dar', valor: 950 });
    expect(proximoLance(900, base)).toMatchObject({ tipo: 'no_piso', valor: 880, margem: 10 });
    expect(proximoLance(880, base)).toEqual({ tipo: 'parar', piso: 880 });
    expect(proximoLance(700, base)).toEqual({ tipo: 'parar', piso: 880 });
  });

  it('respeita o limite de lances', () => {
    expect(
      planoDeLances({ custo: 1, margemMinima: 0, inicial: 100, decremento: 0.01 }, 5),
    ).toHaveLength(5);
  });
});
