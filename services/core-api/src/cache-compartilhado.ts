/**
 * Cache e trabalho único para consultas caras às fontes oficiais.
 *
 * - Guarda o último resultado válido em Redis (compartilhado entre instâncias) e, se o Redis
 *   faltar ou demorar, na memória do processo. Nunca derruba a consulta por causa do cache.
 * - Dois acessos ao mesmo dado ao mesmo tempo viram uma só consulta à fonte, dentro da
 *   instância e entre instâncias (trava curta no Redis).
 * - Se a nova consulta falhar ou vier incompleta, o último resultado completo continua valendo,
 *   identificado pela data em que foi obtido.
 */
import { createClient } from 'redis';
import { randomUUID } from 'node:crypto';

export type EntradaDeCache<T> = {
  valor: T;
  /** Quando o valor foi obtido na fonte. */
  em: number;
  /** Resultado incompleto (erro parcial). Vale por menos tempo e não substitui um completo. */
  parcial: boolean;
  /** Só tenta a fonte de novo depois disto, quando a última tentativa falhou. */
  tentarDepoisDe: number;
};

export type OrigemDoDado = 'cache' | 'fonte' | 'antigo';

/**
 * A fonte ainda não respondeu dentro do prazo pedido. A consulta continua por baixo e o resultado
 * entra no cache; quem chamou deve mostrar "buscando" e perguntar de novo em poucos segundos.
 */
export class CarregandoError extends Error {
  constructor() {
    super('carregando');
    this.name = 'CarregandoError';
  }
}

export type ResultadoDoCache<T> = {
  valor: T;
  em: number;
  origem: OrigemDoDado;
  /** O dado é mais velho que a validade e a atualização falhou ou está em andamento. */
  desatualizado: boolean;
  parcial: boolean;
  /** Uma atualização está sendo feita em segundo plano. */
  atualizando: boolean;
  erro?: unknown;
};

export type PedidoDeCache<T> = {
  /** Até quando o dado é considerado fresco. */
  validadeMs: number;
  /** Quanto tempo guardar para servir de reserva se a fonte falhar. */
  retencaoMs: number;
  /** Fonte completa devolve `parcial: false`. Recebe o último valor guardado, se houver. */
  buscar: (anterior: T | null) => Promise<{ valor: T; parcial?: boolean }>;
  /** Serve o dado velho na hora e atualiza por baixo (para telas que já mostram algo). */
  servirVelhoEAtualizar?: boolean;
  /** Se pronto, o dado fresco vale por mais tempo (ex.: resultado final já homologado). */
  validadeDoValor?: (valor: T) => number | null;
  /**
   * Sem nenhum dado guardado, espera a fonte só até aqui. Passado o prazo, lança
   * `CarregandoError` e a consulta segue por baixo (e vai para o cache quando terminar).
   */
  prazoMs?: number;
};

export type OpcoesDoCache = {
  agora?: () => number;
  /** Prefixo das chaves no Redis. */
  prefixo?: string;
  esperaDaTravaMs?: number;
  validadeDaParcialMs?: number;
  esperaAposFalhaMs?: number;
  /** Sem nenhum dado guardado, quanto tempo repetir a falha sem chamar a fonte de novo. */
  esperaAposFalhaSemDadoMs?: number;
  limiteNaMemoria?: number;
  /** Cliente já pronto (testes). */
  cliente?: ClienteRedis | null;
};

export type ClienteRedis = {
  get(chave: string): Promise<string | null>;
  set(chave: string, valor: string, opcoes?: { PX?: number; NX?: boolean }): Promise<string | null>;
  del(chave: string): Promise<unknown>;
};

