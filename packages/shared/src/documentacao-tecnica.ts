/**
 * Documentação técnica automática de um edital.
 *
 * Monta, sem rede e sem IA, a lista do que o licitante precisa reunir (habilitação, proposta,
 * declarações, garantias, credenciamento) a partir de três fontes, e diz de qual delas veio cada
 * linha:
 *   - `lei`      → regra padrão da Lei 14.133/2021 (e da LC 123/2006) para aquele tipo de objeto;
 *   - `edital`   → o texto do edital/PNCP menciona o requisito (o que está escrito vale mais);
 *   - `dados`    → decorre dos campos do PNCP (modalidade, valor, portal, benefício de ME/EPP).
 *
 * Não substitui a leitura do edital: o que vem de `lei` é o que a norma costuma pedir para esse
 * tipo de compra, e cada edital pode pedir mais ou menos. Por isso o resultado sempre traz o
 * aviso e a indicação de quais linhas foram de fato encontradas no texto do edital.
 */

export type GrupoExigencia =
  | 'participacao'
  | 'habilitacao-juridica'
  | 'regularidade-fiscal'
  | 'qualificacao-economica'
  | 'qualificacao-tecnica'
  | 'proposta'
  | 'declaracoes'
  | 'garantias';

export const GRUPOS_EXIGENCIA: Record<GrupoExigencia, { titulo: string; ordem: number }> = {
  participacao: { titulo: 'Para participar', ordem: 1 },
  'habilitacao-juridica': { titulo: 'Habilitação jurídica', ordem: 2 },
  'regularidade-fiscal': { titulo: 'Regularidade fiscal, social e trabalhista', ordem: 3 },
  'qualificacao-economica': { titulo: 'Qualificação econômico-financeira', ordem: 4 },
  'qualificacao-tecnica': { titulo: 'Qualificação técnica', ordem: 5 },
  declaracoes: { titulo: 'Declarações', ordem: 6 },
  proposta: { titulo: 'Proposta', ordem: 7 },
  garantias: { titulo: 'Garantias e amostras', ordem: 8 },
};

export type OrigemExigencia = 'lei' | 'edital' | 'dados';

export type Exigencia = {
  id: string;
  grupo: GrupoExigencia;
  titulo: string;
  detalhe: string;
  /** Base legal ou do edital, para a pessoa conferir. */
  base: string;
  origem: OrigemExigencia;
  /** `true` quando o texto do edital/PNCP menciona o requisito (não é só o padrão da lei). */
  mencionado: boolean;
};

export type TipoObjeto =
  | 'obra-engenharia'
  | 'saude'
  | 'alimentos'
  | 'tecnologia'
  | 'servico-continuado'
  | 'bens'
  | 'servico-comum';

export const TIPO_OBJETO_NOME: Record<TipoObjeto, string> = {
  'obra-engenharia': 'Obra ou serviço de engenharia',
  saude: 'Saúde (medicamentos, insumos, equipamentos)',
  alimentos: 'Alimentos e merenda',
  tecnologia: 'Tecnologia da informação',
  'servico-continuado': 'Serviço contínuo (mão de obra)',
  bens: 'Compra de bens e materiais',
  'servico-comum': 'Serviço comum',
};

export type PapelDocumento =
  | 'edital'
  | 'termo-referencia'
  | 'estudo-tecnico'
  | 'projeto'
  | 'planilha'
  | 'minuta-contrato'
  | 'ata'
  | 'anexo'
  | 'outro';

export const PAPEL_DOCUMENTO: Record<PapelDocumento, { nome: string; serve: string }> = {
  edital: { nome: 'Edital', serve: 'Regras da disputa, habilitação, prazos e penalidades.' },
  'termo-referencia': {
    nome: 'Termo de referência',
    serve: 'O que será entregue, em que quantidade, prazo e critério de aceite.',
  },
  'estudo-tecnico': {
    nome: 'Estudo técnico',
    serve: 'Por que a compra existe e como o preço foi estimado.',
  },
  projeto: {
    nome: 'Projeto básico',
    serve: 'Projeto, memorial e especificações da obra ou serviço.',
  },
  planilha: {
    nome: 'Planilha de preços',
    serve: 'Modelo da planilha que a proposta precisa preencher.',
  },
  'minuta-contrato': {
    nome: 'Minuta do contrato',
    serve: 'Obrigações, multas, reajuste e garantia do contrato.',
  },
  ata: {
    nome: 'Ata de registro de preços',
    serve: 'Condições da ata: validade, adesão e fornecimento.',
  },
  anexo: { nome: 'Anexo', serve: 'Modelos de declaração e demais anexos do edital.' },
  outro: { nome: 'Outro documento', serve: 'Documento complementar publicado pelo órgão.' },
};

