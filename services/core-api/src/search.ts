import { z } from 'zod';
import {
  nicheSearchExpression,
  ufsDaRegiao,
  GRANDE_VULTO_PADRAO,
  REGIOES,
} from '@licitecomigo/shared';

/** Aceita `a,b` ou `a&b` repetido e entrega sempre uma lista. */
const splitCommas = (value: unknown): unknown =>
  typeof value === 'string' && value.includes(',')
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : value;

const stringOrStrings = z.union([
  z.string().trim().min(1).max(160),
  z.array(z.string().trim().min(1).max(160)).min(1).max(50),
]);
const listish = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(splitCommas, schema);
const ufValue = z.string().trim().length(2).toUpperCase();
const ufOrUfs = z.union([ufValue, z.array(ufValue).min(1).max(27)]);
const booleanish = z.preprocess((value) => {
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return value;
}, z.boolean());
const dateText = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'data inválida');

export const SITUACAO_PRAZO = [
  'abertas',
  'vencendo_hoje',
  'vencendo_3',
  'vencendo_7',
  'encerradas',
] as const;
export const SITUACAO_TIPO = ['suspensa', 'revogada', 'anulada', 'cancelada'] as const;
export const PERIODO_TIPO = ['publicacao', 'abertura', 'encerramento', 'atualizacao'] as const;
export const ESTADO_USUARIO = [
  'favoritas',
  'descartadas',
  'vistas',
  'nao_vistas',
  'pipeline',
] as const;
export const ORDEM = ['recentes', 'encerram', 'valor', 'compat', 'proximas'] as const;

/** Search contract. Legacy aliases remain accepted while new fields are additive. */
export const editalSearchSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  excluir: listish(stringOrStrings).optional(),
  nicho: stringOrStrings.optional(),
  fonte: stringOrStrings.optional(),
  sistema_origem: stringOrStrings.optional(),
  esfera: listish(stringOrStrings).optional(),
  poder: listish(stringOrStrings).optional(),
  municipio_ibge: listish(stringOrStrings).optional(),
  codigo_municipio_ibge: z.string().trim().min(1).max(20).optional(),
  municipio: z.string().trim().min(2).max(120).optional(),
  catmat_catser: z.string().trim().min(1).max(100).optional(),
  uf: listish(ufOrUfs).optional(),
  regiao: listish(z.union([z.enum(REGIOES), z.array(z.enum(REGIOES)).min(1)])).optional(),
  uasg: z.string().trim().min(1).max(30).optional(),
  orgao: z.string().trim().min(2).max(160).optional(),
  modalidade: stringOrStrings.optional(),
  codigo_modalidade: z.coerce.number().int().nonnegative().optional(),
  modalidade_codigo: z.coerce.number().int().nonnegative().optional(),
  modo: stringOrStrings.optional(),
  modo_disputa: stringOrStrings.optional(),
  codigo_modo_disputa: z.coerce.number().int().nonnegative().optional(),
  amparo_legal: stringOrStrings.optional(),
  situacao: stringOrStrings.optional(),
  situacao_prazo: z.enum(SITUACAO_PRAZO).optional(),
  situacao_tipo: listish(
    z.union([z.enum(SITUACAO_TIPO), z.array(z.enum(SITUACAO_TIPO)).min(1)]),
  ).optional(),
  instrumento: stringOrStrings.optional(),
  codigo_instrumento: stringOrStrings.optional(),
  srp: booleanish.optional(),
  prazo_proposta_aberto: booleanish.optional(),
  periodo_tipo: z.enum(PERIODO_TIPO).optional(),
  periodo_de: dateText.optional(),
  periodo_ate: dateText.optional(),
  data_encerramento_proposta_de: z.string().trim().min(1).optional(),
  data_encerramento_proposta_ate: z.string().trim().min(1).optional(),
  data_encerramento_propostas_de: z.string().trim().min(1).optional(),
  data_encerramento_propostas_ate: z.string().trim().min(1).optional(),
  atualizacao_de: z.string().trim().min(1).optional(),
  atualizacao_ate: z.string().trim().min(1).optional(),
  atualizado_desde: z.string().trim().min(1).optional(),
  atualizado_ate: z.string().trim().min(1).optional(),
  alterados_desde: dateText.optional(),
  valor_min: z.coerce.number().nonnegative().optional(),
  valor_max: z.coerce.number().nonnegative().optional(),
  grande_vulto: booleanish.optional(),
  valor_homologado_min: z.coerce.number().nonnegative().optional(),
  valor_homologado_max: z.coerce.number().nonnegative().optional(),
  estado: z.enum(ESTADO_USUARIO).optional(),
  incluir_descartadas: booleanish.optional(),
  perto_municipio: z
    .string()
    .trim()
    .regex(/^\d{7}$/)
    .optional(),
  perto_lat: z.coerce.number().min(-35).max(6).optional(),
  perto_lon: z.coerce.number().min(-75).max(-30).optional(),
  raio_km: z.coerce.number().min(1).max(3000).optional(),
  compat_min: z.coerce.number().min(0).max(100).optional(),
  ordem: z.enum(ORDEM).optional(),
  facetas: booleanish.default(true),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export type EditalSearchFilters = z.infer<typeof editalSearchSchema>;
