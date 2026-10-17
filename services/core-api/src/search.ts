import { z } from 'zod';

export const editalSearchSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  catmat_catser: z.string().trim().min(1).max(100).optional(),
  uf: z.string().trim().length(2).toUpperCase().optional(),
  uasg: z.string().trim().min(1).max(30).optional(),
  modalidade: z.string().trim().min(1).max(100).optional(),
  valor_min: z.coerce.number().nonnegative().optional(),
  valor_max: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export type EditalSearchFilters = z.infer<typeof editalSearchSchema>;

export type SearchQuery = {
  text: string;
  values: Array<string | number>;
  countText: string;
  countValues: Array<string | number>;
};

export function buildEditalSearchQuery(filters: EditalSearchFilters): SearchQuery {
  const conditions = ["tenant_id = current_setting('app.tenant_id')::uuid"];
  const values: Array<string | number> = [];
  const add = (condition: string, value: string | number): void => {
    values.push(value);
    conditions.push(condition.replace('$VALUE', `$${values.length}`));
  };

  if (filters.q) add("search_vector @@ plainto_tsquery('portuguese', $VALUE)", filters.q);
  if (filters.catmat_catser) add('catmat_catser ILIKE $VALUE', `%${filters.catmat_catser}%`);
  if (filters.uf) add('uf = $VALUE', filters.uf);
  if (filters.uasg) add('uasg = $VALUE', filters.uasg);
  if (filters.modalidade) add('modalidade = $VALUE', filters.modalidade);
  if (filters.valor_min !== undefined) add('valor_estimado >= $VALUE', filters.valor_min);
  if (filters.valor_max !== undefined) add('valor_estimado <= $VALUE', filters.valor_max);

  const offset = (filters.page - 1) * filters.page_size;
  const pagination = ` LIMIT ${filters.page_size} OFFSET ${offset}`;
  const where = conditions.join(' AND ');
  const projection = `
    SELECT id, fonte, id_externo, titulo, orgao, uf, uasg, modalidade,
           catmat_catser, valor_estimado, data_publicacao, url_origem, hash_conteudo,
           created_at, updated_at
      FROM editais
     WHERE ${where}
     ORDER BY data_publicacao DESC NULLS LAST, id DESC`;
  return {
    text: `${projection}${pagination}`,
    values,
    countText: `SELECT count(*)::integer AS total FROM editais WHERE ${where}`,
    countValues: values,
  };
}
