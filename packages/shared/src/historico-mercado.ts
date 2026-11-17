/**
 * Histórico de mercado de um edital: preços pagos em outras compras e concorrentes.
 *
 * Tudo aqui é cálculo puro sobre registros REAIS de compras já fechadas (contratos do PNCP,
 * resultados de itens do PNCP e pesquisa de preços do Compras.gov.br). Nada é estimado nem
 * inventado: sem registro, não há número. Roda igual na API e na tela.
 *
 * Limite que precisa ficar claro para quem lê: o PNCP só publica quem participou depois do
 * resultado. Antes disso ninguém sabe quem vai concorrer, então a lista de concorrentes de um
 * edital aberto é HISTÓRICA ("quem costuma vencer compras parecidas"), nunca uma lista de inscritos.
 */

export type OrigemRegistro = 'pncp-contrato' | 'pncp-resultado' | 'compras-gov-preco';

export const ORIGENS_REGISTRO: Record<OrigemRegistro, string> = {
  'pncp-contrato': 'PNCP — contratos publicados pelo órgão',
  'pncp-resultado': 'PNCP — resultado de item',
  'compras-gov-preco': 'Compras.gov.br — pesquisa de preços',
};

/** Uma compra já fechada: quem vendeu, por quanto, quando e para quem. */
export type RegistroDeCompra = {
  fornecedor: string | null;
  cnpj: string | null;
  /** Valor total do contrato (`pncp-contrato`) ou valor unitário pago (demais origens). */
  valor: number | null;
  data: string | null;
  orgao: string | null;
  uf: string | null;
  objeto: string | null;
  origem: OrigemRegistro;
  /** Página pública onde o registro pode ser conferido, quando existe. */
  link: string | null;
};

export type Concorrente = {
  chave: string;
  /** Só CNPJ (14 dígitos). CPF de pessoa física nunca sai: fica nulo e `pessoa_fisica` é true. */
  cnpj: string | null;
  pessoa_fisica: boolean;
  nome: string;
  vitorias: number;
  /** Soma dos valores globais dos contratos do PNCP (nulo quando não há contrato com valor). */
  valor_contratos: number | null;
  ultima_data: string | null;
  ufs: string[];
  orgaos: string[];
  origens: OrigemRegistro[];
  exemplos: Array<{
    objeto: string | null;
    valor: number | null;
    data: string | null;
    orgao: string | null;
    origem: OrigemRegistro;
    link: string | null;
  }>;
};

