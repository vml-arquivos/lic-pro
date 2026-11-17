import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  alertasDosFatos,
  extrairFatos,
  type AlertaDoEdital,
  type FatoDoEdital,
  type PaginaLida,
} from '@licitecomigo/shared';
import { PublicRateLimiter } from './auth-public.js';
import { withTenant } from './db.js';
import { authContext, sendDatabaseUnavailable } from './request-context.js';

/**
 * Leitura dos documentos do edital (PDF publicado no PNCP).
 *
 * O servidor baixa os arquivos, tira o texto e extrai prazos, garantia, amostra, visita e
 * habilitação. O resultado fica em memória (poucas horas) e a tela consulta até ficar pronto.
 * Só baixa de endereços do PNCP. Arquivo que não é PDF ou não tem texto é listado como não lido.
 */

export type DocumentoParaLer = { tipo: string | null; nome: string | null; url: string };

export type EstadoDoDocumento = 'lido' | 'formato' | 'grande' | 'sem_texto' | 'falhou';

export type DocumentoLido = {
  chave: string;
  nome: string;
  tipo: string | null;
  url: string;
  estado: EstadoDoDocumento;
  paginas: number;
  motivo: string | null;
};

export type Leitura = {
  gerado_em: string;
  documentos: DocumentoLido[];
  fatos: FatoDoEdital[];
  alertas: AlertaDoEdital[];
};

type Guardado = Leitura & { textos: Map<string, string[]>; assinatura: string };

export type LeitorDePdf = (bytes: Uint8Array) => Promise<string[]>;

const MAX_DOCUMENTOS = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PAGINAS = 300;
const MAX_CARACTERES_POR_DOCUMENTO = 120_000;
const VALIDADE_MS = 6 * 60 * 60_000;
const ESPERA_APOS_ERRO_MS = 2 * 60_000;
const MAX_NA_MEMORIA = 30;

export const chaveDoDocumento = (url: string): string =>
  createHash('sha256').update(url).digest('hex').slice(0, 12);

const assinaturaDe = (documentos: readonly DocumentoParaLer[]): string =>
  createHash('sha256')
    .update(documentos.map((doc) => doc.url).join('|'))
    .digest('hex')
    .slice(0, 16);

/** Só baixa do PNCP. */
export function urlDoPncp(url: string): boolean {
  try {
    const endereco = new URL(url);
    return (
      endereco.protocol === 'https:' &&
      (endereco.hostname === 'pncp.gov.br' || endereco.hostname.endsWith('.pncp.gov.br'))
    );
  } catch {
    return false;
  }
}

/** Edital e termo de referência primeiro; comprovantes e avisos ficam de fora. */
export function escolherParaLer(documentos: readonly DocumentoParaLer[]): DocumentoParaLer[] {
  const pontos = (doc: DocumentoParaLer): number => {
    const texto = `${doc.tipo ?? ''} ${doc.nome ?? ''}`.toLowerCase();
    if (/comprovante|publica[çc][ãa]o|aviso de|cota[çc][ãa]o|estudo t[ée]cnico/.test(texto))
      return 9;
    if (/^edital|\bedital\b/.test(texto)) return 0;
    if (/termo de refer|projeto b[aá]sico/.test(texto)) return 1;
    if (/minuta|contrato|ata de registro/.test(texto)) return 2;
    if (/anexo|planilha|modelo/.test(texto)) return 4;
    return 5;
  };
  return documentos
    .filter((doc) => urlDoPncp(doc.url))
    .map((doc, ordem) => ({ doc, ordem, pontos: pontos(doc) }))
    .filter((item) => item.pontos < 9)
    .sort((a, b) => a.pontos - b.pontos || a.ordem - b.ordem)
    .slice(0, MAX_DOCUMENTOS)
    .map((item) => item.doc);
}

/** Lê o texto de cada página de um PDF. */
export const lerPdfComUnpdf: LeitorDePdf = async (bytes) => {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes);
  if (pdf.numPages > MAX_PAGINAS) throw new Error('muitas_paginas');
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
};

async function baixar(
  fetchImpl: typeof fetch,
  url: string,
): Promise<{ bytes: Uint8Array } | { erro: 'grande' | 'falhou' }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const resposta = await fetchImpl(url, {
      headers: { accept: 'application/pdf,*/*', 'user-agent': 'LiciteComigo/1.0' },
      signal: controller.signal,
    });
    if (!resposta.ok || !resposta.body) return { erro: 'falhou' };
    const declarado = Number(resposta.headers.get('content-length') ?? 0);
    if (declarado > MAX_BYTES) return { erro: 'grande' };
    const partes: Uint8Array[] = [];
    let total = 0;
    const leitor = resposta.body.getReader();
    for (let lido = await leitor.read(); !lido.done; lido = await leitor.read()) {
      total += lido.value.byteLength;
      if (total > MAX_BYTES) {
        await leitor.cancel();
        return { erro: 'grande' };
      }
      partes.push(lido.value);
    }
    const bytes = new Uint8Array(total);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.byteLength;
    }
    return { bytes };
  } catch {
    return { erro: 'falhou' };
  } finally {
    clearTimeout(timer);
  }
}

