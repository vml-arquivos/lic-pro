import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { createAsaasClient, type AsaasClient } from './asaas.js';
import type { RuntimeConfig } from './config.js';
import { buscarDetalhes } from './pncp-detalhes.js';
import { pncpDate } from './pncp-sync.js';
import { consultarPrecos } from './precos.js';
import { sendDatabaseUnavailable, withPlatform } from './request-context.js';

/**
 * Teste das integrações externas, para a equipe conferir na produção, com um clique, se cada
 * fonte responde. Só leitura: não grava nada e não cobra ninguém.
 */

type Deps = {
  pool: Pool | undefined;
  config: RuntimeConfig;
  asaas?: AsaasClient;
  fetchImpl?: typeof fetch;
};

export type TesteIntegracao = {
  id: 'pncp_lista' | 'pncp_detalhes' | 'compras_precos' | 'asaas' | 'email';
  nome: string;
  estado: 'ok' | 'falha' | 'nao_configurado' | 'sem_dados';
  detalhe: string;
  ms: number;
};

async function timed(
  id: TesteIntegracao['id'],
  nome: string,
  run: () => Promise<Pick<TesteIntegracao, 'estado' | 'detalhe'>>,
): Promise<TesteIntegracao> {
  const started = Date.now();
  try {
    const result = await run();
    return { id, nome, ...result, ms: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    return { id, nome, estado: 'falha', detalhe: message.slice(0, 240), ms: Date.now() - started };
  }
}

export function registerDiagnosticoRoutes(app: FastifyInstance, deps: Deps): void {
  const { pool, config } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;

  app.post('/admin/integracoes/testar', async (request, reply) => {
    if (request.user.role !== 'plataforma') return reply.code(403).send({ error: 'forbidden' });
    if (!pool) return sendDatabaseUnavailable(reply);

    const sample = await withPlatform(
      pool,
      request,
      'integracoes.testar',
      async (client) =>
        (
          await client.query<{ id_externo: string }>(
            `SELECT id_externo FROM editais WHERE fonte = 'pncp' AND id_externo ~ '^[0-9]{14}-1-[0-9]+/[0-9]{4}$'
            ORDER BY created_at DESC LIMIT 1`,
          )
        ).rows[0] ?? null,
    );

    const tests = await Promise.all([
      timed('pncp_lista', 'PNCP: lista de editais', async () => {
        const now = new Date();
        const query = new URLSearchParams({
          dataInicial: pncpDate(new Date(now.getTime() - 3 * 86_400_000)),
          dataFinal: pncpDate(now),
          codigoModalidadeContratacao: '6',
          pagina: '1',
          tamanhoPagina: '10',
        });
        const response = await fetchImpl(
          `${config.pncpBaseUrl}/v1/contratacoes/publicacao?${query}`,
          { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) },
        );
        if (!response.ok) throw new Error(`O PNCP respondeu com o código ${response.status}.`);
        const body = (await response.json()) as { data?: unknown[]; totalRegistros?: number };
        const total = body.totalRegistros ?? body.data?.length ?? 0;
        return {
          estado: 'ok',
          detalhe: `Respondeu. ${total} edital(is) de pregão nos últimos 3 dias.`,
        };
      }),
      timed('pncp_detalhes', 'PNCP: itens e documentos', async () => {
        if (!sample) {
          return {
            estado: 'sem_dados',
            detalhe: 'Ainda não há edital do PNCP no sistema para testar. Rode a coleta primeiro.',
          };
        }
        const found = await buscarDetalhes(config, sample.id_externo, fetchImpl);
        return {
          estado: 'ok',
          detalhe: `Edital ${sample.id_externo}: ${found.itens.length} item(ns) e ${found.documentos.length} documento(s).`,
        };
      }),
      timed('compras_precos', 'Compras.gov.br: preços', async () => {
        const result = await consultarPrecos(
          { config, fetchImpl },
          { catmat: '460789', meses: 12 },
        );
        const amostras = result.todas?.amostras ?? 0;
        return amostras > 0
          ? {
              estado: 'ok',
              detalhe: `Respondeu. ${amostras} preço(s) encontrado(s) para o CATMAT 460789.`,
            }
          : {
              estado: 'sem_dados',
              detalhe:
                'Respondeu, mas sem preços para o CATMAT 460789. Teste outro código em Preços de referência.',
            };
      }),
      timed('asaas', 'Asaas: cobrança', async () => {
        if (!config.billingEnabled && !deps.asaas) {
          return {
            estado: 'nao_configurado',
            detalhe: 'Faltam ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN no servidor.',
          };
        }
        const client = deps.asaas ?? createAsaasClient(config);
        if (!client.ping) return { estado: 'ok', detalhe: 'Configurado.' };
        await client.ping();
        return {
          estado: 'ok',
          detalhe: `Chave aceita (${config.asaasEnv === 'production' ? 'produção' : 'sandbox'}).`,
        };
      }),
      timed('email', 'E-mail', async () =>
        config.emailProvider === 'smtp'
          ? { estado: 'ok', detalhe: 'SMTP configurado (o envio não é testado aqui).' }
          : {
              estado: 'nao_configurado',
              detalhe: 'Sem SMTP. Convites e alertas só aparecem na tela, não chegam por e-mail.',
            },
      ),
    ]);
    return reply.send({ testado_em: new Date().toISOString(), testes: tests });
  });
}
