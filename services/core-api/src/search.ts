import { z } from 'zod';
import { nicheSearchExpression } from '@licitecomigo/shared';

const stringOrStrings = z.union([
  z.string().trim().min(1).max(160),
  z.array(z.string().trim().min(1).max(160)).min(1).max(50),
]);
const booleanish = z.preprocess((value) => {
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return value;
}, z.boolean());

/** Search contract. Legacy aliases remain accepted while new fields are additive. */
export const editalSearchSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  nicho: stringOrStrings.optional(),
  fonte: stringOrStrings.optional(),
  sistema_origem: stringOrStrings.optional(),
  esfera: stringOrStrings.optional(),
  poder: stringOrStrings.optional(),
  municipio_ibge: z.string().trim().min(1).max(20).optional(),
  codigo_municipio_ibge: z.string().trim().min(1).max(20).optional(),
  catmat_catser: z.string().trim().min(1).max(100).optional(),
  uf: z.string().trim().length(2).toUpperCase().optional(),
  uasg: z.string().trim().min(1).max(30).optional(),
  modalidade: stringOrStrings.optional(),
  codigo_modalidade: z.coerce.number().int().nonnegative().optional(),
  modalidade_codigo: z.coerce.number().int().nonnegative().optional(),
  modo: stringOrStrings.optional(),
  modo_disputa: stringOrStrings.optional(),
  codigo_modo_disputa: z.coerce.number().int().nonnegative().optional(),
  situacao: stringOrStrings.optional(),
  instrumento: stringOrStrings.optional(),
  codigo_instrumento: stringOrStrings.optional(),
  srp: booleanish.optional(),
  prazo_proposta_aberto: booleanish.optional(),
  data_encerramento_proposta_de: z.string().trim().min(1).optional(),
  data_encerramento_proposta_ate: z.string().trim().min(1).optional(),
  data_encerramento_propostas_de: z.string().trim().min(1).optional(),
  data_encerramento_propostas_ate: z.string().trim().min(1).optional(),
  atualizacao_de: z.string().trim().min(1).optional(),
  atualizacao_ate: z.string().trim().min(1).optional(),
  atualizado_desde: z.string().trim().min(1).optional(),
  atualizado_ate: z.string().trim().min(1).optional(),
  valor_min: z.coerce.number().nonnegative().optional(),
  valor_max: z.coerce.number().nonnegative().optional(),
  valor_homologado_min: z.coerce.number().nonnegative().optional(),
  valor_homologado_max: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export type EditalSearchFilters = z.infer<typeof editalSearchSchema>;
export type SearchValue = string | number | boolean | string[] | number[];

export type SearchQuery = {
  text: string;
  values: SearchValue[];
  countText: string;
  countValues: SearchValue[];
};