export type EstatisticasDoCache = {
  acertos: number;
  falhas: number;
  consultasAFonte: number;
  compartilhadas: number;
  esperasDeTrava: number;
  servidosAntigos: number;
  redisIndisponivel: number;
};

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class CacheCompartilhado {
  private memoria = new Map<string, EntradaDeCache<unknown> & { ate: number }>();
  private emVoo = new Map<string, Promise<ResultadoDoCache<unknown>>>();
  private cliente: ClienteRedis | null = null;
  private fecharCliente: (() => Promise<void>) | null = null;
  private redisCaidoAte = 0;
  private falhasRecentes = new Map<string, { ate: number; erro: unknown }>();
  readonly estatisticas: EstatisticasDoCache = {
    acertos: 0,
    falhas: 0,
    consultasAFonte: 0,
    compartilhadas: 0,
    esperasDeTrava: 0,
    servidosAntigos: 0,
    redisIndisponivel: 0,
  };
  private readonly agora: () => number;
  private readonly prefixo: string;
  private readonly esperaDaTravaMs: number;
  private readonly validadeDaParcialMs: number;
  private readonly esperaAposFalhaMs: number;
  private readonly esperaAposFalhaSemDadoMs: number;
  private readonly limite: number;

  constructor(redisUrl?: string, opcoes: OpcoesDoCache = {}) {
    this.agora = opcoes.agora ?? Date.now;
    this.prefixo = opcoes.prefixo ?? 'lc:fonte:';
    this.esperaDaTravaMs = opcoes.esperaDaTravaMs ?? 12_000;
    this.validadeDaParcialMs = opcoes.validadeDaParcialMs ?? 2 * 60_000;
    this.esperaAposFalhaMs = opcoes.esperaAposFalhaMs ?? 2 * 60_000;
    this.esperaAposFalhaSemDadoMs = opcoes.esperaAposFalhaSemDadoMs ?? 45_000;
    this.limite = opcoes.limiteNaMemoria ?? 600;
    if (opcoes.cliente !== undefined) this.cliente = opcoes.cliente;
    else if (redisUrl) this.abrirRedis(redisUrl);
  }

  private abrirRedis(url: string): void {
    try {
      const real = createClient({
        url,
        socket: { connectTimeout: 1500, reconnectStrategy: (n) => Math.min(n * 500, 10_000) },
      });
      real.on('error', () => undefined);
      void real.connect().catch(() => undefined);
      this.cliente = real as unknown as ClienteRedis;
      this.fecharCliente = async () => {
        await real.quit().catch(() => undefined);
      };
    } catch {
      this.cliente = null;
    }
  }

  async fechar(): Promise<void> {
    await this.fecharCliente?.();
  }

  /** Executa uma operação do Redis sem nunca derrubar a consulta: falhou, usa só a memória. */
  private async noRedis<R>(operacao: (c: ClienteRedis) => Promise<R>): Promise<R | undefined> {
    const cliente = this.cliente;
    if (!cliente || this.agora() < this.redisCaidoAte) return undefined;
    try {
      return await Promise.race([
        operacao(cliente),
        new Promise<never>((_, rejeitar) =>
          setTimeout(() => rejeitar(new Error('redis_lento')), 800),
        ),
      ]);
    } catch {
      this.estatisticas.redisIndisponivel += 1;
      this.redisCaidoAte = this.agora() + 15_000;
      return undefined;
    }
  }

  async ler<T>(chave: string): Promise<EntradaDeCache<T> | null> {
    const local = this.memoria.get(chave);
    if (local && local.ate > this.agora()) return local as EntradaDeCache<T>;
    const bruto = await this.noRedis((c) => c.get(this.prefixo + chave));
    if (bruto) {
      try {
        const lida = JSON.parse(bruto) as EntradaDeCache<T>;
        if (typeof lida.em === 'number') return lida;
      } catch {
        return null;
      }
    }
    return null;
  }

  async gravar<T>(chave: string, entrada: EntradaDeCache<T>, retencaoMs: number): Promise<void> {
    this.memoria.delete(chave);
    this.memoria.set(chave, { ...entrada, ate: this.agora() + retencaoMs });
    while (this.memoria.size > this.limite) {
      const antiga = this.memoria.keys().next().value;
      if (antiga === undefined) break;
      this.memoria.delete(antiga);
    }
    await this.noRedis((c) =>
      c.set(this.prefixo + chave, JSON.stringify(entrada), { PX: retencaoMs }),
    );
  }

  async esquecer(chave: string): Promise<void> {
    this.memoria.delete(chave);
    await this.noRedis((c) => c.del(this.prefixo + chave));
  }

  /** Esquece todas as chaves em memória que começam com o prefixo (Redis expira sozinho). */
  esquecerPrefixo(inicio: string): void {
    for (const chave of [...this.memoria.keys()]) {
      if (chave.startsWith(inicio)) this.memoria.delete(chave);
    }
  }

  private validadeDe<T>(entrada: EntradaDeCache<T>, pedido: PedidoDeCache<T>): number {
    if (entrada.parcial) return Math.min(pedido.validadeMs, this.validadeDaParcialMs);
    return pedido.validadeDoValor?.(entrada.valor) ?? pedido.validadeMs;
  }

  async obter<T>(chave: string, pedido: PedidoDeCache<T>): Promise<ResultadoDoCache<T>> {
    const entrada = await this.ler<T>(chave);
    const agora = this.agora();
    if (entrada) {
      const idade = agora - entrada.em;
      if (idade < this.validadeDe(entrada, pedido)) {
        this.estatisticas.acertos += 1;
        return {
          valor: entrada.valor,
          em: entrada.em,
          origem: 'cache',
          desatualizado: false,
          parcial: entrada.parcial,
          atualizando: false,
        };
      }
      // Vencido. Se a última tentativa falhou há pouco, não bate de novo na fonte.
      if (agora < entrada.tentarDepoisDe) {
        this.estatisticas.servidosAntigos += 1;
        return {
          valor: entrada.valor,
          em: entrada.em,
          origem: 'antigo',
          desatualizado: true,
          parcial: entrada.parcial,
          atualizando: false,
        };
      }
      if (pedido.servirVelhoEAtualizar) {
        void this.atualizar(chave, pedido, entrada).catch(() => undefined);
        this.estatisticas.servidosAntigos += 1;
        return {
          valor: entrada.valor,
          em: entrada.em,
          origem: 'antigo',
          desatualizado: true,
          parcial: entrada.parcial,
          atualizando: true,
        };
      }
    }
    const falha = this.falhasRecentes.get(chave);
    if (falha && !entrada) {
      if (agora < falha.ate) {
        this.estatisticas.falhas += 1;
        throw falha.erro;
      }
      this.falhasRecentes.delete(chave);
    }
    return this.comPrazo(this.atualizar(chave, pedido, entrada), pedido.prazoMs);
  }

  /** Espera o trabalho até o prazo; depois dele, deixa o trabalho correr e avisa quem espera. */
  private comPrazo<R>(trabalho: Promise<R>, prazoMs: number | undefined): Promise<R> {
    if (!prazoMs || prazoMs <= 0) return trabalho;
    return new Promise<R>((resolve, rejeitar) => {
      const relogio = setTimeout(() => {
        // O trabalho segue sozinho; se falhar depois do prazo, a falha já fica no cache negativo.
        trabalho.catch(() => undefined);
        rejeitar(new CarregandoError());
      }, prazoMs);
      trabalho.then(
        (valor) => {
          clearTimeout(relogio);
          resolve(valor);
        },
        (erro: unknown) => {
          clearTimeout(relogio);
          rejeitar(erro);
        },
      );
    });
  }

  /** Uma só consulta por chave: acessos juntos esperam o mesmo trabalho. */
  private atualizar<T>(
    chave: string,
    pedido: PedidoDeCache<T>,
    antiga: EntradaDeCache<T> | null,
  ): Promise<ResultadoDoCache<T>> {
    const existente = this.emVoo.get(chave);
    if (existente) {
      this.estatisticas.compartilhadas += 1;
      return existente as Promise<ResultadoDoCache<T>>;
    }
    const trabalho = this.consultar(chave, pedido, antiga).finally(() => {
      this.emVoo.delete(chave);
    });
    this.emVoo.set(chave, trabalho as Promise<ResultadoDoCache<unknown>>);
    return trabalho;
  }

  private async consultar<T>(
    chave: string,
    pedido: PedidoDeCache<T>,
    antiga: EntradaDeCache<T> | null,
  ): Promise<ResultadoDoCache<T>> {
    const donoDaTrava = randomUUID();
    const chaveDaTrava = `${this.prefixo}trava:${chave}`;
    let temTrava = true;
    if (this.cliente) {
      const resposta = await this.noRedis((c) =>
        c.set(chaveDaTrava, donoDaTrava, { NX: true, PX: 60_000 }),
      );
      // `undefined` = Redis fora do ar: segue sem trava. `null` = outra instância já consulta.
      temTrava = resposta !== null;
    }
    if (!temTrava) {
      this.estatisticas.esperasDeTrava += 1;
      const limite = this.agora() + this.esperaDaTravaMs;
      while (this.agora() < limite) {
        await dormir(250);
        const nova = await this.ler<T>(chave);
        if (nova && (!antiga || nova.em > antiga.em)) {
          this.estatisticas.compartilhadas += 1;
          return {
            valor: nova.valor,
            em: nova.em,
            origem: 'cache',
            desatualizado: false,
            parcial: nova.parcial,
            atualizando: false,
          };
        }
        const aindaTrava = await this.noRedis((c) => c.get(chaveDaTrava));
        if (aindaTrava === null) break;
      }
      // A outra instância não terminou a tempo: consulta por conta própria.
    }
    try {
      this.estatisticas.consultasAFonte += 1;
      const novo = await pedido.buscar(antiga?.valor ?? null);
      const parcial = Boolean(novo.parcial);
      // Um resultado incompleto não apaga um completo: o completo continua, com a data dele.
      if (parcial && antiga && !antiga.parcial) {
        const mantida = { ...antiga, tentarDepoisDe: this.agora() + this.esperaAposFalhaMs };
        await this.gravar(chave, mantida, pedido.retencaoMs);
        this.estatisticas.servidosAntigos += 1;
        return {
          valor: antiga.valor,
          em: antiga.em,
          origem: 'antigo',
          desatualizado: true,
          parcial: false,
          atualizando: false,
        };
      }
      const entrada: EntradaDeCache<T> = {
        valor: novo.valor,
        em: this.agora(),
        parcial,
        tentarDepoisDe: 0,
      };
      this.falhasRecentes.delete(chave);
      await this.gravar(chave, entrada, pedido.retencaoMs);
      return {
        valor: novo.valor,
        em: entrada.em,
        origem: 'fonte',
        desatualizado: false,
        parcial,
        atualizando: false,
      };
    } catch (erro) {
      this.estatisticas.falhas += 1;
      if (antiga) {
        await this.gravar(
          chave,
          { ...antiga, tentarDepoisDe: this.agora() + this.esperaAposFalhaMs },
          pedido.retencaoMs,
        );
        this.estatisticas.servidosAntigos += 1;
        return {
          valor: antiga.valor,
          em: antiga.em,
          origem: 'antigo',
          desatualizado: true,
          parcial: antiga.parcial,
          atualizando: false,
          erro,
        };
      }
      // Nada guardado e a fonte falhou: não repete a chamada a cada acesso.
      this.falhasRecentes.set(chave, { ate: this.agora() + this.esperaAposFalhaSemDadoMs, erro });
      if (this.falhasRecentes.size > this.limite) {
        const antiga = this.falhasRecentes.keys().next().value;
        if (antiga !== undefined) this.falhasRecentes.delete(antiga);
      }
      throw erro;
    } finally {
      if (this.cliente && temTrava) {
        const atual = await this.noRedis((c) => c.get(chaveDaTrava));
        if (atual === donoDaTrava) await this.noRedis((c) => c.del(chaveDaTrava));
      }
    }
  }

  /**
   * Trabalho que grava no banco (ex.: coletar itens do edital): só um por vez entre as
   * instâncias. Devolve `ocupado` se outra instância já está fazendo.
   */
  async exclusivo<T>(
    chave: string,
    trabalho: () => Promise<T>,
    duracaoMs = 90_000,
  ): Promise<{ ocupado: false; valor: T } | { ocupado: true }> {
    const marca = `x:${chave}`;
    if (this.emVoo.has(marca)) {
      this.estatisticas.compartilhadas += 1;
      return { ocupado: true };
    }
    const dono = randomUUID();
    const chaveDaTrava = `${this.prefixo}trava:x:${chave}`;
    const andamento = (async (): Promise<{ ocupado: false; valor: T } | { ocupado: true }> => {
      if (this.cliente) {
        const resposta = await this.noRedis((c) =>
          c.set(chaveDaTrava, dono, { NX: true, PX: duracaoMs }),
        );
        if (resposta === null) {
          this.estatisticas.esperasDeTrava += 1;
          return { ocupado: true };
        }
      }
      try {
        return { ocupado: false, valor: await trabalho() };
      } finally {
        if (this.cliente) {
          const atual = await this.noRedis((c) => c.get(chaveDaTrava));
          if (atual === dono) await this.noRedis((c) => c.del(chaveDaTrava));
        }
      }
    })();
    // Marcado já, antes de qualquer espera, para que um segundo acesso no mesmo instante veja.
    this.emVoo.set(marca, andamento as unknown as Promise<ResultadoDoCache<unknown>>);
    try {
      return await andamento;
    } finally {
      this.emVoo.delete(marca);
    }
  }
}

/** Cache usado quando ninguém passou um: só memória deste processo. */
export const cacheLocal = new CacheCompartilhado(undefined);

/** Dados para a tela mostrar a idade do dado e se ele pode estar velho. */
export function metaDoDado(resultado: ResultadoDoCache<unknown>, agora = Date.now()) {
  return {
    consultado_em: new Date(resultado.em).toISOString(),
    idade_segundos: Math.max(0, Math.round((agora - resultado.em) / 1000)),
    origem: resultado.origem,
    desatualizado: resultado.desatualizado,
    atualizando: resultado.atualizando,
    parcial: resultado.parcial,
  };
}

/** Meta de um dado que ainda está sendo buscado pela primeira vez (a tela pergunta de novo). */
export function metaCarregando(agora = Date.now()) {
  return {
    consultado_em: new Date(agora).toISOString(),
    idade_segundos: 0,
    origem: 'fonte' as const,
    desatualizado: false,
    atualizando: true,
    parcial: false,
  };
}

/** Quanto a tela espera a fonte na primeira busca antes de mostrar "buscando" e voltar a perguntar. */
export const prazoDaTelaMs = (): number => Number(process.env.PRAZO_DA_TELA_MS) || 9_000;
