/**
 * Leitura do edital: tira do texto dos documentos o que o licitante precisa saber
 * (prazos, garantia, amostra, visita, multa, habilitação).
 *
 * Só regras sobre o texto: cada informação traz o trecho e a página de onde saiu.
 * O que o texto não diz não aparece.
 */

export type PaginaLida = { documento: string; pagina: number; texto: string };

export type GrupoFato =
  'participacao' | 'entrega' | 'pagamento' | 'garantia' | 'habilitacao' | 'penalidades';

export const GRUPOS_FATO: Record<GrupoFato, { titulo: string; ordem: number }> = {
  participacao: { titulo: 'Para participar', ordem: 1 },
  entrega: { titulo: 'Entrega e contrato', ordem: 2 },
  pagamento: { titulo: 'Pagamento', ordem: 3 },
  garantia: { titulo: 'Garantia e amostra', ordem: 4 },
  habilitacao: { titulo: 'Habilitação', ordem: 5 },
  penalidades: { titulo: 'Multas', ordem: 6 },
};

export type FatoDoEdital = {
  id: string;
  grupo: GrupoFato;
  rotulo: string;
  valor: string;
  trecho: string;
  pagina: number;
  documento: string;
};

export type AlertaDoEdital = { id: string; texto: string };

type Frase = { texto: string; pagina: number; documento: string };

const MAX_TRECHO = 260;