function asList(value: string | string[] | undefined): string[] {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

export function buildEditalSearchQuery(filters: EditalSearchFilters): SearchQuery {
  const conditions = ["tenant_id = current_setting('app.tenant_id')::uuid"];
  const values: SearchValue[] = [];
  const add = (condition: string, value: SearchValue): void => {
    values.push(value);
    conditions.push(condition.replace('$VALUE', `$${values.length}`));
  };
  const addText = (column: string, value: string | string[], operator = '='): void => {
    const items = asList(value);
    if (items.length === 1) add(`${column} ${operator} $VALUE`, items[0]!);
    else if (items.length > 1) add(`${column} = ANY($VALUE::text[])`, items);
  };

  if (filters.q) add("search_vector @@ plainto_tsquery('portuguese', $VALUE)", filters.q);
  if (filters.nicho) {
    const nicheExpression = nicheSearchExpression(asList(filters.nicho));
    if (nicheExpression) {
      add("search_vector @@ websearch_to_tsquery('portuguese', $VALUE)", nicheExpression);
    }
  }
  if (filters.fonte) addText('fonte', filters.fonte);
  if (filters.sistema_origem) addText('sistema_origem', filters.sistema_origem);
  if (filters.esfera) addText('esfera', filters.esfera);
  if (filters.poder) addText('poder', filters.poder);
  if (filters.municipio_ibge ?? filters.codigo_municipio_ibge) {
    add('municipio_ibge = $VALUE', filters.municipio_ibge ?? filters.codigo_municipio_ibge!);
  }
  if (filters.catmat_catser) add('catmat_catser ILIKE $VALUE', `%${filters.catmat_catser}%`);
  if (filters.uf) add('uf = $VALUE', filters.uf);
  if (filters.uasg) add('uasg = $VALUE', filters.uasg);
  if (filters.modalidade) addText('modalidade', filters.modalidade);
  if (filters.codigo_modalidade !== undefined || filters.modalidade_codigo !== undefined) {
    add('codigo_modalidade = $VALUE', filters.codigo_modalidade ?? filters.modalidade_codigo!);
  }
  if (filters.modo) addText('modo_disputa', filters.modo);
  if (filters.modo_disputa) addText('modo_disputa', filters.modo_disputa);
  if (filters.codigo_modo_disputa !== undefined) {
    add('codigo_modo_disputa = $VALUE', filters.codigo_modo_disputa);
  }
  if (filters.situacao) addText('situacao', filters.situacao);
  if (filters.instrumento) addText('instrumento', filters.instrumento);
  if (filters.codigo_instrumento) addText('codigo_instrumento', filters.codigo_instrumento);
  if (filters.srp !== undefined) add('srp = $VALUE', filters.srp);
  if (filters.prazo_proposta_aberto === true) {
    conditions.push(
      'data_encerramento_proposta IS NOT NULL AND data_encerramento_proposta > now()',
    );
  } else if (filters.prazo_proposta_aberto === false) {
    conditions.push('(data_encerramento_proposta IS NULL OR data_encerramento_proposta <= now())');
  }
  const proposalEndFrom =
    filters.data_encerramento_proposta_de ?? filters.data_encerramento_propostas_de;
  const proposalEndTo =
    filters.data_encerramento_proposta_ate ?? filters.data_encerramento_propostas_ate;
  if (proposalEndFrom) {
    add(
      'COALESCE(data_encerramento_proposta, data_encerramento_propostas) >= $VALUE',
      proposalEndFrom,
    );
  }
  if (proposalEndTo) {
    add(
      'COALESCE(data_encerramento_proposta, data_encerramento_propostas) <= $VALUE',
      proposalEndTo,
    );
  }
  const updatedFrom = filters.atualizacao_de ?? filters.atualizado_desde;
  const updatedTo = filters.atualizacao_ate ?? filters.atualizado_ate;
  if (updatedFrom) add('COALESCE(data_atualizacao, updated_at) >= $VALUE', updatedFrom);
  if (updatedTo) add('COALESCE(data_atualizacao, updated_at) <= $VALUE', updatedTo);
  if (filters.valor_min !== undefined) add('valor_estimado >= $VALUE', filters.valor_min);
  if (filters.valor_max !== undefined) add('valor_estimado <= $VALUE', filters.valor_max);
  if (filters.valor_homologado_min !== undefined)
    add('valor_homologado >= $VALUE', filters.valor_homologado_min);
  if (filters.valor_homologado_max !== undefined)
    add('valor_homologado <= $VALUE', filters.valor_homologado_max);

  const offset = (filters.page - 1) * filters.page_size;
  const pagination = ` LIMIT ${filters.page_size} OFFSET ${offset}`;
  const where = conditions.join(' AND ');
  const projection = `
    SELECT id, fonte, sistema_origem, id_externo, titulo, orgao, uf, uasg,
           municipio_ibge, esfera, poder, modalidade, codigo_modalidade,
           modo_disputa, situacao, instrumento, srp, catmat_catser,
           valor_estimado, valor_homologado, data_publicacao,
           data_abertura_proposta, data_encerramento_proposta, data_atualizacao,
           url_origem, hash_conteudo,
           jsonb_build_object('fonte', fonte, 'sistema_origem', sistema_origem,
                              'id_externo', id_externo, 'url_origem', url_origem,
                              'atualizado_em', COALESCE(data_atualizacao, updated_at)) AS proveniencia,
           jsonb_build_object(
             'titulo', titulo IS NOT NULL, 'orgao', orgao IS NOT NULL,
             'modalidade', modalidade IS NOT NULL, 'valor_estimado', valor_estimado IS NOT NULL,
             'data_publicacao', data_publicacao IS NOT NULL,
             'data_encerramento_proposta',
               COALESCE(data_encerramento_proposta, data_encerramento_propostas) IS NOT NULL,
             'estado', estado_completude
           ) AS completude,
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