function semAcento(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Só os dígitos de um CPF/CNPJ; nulo se não tiver tamanho de documento (11 ou 14). */
export function documentoDoFornecedor(valor: string | null | undefined): string | null {
  const digitos = (valor ?? '').replace(/\D/g, '');
  return digitos.length === 14 || digitos.length === 11 ? digitos : null;
}

/** CPF aparece mascarado na lista pública; a tela nunca mostra os 11 dígitos de pessoa física. */
export function formatarDocumento(documento: string | null): string | null {
  if (!documento) return null;
  if (documento.length === 14) {
    return documento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return `***.${documento.slice(3, 6)}.${documento.slice(6, 9)}-**`;
}

const STOPWORDS = new Set(
  [
    'para',
    'com',
    'sem',
    'das',
    'dos',
    'uma',
    'uns',
    'umas',
    'por',
    'pelo',
    'pela',
    'que',
    'nos',
    'nas',
    'este',
    'esta',
    'esse',
    'essa',
    'aquisicao',
    'contratacao',
    'registro',
    'preco',
    'precos',
    'empresa',
    'especializada',
    'fornecimento',
    'futura',
    'futuro',
    'eventual',
    'objeto',
    'servico',
    'servicos',
    'material',
    'materiais',
    'municipio',
    'prefeitura',
    'municipal',
    'secretaria',
    'atender',
    'necessidades',
    'demais',
    'conforme',
    'edital',
    'termo',
    'referencia',
    'anexo',
    'tipo',
    'unidade',
    'unidades',
  ].map(semAcento),
);

/** Palavras que identificam o assunto de um texto (sem acento, sem plural, sem palavras vazias). */
export function palavrasDoAssunto(texto: string | null | undefined): Set<string> {
  const saida = new Set<string>();
  for (const bruta of semAcento(texto ?? '').split(/[^a-z0-9]+/)) {
    if (bruta.length < 4 || /^\d+$/.test(bruta) || STOPWORDS.has(bruta)) continue;
    saida.add(bruta.length > 4 && bruta.endsWith('s') ? bruta.slice(0, -1) : bruta);
  }
  return saida;
}

/**
 * Quanto dois assuntos se parecem (0 a 1): palavras em comum sobre o menor dos dois conjuntos.
 * Exige pelo menos 2 palavras em comum (ou 1, quando um dos textos só tem 1 ou 2 palavras).
 */
export function similaridadeDeAssunto(
  a: ReadonlySet<string> | string | null | undefined,
  b: ReadonlySet<string> | string | null | undefined,
): number {
  const A = typeof a === 'object' && a !== null ? a : palavrasDoAssunto(a);
  const B = typeof b === 'object' && b !== null ? b : palavrasDoAssunto(b);
  const menor = Math.min(A.size, B.size);
  if (menor === 0) return 0;
  let comum = 0;
  for (const palavra of A) if (B.has(palavra)) comum += 1;
  if (comum === 0) return 0;
  if (comum < 2 && menor > 2) return 0;
  return Math.round((comum / menor) * 100) / 100;
}

function chaveDe(registro: RegistroDeCompra): { chave: string; cnpj: string | null } | null {
  const cnpj = documentoDoFornecedor(registro.cnpj);
  if (cnpj) return { chave: cnpj, cnpj };
  const nome = semAcento(registro.fornecedor ?? '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return nome.length >= 3 ? { chave: `nome:${nome}`, cnpj: null } : null;
}

const mais = <T>(lista: T[], item: T | null | undefined): void => {
  if (item && !lista.includes(item)) lista.push(item);
};

/**
 * Junta compras fechadas por fornecedor (CNPJ; sem CNPJ, pelo nome) e ordena por vitórias,
 * depois por valor e por data. Cada vitória é um registro real; o mesmo contrato não conta duas
 * vezes (chave: origem + link, ou origem + órgão + data + valor).
 */
export function agruparConcorrentes(
  registros: readonly RegistroDeCompra[],
  limite = 15,
): Concorrente[] {
  const grupos = new Map<string, Concorrente>();
  const vistos = new Set<string>();
  for (const registro of registros) {
    const dono = chaveDe(registro);
    if (!dono) continue;
    const identidade =
      registro.link ??
      [registro.origem, registro.orgao, registro.data, registro.valor, registro.objeto].join('|');
    const unica = `${dono.chave}#${registro.origem}#${identidade}`;
    if (vistos.has(unica)) continue;
    vistos.add(unica);

    let grupo = grupos.get(dono.chave);
    if (!grupo) {
      grupo = {
        chave: dono.cnpj?.length === 11 ? (formatarDocumento(dono.cnpj) ?? 'pf') : dono.chave,
        cnpj: dono.cnpj?.length === 14 ? dono.cnpj : null,
        pessoa_fisica: dono.cnpj?.length === 11,
        nome: (registro.fornecedor ?? '').replace(/\s+/g, ' ').trim() || 'Fornecedor sem nome',
        vitorias: 0,
        valor_contratos: null,
        ultima_data: null,
        ufs: [],
        orgaos: [],
        origens: [],
        exemplos: [],
      };
      grupos.set(dono.chave, grupo);
    }
    grupo.vitorias += 1;
    if (registro.origem === 'pncp-contrato' && registro.valor !== null && registro.valor > 0) {
      grupo.valor_contratos = (grupo.valor_contratos ?? 0) + registro.valor;
    }
    if (registro.data && (!grupo.ultima_data || registro.data > grupo.ultima_data)) {
      grupo.ultima_data = registro.data;
    }
    mais(grupo.ufs, registro.uf?.toUpperCase());
    mais(grupo.orgaos, registro.orgao);
    mais(grupo.origens, registro.origem);
    grupo.exemplos.push({
      objeto: registro.objeto,
      valor: registro.valor,
      data: registro.data,
      orgao: registro.orgao,
      origem: registro.origem,
      link: registro.link,
    });
  }
  return [...grupos.values()]
    .map((grupo) => ({
      ...grupo,
      valor_contratos:
        grupo.valor_contratos === null ? null : Math.round(grupo.valor_contratos * 100) / 100,
      ufs: grupo.ufs.sort().slice(0, 6),
      orgaos: grupo.orgaos.slice(0, 4),
      exemplos: grupo.exemplos
        .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
        .slice(0, 3),
    }))
    .sort(
      (a, b) =>
        b.vitorias - a.vitorias ||
        (b.valor_contratos ?? 0) - (a.valor_contratos ?? 0) ||
        (b.ultima_data ?? '').localeCompare(a.ultima_data ?? '') ||
        a.nome.localeCompare(b.nome),
    )
    .slice(0, limite);
}

export type EstatisticaDePrecos = {
  amostras: number;
  minimo: number;
  maximo: number;
  mediana: number;
  p25: number;
  p75: number;
};

export type PosicaoDoPreco =
  'abaixo_do_minimo' | 'abaixo_da_faixa' | 'na_faixa' | 'acima_da_faixa' | 'acima_do_maximo';

export type ComparacaoDePreco = {
  /** Nulo quando há poucas amostras para comparar com segurança. */
  posicao: PosicaoDoPreco | null;
  /** (estimado − mediana) ÷ mediana, em %; positivo = o edital estima acima do que se pagou. */
  diferenca_mediana_pct: number | null;
  texto: string;
};

export const MINIMO_DE_AMOSTRAS = 3;

/**
 * Compara o valor unitário estimado pelo edital com o que foi pago em outras compras do mesmo
 * item. A faixa "normal" é o intervalo entre o 1º e o 3º quartil das compras reais.
 */
export function compararPreco(
  estimadoUnitario: number | null | undefined,
  estatistica: EstatisticaDePrecos | null | undefined,
): ComparacaoDePreco {
  if (!estimadoUnitario || estimadoUnitario <= 0) {
    return { posicao: null, diferenca_mediana_pct: null, texto: 'Sem valor estimado no edital.' };
  }
  if (!estatistica || estatistica.amostras === 0) {
    return {
      posicao: null,
      diferenca_mediana_pct: null,
      texto: 'Sem compras anteriores deste item.',
    };
  }
  const diferenca =
    Math.round(((estimadoUnitario - estatistica.mediana) / estatistica.mediana) * 1000) / 10;
  if (estatistica.amostras < MINIMO_DE_AMOSTRAS) {
    return {
      posicao: null,
      diferenca_mediana_pct: diferenca,
      texto: 'Poucas compras para comparar.',
    };
  }
  const posicao: PosicaoDoPreco =
    estimadoUnitario < estatistica.minimo
      ? 'abaixo_do_minimo'
      : estimadoUnitario > estatistica.maximo
        ? 'acima_do_maximo'
        : estimadoUnitario < estatistica.p25
          ? 'abaixo_da_faixa'
          : estimadoUnitario > estatistica.p75
            ? 'acima_da_faixa'
            : 'na_faixa';
  const modulo = Math.abs(diferenca).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const leitura: Record<PosicaoDoPreco, string> = {
    abaixo_do_minimo: 'Estimado abaixo do menor preço já pago.',
    abaixo_da_faixa: `Estimado ${modulo}% abaixo da mediana.`,
    na_faixa: 'Estimado dentro do que se costuma pagar.',
    acima_da_faixa: `Estimado ${modulo}% acima da mediana.`,
    acima_do_maximo: 'Estimado acima do maior preço já pago.',
  };
  return { posicao, diferenca_mediana_pct: diferenca, texto: leitura[posicao] };
}

export const AVISO_HISTORICO =
  'O PNCP só divulga quem participou depois que o resultado sai. Por isso, em um edital aberto não ' +
  'existe lista oficial de concorrentes: o que mostramos é o histórico real de quem venceu compras ' +
  'parecidas, com a fonte de cada registro. Preços pagos servem de apoio à pesquisa de preços e ' +
  'não substituem a metodologia do edital.';

export const FONTES_HISTORICO = [
  {
    id: 'pncp-contratos',
    nome: 'PNCP — contratos e empenhos publicados',
    url: 'https://pncp.gov.br/app/contratos',
    descricao: 'Contratos assinados pelo órgão do edital, com o fornecedor contratado.',
  },
  {
    id: 'pncp-resultados',
    nome: 'PNCP — resultado dos itens',
    url: 'https://pncp.gov.br/app/editais',
    descricao: 'Valor homologado e vencedor de cada item, quando a compra já foi encerrada.',
  },
  {
    id: 'compras-gov',
    nome: 'Compras.gov.br — Dados Abertos (pesquisa de preços)',
    url: 'https://dadosabertos.compras.gov.br/',
    descricao: 'Preços praticados por código CATMAT em compras do Governo Federal e parceiros.',
  },
] as const;