/** Texto sem acento e em minúsculas, só para procurar. */
function simples(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function limpar(texto: string): string {
  return texto.replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

/** Quebra o texto de uma página em frases. */
export function frasesDaPagina(texto: string, pagina: number, documento: string): Frase[] {
  const corrido = limpar(texto);
  if (!corrido) return [];
  const partes = corrido.split(/(?<=[.;:!?])\s+(?=[A-ZÀ-Ú0-9"“(§])/u);
  const frases: Frase[] = [];
  for (const parte of partes) {
    const frase = parte.trim();
    if (frase.length < 12) continue;
    if (frase.length <= 700) {
      frases.push({ texto: frase, pagina, documento });
      continue;
    }
    // Frase muito longa: corta em pedaços para o trecho ficar legível.
    for (let inicio = 0; inicio < frase.length; inicio += 600) {
      frases.push({ texto: frase.slice(inicio, inicio + 700), pagina, documento });
    }
  }
  return frases;
}

function aparar(texto: string): string {
  if (texto.length <= MAX_TRECHO) return texto;
  return `${texto.slice(0, MAX_TRECHO - 1).trimEnd()}…`;
}

const NUMERO = '(\\d{1,3})';
/** "10 (dez) dias úteis" → ["10", "dias úteis"] */
const PRAZO = new RegExp(
  `${NUMERO}\\s*(?:\\([^)]{1,40}\\)\\s*)?(dias\\s+[uú]teis|dias\\s+corridos|dias|horas|meses|mes|anos)`,
  'i',
);

function prazoEm(texto: string): { n: number; unidade: string } | null {
  const achou = PRAZO.exec(texto);
  if (!achou) return null;
  const unidade = achou[2]!.toLowerCase().replace(/\s+/g, ' ').replace('uteis', 'úteis');
  return { n: Number(achou[1]), unidade: unidade === 'mes' ? 'meses' : unidade };
}

function textoDoPrazo(prazo: { n: number; unidade: string }): string {
  const unidade =
    prazo.n === 1
      ? prazo.unidade
          .replace('dias', 'dia')
          .replace('meses', 'mês')
          .replace('anos', 'ano')
          .replace('horas', 'hora')
      : prazo.unidade;
  return `${prazo.n} ${unidade}`;
}

type Regra = {
  id: string;
  grupo: GrupoFato;
  rotulo: string;
  /** Acha as frases candidatas (texto sem acento). */
  candidata: RegExp;
  /** Tira o valor; devolve null se a frase não serve. */
  valor: (frase: string, simplificada: string) => string | null;
};

function percentuais(frase: string): number[] {
  const lista: number[] = [];
  for (const achado of frase.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g)) {
    const numero = Number(achado[1]!.replace(',', '.'));
    if (Number.isFinite(numero)) lista.push(numero);
  }
  return lista;
}

function pct(numero: number): string {
  return `${numero.toLocaleString('pt-BR')}%`;
}

const REGRAS: Regra[] = [
  {
    id: 'validade-proposta',
    grupo: 'participacao',
    rotulo: 'Validade da proposta',
    candidata: /validade d[ae]s? propostas?/,
    valor: (frase) => {
      const prazo = prazoEm(frase);
      return prazo ? textoDoPrazo(prazo) : null;
    },
  },
  {
    id: 'criterio',
    grupo: 'participacao',
    rotulo: 'Critério de julgamento',
    candidata: /(menor preco|maior desconto|tecnica e preco|maior lance|menor taxa)/,
    valor: (frase, simples) => {
      const criterio = /(menor preco|maior desconto|tecnica e preco|maior lance|menor taxa)/.exec(
        simples,
      );
      if (!criterio) return null;
      const nome = {
        'menor preco': 'Menor preço',
        'maior desconto': 'Maior desconto',
        'tecnica e preco': 'Técnica e preço',
        'maior lance': 'Maior lance',
        'menor taxa': 'Menor taxa',
      }[criterio[1]!];
      const tipo = /(por item|por lote|global|por grupo)/.exec(simples);
      void frase;
      return tipo ? `${nome} ${tipo[1]}` : (nome ?? null);
    },
  },
  {
    id: 'exclusivo-mpe',
    grupo: 'participacao',
    rotulo: 'Exclusivo para ME/EPP',
    candidata:
      /(exclusiv[oa]s?[^.]{0,80}(microempresa|epp|me\b|pequeno porte)|participacao exclusiva|cota reservada|cota de ate 25)/,
    valor: (frase, simples) => {
      if (/nao\b[^.]{0,40}exclusiv/.test(simples)) return null;
      if (/cota reservada|cota de ate 25/.test(simples)) return 'Parte reservada para ME/EPP';
      return 'Sim';
    },
  },
  {
    id: 'sicaf',
    grupo: 'participacao',
    rotulo: 'Cadastro no SICAF',
    candidata: /sicaf/,
    valor: () => 'Citado no edital',
  },
  {
    id: 'consorcio',
    grupo: 'participacao',
    rotulo: 'Consórcio',
    candidata: /consorcio/,
    valor: (_frase, simples) => {
      if (
        /(vedad|nao sera permitid|nao sera admitid|nao podera|nao e permitid|nao se admit)/.test(
          simples,
        )
      )
        return 'Não aceita';
      if (/(sera permitid|e permitid|sera admitid|admite-se|podem participar)/.test(simples))
        return 'Aceita';
      return null;
    },
  },
  {
    id: 'impugnacao',
    grupo: 'participacao',
    rotulo: 'Prazo para pedir esclarecimento ou impugnar',
    candidata: /(impugna|esclarecimentos?)/,
    valor: (frase, simples) => {
      if (!/(ate|antes|anteced|anterior)/.test(simples)) return null;
      const prazo = prazoEm(frase);
      return prazo ? `Até ${textoDoPrazo(prazo)} antes da abertura` : null;
    },
  },
  {
    id: 'prazo-entrega',
    grupo: 'entrega',
    rotulo: 'Prazo de entrega',
    candidata: /prazo[^.]{0,60}(entrega|fornecimento|execucao)|entrega[^.]{0,60}prazo/,
    valor: (frase, simples) => {
      if (/(amostra|pagamento|recurso|impugna|proposta|esclarecimento)/.test(simples)) return null;
      const prazo = prazoEm(frase);
      return prazo
        ? `${textoDoPrazo(prazo)}${/ap[oó]s|a contar|contados|apos/i.test(frase) ? ' após o pedido' : ''}`
        : null;
    },
  },
  {
    id: 'vigencia',
    grupo: 'entrega',
    rotulo: 'Duração do contrato',
    candidata: /vigencia/,
    valor: (frase) => {
      const prazo = prazoEm(frase);
      return prazo ? textoDoPrazo(prazo) : null;
    },
  },
  {
    id: 'local-entrega',
    grupo: 'entrega',
    rotulo: 'Local de entrega',
    candidata: /(local de entrega|local da entrega|entregues? (no|na|nos|nas|em) )/,
    valor: (frase) => {
      const depois = /(?:local (?:de|da) entrega|entregues?)[^:]{0,40}[:]\s*(.+)$/i.exec(frase);
      const valor = limpar(depois?.[1] ?? frase);
      return valor.length >= 8 ? aparar(valor).slice(0, 140) : null;
    },
  },
  {
    id: 'reajuste',
    grupo: 'entrega',
    rotulo: 'Reajuste de preço',
    candidata: /reajust/,
    valor: (_frase, simples) => {
      const indice = /(ipca|inpc|igp-m|igpm|incc|ipc)/.exec(simples);
      if (/(nao havera|vedad|nao sera concedid|nao ha reajuste)/.test(simples)) return 'Não prevê';
      return indice ? `Prevê, pelo ${indice[1]!.toUpperCase()}` : 'Prevê';
    },
  },
  {
    id: 'pagamento',
    grupo: 'pagamento',
    rotulo: 'Prazo de pagamento',
    candidata: /pagamento/,
    valor: (frase, simples) => {
      if (
        !/(prazo|ate|em ate|no prazo|sera efetuado|sera realizado|serao efetuad|devera ser)/.test(
          simples,
        )
      )
        return null;
      if (/(recurso|multa|garantia)/.test(simples)) return null;
      const prazo = prazoEm(frase);
      return prazo && prazo.n <= 90 ? `Até ${textoDoPrazo(prazo)}` : null;
    },
  },
  {
    id: 'garantia-contratual',
    grupo: 'garantia',
    rotulo: 'Garantia do contrato',
    candidata: /garantia[^.]{0,80}(contratual|execucao|contrato|adicional)/,
    valor: (frase, simples) => {
      if (/nao (sera|serao) exigid|dispensad|nao (ha|havera) exigencia/.test(simples))
        return 'Não exigida';
      const lista = percentuais(frase);
      if (lista.length) return `${pct(Math.max(...lista))} do valor do contrato`;
      return /(exigid|prestar|apresentar|devera)/.test(simples) ? 'Exigida' : null;
    },
  },
  {
    id: 'garantia-produto',
    grupo: 'garantia',
    rotulo: 'Garantia do produto',
    candidata:
      /garantia[^.]{0,30}(do produto|dos bens|dos equipamentos|minima|tecnica|de fabrica|do fabricante|dos materiais)/,
    valor: (frase) => {
      const prazo = prazoEm(frase);
      return prazo ? `Mínimo de ${textoDoPrazo(prazo)}` : null;
    },
  },
  {
    id: 'amostra',
    grupo: 'garantia',
    rotulo: 'Amostra',
    candidata: /amostra/,
    valor: (frase, simples) => {
      if (/(nao sera exigid|nao sera necessari|dispensad|nao havera|nao se exige)/.test(simples))
        return 'Não exigida';
      if (
        /(devera|devera[o]?|sera exigid|exigida|exigir|solicitad|apresentar|apresentacao|poder[ao])/.test(
          simples,
        )
      ) {
        const prazo = prazoEm(frase);
        return prazo ? `Exigida, em até ${textoDoPrazo(prazo)}` : 'Exigida do primeiro colocado';
      }
      return null;
    },
  },
  {
    id: 'visita-tecnica',
    grupo: 'garantia',
    rotulo: 'Visita técnica',
    candidata: /(visita tecnica|vistoria)/,
    valor: (_frase, simples) => {
      if (/(nao (sera|e) (exigid|obrigatori)|dispensad|nao havera|nao se exige)/.test(simples))
        return 'Não exigida';
      if (/(facultativ|opcional|poder[ao] realizar)/.test(simples)) return 'Facultativa';
      if (/(obrigatori|devera realizar|devera ser realizad|exigid)/.test(simples))
        return 'Obrigatória';
      return null;
    },
  },
  {
    id: 'atestado',
    grupo: 'habilitacao',
    rotulo: 'Atestado de capacidade técnica',
    candidata: /atestados?[^.]{0,60}(capacidade|desempenho|aptidao)/,
    valor: (frase, simples) => {
      if (/nao (sera|serao) exigid|dispensad/.test(simples)) return 'Não exigido';
      const lista = percentuais(frase);
      return lista.length
        ? `Exigido, com mínimo de ${pct(Math.max(...lista))} do objeto`
        : 'Exigido';
    },
  },
  {
    id: 'balanco',
    grupo: 'habilitacao',
    rotulo: 'Balanço e índices contábeis',
    candidata: /(liquidez|solvencia|indices? contabeis|balanco patrimonial)/,
    valor: (_frase, simples) => {
      const indices = [
        /liquidez geral/.test(simples) ? 'LG' : null,
        /liquidez corrente/.test(simples) ? 'LC' : null,
        /solvencia geral/.test(simples) ? 'SG' : null,
      ].filter(Boolean);
      if (indices.length) return `Exige índices (${indices.join(', ')})`;
      return /balanco patrimonial/.test(simples) ? 'Exige balanço patrimonial' : null;
    },
  },
  {
    id: 'patrimonio-liquido',
    grupo: 'habilitacao',
    rotulo: 'Patrimônio líquido mínimo',
    candidata: /patrimonio liquido/,
    valor: (frase) => {
      const lista = percentuais(frase);
      return lista.length ? `${pct(Math.max(...lista))} do valor estimado` : null;
    },
  },
  {
    id: 'certificacao',
    grupo: 'habilitacao',
    rotulo: 'Selos e normas',
    candidata:
      /(inmetro|abnt|iso\s?\d{3,5}|anvisa|certificado de conformidade|registro no ministerio)/,
    valor: (_frase, simples) => {
      const nomes = [
        /inmetro/.test(simples) ? 'INMETRO' : null,
        /abnt/.test(simples) ? 'ABNT' : null,
        /iso\s?\d{3,5}/.test(simples) ? 'ISO' : null,
        /anvisa/.test(simples) ? 'ANVISA' : null,
      ].filter(Boolean);
      return nomes.length ? `Cita ${nomes.join(', ')}` : null;
    },
  },
  {
    id: 'multa',
    grupo: 'penalidades',
    rotulo: 'Multa por atraso ou descumprimento',
    candidata: /multa/,
    valor: (frase) => {
      const lista = percentuais(frase);
      if (!lista.length) return null;
      const maior = Math.max(...lista);
      const menor = Math.min(...lista);
      return maior === menor ? `${pct(maior)}` : `De ${pct(menor)} a ${pct(maior)}`;
    },
  },
];

const PESO_DOCUMENTO: Array<[RegExp, number]> = [
  [/^edital|\bedital\b/i, 0],
  [/termo de refer/i, 1],
  [/projeto b[aá]sico/i, 1],
  [/minuta|contrato|ata/i, 2],
];

function pesoDoDocumento(nome: string): number {
  for (const [rx, peso] of PESO_DOCUMENTO) if (rx.test(nome)) return peso;
  return 3;
}

/** Tira do texto lido as informações práticas do edital. */
export function extrairFatos(paginas: readonly PaginaLida[]): FatoDoEdital[] {
  const ordenadas = [...paginas].sort(
    (a, b) =>
      pesoDoDocumento(a.documento) - pesoDoDocumento(b.documento) ||
      a.documento.localeCompare(b.documento) ||
      a.pagina - b.pagina,
  );
  const frases = ordenadas.flatMap((pagina) =>
    frasesDaPagina(pagina.texto, pagina.pagina, pagina.documento),
  );
  const prontas = frases.map((frase) => ({ frase, simples: simples(frase.texto) }));
  const fatos: FatoDoEdital[] = [];
  for (const regra of REGRAS) {
    for (const { frase, simples: s } of prontas) {
      if (!regra.candidata.test(s)) continue;
      const valor = regra.valor(frase.texto, s);
      if (!valor) continue;
      fatos.push({
        id: regra.id,
        grupo: regra.grupo,
        rotulo: regra.rotulo,
        valor,
        trecho: aparar(frase.texto),
        pagina: frase.pagina,
        documento: frase.documento,
      });
      break;
    }
  }
  return fatos.sort((a, b) => GRUPOS_FATO[a.grupo].ordem - GRUPOS_FATO[b.grupo].ordem);
}

function diasDoValor(valor: string): number | null {
  const achou = /(\d{1,3})\s*(dias?|horas?|meses|m[eê]s)/i.exec(valor);
  if (!achou) return null;
  const n = Number(achou[1]);
  const unidade = achou[2]!.toLowerCase();
  if (unidade.startsWith('hora')) return n / 24;
  if (unidade.startsWith('m')) return n * 30;
  return n;
}

/** Avisos curtos para quem vai decidir se participa. */
export function alertasDosFatos(fatos: readonly FatoDoEdital[]): AlertaDoEdital[] {
  const por = new Map(fatos.map((fato) => [fato.id, fato]));
  const alertas: AlertaDoEdital[] = [];
  const adicionar = (id: string, texto: string) => alertas.push({ id, texto });

  const entrega = por.get('prazo-entrega');
  const diasEntrega = entrega ? diasDoValor(entrega.valor) : null;
  if (entrega && diasEntrega !== null && diasEntrega <= 7)
    adicionar('prazo-entrega', `Entrega rápida: ${entrega.valor}.`);

  const amostra = por.get('amostra');
  if (amostra && /^Exigida/.test(amostra.valor))
    adicionar('amostra', 'Pede amostra. Conte com tempo e custo.');

  const visita = por.get('visita-tecnica');
  if (visita?.valor === 'Obrigatória')
    adicionar('visita-tecnica', 'Visita técnica obrigatória. Marque antes da sessão.');

  const garantia = por.get('garantia-contratual');
  if (garantia && garantia.valor !== 'Não exigida')
    adicionar('garantia-contratual', `Garantia do contrato: ${garantia.valor.toLowerCase()}.`);

  const pagamento = por.get('pagamento');
  const diasPagamento = pagamento ? diasDoValor(pagamento.valor) : null;
  if (pagamento && diasPagamento !== null && diasPagamento > 30)
    adicionar(
      'pagamento',
      `Pagamento em até ${Math.round(diasPagamento)} dias. Conte com o caixa.`,
    );

  const multa = por.get('multa');
  const maior = multa ? Math.max(...percentuais(multa.valor)) : 0;
  if (multa && maior >= 20) adicionar('multa', `Multa pode chegar a ${pct(maior)}.`);

  if (por.get('exclusivo-mpe')?.valor === 'Sim')
    adicionar('exclusivo-mpe', 'Só ME/EPP pode disputar.');

  if (por.get('consorcio')?.valor === 'Não aceita') adicionar('consorcio', 'Não aceita consórcio.');

  if (por.get('balanco')?.valor.startsWith('Exige índices'))
    adicionar('balanco', 'Pede índices contábeis. Veja o balanço antes.');

  if (por.get('patrimonio-liquido'))
    adicionar(
      'patrimonio-liquido',
      `Patrimônio líquido mínimo de ${por.get('patrimonio-liquido')!.valor}.`,
    );

  if (/^Exigido/.test(por.get('atestado')?.valor ?? ''))
    adicionar('atestado', 'Pede atestado de capacidade técnica.');

  return alertas;
}
