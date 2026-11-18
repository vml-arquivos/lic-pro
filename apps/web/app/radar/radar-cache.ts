/**
 * Guarda a última resposta de cada busca do Radar neste navegador, para reabrir a lista na hora
 * e atualizar em segundo plano. A chave inclui a conta e a busca já normalizada (com o perfil
 * aplicado): trocar de conta, de perfil ou de filtro nunca reaproveita outra lista.
 */
import type { ListResponse } from './radar-lib';

type Entrada = { dados: ListResponse; em: number; scroll: number };

/** Até esta idade a lista é considerada fresca e não precisa ser buscada de novo. */
export const FRESCO_MS = 45_000;
/** Depois disto a lista guardada é descartada. */
export const VALIDADE_MS = 30 * 60_000;
const LIMITE = 24;
const PREFIXO = 'lc:radar:lista:';
export const CHAVE_ULTIMA = 'lc:radar:ultima';

const memoria = new Map<string, Entrada>();

/** Ordena os parâmetros para que a mesma busca gere sempre a mesma chave. */
export function chaveDaLista(usuario: string, params: URLSearchParams): string {
  const ordenados = [...params.entries()].sort(([a, va], [b, vb]) =>
    a === b ? va.localeCompare(vb) : a.localeCompare(b),
  );
  return `${usuario}|${new URLSearchParams(ordenados).toString()}`;
}

function armazenamento(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function lerLista(chave: string, agora = Date.now()): (Entrada & { idade: number }) | null {
  let entrada = memoria.get(chave) ?? null;
  if (!entrada) {
    try {
      const bruto = armazenamento()?.getItem(PREFIXO + chave);
      if (bruto) {
        const lido = JSON.parse(bruto) as Entrada;
        if (lido && typeof lido.em === 'number' && Array.isArray(lido.dados?.data)) {
          entrada = lido;
          memoria.set(chave, lido);
        }
      }
    } catch {
      entrada = null;
    }
  }
  if (!entrada) return null;
  const idade = agora - entrada.em;
  if (idade > VALIDADE_MS || idade < 0) {
    esquecerLista(chave);
    return null;
  }
  return { ...entrada, idade };
}

export function guardarLista(chave: string, dados: ListResponse, agora = Date.now()): void {
  const anterior = memoria.get(chave);
  const entrada: Entrada = { dados, em: agora, scroll: anterior?.scroll ?? 0 };
  memoria.delete(chave);
  memoria.set(chave, entrada);
  while (memoria.size > LIMITE) {
    const maisAntiga = memoria.keys().next().value;
    if (maisAntiga === undefined) break;
    esquecerLista(maisAntiga);
  }
  gravar(chave, entrada);
}

export function guardarScroll(chave: string, scroll: number): void {
  const entrada = memoria.get(chave);
  if (!entrada) return;
  entrada.scroll = Math.max(0, Math.round(scroll));
  gravar(chave, entrada);
}

function gravar(chave: string, entrada: Entrada): void {
  try {
    armazenamento()?.setItem(PREFIXO + chave, JSON.stringify(entrada));
  } catch {
    // sem espaço ou sem armazenamento: continua só na memória
  }
}

export function esquecerLista(chave: string): void {
  memoria.delete(chave);
  try {
    armazenamento()?.removeItem(PREFIXO + chave);
  } catch {
    // nada a fazer
  }
}

/** Apaga todas as listas guardadas (por exemplo, quando o perfil é salvo). */
export function esquecerListas(): void {
  memoria.clear();
  try {
    const guardado = armazenamento();
    if (!guardado) return;
    for (let i = guardado.length - 1; i >= 0; i -= 1) {
      const nome = guardado.key(i);
      if (nome?.startsWith(PREFIXO)) guardado.removeItem(nome);
    }
  } catch {
    // nada a fazer
  }
}

/** Lembra a busca em que a pessoa estava, para o "Voltar ao Radar" do edital. */
export function lembrarBusca(usuario: string, query: string): void {
  try {
    armazenamento()?.setItem(CHAVE_ULTIMA, JSON.stringify({ usuario, query }));
  } catch {
    // sem armazenamento
  }
}

export function buscaLembrada(usuario: string): string {
  try {
    const bruto = armazenamento()?.getItem(CHAVE_ULTIMA);
    if (!bruto) return '';
    const lido = JSON.parse(bruto) as { usuario?: string; query?: string };
    return lido.usuario === usuario && typeof lido.query === 'string' ? lido.query : '';
  } catch {
    return '';
  }
}
