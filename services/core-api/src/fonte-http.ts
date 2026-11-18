/**
 * Acesso às fontes oficiais (PNCP, Compras.gov.br) com regras comuns: limite de chamadas ao
 * mesmo tempo por fonte, nova tentativa com espera crescente quando a fonte pede calma (429)
 * ou falha por um instante (502/503/504), e contagem das chamadas feitas.
 */

export type ContadoresDaFonte = {
  /** Chamadas feitas de verdade à fonte, contando cada nova tentativa. */
  chamadas: number;
  novasTentativas: number;
  limitadas: number;
  falhas: number;
};

const contadores = new Map<string, ContadoresDaFonte>();

export function contadoresDaFonte(nome: string): ContadoresDaFonte {
  let atual = contadores.get(nome);
  if (!atual) {
    atual = { chamadas: 0, novasTentativas: 0, limitadas: 0, falhas: 0 };
    contadores.set(nome, atual);
  }
  return atual;
}

export function resumoDosContadores(): Record<string, ContadoresDaFonte> {
  return Object.fromEntries([...contadores.entries()].map(([nome, valor]) => [nome, { ...valor }]));
}

export function zerarContadores(): void {
  contadores.clear();
}

class Semaforo {
  private livres: number;
  private fila: Array<() => void> = [];
  constructor(limite: number) {
    this.livres = limite;
  }
  async pegar(): Promise<() => void> {
    if (this.livres > 0) this.livres -= 1;
    else await new Promise<void>((resolve) => this.fila.push(resolve));
    let liberado = false;
    return () => {
      if (liberado) return;
      liberado = true;
      const proximo = this.fila.shift();
      if (proximo) proximo();
      else this.livres += 1;
    };
  }
}

export type OpcoesDaFonte = {
  /** Chamadas ao mesmo tempo para esta fonte (em toda a instância). */
  concorrencia?: number;
  /** Quantas vezes tentar de novo depois da primeira chamada. */
  novasTentativas?: number;
  esperaBaseMs?: number;
  esperaMaximaMs?: number;
  dormir?: (ms: number) => Promise<void>;
};

const STATUS_DE_NOVA_TENTATIVA = new Set([429, 502, 503, 504]);

/** Lê o Retry-After (segundos ou data) em milissegundos. */
export function esperaPedida(valor: string | null, agora = Date.now()): number | null {
  if (!valor) return null;
  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) return segundos * 1000;
  const data = Date.parse(valor);
  return Number.isNaN(data) ? null : Math.max(0, data - agora);
}

/**
 * Devolve um `fetch` com a política da fonte. Quem já recebe `fetchImpl` continua igual:
 * basta passar este no lugar.
 */
export function comPoliticaDeFonte(
  base: typeof fetch,
  nome: string,
  opcoes: OpcoesDaFonte = {},
): typeof fetch {
  const semaforo = new Semaforo(opcoes.concorrencia ?? 6);
  const tentativas = opcoes.novasTentativas ?? 2;
  const esperaBase = opcoes.esperaBaseMs ?? 600;
  const esperaMaxima = opcoes.esperaMaximaMs ?? 15_000;
  const dormir = opcoes.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const conta = contadoresDaFonte(nome);

  return (async (entrada: Parameters<typeof fetch>[0], inicio?: Parameters<typeof fetch>[1]) => {
    for (let tentativa = 0; ; tentativa += 1) {
      const liberar = await semaforo.pegar();
      let resposta: Response | null = null;
      let erro: unknown = null;
      try {
        conta.chamadas += 1;
        if (tentativa > 0) conta.novasTentativas += 1;
        resposta = await base(entrada, inicio);
      } catch (causa) {
        erro = causa;
      } finally {
        liberar();
      }
      const abortada = erro instanceof Error && erro.name === 'AbortError';
      if (resposta?.status === 429) conta.limitadas += 1;
      const tentarDeNovo =
        tentativa < tentativas &&
        !abortada &&
        (erro !== null || (resposta !== null && STATUS_DE_NOVA_TENTATIVA.has(resposta.status)));
      if (!tentarDeNovo) {
        if (erro !== null) {
          conta.falhas += 1;
          throw erro;
        }
        if (resposta && resposta.status >= 500) conta.falhas += 1;
        return resposta as Response;
      }
      const pedida = esperaPedida(resposta?.headers.get('retry-after') ?? null);
      const crescente = esperaBase * 2 ** tentativa * (0.75 + Math.random() * 0.5);
      await dormir(Math.min(esperaMaxima, Math.max(pedida ?? 0, crescente)));
    }
  }) as typeof fetch;
}