export type DocumentoEntrada = {
  tipo?: string | null;
  nome_arquivo?: string | null;
  url?: string | null;
};

export type ItemEntrada = {
  numero?: string | null;
  descricao?: string | null;
  quantidade?: number | null;
  valor_unitario_estimado?: number | null;
  catmat_catser?: string | null;
  beneficio?: string | null;
};

export type DocTecnicaEntrada = {
  titulo: string;
  /** Texto do edital no PNCP (informação complementar, órgão, unidade…). */
  texto?: string | null;
  modalidade?: string | null;
  modo_disputa?: string | null;
  instrumento?: string | null;
  srp?: boolean | null;
  amparo_legal?: string | null;
  valor_estimado?: number | null;
  esfera?: string | null;
  portal?: string | null;
  portal_site?: string | null;
  itens?: readonly ItemEntrada[];
  documentos?: readonly DocumentoEntrada[];
};

export type DocumentoClassificado = {
  papel: PapelDocumento;
  papel_nome: string;
  serve: string;
  nome: string;
  url: string | null;
};

export type DocumentacaoTecnica = {
  tipo_objeto: TipoObjeto;
  tipo_objeto_nome: string;
  resumo: string;
  grupos: { grupo: GrupoExigencia; titulo: string; exigencias: Exigencia[] }[];
  total_exigencias: number;
  /** Quantas linhas o texto do edital confirmou (as demais são o padrão para o tipo de compra). */
  total_mencionadas: number;
  documentos: DocumentoClassificado[];
  pontos_de_atencao: string[];
  como_foi_montada: string[];
  aviso: string;
};

const LIMITE_ME_EPP = 80_000;

