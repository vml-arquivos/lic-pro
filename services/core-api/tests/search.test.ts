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
});
