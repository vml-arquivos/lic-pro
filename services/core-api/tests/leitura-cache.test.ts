import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CacheCompartilhado, type ClienteRedis } from '../src/cache-compartilhado.js';
import { CacheDeLeitura, type DocumentoParaLer } from '../src/leitura-edital.js';

const pausa = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
const URL_A = 'https://pncp.gov.br/pncp-api/v1/orgaos/1/compras/2026/4/arquivos/1';

const leituraFalsa = (lidos: number, completa = true) => ({
  gerado_em: new Date().toISOString(),
  documentos: Array.from({ length: Math.max(lidos, 1) }, (_, i) => ({
    chave: `c${i}`.padEnd(12, '0'),
    nome: `Doc ${i}`,
    tipo: null,
    url: URL_A,
    estado: i < lidos ? ('lido' as const) : ('falhou' as const),
    paginas: 1,
    motivo: null,
  })),
  fatos: [],
  alertas: [],
  textos: new Map([['c0'.padEnd(12, '0'), ['texto do edital']]]),
  assinatura: 'x',
  completa,
});

function redisFalso(): ClienteRedis {
  const dados = new Map<string, string>();
  return {
    get: async (chave) => dados.get(chave) ?? null,
    set: async (chave, valor, opcoes) => {
      if (opcoes?.NX && dados.has(chave)) return null;
      dados.set(chave, valor);
      return 'OK';
    },
    del: async (chave) => {
      dados.delete(chave);
      return 1;
    },
  };
}

describe('leitura dos documentos: fila, falhas e cache compartilhado', () => {
  it('quem abriu o edital passa na frente do preparo antecipado', async () => {
    const ordem: string[] = [];
    let liberar!: () => void;
    const segurar = new Promise<void>((resolve) => (liberar = resolve));
    let primeira = true;
    const cache = new CacheDeLeitura(async (documentos) => {
      if (primeira) {
        primeira = false;
        await segurar;
      }
      ordem.push(documentos[0]!.nome!);
      return leituraFalsa(1);
    });
    const doc = (nome: string): DocumentoParaLer[] => [{ tipo: 'Edital', nome, url: URL_A }];
    cache.consultar('a', doc('ocupado'), 'alta');
    cache.consultar('b', doc('antecipado-1'), 'baixa');
    cache.consultar('c', doc('antecipado-2'), 'baixa');
    cache.consultar('d', doc('aberto-agora'), 'alta');
    expect(cache.naFila).toBe(3);
    liberar();
    await pausa(40);
    expect(ordem).toEqual(['ocupado', 'aberto-agora', 'antecipado-1', 'antecipado-2']);
  });

  it('o preparo antecipado sobe de prioridade quando a pessoa abre o edital', async () => {
    const ordem: string[] = [];
    let liberar!: () => void;
    const segurar = new Promise<void>((resolve) => (liberar = resolve));
    let primeira = true;
    const cache = new CacheDeLeitura(async (documentos) => {
      if (primeira) {
        primeira = false;
        await segurar;
      }
      ordem.push(documentos[0]!.nome!);
      return leituraFalsa(1);
    });
    const doc = (nome: string): DocumentoParaLer[] => [{ tipo: 'Edital', nome, url: URL_A }];
    cache.consultar('a', doc('ocupado'), 'alta');
    cache.consultar('b', doc('um'), 'baixa');
    cache.consultar('c', doc('dois'), 'baixa');
    cache.consultar('c', doc('dois'), 'alta');
    liberar();
    await pausa(40);
    expect(ordem).toEqual(['ocupado', 'dois', 'um']);
  });

  it('leitura com documento que não baixou é refeita logo, sem perder a anterior melhor', async () => {
    let agora = 1_000_000;
    let versao = 0;
    const cache = new CacheDeLeitura(
      async () => {
        versao += 1;
        return versao === 1 ? leituraFalsa(2) : leituraFalsa(1, false);
      },
      () => agora,
    );
    const docs: DocumentoParaLer[] = [{ tipo: 'Edital', nome: 'E', url: URL_A }];
    const id = randomUUID();
    cache.consultar(id, docs);
    await pausa();
    const primeira = cache.consultar(id, docs);
    expect(primeira.estado).toBe('pronta');
    // Depois de 7 h a leitura venceu; a nova sai pior (1 de 2 documentos): a antiga fica.
    agora += 7 * 3_600_000;
    expect(cache.consultar(id, docs).estado).toBe('pronta');
    await pausa();
    const depois = cache.consultar(id, docs);
    expect(depois.estado).toBe('pronta');
    if (depois.estado === 'pronta')
      expect(depois.leitura.documentos.filter((d) => d.estado === 'lido')).toHaveLength(2);
    expect(versao).toBe(2);
    // Não insiste de novo enquanto espera.
    cache.consultar(id, docs);
    expect(versao).toBe(2);
  });

  it('anexo trocado (nova versão na fonte) refaz a leitura', async () => {
    let chamadas = 0;
    const cache = new CacheDeLeitura(async () => {
      chamadas += 1;
      return leituraFalsa(1);
    });
    const id = randomUUID();
    cache.consultar(id, [{ tipo: 'Edital', nome: 'E', url: URL_A, versao: '2026-11-01' }]);
    await pausa();
    expect(
      cache.consultar(id, [{ tipo: 'Edital', nome: 'E', url: URL_A, versao: '2026-11-01' }]).estado,
    ).toBe('pronta');
    expect(chamadas).toBe(1);
    expect(
      cache.consultar(id, [{ tipo: 'Edital', nome: 'E', url: URL_A, versao: '2026-11-10' }]).estado,
    ).toBe('lendo');
    await pausa();
    expect(chamadas).toBe(2);
  });

  it('depois de um reinício, a leitura volta do cache compartilhado sem baixar os PDFs', async () => {
    const redis = redisFalso();
    const compartilhado = new CacheCompartilhado(undefined, { cliente: redis });
    let baixou = 0;
    const leitor = async () => {
      baixou += 1;
      return leituraFalsa(1);
    };
    const docs: DocumentoParaLer[] = [{ tipo: 'Edital', nome: 'E', url: URL_A }];
    const id = randomUUID();
    const antes = new CacheDeLeitura(leitor);
    antes.usarCompartilhado(compartilhado);
    antes.consultar(id, docs);
    await pausa();
    expect(baixou).toBe(1);

    const depoisDoReinicio = new CacheDeLeitura(leitor);
    depoisDoReinicio.usarCompartilhado(new CacheCompartilhado(undefined, { cliente: redis }));
    expect(depoisDoReinicio.consultar(id, docs).estado).toBe('lendo');
    await pausa();
    expect(depoisDoReinicio.consultar(id, docs).estado).toBe('pronta');
    expect(baixou).toBe(1);
    expect(depoisDoReinicio.textoLido(id)).toContain('texto do edital');
  });
});