const ehPdf = (bytes: Uint8Array): boolean =>
  bytes.length > 4 &&
  bytes[0] === 0x25 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x44 &&
  bytes[3] === 0x46;

const nomeDe = (doc: DocumentoParaLer): string =>
  doc.nome?.trim() || doc.tipo?.trim() || 'Documento';

function limitar(paginas: string[]): string[] {
  let usado = 0;
  const saida: string[] = [];
  for (const pagina of paginas) {
    const restante = MAX_CARACTERES_POR_DOCUMENTO - usado;
    if (restante <= 0) break;
    const texto = pagina.length > restante ? pagina.slice(0, restante) : pagina;
    saida.push(texto);
    usado += texto.length;
  }
  return saida;
}

/** Baixa e lê os documentos escolhidos. Um por vez, para não pesar na memória. */
export async function lerDocumentos(
  documentos: readonly DocumentoParaLer[],
  {
    fetchImpl = fetch,
    lerPdf = lerPdfComUnpdf,
  }: { fetchImpl?: typeof fetch; lerPdf?: LeitorDePdf } = {},
): Promise<Guardado> {
  const lidos: DocumentoLido[] = [];
  const textos = new Map<string, string[]>();
  const paginasParaFatos: PaginaLida[] = [];

  for (const doc of documentos) {
    const chave = chaveDoDocumento(doc.url);
    const base = { chave, nome: nomeDe(doc), tipo: doc.tipo, url: doc.url };
    const baixado = await baixar(fetchImpl, doc.url);
    if ('erro' in baixado) {
      lidos.push({
        ...base,
        estado: baixado.erro === 'grande' ? 'grande' : 'falhou',
        paginas: 0,
        motivo: baixado.erro === 'grande' ? 'Arquivo muito grande.' : 'Não foi possível baixar.',
      });
      continue;
    }
    if (!ehPdf(baixado.bytes)) {
      lidos.push({ ...base, estado: 'formato', paginas: 0, motivo: 'Não é PDF.' });
      continue;
    }
    try {
      const paginas = limitar(await lerPdf(baixado.bytes));
      if (!paginas.some((pagina) => pagina.trim().length > 20)) {
        lidos.push({ ...base, estado: 'sem_texto', paginas: 0, motivo: 'PDF sem texto (imagem).' });
        continue;
      }
      textos.set(chave, paginas);
      paginas.forEach((texto, indice) =>
        paginasParaFatos.push({ documento: base.nome, pagina: indice + 1, texto }),
      );
      lidos.push({ ...base, estado: 'lido', paginas: paginas.length, motivo: null });
    } catch (error) {
      lidos.push({
        ...base,
        estado: error instanceof Error && error.message === 'muitas_paginas' ? 'grande' : 'falhou',
        paginas: 0,
        motivo:
          error instanceof Error && error.message === 'muitas_paginas'
            ? 'Documento muito longo.'
            : 'Não foi possível ler.',
      });
    }
  }

  const fatos = extrairFatos(paginasParaFatos);
  return {
    gerado_em: new Date().toISOString(),
    documentos: lidos,
    fatos,
    alertas: alertasDosFatos(fatos),
    textos,
    assinatura: assinaturaDe(documentos),
  };
}

type Entrada =
  | { estado: 'lendo'; assinatura: string; inicio: number }
  | { estado: 'pronta'; assinatura: string; em: number; leitura: Guardado }
  | { estado: 'erro'; assinatura: string; em: number };

