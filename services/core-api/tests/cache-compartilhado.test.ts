import { describe, expect, it } from 'vitest';
import {
  CacheCompartilhado,
  CarregandoError,
  type ClienteRedis,
} from '../src/cache-compartilhado.js';

/** Redis de mentira, compartilhado entre "instâncias" nos testes. */
function redisFalso(): ClienteRedis & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    async get(chave) {
      return dados.get(chave) ?? null;
    },
    async set(chave, valor, opcoes) {
      if (opcoes?.NX && dados.has(chave)) return null;
      dados.set(chave, valor);
      return 'OK';
    },
    async del(chave) {
      dados.delete(chave);
      return 1;
    },
  };
}

const pausa = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('cache compartilhado', () => {
  it('reaproveita o dado dentro da validade sem consultar a fonte de novo', async () => {
    const cache = new CacheCompartilhado(undefined);
    let chamadas = 0;
    const pedido = {
      validadeMs: 60_000,
      retencaoMs: 600_000,
      buscar: async () => ({ valor: { n: ++chamadas } }),
    };
    const primeiro = await cache.obter('k', pedido);
    const segundo = await cache.obter('k', pedido);
    expect(chamadas).toBe(1);
    expect(primeiro.origem).toBe('fonte');
    expect(segundo.origem).toBe('cache');
    expect(segundo.valor).toEqual({ n: 1 });
  });

  it('dez acessos ao mesmo tempo fazem uma só consulta à fonte', async () => {
    const cache = new CacheCompartilhado(undefined);
    let chamadas = 0;
    const pedido = {
      validadeMs: 60_000,
      retencaoMs: 600_000,
      buscar: async () => {
        chamadas += 1;
        await pausa(30);
        return { valor: 'ok' };
      },
    };
    const respostas = await Promise.all(Array.from({ length: 10 }, () => cache.obter('k', pedido)));
    expect(chamadas).toBe(1);
    expect(respostas.every((resposta) => resposta.valor === 'ok')).toBe(true);
  });

  it('duas instâncias com o mesmo Redis fazem uma só consulta à fonte', async () => {
    const redis = redisFalso();
    const a = new CacheCompartilhado(undefined, { cliente: redis });
    const b = new CacheCompartilhado(undefined, { cliente: redis });
    let chamadas = 0;
    const pedido = {
      validadeMs: 60_000,
      retencaoMs: 600_000,
      buscar: async () => {
        chamadas += 1;
        await pausa(60);
        return { valor: 'da-fonte' };
      },
    };
    const [ra, rb] = await Promise.all([a.obter('edital:1', pedido), b.obter('edital:1', pedido)]);
    expect(chamadas).toBe(1);
    expect(ra.valor).toBe('da-fonte');
    expect(rb.valor).toBe('da-fonte');
    // Uma terceira instância, depois, só lê.
    const c = new CacheCompartilhado(undefined, { cliente: redis });
    const rc = await c.obter('edital:1', pedido);
    expect(rc.origem).toBe('cache');
    expect(chamadas).toBe(1);
  });

  it('se a fonte falhar, mantém o último dado válido e informa a data dele', async () => {
    let agora = 1_000;
    const cache = new CacheCompartilhado(undefined, { agora: () => agora });
    let falhar = false;
    const pedido = {
      validadeMs: 100,
      retencaoMs: 10_000,
      buscar: async () => {
        if (falhar) throw new Error('fonte fora');
        return { valor: 'bom' };
      },
    };
    const primeiro = await cache.obter('k', pedido);
    agora += 500;
    falhar = true;
    const depois = await cache.obter('k', pedido);
    expect(depois.valor).toBe('bom');
    expect(depois.origem).toBe('antigo');
    expect(depois.desatualizado).toBe(true);
    expect(depois.em).toBe(primeiro.em);
  });

  it('depois de uma falha, não bate na fonte de novo até passar a espera', async () => {
    let agora = 0;
    const cache = new CacheCompartilhado(undefined, {
      agora: () => agora,
      esperaAposFalhaMs: 1_000,
    });
    let chamadas = 0;
    let falhar = false;
    const pedido = {
      validadeMs: 100,
      retencaoMs: 100_000,
      buscar: async () => {
        chamadas += 1;
        if (falhar) throw new Error('x');
        return { valor: 1 };
      },
    };
    await cache.obter('k', pedido);
    agora = 200;
    falhar = true;
    await cache.obter('k', pedido);
    await cache.obter('k', pedido);
    await cache.obter('k', pedido);
    expect(chamadas).toBe(2);
    agora = 1_500;
    await cache.obter('k', pedido);
    expect(chamadas).toBe(3);
  });

  it('resultado parcial não apaga um resultado completo', async () => {
    let agora = 0;
    const cache = new CacheCompartilhado(undefined, { agora: () => agora });
    let parcial = false;
    const pedido = {
      validadeMs: 100,
      retencaoMs: 100_000,
      buscar: async () => ({ valor: parcial ? ['só um'] : ['um', 'dois'], parcial }),
    };
    await cache.obter('k', pedido);
    agora = 500;
    parcial = true;
    const resposta = await cache.obter('k', pedido);
    expect(resposta.valor).toEqual(['um', 'dois']);
    expect(resposta.desatualizado).toBe(true);
  });

  it('resultado parcial vale por pouco tempo', async () => {
    let agora = 0;
    const cache = new CacheCompartilhado(undefined, {
      agora: () => agora,
      validadeDaParcialMs: 1_000,
    });
    let chamadas = 0;
    const pedido = {
      validadeMs: 60_000,
      retencaoMs: 600_000,
      buscar: async () => ({ valor: ++chamadas, parcial: true }),
    };
    await cache.obter('k', pedido);
    agora = 500;
    await cache.obter('k', pedido);
    expect(chamadas).toBe(1);
    agora = 1_500;
    await cache.obter('k', pedido);
    expect(chamadas).toBe(2);
  });

  it('sem dado guardado e com a fonte fora, o erro sobe', async () => {
    const cache = new CacheCompartilhado(undefined);
    await expect(
      cache.obter('k', {
        validadeMs: 1,
        retencaoMs: 1,
        buscar: async () => {
          throw new Error('fora');
        },
      }),
    ).rejects.toThrow('fora');
  });

  it('sem dado guardado, repete a falha por um tempo sem chamar a fonte', async () => {
    let agora = 0;
    const cache = new CacheCompartilhado(undefined, {
      agora: () => agora,
      esperaAposFalhaSemDadoMs: 1_000,
    });
    let chamadas = 0;
    const pedido = {
      validadeMs: 1_000,
      retencaoMs: 10_000,
      buscar: async () => {
        chamadas += 1;
        throw new Error('fora');
      },
    };
    await expect(cache.obter('k', pedido)).rejects.toThrow('fora');
    await expect(cache.obter('k', pedido)).rejects.toThrow('fora');
    await expect(cache.obter('k', pedido)).rejects.toThrow('fora');
    expect(chamadas).toBe(1);
    agora = 2_000;
    await expect(cache.obter('k', pedido)).rejects.toThrow('fora');
    expect(chamadas).toBe(2);
  });

  it('serve o dado velho na hora e atualiza por baixo quando pedido', async () => {
    let agora = 0;
    const cache = new CacheCompartilhado(undefined, { agora: () => agora });
    let versao = 0;
    const pedido = {
      validadeMs: 100,
      retencaoMs: 100_000,
      servirVelhoEAtualizar: true,
      buscar: async () => ({ valor: ++versao }),
    };
    await cache.obter('k', pedido);
    agora = 500;
    const velho = await cache.obter('k', pedido);
    expect(velho.valor).toBe(1);
    expect(velho.atualizando).toBe(true);
    await pausa(10);
    const novo = await cache.obter('k', pedido);
    expect(novo.valor).toBe(2);
  });

  it('usa a validade do próprio valor (ex.: resultado final) quando informada', async () => {
    let agora = 0;
    const cache = new CacheCompartilhado(undefined, { agora: () => agora });
    let chamadas = 0;
    const pedido = {
      validadeMs: 100,
      retencaoMs: 100_000,
      validadeDoValor: (valor: { final: boolean }) => (valor.final ? 50_000 : null),
      buscar: async () => ({ valor: { final: ++chamadas > 0 } }),
    };
    await cache.obter('k', pedido);
    agora = 10_000;
    await cache.obter('k', pedido);
    expect(chamadas).toBe(1);
  });

  it('segue sem cache compartilhado quando o Redis falha', async () => {
    const quebrado: ClienteRedis = {
      get: async () => {
        throw new Error('redis fora');
      },
      set: async () => {
        throw new Error('redis fora');
      },
      del: async () => {
        throw new Error('redis fora');
      },
    };
    const cache = new CacheCompartilhado(undefined, { cliente: quebrado });
    let chamadas = 0;
    const pedido = {
      validadeMs: 60_000,
      retencaoMs: 600_000,
      buscar: async () => ({ valor: ++chamadas }),
    };
    const a = await cache.obter('k', pedido);
    const b = await cache.obter('k', pedido);
    expect(a.valor).toBe(1);
    expect(b.origem).toBe('cache');
    expect(chamadas).toBe(1);
    expect(cache.estatisticas.redisIndisponivel).toBeGreaterThan(0);
  });

  it('trabalho exclusivo: dois ao mesmo tempo, só um roda', async () => {
    const redis = redisFalso();
    const a = new CacheCompartilhado(undefined, { cliente: redis });
    const b = new CacheCompartilhado(undefined, { cliente: redis });
    let rodou = 0;
    const trabalho = async () => {
      rodou += 1;
      await pausa(40);
      return 'feito';
    };
    const [x, y, z] = await Promise.all([
      a.exclusivo('edital:1', trabalho),
      a.exclusivo('edital:1', trabalho),
      b.exclusivo('edital:1', trabalho),
    ]);
    expect(rodou).toBe(1);
    expect([x, y, z].filter((r) => r.ocupado).length).toBe(2);
    const depois = await a.exclusivo('edital:1', trabalho);
    expect(depois.ocupado).toBe(false);
    expect(rodou).toBe(2);
  });
  it('passado o prazo sem dado guardado, avisa "carregando" e o resultado entra no cache depois', async () => {
    const cache = new CacheCompartilhado(undefined);
    let chamadas = 0;
    const pedido = {
      validadeMs: 60_000,
      retencaoMs: 600_000,
      prazoMs: 30,
      buscar: async () => {
        chamadas += 1;
        await pausa(120);
        return { valor: { ok: true } };
      },
    };
    await expect(cache.obter('lento', pedido)).rejects.toBeInstanceOf(CarregandoError);
    // Segundo acesso durante a busca: junta-se a ela, sem nova consulta à fonte.
    await expect(cache.obter('lento', pedido)).rejects.toBeInstanceOf(CarregandoError);
    await pausa(200);
    const pronto = await cache.obter('lento', pedido);
    expect(pronto).toMatchObject({ origem: 'cache', valor: { ok: true } });
    expect(chamadas).toBe(1);
  });

  it('prazo não atrapalha: fonte rápida responde normal e falha da fonte continua falha', async () => {
    const cache = new CacheCompartilhado(undefined);
    const rapido = await cache.obter('rapido', {
      validadeMs: 60_000,
      retencaoMs: 600_000,
      prazoMs: 500,
      buscar: async () => ({ valor: 1 }),
    });
    expect(rapido.origem).toBe('fonte');
    await expect(
      cache.obter('quebrada', {
        validadeMs: 60_000,
        retencaoMs: 600_000,
        prazoMs: 500,
        buscar: async () => {
          throw new Error('fonte caiu');
        },
      }),
    ).rejects.toThrow('fonte caiu');
  });
});
