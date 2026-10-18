import { describe, expect, it } from 'vitest';
import { buildEditalSearchQuery, editalSearchSchema } from '../src/search.js';

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

    expect(query.text).toContain("tenant_id = current_setting('app.tenant_id')::uuid");
    expect(query.text).toContain("plainto_tsquery('portuguese'");
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
});
