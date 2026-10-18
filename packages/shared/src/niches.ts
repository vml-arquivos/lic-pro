export type NicheDefinition = {
  code: string;
  label: string;
  description: string;
  source: 'CNAE/CONCLA' | 'vocabulário de compras públicas';
  terms: readonly string[];
};

/**
 * Navigation vocabulary only. It helps a user scope local search; it is not
 * an official eligibility, CNAE, CATMAT or CATSER decision.
 */
export const NICHE_CATALOG: readonly NicheDefinition[] = [
  {
    code: 'agropecuaria-alimentos',
    label: 'Agropecuária e alimentos',
    description: 'Produção rural, gêneros alimentícios e alimentação escolar.',
    source: 'CNAE/CONCLA',
    terms: ['agricultura', 'agropecuária', 'alimento', 'gêneros alimentícios', 'merenda'],
  },
  {
    code: 'mineracao-recursos-naturais',
    label: 'Mineração e recursos naturais',
    description: 'Extração mineral, insumos naturais e atividades relacionadas.',
    source: 'CNAE/CONCLA',
    terms: ['mineração', 'extração mineral', 'pedra', 'areia', 'brita'],
  },
  {
    code: 'industria-manufatura',
    label: 'Indústria e manufatura',
    description: 'Bens industriais, componentes e processos de fabricação.',
    source: 'CNAE/CONCLA',
    terms: ['indústria', 'industrial', 'fabricação', 'manufatura', 'produção'],
  },
  {
    code: 'energia-utilidades',
    label: 'Energia e utilidades',
    description: 'Energia, iluminação, gás e serviços de utilidade pública.',
    source: 'CNAE/CONCLA',
    terms: ['energia', 'elétrica', 'iluminação pública', 'gás', 'gerador'],
  },
  {
    code: 'agua-saneamento-residuos',
    label: 'Água, saneamento e resíduos',
    description: 'Abastecimento, saneamento, coleta e destinação de resíduos.',
    source: 'CNAE/CONCLA',
    terms: ['água', 'saneamento', 'esgoto', 'resíduos', 'coleta de lixo'],
  },
  {
    code: 'construcao-obras',
    label: 'Construção e obras',
    description: 'Obras, reformas, infraestrutura e materiais de construção.',
    source: 'CNAE/CONCLA',
    terms: ['construção', 'obra', 'reforma', 'engenharia', 'infraestrutura'],
  },
  {
    code: 'comercio-bens',
    label: 'Comércio e fornecimento de bens',
    description: 'Fornecimento, distribuição e comércio de materiais e equipamentos.',
    source: 'CNAE/CONCLA',
    terms: ['fornecimento', 'aquisição', 'comércio', 'distribuição', 'material'],
  },
  {
    code: 'transporte-logistica',
    label: 'Transporte e logística',
    description: 'Transporte de pessoas ou cargas, entregas e logística.',
    source: 'CNAE/CONCLA',
    terms: ['transporte', 'logística', 'frete', 'locação de veículos', 'entrega'],
  },
  {
    code: 'hospedagem-alimentacao',
    label: 'Hospedagem e alimentação',
    description: 'Hospedagem, refeições preparadas e serviços de alimentação.',
    source: 'CNAE/CONCLA',
    terms: ['hospedagem', 'hotel', 'refeição', 'alimentação', 'restaurante'],
  },
  {
    code: 'tecnologia-comunicacao',
    label: 'Tecnologia e comunicação',
    description: 'Software, hardware, suporte, conectividade e comunicação.',
    source: 'CNAE/CONCLA',
    terms: ['tecnologia da informação', 'software', 'hardware', 'informática', 'comunicação'],
  },
  {
    code: 'financas-seguros',
    label: 'Finanças e seguros',
    description: 'Serviços financeiros, seguros e apoio administrativo especializado.',
    source: 'CNAE/CONCLA',
    terms: ['serviços financeiros', 'seguro', 'bancário', 'cobrança', 'contabilidade'],
  },
  {
    code: 'imobiliario',
    label: 'Atividades imobiliárias',
    description: 'Locação, administração e serviços de imóveis.',
    source: 'CNAE/CONCLA',
    terms: ['imobiliário', 'imóvel', 'locação de imóvel', 'administração predial'],
  },
  {
    code: 'servicos-profissionais',
    label: 'Serviços profissionais e técnicos',
    description: 'Consultoria, projetos, engenharia, contabilidade e serviços técnicos.',
    source: 'CNAE/CONCLA',
    terms: ['consultoria', 'serviços técnicos', 'projeto', 'assessoria', 'especializado'],
  },
  {
    code: 'servicos-administrativos',
    label: 'Serviços administrativos e apoio',
    description: 'Terceirização, apoio operacional e serviços administrativos.',
    source: 'CNAE/CONCLA',
    terms: ['serviços administrativos', 'apoio operacional', 'terceirização', 'recepção'],
  },
  {
    code: 'educacao-treinamento',
    label: 'Educação e treinamento',
    description: 'Ensino, capacitação, formação e materiais educacionais.',
    source: 'CNAE/CONCLA',
    terms: ['educação', 'ensino', 'capacitação', 'treinamento', 'material didático'],
  },
  {
    code: 'saude-assistencia',
    label: 'Saúde e assistência social',
    description: 'Atendimento, medicamentos, equipamentos e serviços de saúde.',
    source: 'CNAE/CONCLA',
    terms: ['saúde', 'hospitalar', 'medicamento', 'assistência social', 'equipamento médico'],
  },
  {
    code: 'cultura-esporte-eventos',
    label: 'Cultura, esporte e eventos',
    description: 'Atividades culturais, esportivas, recreativas e eventos.',
    source: 'CNAE/CONCLA',
    terms: ['cultura', 'esporte', 'evento', 'recreação', 'produção cultural'],
  },
  {
    code: 'limpeza-conservacao',
    label: 'Limpeza e conservação',
    description: 'Limpeza predial, conservação e serviços continuados.',
    source: 'vocabulário de compras públicas',
    terms: ['limpeza e conservação', 'limpeza predial', 'conservação', 'higienização'],
  },
  {
    code: 'seguranca-vigilancia',
    label: 'Segurança e vigilância',
    description: 'Vigilância patrimonial, segurança e monitoramento.',
    source: 'vocabulário de compras públicas',
    terms: ['vigilância', 'segurança patrimonial', 'monitoramento', 'portaria'],
  },
  {
    code: 'manutencao-predial',
    label: 'Manutenção predial',
    description: 'Manutenção elétrica, hidráulica, climatização e predial.',
    source: 'vocabulário de compras públicas',
    terms: [
      'manutenção predial',
      'manutenção elétrica',
      'manutenção hidráulica',
      'ar condicionado',
    ],
  },
  {
    code: 'medicamentos-equipamentos-saude',
    label: 'Medicamentos e equipamentos de saúde',
    description: 'Itens hospitalares, medicamentos e equipamentos assistenciais.',
    source: 'vocabulário de compras públicas',
    terms: ['medicamentos', 'material hospitalar', 'equipamentos hospitalares', 'insumos de saúde'],
  },
  {
    code: 'expediente-mobiliario',
    label: 'Expediente e mobiliário',
    description: 'Material de escritório, mobiliário e equipamentos de uso geral.',
    source: 'vocabulário de compras públicas',
    terms: ['material de expediente', 'mobiliário', 'móveis', 'escritório'],
  },
  {
    code: 'uniformes-epis',
    label: 'Uniformes e EPIs',
    description: 'Vestuário profissional, uniformes e equipamentos de proteção.',
    source: 'vocabulário de compras públicas',
    terms: ['uniforme', 'vestuário', 'EPI', 'equipamento de proteção individual'],
  },
  {
    code: 'veiculos-pecas',
    label: 'Veículos, peças e manutenção',
    description: 'Veículos, peças, pneus, combustíveis e manutenção automotiva.',
    source: 'vocabulário de compras públicas',
    terms: ['veículo', 'automotivo', 'peças', 'pneus', 'combustível'],
  },
  {
    code: 'meio-ambiente',
    label: 'Meio ambiente e sustentabilidade',
    description: 'Gestão ambiental, recuperação, reciclagem e sustentabilidade.',
    source: 'vocabulário de compras públicas',
    terms: ['meio ambiente', 'sustentabilidade', 'reciclagem', 'gestão ambiental'],
  },
] as const;

export const NICHE_CODES = NICHE_CATALOG.map((niche) => niche.code);

export function isNicheCode(value: string): boolean {
  return NICHE_CODES.includes(value);
}

export function normalizeNicheCodes(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(isNicheCode))].slice(0, 3);
}

export function nicheDefinitions(values: readonly string[]): NicheDefinition[] {
  const wanted = new Set(values);
  return NICHE_CATALOG.filter((niche) => wanted.has(niche.code));
}

export function nicheSearchExpression(values: readonly string[]): string {
  return nicheDefinitions(values)
    .flatMap((niche) => niche.terms)
    .map((term) => `"${term.replaceAll('"', '')}"`)
    .join(' OR ');
}