export type SearchValue = string | number | boolean | string[] | number[];

export type RadarProfile = {
  ufs: string[];
  palavras: string[];
  valorMin: number | null;
  valorMax: number | null;
  modalidades: string[];
};

export type SearchContext = {
  /** Condições extras (com `{0}`, `{1}`… locais) somadas às do filtro, como as do motor de alertas. */
  extra?: { sql: string; params: SearchValue[] }[];
  userId?: string;
  profile?: RadarProfile | null;
  grandeVultoMin?: number;
};

export type FacetKey = 'uf' | 'modalidade' | 'situacao' | 'esfera';
export const FACET_COLUMNS: Record<FacetKey, string> = {
  uf: 'uf',
  modalidade: 'modalidade',
  situacao: 'situacao',
  esfera: 'esfera',
};

export type SearchQuery = {
  text: string;
  values: SearchValue[];
  countText: string;
  countValues: SearchValue[];
  facets: { campo: FacetKey; text: string; values: SearchValue[] }[];
};

/** Fragmento SQL com parâmetros locais `{0}`, `{1}`… numerados na montagem final. */
type Frag = { sql: string; params: SearchValue[]; facet?: FacetKey };

function assemble(frags: readonly Frag[], values: SearchValue[] = []): string[] {
  return frags.map((frag) => {
    const slots = frag.params.map((param) => {
      values.push(param);
      return values.length;
    });
    return frag.sql.replace(/\{(\d+)\}/g, (_match, index: string) => `$${slots[Number(index)]}`);
  });
}

