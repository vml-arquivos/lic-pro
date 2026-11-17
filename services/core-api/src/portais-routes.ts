import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  PORTAIS_CONHECIDOS,
  gerarDocumentacaoTecnica,
  infoDoPortal,
  portalDaLicitacao,
} from '@licitecomigo/shared';
import { z } from 'zod';
import { withTenant } from './db.js';
import { searchContext, scopedFilters } from './radar.js';
import { authContext, sendDatabaseUnavailable } from './request-context.js';
import { buildEditalSearchQuery } from './search.js';
import { leituras } from './leitura-edital.js';

type Deps = { pool: Pool | undefined };

export type PortalListado = {
  slug: string;
  nome: string;
  site: string | null;
  descricao: string | null;
  total: number;
  conhecido: boolean;
};

/**
 * Junta os nomes de portal que o PNCP informou (cada edital traz o seu) em um item por portal
 * e acrescenta os portais conhecidos que ainda não apareceram, com total zero.
 */
export function montarListaDePortais(
  linhas: readonly { valor: string; total: number }[],
): PortalListado[] {
  const porSlug = new Map<string, PortalListado>();
  for (const linha of linhas) {
    const portal = portalDaLicitacao({ usuario: linha.valor });
    if (!portal) continue;
    const info = infoDoPortal(portal.slug);
    const atual = porSlug.get(portal.slug);
    if (atual) {
      atual.total += linha.total;
      continue;
    }
    porSlug.set(portal.slug, {
      slug: portal.slug,
      nome: portal.nome,
      site: info?.site ?? null,
      descricao: info?.descricao ?? null,
      total: linha.total,
      conhecido: portal.conhecido,
    });
  }
  for (const info of PORTAIS_CONHECIDOS) {
    if (porSlug.has(info.slug)) continue;
    porSlug.set(info.slug, {
      slug: info.slug,
      nome: info.nome,
      site: info.site,
      descricao: info.descricao,
      total: 0,
      conhecido: true,
    });
  }
  return [...porSlug.values()].sort(
    (a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

export function registerPortaisRoutes(app: FastifyInstance, { pool }: Deps): void {
  /**
   * Portais de compras com a quantidade de editais de cada um. Aceita os mesmos filtros da busca
   * (menos o próprio filtro de portal), então a contagem acompanha o que a pessoa está vendo.
   */
  app.get('/portais', async (request, reply) => {
    if (!pool) return sendDatabaseUnavailable(reply);
    const resposta = await withTenant(pool, authContext(request), async (client) => {
      const bruto: Record<string, unknown> = { ...(request.query as Record<string, unknown>) };
      delete bruto.sistema_origem;
      delete bruto.portal;
      const filters = await scopedFilters(client, request, {
        ...bruto,
        facetas: true,
        page: 1,
        page_size: 1,
      });
      const busca = buildEditalSearchQuery(filters, await searchContext(client, request));
      const faceta = busca.facets.find((item) => item.campo === 'sistema_origem')!;
      const linhas = await client.query<{ valor: string; total: number }>(
        faceta.text,
        faceta.values,
      );
      const contagem = await client.query<{ total: number }>(busca.countText, busca.countValues);
      const portais = montarListaDePortais(linhas.rows);
      const comPortal = portais.reduce((soma, portal) => soma + portal.total, 0);
      const total = contagem.rows[0]?.total ?? 0;
      return { portais, total, sem_portal: Math.max(0, total - comPortal) };
    });
    return reply.send({
      ...resposta,
      fonte: {
        nome: 'PNCP — sistema de origem de cada contratação',
        observacao:
          'O PNCP reúne as contratações; a disputa acontece no portal de origem de cada uma.',
      },
    });
  });

  /** Documentação técnica automática: o que o licitante precisa reunir para participar. */
  app.get('/editais/:id/documentacao-tecnica', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (!pool) return sendDatabaseUnavailable(reply);
    const carregado = await withTenant(pool, authContext(request), async (client) => {
      const edital = (
        await client.query<{
          titulo: string;
          conteudo_texto: string | null;
          modalidade: string | null;
          modo_disputa: string | null;
          instrumento: string | null;
          srp: boolean | null;
          amparo_legal: string | null;
          valor_estimado: number | null;
          esfera: string | null;
          sistema_origem: string | null;
          portal_slug: string | null;
          url_origem: string | null;
        }>(
          `SELECT titulo, conteudo_texto, modalidade, modo_disputa, instrumento, srp, amparo_legal,
                  valor_estimado::float8 AS valor_estimado, esfera, sistema_origem, portal_slug,
                  url_origem
             FROM editais WHERE id = $1`,
          [id],
        )
      ).rows[0];
      if (!edital) return null;
      const itens = await client.query<{
        numero: string;
        descricao: string;
        quantidade: number | null;
        valor_unitario_estimado: number | null;
        catmat_catser: string | null;
        beneficio: string | null;
      }>(
        `SELECT numero, descricao, quantidade::float8 AS quantidade,
                valor_unitario_estimado::float8 AS valor_unitario_estimado, catmat_catser, beneficio
           FROM itens_edital WHERE edital_id = $1 ORDER BY numero LIMIT 300`,
        [id],
      );
      const documentos = await client.query<{
        tipo: string | null;
        nome_arquivo: string | null;
        url: string | null;
      }>(
        `SELECT tipo, nome_arquivo, url FROM edital_documentos
          WHERE edital_id = $1 ORDER BY created_at LIMIT 100`,
        [id],
      );
      return { edital, itens: itens.rows, documentos: documentos.rows };
    });
    if (!carregado) return reply.code(404).send({ error: 'edital_not_found' });

    const { edital } = carregado;
    const portal = portalDaLicitacao({
      usuario: edital.sistema_origem,
      link: edital.url_origem,
      objeto: edital.titulo,
    });
    const info = infoDoPortal(edital.portal_slug ?? portal?.slug ?? '');
    const documentacao = gerarDocumentacaoTecnica({
      titulo: edital.titulo,
      texto: [edital.conteudo_texto, leituras.textoLido(id)].filter(Boolean).join('\n\n') || null,
      modalidade: edital.modalidade,
      modo_disputa: edital.modo_disputa,
      instrumento: edital.instrumento,
      srp: edital.srp,
      amparo_legal: edital.amparo_legal,
      valor_estimado: edital.valor_estimado,
      esfera: edital.esfera,
      portal: portal?.nome ?? null,
      portal_site: info?.site ?? null,
      itens: carregado.itens,
      documentos: carregado.documentos,
    });
    return reply.send({
      documentacao,
      portal: portal
        ? { ...portal, site: info?.site ?? null, link_edital: edital.url_origem }
        : null,
      itens_coletados: carregado.itens.length,
      documentos_coletados: carregado.documentos.length,
    });
  });
}
