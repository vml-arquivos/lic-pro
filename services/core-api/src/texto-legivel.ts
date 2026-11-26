/**
 * Limpa o texto lido de um PDF. Alguns PDFs (páginas de jornal, escaneados com camada de texto
 * ruim) guardam as letras numa codificação que a leitura não traduz, e saem quadradinhos e
 * símbolos soltos no lugar das palavras. Esse lixo não pode aparecer como se fosse texto, nem
 * entrar na busca e na leitura automática de prazos e exigências.
 */
export const MARCA_TRECHO = 'Trecho não legível.';
export const MARCA_PAGINA = 'Página sem texto legível.';

/** Caracteres de controle, de substituição e de uso privado: sinal certo de decodificação falha. */
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f�-]/gu;
/** Símbolos que quase não aparecem em texto de edital e dominam o texto mal decodificado. */
const SIMBOLOS = /[!"#&*?@^~{}\\]/gu;

export function linhaIlegivel(linha: string): boolean {
  const compacta = linha.replace(/\s+/gu, '');
  const total = [...compacta].length;
  if (total === 0) return false;
  const controles = (compacta.match(CONTROLE) ?? []).length;
  if (controles >= 2 && controles / total >= 0.1) return true;
  if (total < 6) return false;
  const estranhos = controles + (compacta.match(SIMBOLOS) ?? []).length;
  const proporcao = estranhos / total;
  const temPalavra = /\p{L}{3,}/u.test(linha);
  return proporcao >= 0.3 || (!temPalavra && proporcao >= 0.15);
}

export type PaginaLimpa = {
  texto: string;
  /** A página toda é ilegível: some da busca e da leitura automática. */
  ilegivel: boolean;
  /** Linhas ilegíveis tiradas desta página. */
  removidas: number;
};

export function limparPagina(pagina: string): PaginaLimpa {
  const linhas = pagina.split('\n');
  const comTexto = linhas.filter((linha) => linha.trim() !== '');
  const ruins = new Set(linhas.map((linha, indice) => (linhaIlegivel(linha) ? indice : -1)));
  ruins.delete(-1);
  const removidas = ruins.size;
  if (removidas === 0) return { texto: pagina, ilegivel: false, removidas: 0 };
  if (comTexto.length > 0 && removidas / comTexto.length >= 0.5) {
    return { texto: MARCA_PAGINA, ilegivel: true, removidas };
  }
  const saida: string[] = [];
  let anteriorRuim = false;
  linhas.forEach((linha, indice) => {
    if (ruins.has(indice)) {
      if (!anteriorRuim) saida.push(MARCA_TRECHO);
      anteriorRuim = true;
      return;
    }
    if (linha.trim() !== '') anteriorRuim = false;
    saida.push(linha);
  });
  return { texto: saida.join('\n'), ilegivel: false, removidas };
}

/** Texto de verdade de uma página, sem as marcas de trecho ou página ilegível. */
export const semMarcas = (texto: string): string =>
  texto.replaceAll(MARCA_TRECHO, '').replaceAll(MARCA_PAGINA, '');
