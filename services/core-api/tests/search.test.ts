import { describe, expect, it } from 'vitest';
import {
  buildEditalExportQuery,
  buildEditalSearchQuery,
  editalSearchSchema,
} from '../src/search.js';

describe('edital search query', () => {
  it('keeps filters parameterized and tenant-scoped', () => {
    const filters = editalSearchSchema.parse({
      q: 'material de escritório',
      uf: 'df',
      valor_min: '100',
      page: '2',
      page_size: '10',
    });
    const query = buildEditalSearchQuery(filters);

    expect(query.text).toContain(
      "tenant_id IN (SELECT current_setting('app.tenant_id')::uuid UNION SELECT id FROM plataforma_tenants)",
    );
    expect(query.text).toContain("websearch_to_tsquery('portuguese'");
    expect(query.text).toContain('LIMIT 10 OFFSET 10');
    expect(query.text).not.toContain('material de escritório');
    expect(query.values).toEqual(['material de escritório', 'DF', 100]);
    expect(query.countValues).toBe(query.values);
  });

  it('supports official-source filters without interpolating user values', () => {
    const filters = editalSearchSchema.parse({
      sistema_origem: ['Compras.gov.br', 'PNCP'],
      municipio_ibge: '5300108',
      codigo_modalidade: '6',
      situacao: 'Divulgada',
      prazo_proposta_aberto: 'true',
      data_encerramento_proposta_ate: '2026-12-31T23:59:59Z',
    });
    const query = buildEditalSearchQuery(filters);

    expect(query.text).toContain('sistema_origem = ANY($1::text[])');
    expect(query.text).toContain('municipio_ibge = $2');
    expect(query.text).toContain('codigo_modalidade = $3');
    expect(query.text).toContain('data_encerramento_proposta IS NOT NULL');
    expect(query.text).not.toContain('5300108');
    expect(query.values).toEqual([
      ['Compras.gov.br', 'PNCP'],
      '5300108',
      6,
      'Divulgada',
      '2026-12-31T23:59:59Z',
    ]);
  });

  it('scopes the search by the shared niche vocabulary', () => {
    const filters = editalSearchSchema.parse({
      nicho: ['tecnologia-comunicacao', 'saude-assistencia'],
    });
    const query = buildEditalSearchQuery(filters);

    expect(query.text).toContain("websearch_to_tsquery('portuguese'");
    expect(query.text).not.toContain('tecnologia da informação');
    expect(query.values[0]).toContain('software');
    expect(query.values[0]).toContain('saúde');
  });

  it('accepts lists, regions, exclusions and state-of-the-user filters', () => {
    const filters = editalSearchSchema.parse({
      uf: 'df,go',
      regiao: 'centro-oeste',
      excluir: 'locação, obra',
      situacao_prazo: 'vencendo_7',
      estado: 'favoritas',
      ordem: 'encerram',
    });
    const query = buildEditalSearchQuery(filters, { userId: 'u-1' });

    expect(query.text).toContain('uf = ANY($3::text[])');
    expect(query.values.slice(0, 2)).toEqual(['"locação"', '"obra"']);
    expect(query.values[2]).toEqual(['DF', 'GO']);
    expect(query.text).toContain("interval '7 days'");
    expect(query.text).toContain('edital_interacoes');
    expect(query.text).toContain('ORDER BY (data_encerramento_proposta > now()) DESC');
    expect(query.values).toContain('u-1');
    expect(JSON.stringify(query.values)).not.toContain('favoritas');
  });

  it('hides discarded editais unless asked, only for a signed-in user', () => {
    const base = editalSearchSchema.parse({});
    expect(buildEditalSearchQuery(base, { userId: 'u-1' }).text).toContain('NOT EXISTS');
    expect(buildEditalSearchQuery(base).text).not.toContain('edital_interacoes ei WHERE');
    const incluir = editalSearchSchema.parse({ incluir_descartadas: 'true' });
    const withDiscarded = buildEditalSearchQuery(incluir, { userId: 'u-1' }).text;
    expect(withDiscarded).not.toContain('NOT EXISTS (SELECT 1 FROM edital_interacoes');
  });

  it('computes facets that ignore their own filter', () => {
    const filters = editalSearchSchema.parse({ uf: 'DF', modalidade: 'Pregão' });
    const query = buildEditalSearchQuery(filters);
    const ufFacet = query.facets.find((facet) => facet.campo === 'uf')!;
    const modalidadeFacet = query.facets.find((facet) => facet.campo === 'modalidade')!;
    expect(ufFacet.text).not.toContain('uf = $');
    expect(ufFacet.values).toEqual(['Pregão']);
    expect(modalidadeFacet.values).toEqual(['DF']);
    expect(query.facets.map((facet) => facet.campo)).toEqual([
      'uf',
      'modalidade',
      'situacao',
      'esfera',
    ]);
  });

  it('builds an explainable compatibility score from the profile', () => {
    const filters = editalSearchSchema.parse({ nicho: 'tecnologia-comunicacao', ordem: 'compat' });
    const query = buildEditalSearchQuery(filters, {
      userId: 'u-1',
      profile: {
        ufs: ['DF'],
        palavras: ['software'],
        valorMin: 1000,
        valorMax: null,
        modalidades: ['Pregão'],
      },
    });
    expect(query.text).toContain('AS compat');
    expect(query.text).toContain('compat_detalhe');
    for (const criterio of ['segmento', 'uf', 'valor', 'palavras', 'modalidade']) {
      expect(query.text).toContain(`'criterio', '${criterio}'`);
    }
    expect(query.countValues.length).toBeLessThan(query.values.length);
    expect(query.countText).not.toContain('compat');
  });

  it('measures proximity from a municipality or from coordinates', () => {
    const byCity = buildEditalSearchQuery(
      editalSearchSchema.parse({ perto_municipio: '5300108', raio_km: '200', ordem: 'proximas' }),
    );
    expect(byCity.text).toContain('LEFT JOIN municipios_ibge');
    expect(byCity.text).toContain('AS distancia_km');
    expect(byCity.values).toContain('5300108');
    const byPoint = buildEditalSearchQuery(
      editalSearchSchema.parse({ perto_lat: '-15.79', perto_lon: '-47.88', raio_km: '50' }),
    );
    expect(byPoint.values).toContain(-15.79);
    expect(byPoint.values).toContain(50);
  });

  it('applies the large-contract threshold from the context', () => {
    const filters = editalSearchSchema.parse({ grande_vulto: 'true' });
    expect(buildEditalSearchQuery(filters).values).toEqual([200_000_000]);
    expect(buildEditalSearchQuery(filters, { grandeVultoMin: 50 }).values).toEqual([50]);
  });

  it('exports with a hard cap and no pagination parameters', () => {
    const query = buildEditalExportQuery(editalSearchSchema.parse({ uf: 'DF' }), {}, 999_999);
    expect(query.text).toMatch(/LIMIT 5000$/);
    expect(query.values).toEqual(['DF']);
  });

  it('rejects malformed dates and out-of-range values', () => {
    expect(() => editalSearchSchema.parse({ periodo_de: 'ontem' })).toThrow();
    expect(() => editalSearchSchema.parse({ raio_km: '99999' })).toThrow();
    expect(() => editalSearchSchema.parse({ regiao: 'atlantida' })).toThrow();
  });
});