function normalizar(valor: string | null | undefined): string {
  return (valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const PADROES_TIPO: { tipo: TipoObjeto; rx: RegExp }[] = [
  {
    tipo: 'obra-engenharia',
    rx: /\b(obras?|construcao|reforma|pavimenta\w*|engenharia|edificac\w*|drenagem|recapeamento|terraplen\w*|ampliacao de)\b/,
  },
  {
    tipo: 'saude',
    rx: /\b(medicament\w*|farmac\w*|hospitalar\w*|material medico|insumos? (medic|hospital|laborat)\w*|reagentes?|odontolog\w*|ortese|protese)\b/,
  },
  {
    tipo: 'alimentos',
    rx: /\b(generos? alimenticios?|merenda|alimentacao|refeico\w*|alimentos?|hortifrut\w*|carnes?|leite|pao|cesta basica)\b/,
  },
  {
    tipo: 'tecnologia',
    rx: /\b(software|licenca\w*|sistema de informac\w*|tecnologia da informacao|computador\w*|notebook\w*|servidor\w*|rede de dados|hospedagem|nuvem|desenvolvimento de sistema\w*|suporte tecnico)\b/,
  },
  {
    tipo: 'servico-continuado',
    rx: /\b(limpeza|conservacao|vigilancia|portaria|copeiragem|mao-de-trabalho|terceirizac\w*|manutencao|transporte escolar|locacao de veiculos?|jardinagem)\b/,
  },
  {
    tipo: 'bens',
    rx: /\b(aquisicao|fornecimento|compra|material|materiais|equipamentos?|mobiliario|veiculos?|uniformes?|combustiveis?)\b/,
  },
];

/** Tipo do objeto pelo texto do objeto e pelas primeiras descrições dos itens. */
export function classificarObjeto(titulo: string, itens: readonly ItemEntrada[] = []): TipoObjeto {
  // "mão de obra" é do serviço contínuo, não de obra de engenharia.
  const limpo = (texto: string): string =>
    normalizar(texto).replace(/mao de obra/g, 'mao-de-trabalho');
  const base = limpo(titulo);
  const comItens = `${base} ${itens
    .slice(0, 12)
    .map((item) => limpo(item.descricao ?? ''))
    .join(' ')}`;
  for (const texto of [base, comItens]) {
    const achou = PADROES_TIPO.find((padrao) => padrao.rx.test(texto));
    if (achou) return achou.tipo;
  }
  return 'servico-comum';
}

type Detector = {
  id: string;
  rx: RegExp;
  grupo: GrupoExigencia;
  titulo: string;
  detalhe: string;
  base: string;
};

/** O que o texto do edital costuma dizer de forma explícita. */
const DETECTORES: readonly Detector[] = [
  {
    id: 'atestado-capacidade',
    rx: /atestados?( de)? capacidade tecnic\w*|acervo tecnico|\bcat\b|\bart\b|\brrt\b/,
    grupo: 'qualificacao-tecnica',
    titulo: 'Atestado de capacidade técnica',
    detalhe:
      'O edital cita atestado/acervo técnico. Veja no edital qual quantidade mínima e quem pode emitir (público ou privado).',
    base: 'Lei 14.133/2021, art. 67',
  },
  {
    id: 'balanco',
    rx: /balanco patrimonial|demonstracoes? contabeis|indices? (de )?liquidez|patrimonio liquido|capital (social )?minimo/,
    grupo: 'qualificacao-economica',
    titulo: 'Balanço e índices contábeis',
    detalhe:
      'O edital cita balanço/índices/patrimônio mínimo. Confirme os índices exigidos com a sua contabilidade antes de propor.',
    base: 'Lei 14.133/2021, art. 69',
  },
  {
    id: 'visita-tecnica',
    rx: /visita tecnica|vistoria (previa|tecnica)|atestado de visita/,
    grupo: 'qualificacao-tecnica',
    titulo: 'Visita técnica (ou declaração de que conhece o local)',
    detalhe:
      'O edital cita visita/vistoria. Agende com o órgão e veja se a declaração de conhecimento do local substitui a visita.',
    base: 'Lei 14.133/2021, art. 63, §2º',
  },
  {
    id: 'amostra',
    rx: /\bamostras?\b|prova de conceito|demonstracao do (produto|sistema)|degustacao/,
    grupo: 'garantias',
    titulo: 'Amostra ou prova de conceito',
    detalhe:
      'O edital cita amostra/demonstração. Normalmente é pedida só do primeiro colocado, em prazo curto: já deixe uma pronta.',
    base: 'Lei 14.133/2021, art. 41, II',
  },
  {
    id: 'garantia-proposta',
    rx: /garantia de proposta/,
    grupo: 'garantias',
    titulo: 'Garantia de proposta',
    detalhe:
      'O edital cita garantia de proposta (até 1% do valor estimado). Veja a forma aceita e o prazo de devolução.',
    base: 'Lei 14.133/2021, art. 58',
  },
  {
    id: 'garantia-execucao',
    rx: /garantia (de execucao|contratual)|seguro[- ]garantia|fianca bancaria|caucao/,
    grupo: 'garantias',
    titulo: 'Garantia de execução do contrato',
    detalhe:
      'O edital cita garantia contratual (seguro-garantia, fiança ou caução). Peça cotação antes de fechar o preço: ela tem custo.',
    base: 'Lei 14.133/2021, arts. 96 a 102',
  },
  {
    id: 'registro-conselho',
    rx: /\bcrea\b|\bcau\b|\bcrf\b|\bcrm\b|\bcrc\b|conselho (regional|profissional)|registro (no|na) (conselho|entidade)/,
    grupo: 'qualificacao-tecnica',
    titulo: 'Registro no conselho profissional',
    detalhe:
      'O edital cita registro em conselho (CREA, CAU, CRF…). Confira se o registro e o responsável técnico estão em dia.',
    base: 'Lei 14.133/2021, art. 67, V',
  },
  {
    id: 'anvisa',
    rx: /\banvisa\b|autorizacao de funcionamento|\bafe\b|licenca sanitaria|alvara sanitario|vigilancia sanitaria/,
    grupo: 'qualificacao-tecnica',
    titulo: 'Licença/registro sanitário (ANVISA ou vigilância local)',
    detalhe:
      'O edital cita exigência sanitária. Tenha o alvará/AFE e o registro do produto atualizados.',
    base: 'Lei 14.133/2021, art. 67, IV (lei especial)',
  },
  {
    id: 'iso',
    rx: /\biso ?\d{3,5}\b|certificacao (do|de) (fabricante|qualidade)|inmetro/,
    grupo: 'qualificacao-tecnica',
    titulo: 'Certificação (ISO, INMETRO, fabricante)',
    detalhe:
      'O edital cita certificação. Veja se vale a do fabricante ou se precisa ser da própria empresa.',
    base: 'Edital',
  },
  {
    id: 'sicaf',
    rx: /\bsicaf\b/,
    grupo: 'participacao',
    titulo: 'Cadastro no SICAF',
    detalhe:
      'O edital cita o SICAF. Deixe o cadastro atualizado: ele substitui parte dos documentos de habilitação.',
    base: 'Edital',
  },
  {
    id: 'consorcio',
    rx: /consorcio/,
    grupo: 'participacao',
    titulo: 'Regra para consórcio de empresas',
    detalhe: 'O edital fala de consórcio. Veja se é permitido ou vedado antes de montar parceria.',
    base: 'Lei 14.133/2021, art. 15',
  },
  {
    id: 'planilha-custos',
    rx: /planilha de (custos|formacao de precos)|\bbdi\b|convencao coletiva/,
    grupo: 'proposta',
    titulo: 'Planilha de custos e formação de preços',
    detalhe:
      'O edital pede a composição do preço (custos, encargos, BDI ou convenção coletiva). Preencha no modelo do próprio edital.',
    base: 'Edital',
  },
  {
    id: 'marca-modelo',
    rx: /marca e modelo|marca\/modelo|ficha tecnica|catalogo|folheto|prospecto/,
    grupo: 'proposta',
    titulo: 'Marca, modelo e ficha técnica do produto',
    detalhe:
      'O edital pede marca/modelo ou ficha técnica na proposta. Ofereça só o que atende à especificação.',
    base: 'Edital',
  },
  {
    id: 'cnd-certidoes',
    rx: /certidao negativa|\bcnd\b|\bcndt\b|\bfgts\b|crf do fgts/,
    grupo: 'regularidade-fiscal',
    titulo: 'Certidões negativas (fiscais, FGTS e trabalhista)',
    detalhe:
      'O edital cita certidões. Veja a validade de cada uma para não vencer no dia da disputa.',
    base: 'Lei 14.133/2021, art. 68',
  },
];

function mencionou(texto: string, id: string): boolean {
  return DETECTORES.some((detector) => detector.id === id && detector.rx.test(texto));
}

function exigencia(
  id: string,
  grupo: GrupoExigencia,
  titulo: string,
  detalhe: string,
  base: string,
  origem: OrigemExigencia,
  mencionado = false,
): Exigencia {
  return { id, grupo, titulo, detalhe, base, origem, mencionado };
}

const PAPEIS: { papel: PapelDocumento; rx: RegExp }[] = [
  { papel: 'termo-referencia', rx: /termo de referencia|\btr\b/ },
  { papel: 'estudo-tecnico', rx: /estudo tecnico|\betp\b/ },
  { papel: 'projeto', rx: /projeto basico|memorial|projeto executivo/ },
  { papel: 'planilha', rx: /planilha|orcamento|cronograma/ },
  { papel: 'minuta-contrato', rx: /minuta|contrato/ },
  { papel: 'ata', rx: /ata de registro/ },
  { papel: 'edital', rx: /edital|aviso de contratacao|pregao|concorrencia|convocat\w*/ },
  { papel: 'anexo', rx: /anexo|modelo de declaracao|declaracao/ },
];

export function classificarDocumento(doc: DocumentoEntrada): DocumentoClassificado {
  const texto = normalizar(`${doc.tipo ?? ''} ${doc.nome_arquivo ?? ''}`);
  const papel = PAPEIS.find((item) => item.rx.test(texto))?.papel ?? 'outro';
  const info = PAPEL_DOCUMENTO[papel];
  return {
    papel,
    papel_nome: info.nome,
    serve: info.serve,
    nome: (doc.nome_arquivo ?? doc.tipo ?? info.nome).trim() || info.nome,
    url: doc.url ?? null,
  };
}

function exclusivoMeEpp(itens: readonly ItemEntrada[], valor: number | null): boolean {
  if (itens.some((item) => /exclusiv/.test(normalizar(item.beneficio)))) return true;
  return valor !== null && valor > 0 && valor <= LIMITE_ME_EPP;
}

/** Gera a documentação técnica. Função pura: o mesmo edital sempre dá o mesmo resultado. */
export function gerarDocumentacaoTecnica(entrada: DocTecnicaEntrada): DocumentacaoTecnica {
  const itens = entrada.itens ?? [];
  const documentos = (entrada.documentos ?? []).map(classificarDocumento);
  const tipo = classificarObjeto(entrada.titulo, itens);
  const texto = normalizar(
    [
      entrada.titulo,
      entrada.texto,
      entrada.amparo_legal,
      entrada.instrumento,
      ...(entrada.documentos ?? []).map((doc) => `${doc.tipo ?? ''} ${doc.nome_arquivo ?? ''}`),
    ].join('\n'),
  );
  const valor =
    entrada.valor_estimado !== null && entrada.valor_estimado !== undefined
      ? Number(entrada.valor_estimado)
      : null;
  const lista: Exigencia[] = [];
  const vistos = new Set<string>();
  const adicionar = (item: Exigencia): void => {
    if (vistos.has(item.id)) return;
    vistos.add(item.id);
    lista.push(item);
  };

  // --- Para participar -------------------------------------------------------------------
  if (entrada.portal) {
    adicionar(
      exigencia(
        'credenciamento-portal',
        'participacao',
        `Cadastro e credenciamento no portal ${entrada.portal}`,
        `A disputa acontece no portal ${entrada.portal}. Faça o cadastro da empresa e do representante antes da data de abertura${entrada.portal_site ? ` (${entrada.portal_site})` : ''}.`,
        'Dados do PNCP (sistema de origem)',
        'dados',
      ),
    );
  }
  if (exclusivoMeEpp(itens, valor)) {
    adicionar(
      exigencia(
        'exclusivo-me-epp',
        'participacao',
        'Participação exclusiva de ME/EPP',
        'Itens de até R$ 80 mil são reservados a microempresas e empresas de pequeno porte. Grande empresa não pode disputar esses itens.',
        'LC 123/2006, art. 48, I',
        'dados',
      ),
    );
  } else if (itens.some((item) => /cota|reservad/.test(normalizar(item.beneficio)))) {
    adicionar(
      exigencia(
        'cota-me-epp',
        'participacao',
        'Cota reservada para ME/EPP',
        'Parte da quantidade é reservada a microempresas e empresas de pequeno porte; a outra parte é de ampla participação.',
        'LC 123/2006, art. 48, III',
        'dados',
      ),
    );
  }
  if (mencionou(texto, 'sicaf')) {
    adicionar(exigenciaDetectada('sicaf'));
  } else if (
    /federal/.test(normalizar(entrada.esfera)) ||
    /compras\.gov/.test(normalizar(entrada.portal))
  ) {
    adicionar(
      exigencia(
        'sicaf',
        'participacao',
        'Cadastro no SICAF',
        'Compras do Governo Federal costumam exigir o SICAF atualizado. Ele substitui parte dos documentos de habilitação.',
        'Padrão em compras federais (confirme no edital)',
        'dados',
      ),
    );
  }
  if (mencionou(texto, 'consorcio')) adicionar(exigenciaDetectada('consorcio'));

  // --- Habilitação jurídica --------------------------------------------------------------
  adicionar(
    exigencia(
      'ato-constitutivo',
      'habilitacao-juridica',
      'Ato constitutivo da empresa e documento do representante',
      'Contrato social (ou requerimento de empresário/MEI) com as últimas alterações e documento de identidade de quem assina.',
      'Lei 14.133/2021, art. 66',
      'lei',
    ),
  );

  // --- Regularidade fiscal ---------------------------------------------------------------
  adicionar(
    exigencia(
      'cnpj-cadastros',
      'regularidade-fiscal',
      'Inscrição no CNPJ e nos cadastros de contribuintes',
      'Comprovante de inscrição no CNPJ e, quando houver, nos cadastros estadual e municipal.',
      'Lei 14.133/2021, art. 68, I e II',
      'lei',
    ),
  );
  adicionar(
    exigencia(
      'certidoes-fiscais',
      'regularidade-fiscal',
      'Certidões de regularidade fiscal, FGTS e trabalhista',
      'Fazenda federal e seguridade social, FGTS (CRF), Justiça do Trabalho (CNDT) e as Fazendas estadual e municipal da sede da empresa.',
      'Lei 14.133/2021, art. 68, III a V',
      'lei',
      mencionou(texto, 'cnd-certidoes'),
    ),
  );

  // --- Declarações -----------------------------------------------------------------------
  adicionar(
    exigencia(
      'declaracoes-padrao',
      'declaracoes',
      'Declarações do edital (requisitos, menor, reserva de cargos)',
      'Cumprimento dos requisitos de habilitação, proibição de trabalho de menores (art. 7º, XXXIII, da Constituição) e reserva de cargos para pessoa com deficiência. O edital traz os modelos.',
      'Lei 14.133/2021, arts. 63 e 68, VI',
      'lei',
    ),
  );
  if (valor !== null && valor > 0 && valor <= LIMITE_ME_EPP) {
    adicionar(
      exigencia(
        'declaracao-me-epp',
        'declaracoes',
        'Declaração de enquadramento como ME/EPP',
        'Quem usa os benefícios de ME/EPP precisa declarar o enquadramento. Regularidade fiscal tardia pode ser sanada em até 5 dias úteis, prorrogáveis.',
        'LC 123/2006, arts. 43 e 48',
        'dados',
      ),
    );
  }

  // --- Econômico-financeira --------------------------------------------------------------
  const exigeBalanco = mencionou(texto, 'balanco');
  adicionar(
    exigencia(
      'balanco-falencia',
      'qualificacao-economica',
      'Balanço patrimonial e certidão negativa de falência',
      'Balanço e demonstrações dos 2 últimos exercícios e certidão negativa de falência ou recuperação judicial. O órgão pode exigir índices contábeis e patrimônio líquido de até 10% do valor estimado.',
      'Lei 14.133/2021, art. 69',
      exigeBalanco ? 'edital' : 'lei',
      exigeBalanco,
    ),
  );

  // --- Qualificação técnica por tipo de objeto -------------------------------------------
  const tecnica = exigenciasTecnicas(tipo, texto);
  tecnica.forEach(adicionar);
  for (const id of [
    'atestado-capacidade',
    'registro-conselho',
    'anvisa',
    'iso',
    'visita-tecnica',
  ]) {
    if (mencionou(texto, id)) adicionar(exigenciaDetectada(id));
  }

  // --- Proposta ---------------------------------------------------------------------------
  adicionar(
    exigencia(
      'proposta-precos',
      'proposta',
      itens.length
        ? `Proposta com preço unitário e total (${itens.length} ${itens.length === 1 ? 'item' : 'itens'})`
        : 'Proposta com preço unitário e total',
      'Preço de cada item e valor global, prazo de validade da proposta e prazo de entrega. Preço acima do estimado leva à desclassificação.',
      'Lei 14.133/2021, art. 59',
      'lei',
    ),
  );
  const comCatalogo = itens.filter((item) => item.catmat_catser).length;
  if (comCatalogo > 0) {
    adicionar(
      exigencia(
        'catalogo-catmat',
        'proposta',
        'Itens com código CATMAT/CATSER',
        `${comCatalogo} de ${itens.length} itens têm código de catálogo. A descrição da proposta deve bater com a do catálogo.`,
        'Dados do PNCP (itens)',
        'dados',
      ),
    );
  }
  for (const id of ['planilha-custos', 'marca-modelo']) {
    if (mencionou(texto, id)) adicionar(exigenciaDetectada(id));
  }
  if (tipo === 'servico-continuado' || tipo === 'obra-engenharia') {
    adicionar(
      exigencia(
        'composicao-preco',
        'proposta',
        tipo === 'obra-engenharia'
          ? 'Planilha orçamentária, cronograma e BDI'
          : 'Planilha de custos e formação de preços',
        tipo === 'obra-engenharia'
          ? 'A proposta de obra traz planilha de quantitativos, composição de custos, BDI e cronograma físico-financeiro.'
          : 'Serviço com mão de obra exige composição de custos: salários, encargos, insumos e lucro, conforme a convenção coletiva da categoria.',
        'Lei 14.133/2021, art. 59 e edital',
        'lei',
        mencionou(texto, 'planilha-custos'),
      ),
    );
  }

  // --- Garantias e amostras ---------------------------------------------------------------
  for (const id of ['garantia-proposta', 'garantia-execucao', 'amostra']) {
    if (mencionou(texto, id)) adicionar(exigenciaDetectada(id));
  }
  if (tipo === 'obra-engenharia' && !vistos.has('garantia-execucao')) {
    adicionar(
      exigencia(
        'garantia-execucao',
        'garantias',
        'Garantia de execução (comum em obras)',
        'Em obras o órgão costuma pedir garantia de até 5% do contrato (seguro-garantia, fiança ou caução). Considere o custo no preço.',
        'Lei 14.133/2021, arts. 96 a 102',
        'lei',
      ),
    );
  }

  const ordenada = [...lista].sort(
    (a, b) => GRUPOS_EXIGENCIA[a.grupo].ordem - GRUPOS_EXIGENCIA[b.grupo].ordem,
  );
  const grupos = (Object.keys(GRUPOS_EXIGENCIA) as GrupoExigencia[])
    .sort((a, b) => GRUPOS_EXIGENCIA[a].ordem - GRUPOS_EXIGENCIA[b].ordem)
    .map((grupo) => ({
      grupo,
      titulo: GRUPOS_EXIGENCIA[grupo].titulo,
      exigencias: ordenada.filter((item) => item.grupo === grupo),
    }))
    .filter((grupo) => grupo.exigencias.length > 0);

  const mencionadas = ordenada.filter((item) => item.mencionado).length;
  return {
    tipo_objeto: tipo,
    tipo_objeto_nome: TIPO_OBJETO_NOME[tipo],
    resumo: resumoDe(ordenada.length, mencionadas),
    grupos,
    total_exigencias: ordenada.length,
    total_mencionadas: mencionadas,
    documentos,
    pontos_de_atencao: pontosDeAtencao(entrada, itens, valor, documentos, tipo),
    como_foi_montada: [
      'Tipo do objeto: identificado pelas palavras do objeto e das descrições dos itens.',
      'Linhas marcadas “o edital menciona”: o requisito aparece no texto do edital ou nos nomes dos arquivos publicados no PNCP.',
      'Demais linhas: o que a Lei 14.133/2021 e a LC 123/2006 costumam exigir para esse tipo de compra. Cada edital pode pedir mais ou menos.',
      'Itens, benefícios de ME/EPP, valor, modalidade e portal: vêm dos dados oficiais do PNCP.',
    ],
    aviso:
      'Lista de apoio gerada automaticamente. Confirme cada exigência e os prazos no edital e nos anexos oficiais antes de decidir.',
  };
}

function exigenciaDetectada(id: string): Exigencia {
  const detector = DETECTORES.find((item) => item.id === id)!;
  return exigencia(
    detector.id,
    detector.grupo,
    detector.titulo,
    detector.detalhe,
    detector.base,
    'edital',
    true,
  );
}

function exigenciasTecnicas(tipo: TipoObjeto, texto: string): Exigencia[] {
  const sugeridas = (
    id: string,
    titulo: string,
    detalhe: string,
    base: string,
    detectorId?: string,
  ): Exigencia =>
    exigencia(
      id,
      'qualificacao-tecnica',
      titulo,
      detalhe,
      base,
      'lei',
      detectorId ? mencionou(texto, detectorId) : false,
    );

  switch (tipo) {
    case 'obra-engenharia':
      return [
        sugeridas(
          'registro-conselho',
          'Registro da empresa no CREA/CAU',
          'Registro ou inscrição da empresa e do responsável técnico no conselho profissional da área.',
          'Lei 14.133/2021, art. 67, V',
          'registro-conselho',
        ),
        sugeridas(
          'atestado-capacidade',
          'Atestado e acervo técnico (CAT) de obra semelhante',
          'Profissional com ART/RRT e CAT de obra de complexidade equivalente. O órgão pode exigir quantidades mínimas.',
          'Lei 14.133/2021, art. 67, I e II',
          'atestado-capacidade',
        ),
        sugeridas(
          'visita-tecnica',
          'Visita ao local (ou declaração de que conhece o local)',
          'Em obra, o edital quase sempre pede vistoria ou declaração de conhecimento do local.',
          'Lei 14.133/2021, art. 63, §2º',
          'visita-tecnica',
        ),
      ];
    case 'saude':
      return [
        sugeridas(
          'anvisa',
          'Autorização de funcionamento e registro do produto',
          'AFE/licença sanitária da empresa e registro ou notificação do produto na ANVISA, quando a lei exigir.',
          'Lei 14.133/2021, art. 67, IV (lei especial)',
          'anvisa',
        ),
        sugeridas(
          'atestado-capacidade',
          'Atestado de capacidade técnica',
          'Atestado de fornecimento anterior de produtos semelhantes, quando o edital pedir.',
          'Lei 14.133/2021, art. 67',
          'atestado-capacidade',
        ),
      ];
    case 'alimentos':
      return [
        sugeridas(
          'anvisa',
          'Alvará/licença sanitária e registro de origem',
          'Licença sanitária da empresa e, para produtos de origem animal, inspeção (SIF/SIM) conforme o caso.',
          'Lei 14.133/2021, art. 67, IV (lei especial)',
          'anvisa',
        ),
      ];
    case 'tecnologia':
      return [
        sugeridas(
          'atestado-capacidade',
          'Atestado de capacidade técnica',
          'Atestado de entrega ou serviço de TI semelhante, emitido por cliente público ou privado. Pode haver exigência de certificação do fabricante.',
          'Lei 14.133/2021, art. 67',
          'atestado-capacidade',
        ),
      ];
    case 'servico-continuado':
      return [
        sugeridas(
          'atestado-capacidade',
          'Atestado de serviço contínuo semelhante',
          'Atestado de execução anterior com número mínimo de postos ou período mínimo de contrato, quando o edital pedir.',
          'Lei 14.133/2021, art. 67',
          'atestado-capacidade',
        ),
      ];
    default:
      return [];
  }
}

function resumoDe(total: number, mencionadas: number): string {
  const base = `${total} exigências previstas para este tipo de compra`;
  return mencionadas > 0
    ? `${base}, ${mencionadas} confirmada${mencionadas === 1 ? '' : 's'} no texto do edital.`
    : `${base} (padrão da lei; o texto disponível no PNCP não detalha exigências).`;
}

function pontosDeAtencao(
  entrada: DocTecnicaEntrada,
  itens: readonly ItemEntrada[],
  valor: number | null,
  documentos: readonly DocumentoClassificado[],
  tipo: TipoObjeto,
): string[] {
  const pontos: string[] = [];
  if (!documentos.some((doc) => doc.papel === 'edital')) {
    pontos.push(
      entrada.portal
        ? `O edital completo não está entre os arquivos do PNCP. Abra-o no portal ${entrada.portal} (link “Abrir no portal”).`
        : 'O edital completo não está entre os arquivos do PNCP. Abra-o pelo link da fonte.',
    );
  }
  if (entrada.srp) {
    pontos.push(
      'Registro de preços: a ata não obriga o órgão a comprar tudo. Considere o risco de pouca demanda e o prazo de validade da ata.',
    );
  }
  if (/fechado/.test(normalizar(entrada.modo_disputa))) {
    pontos.push(
      'Modo de disputa fechado: o preço é um lance único, sem chance de ajuste durante a disputa.',
    );
  }
  if (valor !== null && valor > 0 && valor <= 50_000) {
    pontos.push(
      'Compra de valor baixo: o edital pode dispensar parte dos documentos de habilitação. Veja o que realmente é exigido.',
    );
  }
  if (itens.length === 0) {
    pontos.push(
      'Itens ainda não buscados no PNCP: use “Buscar itens e documentos no PNCP” para ver quantidades e preços.',
    );
  }
  if (tipo === 'servico-continuado') {
    pontos.push(
      'Serviço contínuo: confira o reajuste, a repactuação e a convenção coletiva da categoria antes de fechar o preço.',
    );
  }
  return pontos;
}