/** Guarda as leituras em memória e evita ler o mesmo edital duas vezes ao mesmo tempo. */
export class CacheDeLeitura {
  private readonly entradas = new Map<string, Entrada>();
  private fila: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly ler: (documentos: readonly DocumentoParaLer[]) => Promise<Guardado>,
    private readonly agora: () => number = Date.now,
  ) {}

  consultar(
    editalId: string,
    documentos: readonly DocumentoParaLer[],
  ): { estado: 'lendo' } | { estado: 'erro' } | { estado: 'pronta'; leitura: Guardado } {
    const assinatura = assinaturaDe(documentos);
    const atual = this.entradas.get(editalId);
    if (atual && atual.assinatura === assinatura) {
      if (atual.estado === 'pronta' && this.agora() - atual.em < VALIDADE_MS)
        return { estado: 'pronta', leitura: atual.leitura };
      if (atual.estado === 'lendo') return { estado: 'lendo' };
      if (atual.estado === 'erro' && this.agora() - atual.em < ESPERA_APOS_ERRO_MS)
        return { estado: 'erro' };
    }
    this.entradas.set(editalId, { estado: 'lendo', assinatura, inicio: this.agora() });
    this.limpar();
    this.fila = this.fila
      .catch(() => undefined)
      .then(() => this.ler(documentos))
      .then((leitura) => {
        this.entradas.set(editalId, { estado: 'pronta', assinatura, em: this.agora(), leitura });
      })
      .catch(() => {
        this.entradas.set(editalId, { estado: 'erro', assinatura, em: this.agora() });
      });
    return { estado: 'lendo' };
  }

  /** Texto já lido de um edital (vazio se ainda não ficou pronto). */
  textoLido(editalId: string): string {
    const atual = this.entradas.get(editalId);
    if (atual?.estado !== 'pronta') return '';
    return [...atual.leitura.textos.values()].map((paginas) => paginas.join('\n')).join('\n\n');
  }

  paginas(editalId: string, chave: string): string[] | null {
    const atual = this.entradas.get(editalId);
    return atual?.estado === 'pronta' ? (atual.leitura.textos.get(chave) ?? null) : null;
  }

  private limpar(): void {
    while (this.entradas.size > MAX_NA_MEMORIA) {
      const mais_antiga = this.entradas.keys().next().value as string | undefined;
      if (mais_antiga === undefined) break;
      this.entradas.delete(mais_antiga);
    }
  }
}

/** Mesma memória usada pela rota de leitura e pela documentação técnica. */
export const leituras = new CacheDeLeitura((documentos) => lerDocumentos(documentos));

type Deps = {
  pool: Pool | undefined;
  cache?: CacheDeLeitura;
};

export function registerLeituraRoutes(
  app: FastifyInstance,
  { pool, cache = leituras }: Deps,
): void {
  const limiter = new PublicRateLimiter(60);

  async function documentosDoEdital(
    request: Parameters<typeof authContext>[0],
    id: string,
  ): Promise<{ fonte: string; documentos: DocumentoParaLer[] } | null> {
    return withTenant(pool!, authContext(request), async (client) => {
      const edital = (
        await client.query<{ fonte: string }>('SELECT fonte FROM editais WHERE id = $1', [id])
      ).rows[0];
      if (!edital) return null;
      const docs = await client.query<DocumentoParaLer>(
        `SELECT tipo, nome_arquivo AS nome, url FROM edital_documentos
          WHERE edital_id = $1 AND url IS NOT NULL ORDER BY created_at LIMIT 100`,
        [id],
      );
      return { fonte: edital.fonte, documentos: docs.rows };
    });
  }

  /** Leitura pronta (ou em andamento) dos documentos do edital. */
  app.get('/editais/:id/leitura', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    limiter.check(`leitura:${request.user.sub}`);
    if (!pool) return sendDatabaseUnavailable(reply);
    const carregado = await documentosDoEdital(request, id);
    if (!carregado) return reply.code(404).send({ error: 'edital_not_found' });

    const escolhidos = escolherParaLer(carregado.documentos);
    if (!escolhidos.length) {
      return reply.send({
        estado: 'pronta',
        documentos: [],
        fatos: [],
        alertas: [],
        gerado_em: new Date().toISOString(),
      });
    }
    const consulta = cache.consultar(id, escolhidos);
    if (consulta.estado === 'lendo') return reply.send({ estado: 'lendo' });
    if (consulta.estado === 'erro') return reply.send({ estado: 'erro' });
    const { textos: _textos, assinatura: _assinatura, ...leitura } = consulta.leitura;
    void _textos;
    void _assinatura;
    return reply.send({ estado: 'pronta', ...leitura });
  });

  /** Texto de um documento já lido, página por página. */
  app.get('/editais/:id/leitura/:chave', async (request, reply) => {
    const { id, chave } = z
      .object({ id: z.string().uuid(), chave: z.string().regex(/^[0-9a-f]{12}$/) })
      .parse(request.params);
    limiter.check(`leitura:${request.user.sub}`);
    if (!pool) return sendDatabaseUnavailable(reply);
    const carregado = await documentosDoEdital(request, id);
    if (!carregado) return reply.code(404).send({ error: 'edital_not_found' });
    const paginas = cache.paginas(id, chave);
    if (!paginas) return reply.code(404).send({ error: 'texto_indisponivel' });
    return reply.send({
      paginas: paginas.map((texto, indice) => ({ numero: indice + 1, texto })),
    });
  });
}
