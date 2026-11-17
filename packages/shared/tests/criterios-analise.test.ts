import { describe, expect, it } from 'vitest';
import {
  CRITERIOS_ANALISE,
  CRITERIOS_COMPATIBILIDADE,
  CRITERIOS_FOCOS,
  FOCOS_ANALISE,
  PESOS,
  analisarOportunidade,
  type EntradaAnalise,
} from '../src/index.js';

const base: EntradaAnalise = {
  valor_estimado: 100_000,
  encerra_em: null,
  agora: new Date('2026-11-17T12:00:00Z'),
  uf: 'DF',
  uf_empresa: 'DF',
  modalidade: 'Pregão - Eletrônico',
  srp: null,
  itens: 3,
  compat: 80,
  perfil_valor_min: null,
  perfil_valor_max: null,
  historico_orgao: null,
  preco_vs_mediana: null,
  margem_pct: 15,
};

describe('critérios das análises', () => {
  it('cobrem os mesmos critérios e pesos que o cálculo usa', () => {
    expect(CRITERIOS_ANALISE.map((c) => c.chave).sort()).toEqual(Object.keys(PESOS).sort());
    for (const criterio of CRITERIOS_ANALISE) {
      expect(criterio.peso_pct).toBe(Math.round(PESOS[criterio.chave] * 100));
    }
    expect(CRITERIOS_ANALISE.reduce((s, c) => s + c.peso_pct, 0)).toBe(100);
    expect(
      analisarOportunidade(base)
        .componentes.map((c) => c.chave)
        .sort(),
    ).toEqual(CRITERIOS_ANALISE.map((c) => c.chave).sort());
  });

  it('descrevem todos os focos de ordenação', () => {
    expect(CRITERIOS_FOCOS.map((f) => f.foco).sort()).toEqual([...FOCOS_ANALISE].sort());
    expect(CRITERIOS_FOCOS.find((f) => f.foco === 'interessantes')!.usa).toHaveLength(5);
  });

  it('as regras escritas batem com o cálculo (prazo e facilidade)', () => {
    const pontos = (extra: Partial<EntradaAnalise>, chave: string) =>
      analisarOportunidade({ ...base, ...extra }).componentes.find((c) => c.chave === chave)!
        .pontos;
    const dia = 86_400_000;
    const em = (dias: number) => new Date(base.agora.getTime() + dias * dia).toISOString();
    expect(pontos({ encerra_em: em(5) }, 'prazo')).toBe(100);
    expect(pontos({ encerra_em: em(20) }, 'prazo')).toBe(80);
    expect(pontos({ encerra_em: em(45) }, 'prazo')).toBe(60);
    expect(pontos({ encerra_em: em(0.5) }, 'prazo')).toBe(25);
    expect(pontos({ encerra_em: null }, 'prazo')).toBe(40);
    expect(
      pontos(
        { modalidade: 'Dispensa', valor_estimado: 500_000, uf: 'SP', itens: 10 },
        'facilidade',
      ),
    ).toBe(75);
    expect(pontos({ modalidade: 'Inexigibilidade' }, 'facilidade')).toBe(10);
    expect(pontos({ valor_estimado: null }, 'valor')).toBe(30);
  });

  it('a compatibilidade soma os pontos máximos do Radar', () => {
    expect(CRITERIOS_COMPATIBILIDADE.map((c) => c.pontos)).toEqual([35, 20, 20, 15, 15, 10]);
  });
});