function asList(value: string | string[] | undefined): string[] {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

/** Escapa curingas do LIKE para que o texto digitado valha literalmente. */
function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function orExpression(terms: readonly string[]): string {
  return terms.map((term) => `"${term.replaceAll('"', '')}"`).join(' OR ');
}

const PERIODO_COLUNA: Record<(typeof PERIODO_TIPO)[number], string> = {
  publicacao: 'data_publicacao',
  abertura: 'data_abertura_proposta',
  encerramento: 'COALESCE(data_encerramento_proposta, data_encerramento_propostas)',
  atualizacao: 'COALESCE(data_atualizacao, updated_at)',
};

const SITUACAO_PADRAO: Record<(typeof SITUACAO_TIPO)[number], string> = {
  suspensa: '%suspens%',
  revogada: '%revoga%',
  anulada: '%anula%',
  cancelada: '%cancela%',
};

const SAO_PAULO_FIM_DO_DIA =
  "((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day') AT TIME ZONE 'America/Sao_Paulo')";

function dateUpperBound(column: string, value: string): Frag {
  // Só a data ("2026-10-31") vale o dia inteiro; com hora, vale até aquela hora.
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { sql: `${column} < ({0}::date + 1)::timestamptz`, params: [value] }
    : { sql: `${column} <= {0}::timestamptz`, params: [value] };
}

function distanceExpression(): string {
  // Haversine em km entre o município do edital (m) e o ponto de referência $lat/$lon.
  return `(6371 * 2 * asin(sqrt(
    power(sin(radians(m.latitude - {LAT}) / 2), 2) +
    cos(radians({LAT})) * cos(radians(m.latitude)) * power(sin(radians(m.longitude - {LON}) / 2), 2)
  )))`;
}

type ScoreComponent = {
  chave: string;
  descricao: string;
  maximo: number;
  sql: string;
  params: SearchValue[];
};

function scoreComponents(filters: EditalSearchFilters, ctx: SearchContext): ScoreComponent[] {
  const components: ScoreComponent[] = [];
  const niches = asList(filters.nicho as string | string[] | undefined);
  const nicheExpression = niches.length ? nicheSearchExpression(niches) : '';
  if (nicheExpression) {
    components.push({
      chave: 'segmento',
      descricao: 'O objeto do edital combina com os seus nichos',
      maximo: 35,
      sql: "CASE WHEN search_vector @@ websearch_to_tsquery('portuguese', {0}) THEN 35 ELSE 0 END",
      params: [nicheExpression],
    });
  }
  const profile = ctx.profile;
  if (profile?.ufs.length) {
    components.push({
      chave: 'uf',
      descricao: 'O edital é de uma UF em que você atua',
      maximo: 20,
      sql: 'CASE WHEN uf = ANY({0}::text[]) THEN 20 ELSE 0 END',
      params: [profile.ufs],
    });
  }
  if (profile && (profile.valorMin !== null || profile.valorMax !== null)) {
    components.push({
      chave: 'valor',
      descricao: 'O valor estimado está na sua faixa',
      maximo: 20,
      sql: `CASE WHEN valor_estimado IS NOT NULL
                    AND ({0}::numeric IS NULL OR valor_estimado >= {0}::numeric)
                    AND ({1}::numeric IS NULL OR valor_estimado <= {1}::numeric) THEN 20 ELSE 0 END`,
      params: [profile.valorMin as unknown as string, profile.valorMax as unknown as string],
    });
  }
  if (profile?.palavras.length) {
    components.push({
      chave: 'palavras',
      descricao: 'Contém palavras de interesse da sua empresa',
      maximo: 15,
      sql: "CASE WHEN search_vector @@ websearch_to_tsquery('portuguese', {0}) THEN 15 ELSE 0 END",
      params: [orExpression(profile.palavras)],
    });
  }
  if (profile?.modalidades.length) {
    components.push({
      chave: 'modalidade',
      descricao: 'A modalidade é uma das que você prefere',
      maximo: 10,
      sql: 'CASE WHEN modalidade = ANY({0}::text[]) THEN 10 ELSE 0 END',
      params: [profile.modalidades],
    });
  }
  return components;
}

export function buildEditalSearchQuery(
  filters: EditalSearchFilters,
  ctx: SearchContext = {},
): SearchQuery {
  // Editais da própria conta mais o catálogo compartilhado (coletado pela plataforma).
  const frags: Frag[] = [
    {
      sql: "tenant_id IN (SELECT current_setting('app.tenant_id')::uuid UNION SELECT id FROM plataforma_tenants)",
      params: [],
    },
  ];
  const add = (sql: string, params: SearchValue[], facet?: FacetKey): void => {
    frags.push(facet ? { sql, params, facet } : { sql, params });
  };
  const addText = (column: string, value: string | string[], facet?: FacetKey): void => {
    const items = asList(value);
    if (items.length === 1) add(`${column} = {0}`, [items[0]!], facet);
    else if (items.length > 1) add(`${column} = ANY({0}::text[])`, [items], facet);
  };

  if (filters.q) add("search_vector @@ websearch_to_tsquery('portuguese', {0})", [filters.q]);
  for (const term of asList(filters.excluir as string | string[] | undefined)) {
    add("NOT (search_vector @@ websearch_to_tsquery('portuguese', {0}))", [
      `"${term.replaceAll('"', '')}"`,
    ]);
  }
  if (filters.nicho) {
    const nicheExpression = nicheSearchExpression(asList(filters.nicho as string | string[]));
    if (nicheExpression) {
      add("search_vector @@ websearch_to_tsquery('portuguese', {0})", [nicheExpression]);
    }
  }
  if (filters.fonte) addText('fonte', filters.fonte);
  if (filters.sistema_origem) addText('sistema_origem', filters.sistema_origem);
  if (filters.esfera) addText('esfera', filters.esfera as string | string[], 'esfera');
  if (filters.poder) addText('poder', filters.poder as string | string[]);
  const municipios = asList(
    (filters.municipio_ibge ?? filters.codigo_municipio_ibge) as string | string[] | undefined,
  );
  if (municipios.length) addText('municipio_ibge', municipios);
  if (filters.municipio) add('municipio_nome ILIKE {0}', [likeContains(filters.municipio)]);
  if (filters.catmat_catser) {
    add(
      `(catmat_catser ILIKE {0} OR EXISTS (
         SELECT 1 FROM itens_edital ie
          WHERE ie.edital_id = editais.id AND ie.catmat_catser ILIKE {0}))`,
      [likeContains(filters.catmat_catser)],
    );
  }
  const ufs = asList(filters.uf as string | string[] | undefined);
  if (ufs.length === 1) add('uf = {0}', [ufs[0]!], 'uf');
  else if (ufs.length > 1) add('uf = ANY({0}::text[])', [ufs], 'uf');
  const regioes = asList(filters.regiao as string | string[] | undefined);
  if (regioes.length) add('uf = ANY({0}::text[])', [ufsDaRegiao(regioes)], 'uf');
  if (filters.uasg) add('uasg = {0}', [filters.uasg]);
  if (filters.orgao) {
    const digits = filters.orgao.replace(/\D/g, '');
    if (digits.length === 14 && digits === filters.orgao.replace(/[.\-/\s]/g, '')) {
      add('orgao_cnpj = {0}', [digits]);
    } else {
      add('orgao ILIKE {0}', [likeContains(filters.orgao)]);
    }
  }
  if (filters.modalidade) addText('modalidade', filters.modalidade, 'modalidade');
  if (filters.codigo_modalidade !== undefined || filters.modalidade_codigo !== undefined) {
    add('codigo_modalidade = {0}', [filters.codigo_modalidade ?? filters.modalidade_codigo!]);
  }
  if (filters.modo) addText('modo_disputa', filters.modo);
  if (filters.modo_disputa) addText('modo_disputa', filters.modo_disputa);
  if (filters.codigo_modo_disputa !== undefined) {
    add('codigo_modo_disputa = {0}', [filters.codigo_modo_disputa]);
  }
  if (filters.amparo_legal) addText('amparo_legal', filters.amparo_legal);
  if (filters.situacao) addText('situacao', filters.situacao, 'situacao');
  const tipos = asList(filters.situacao_tipo as string | string[] | undefined);
  if (tipos.length) {
    add(
      `situacao ILIKE ANY({0}::text[])`,
      [tipos.map((tipo) => SITUACAO_PADRAO[tipo as keyof typeof SITUACAO_PADRAO])],
      'situacao',
    );
  }
  if (filters.instrumento) addText('instrumento', filters.instrumento);
  if (filters.codigo_instrumento) addText('codigo_instrumento', filters.codigo_instrumento);
  if (filters.srp !== undefined) add('srp = {0}', [filters.srp]);
  if (filters.prazo_proposta_aberto === true) {
    add('data_encerramento_proposta IS NOT NULL AND data_encerramento_proposta > now()', []);
  } else if (filters.prazo_proposta_aberto === false) {
    add('(data_encerramento_proposta IS NULL OR data_encerramento_proposta <= now())', []);
  }
  switch (filters.situacao_prazo) {
    case 'abertas':
      add('data_encerramento_proposta IS NOT NULL AND data_encerramento_proposta > now()', []);
      break;
    case 'vencendo_hoje':
      add(
        `data_encerramento_proposta > now() AND data_encerramento_proposta <= ${SAO_PAULO_FIM_DO_DIA}`,
        [],
      );
      break;
    case 'vencendo_3':
      add(
        "data_encerramento_proposta > now() AND data_encerramento_proposta <= now() + interval '3 days'",
        [],
      );
      break;
    case 'vencendo_7':
      add(
        "data_encerramento_proposta > now() AND data_encerramento_proposta <= now() + interval '7 days'",
        [],
      );
      break;
    case 'encerradas':
      add('data_encerramento_proposta IS NOT NULL AND data_encerramento_proposta <= now()', []);
      break;
    default:
      break;
  }
  if (filters.periodo_de || filters.periodo_ate) {
    const column = PERIODO_COLUNA[filters.periodo_tipo ?? 'publicacao'];
    if (filters.periodo_de) add(`${column} >= {0}::timestamptz`, [filters.periodo_de]);
    if (filters.periodo_ate) {
      const bound = dateUpperBound(column, filters.periodo_ate);
      add(bound.sql, bound.params);
    }
  }
  const proposalEndFrom =
    filters.data_encerramento_proposta_de ?? filters.data_encerramento_propostas_de;
  const proposalEndTo =
    filters.data_encerramento_proposta_ate ?? filters.data_encerramento_propostas_ate;
  if (proposalEndFrom) {
    add('COALESCE(data_encerramento_proposta, data_encerramento_propostas) >= {0}', [
      proposalEndFrom,
    ]);
  }
  if (proposalEndTo) {
    add('COALESCE(data_encerramento_proposta, data_encerramento_propostas) <= {0}', [
      proposalEndTo,
    ]);
  }
  const updatedFrom = filters.atualizacao_de ?? filters.atualizado_desde;
  const updatedTo = filters.atualizacao_ate ?? filters.atualizado_ate;
  if (updatedFrom) add('COALESCE(data_atualizacao, updated_at) >= {0}', [updatedFrom]);
  if (updatedTo) add('COALESCE(data_atualizacao, updated_at) <= {0}', [updatedTo]);
  if (filters.alterados_desde) {
    add(
      `EXISTS (SELECT 1 FROM edital_eventos ev
                WHERE ev.edital_id = editais.id AND ev.tipo = 'alteracao'
                  AND ev.created_at > {0}::timestamptz)`,
      [filters.alterados_desde],
    );
  }
  if (filters.valor_min !== undefined) add('valor_estimado >= {0}', [filters.valor_min]);
  if (filters.valor_max !== undefined) add('valor_estimado <= {0}', [filters.valor_max]);
  if (filters.grande_vulto !== undefined) {
    const limiar = ctx.grandeVultoMin ?? GRANDE_VULTO_PADRAO;
    add(
      filters.grande_vulto
        ? 'valor_estimado >= {0}'
        : '(valor_estimado IS NULL OR valor_estimado < {0})',
      [limiar],
    );
  }
  if (filters.valor_homologado_min !== undefined)
    add('valor_homologado >= {0}', [filters.valor_homologado_min]);
  if (filters.valor_homologado_max !== undefined)
    add('valor_homologado <= {0}', [filters.valor_homologado_max]);

  // Estado do usuário (favorito, descartado, visto, pipeline)
  if (ctx.userId) {
    const interacao = (extra: string) =>
      `EXISTS (SELECT 1 FROM edital_interacoes ei
                WHERE ei.edital_id = editais.id AND ei.usuario_id = {0} AND ${extra})`;
    switch (filters.estado) {
      case 'favoritas':
        add(interacao('ei.favorito'), [ctx.userId]);
        break;
      case 'descartadas':
        add(interacao('ei.descartado'), [ctx.userId]);
        break;
      case 'vistas':
        add(interacao('ei.visto_em IS NOT NULL'), [ctx.userId]);
        break;
      case 'nao_vistas':
        add(`NOT ${interacao('ei.visto_em IS NOT NULL')}`, [ctx.userId]);
        break;
      case 'pipeline':
        add(
          `EXISTS (SELECT 1 FROM oportunidades_salvas os
                    WHERE os.edital_id = editais.id AND os.usuario_id = {0}
                      AND os.status <> 'arquivada')`,
          [ctx.userId],
        );
        break;
      default:
        if (!filters.incluir_descartadas) add(`NOT ${interacao('ei.descartado')}`, [ctx.userId]);
    }
  }

  for (const extra of ctx.extra ?? []) add(extra.sql, extra.params);

  // Proximidade: ponto de referência = município (IBGE) ou coordenadas informadas.
  const hasReference =
    Boolean(filters.perto_municipio) ||
    (filters.perto_lat !== undefined && filters.perto_lon !== undefined);
  const referenceParams: SearchValue[] = filters.perto_municipio
    ? [filters.perto_municipio]
    : [filters.perto_lat ?? 0, filters.perto_lon ?? 0];
  const referenceSql = (template: string): string =>
    filters.perto_municipio
      ? template
          .replaceAll('{LAT}', '(SELECT latitude FROM municipios_ibge WHERE codigo_ibge = {0})')
          .replaceAll('{LON}', '(SELECT longitude FROM municipios_ibge WHERE codigo_ibge = {0})')
      : template
          .replaceAll('{LAT}', '{0}::double precision')
          .replaceAll('{LON}', '{1}::double precision');
  if (hasReference && filters.raio_km !== undefined) {
    add(`${referenceSql(distanceExpression())} <= {${referenceParams.length}}`, [
      ...referenceParams,
      filters.raio_km,
    ]);
  }

  // Nota de compatibilidade (determinística e explicável)
  const components = scoreComponents(filters, ctx);
  const possible = components.reduce((sum, component) => sum + component.maximo, 0);
  const scoreSql = (): { sql: string; params: SearchValue[] } => {
    const params: SearchValue[] = [];
    const parts = components.map((component) => {
      const offset = params.length;
      params.push(...component.params);
      return `(${component.sql.replace(/\{(\d+)\}/g, (_m, i: string) => `{${Number(i) + offset}}`)})`;
    });
    return { sql: `round(100.0 * (${parts.join(' + ')}) / ${possible})::int`, params };
  };
  if (possible > 0 && filters.compat_min !== undefined) {
    const score = scoreSql();
    add(`${score.sql} >= {${score.params.length}}`, [...score.params, filters.compat_min]);
  }

  const needsMunicipio = hasReference;
  const joins = needsMunicipio
    ? ' LEFT JOIN municipios_ibge m ON m.codigo_ibge = editais.municipio_ibge'
    : '';
  const sqlWhere = (selected: readonly Frag[], values: SearchValue[]): string =>
    assemble(selected, values).join(' AND ');

  const values: SearchValue[] = [];
  const where = sqlWhere(frags, values);
  const whereValues = [...values];

  // Projeção e ordenação (parâmetros extras depois dos filtros)
  const extras: Frag[] = [];
  const projectionExtras: string[] = [];
  if (possible > 0) {
    const score = scoreSql();
    extras.push({ sql: score.sql, params: score.params });
    projectionExtras.push(`__${extras.length - 1}__ AS compat`);
    const detail = components.map((component) => {
      const index = extras.length;
      extras.push({
        sql: `jsonb_build_object('criterio', '${component.chave}', 'descricao', '${component.descricao.replaceAll("'", "''")}', 'pontos', ${component.sql}, 'maximo', ${component.maximo})`,
        params: component.params,
      });
      return `__${index}__`;
    });
    projectionExtras.push(`jsonb_build_array(${detail.join(', ')}) AS compat_detalhe`);
  }
  if (hasReference) {
    extras.push({
      sql: `round((${referenceSql(distanceExpression())})::numeric, 1)`,
      params: referenceParams,
    });
    projectionExtras.push(`__${extras.length - 1}__ AS distancia_km`);
  }
  if (ctx.userId) {
    for (const [coluna, alias] of [
      ['favorito', 'favorito'],
      ['descartado', 'descartado'],
    ] as const) {
      extras.push({
        sql: `COALESCE((SELECT ei.${coluna} FROM edital_interacoes ei WHERE ei.edital_id = editais.id AND ei.usuario_id = {0}), false)`,
        params: [ctx.userId],
      });
      projectionExtras.push(`__${extras.length - 1}__ AS ${alias}`);
    }
    extras.push({
      sql: '(SELECT ei.visto_em IS NOT NULL FROM edital_interacoes ei WHERE ei.edital_id = editais.id AND ei.usuario_id = {0}) IS TRUE',
      params: [ctx.userId],
    });
    projectionExtras.push(`__${extras.length - 1}__ AS visto`);
  }

  const extraSql = assemble(extras, values);
  const resolve = (text: string): string =>
    text.replace(/__(\d+)__/g, (_m, index: string) => extraSql[Number(index)]!);
  const scoreIndex = possible > 0 ? 0 : -1;
  const distanceIndex = hasReference
    ? extras.findIndex((extra) => extra.sql.startsWith('round(('))
    : -1;
  const orderBy = (() => {
    switch (filters.ordem) {
      case 'encerram':
        return 'ORDER BY (data_encerramento_proposta > now()) DESC NULLS LAST, data_encerramento_proposta ASC NULLS LAST, id DESC';
      case 'valor':
        return 'ORDER BY valor_estimado DESC NULLS LAST, id DESC';
      case 'compat':
        return scoreIndex >= 0
          ? `ORDER BY ${extraSql[scoreIndex]} DESC, data_publicacao DESC NULLS LAST, id DESC`
          : 'ORDER BY data_publicacao DESC NULLS LAST, id DESC';
      case 'proximas':
        return distanceIndex >= 0
          ? `ORDER BY ${extraSql[distanceIndex]} ASC NULLS LAST, data_publicacao DESC NULLS LAST, id DESC`
          : 'ORDER BY data_publicacao DESC NULLS LAST, id DESC';
      default:
        return 'ORDER BY data_publicacao DESC NULLS LAST, id DESC';
    }
  })();
  // A ordenação reutiliza expressões já numeradas; elas não repetem parâmetros novos.
  const extraProjection = projectionExtras.length
    ? `,\n           ${resolve(projectionExtras.join(',\n           '))}`
    : '';

  const offset = (filters.page - 1) * filters.page_size;
  const pagination = ` LIMIT ${filters.page_size} OFFSET ${offset}`;
  const projection = `
    SELECT editais.id, fonte, sistema_origem, id_externo, titulo, orgao, orgao_cnpj, uf, uasg,
           municipio_ibge, municipio_nome, esfera, poder, modalidade, codigo_modalidade,
           modo_disputa, situacao, instrumento, srp, catmat_catser, amparo_legal, numero_compra,
           valor_estimado, valor_homologado, data_publicacao,
           data_abertura_proposta, data_encerramento_proposta, data_atualizacao,
           url_origem, hash_conteudo,
           jsonb_build_object('fonte', fonte, 'sistema_origem', sistema_origem,
                              'id_externo', id_externo, 'url_origem', url_origem,
                              'atualizado_em', COALESCE(data_atualizacao, editais.updated_at)) AS proveniencia,
           jsonb_build_object(
             'titulo', titulo IS NOT NULL, 'orgao', orgao IS NOT NULL,
             'modalidade', modalidade IS NOT NULL, 'valor_estimado', valor_estimado IS NOT NULL,
             'data_publicacao', data_publicacao IS NOT NULL,
             'data_encerramento_proposta',
               COALESCE(data_encerramento_proposta, data_encerramento_propostas) IS NOT NULL,
             'estado', estado_completude
           ) AS completude,
           editais.created_at, editais.updated_at${extraProjection}
      FROM editais${joins}
     WHERE ${where}
     ${orderBy}`;

  // Facetas: contagem de cada filtro ignorando a própria seleção daquele filtro.
  const facets = (Object.keys(FACET_COLUMNS) as FacetKey[]).map((campo) => {
    const facetValues: SearchValue[] = [];
    const facetWhere = sqlWhere(
      frags.filter((frag) => frag.facet !== campo),
      facetValues,
    );
    return {
      campo,
      text: `SELECT ${FACET_COLUMNS[campo]}::text AS valor, count(*)::int AS total
               FROM editais${joins}
              WHERE ${facetWhere} AND ${FACET_COLUMNS[campo]} IS NOT NULL
              GROUP BY ${FACET_COLUMNS[campo]}
              ORDER BY total DESC, valor
              LIMIT 40`,
      values: facetValues,
    };
  });

  const hasExtras = values.length > whereValues.length;
  return {
    text: `${projection}${pagination}`,
    values,
    countText: `SELECT count(*)::integer AS total FROM editais${joins} WHERE ${where}`,
    countValues: hasExtras ? whereValues : values,
    facets,
  };
}

/** Mesma busca, sem paginação e com colunas de exportação (limite aplicado fora). */
export function buildEditalExportQuery(
  filters: EditalSearchFilters,
  ctx: SearchContext = {},
  limit = 5000,
): { text: string; values: SearchValue[] } {
  const query = buildEditalSearchQuery({ ...filters, page: 1, page_size: 100 }, ctx);
  return {
    text: query.text.replace(/ LIMIT 100 OFFSET 0$/, ` LIMIT ${Math.min(limit, 5000)}`),
    values: query.values,
  };
}
