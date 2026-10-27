import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { RuntimeConfig } from './config.js';
import { withTenant } from './db.js';

/**
 * Coleta do PNCP (Portal Nacional de Contratações Públicas) dentro do core-api.
 *
 * Lê só as rotas públicas documentadas de consulta (`/v1/contratacoes/publicacao` e
 * `/v1/contratacoes/atualizacao`), página por página, e grava no catálogo da plataforma pela
 * função `coleta_gravar_editais` (migration 0022). Campo ausente na fonte fica nulo: nunca se
 * inventa valor, status ou data. Falha de rede ou da fonte não derruba o servidor: a rodada
 * termina como "parcial" ou "erro", fica registrada e a próxima tenta de novo.
 */

export const MODALIDADES_PNCP: Readonly<Record<number, string>> = {
  1: 'Leilão eletrônico',
  2: 'Diálogo competitivo',
  3: 'Concurso',
  4: 'Concorrência eletrônica',
  5: 'Concorrência presencial',
  6: 'Pregão eletrônico',
  7: 'Pregão presencial',
  8: 'Dispensa',
  9: 'Inexigibilidade',
  10: 'Manifestação de interesse',
  11: 'Pré-qualificação',
  12: 'Credenciamento',
  13: 'Leilão presencial',
};

const PAGE_SIZE = 50;
const LOCK_KEY = 'licite-comigo:pncp-sync';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export type PncpEdital = {
  id_externo: string;
  titulo: string;
  orgao: string | null;
  uf: string | null;
  uasg: string | null;
  modalidade: string | null;
  valor_estimado: string | null;
  data_publicacao: string | null;
  url_origem: string | null;
  hash_conteudo: string;
  conteudo_texto: string;
  sistema_origem: string | null;
  codigo_modalidade: number | null;
  codigo_modo_disputa: number | null;
  codigo_instrumento: string | null;
  instrumento: string | null;
  modo_disputa: string | null;
  situacao: string | null;
  esfera: string | null;
  poder: string | null;
  municipio_ibge: string | null;
  municipio_nome: string | null;
  srp: boolean | null;
  data_atualizacao: string | null;
  data_abertura_proposta: string | null;
  data_encerramento_proposta: string | null;
  valor_homologado: string | null;
  estado_completude: string | null;
  orgao_cnpj: string | null;
  numero_compra: string | null;
  processo: string | null;
  amparo_legal: string | null;
  informacao_complementar: string | null;
};

type Json = Record<string, unknown>;

const ESFERAS: Record<string, string> = {
  F: 'Federal',
  E: 'Estadual',
  M: 'Municipal',
  D: 'Distrital',
};
const PODERES: Record<string, string> = { E: 'Executivo', L: 'Legislativo', J: 'Judiciário' };

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function text(value: unknown): string | null {
  if (value === null || value === undefined || typeof value === 'object') return null;
  const result = String(value).trim();
  return result || null;
}

function first(source: Json, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function integer(value: unknown): number | null {
  if (value === undefined || value === null || value === '' || typeof value === 'boolean') {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function decimal(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

/** Data/hora ISO. O PNCP envia sem fuso; fica como horário de Brasília (UTC-3). */
function timestamp(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const date = new Date(hasZone ? raw : `${raw}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 't', '1', 'sim'].includes(normalized)) return true;
    if (['false', 'f', '0', 'nao', 'não'].includes(normalized)) return false;
  }
  return null;
}

function digits(value: unknown): string | null {
  const raw = text(value);
  const only = raw ? raw.replace(/\D/g, '') : '';
  return only || null;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

/** Converte um registro do PNCP para o formato do catálogo. `null` quando faltam id ou objeto. */
export function normalizePncp(raw: unknown): PncpEdital | null {
  if (!isObject(raw)) return null;
  const orgaoEntidade = isObject(raw.orgaoEntidade) ? raw.orgaoEntidade : {};
  const unidade = isObject(raw.unidadeOrgao) ? raw.unidadeOrgao : {};
  const idExterno = text(raw.numeroControlePNCP);
  const titulo = text(raw.objetoCompra);
  if (!idExterno || !titulo) return null;

  const amparo = raw.amparoLegal;
  const amparoLegal = isObject(amparo) ? text(first(amparo, 'nome', 'descricao')) : text(amparo);
  const orgao = text(orgaoEntidade.razaoSocial);
  const modalidade = text(raw.modalidadeNome);
  const instrumento = text(
    first(
      raw,
      'tipoInstrumentoConvocatorioNome',
      'instrumentoConvocatorioNome',
      'tipoInstrumentoNome',
    ),
  );
  const situacao = text(first(raw, 'situacaoCompraNome', 'situacaoNome', 'situacao'));
  const informacao = text(raw.informacaoComplementar);
  const conteudo = [
    titulo,
    informacao,
    modalidade,
    instrumento,
    situacao,
    orgao,
    text(unidade.nomeUnidade),
    text(unidade.municipioNome),
  ]
    .filter(Boolean)
    .join('\n');

  const esferaId = text(first(raw, 'esferaId') ?? orgaoEntidade.esferaId)?.toUpperCase();
  const poderId = text(first(raw, 'poderId') ?? orgaoEntidade.poderId)?.toUpperCase();

  return {
    id_externo: idExterno,
    titulo,
    orgao,
    uf: text(unidade.ufSigla),
    uasg: text(unidade.codigoUnidade),
    modalidade,
    valor_estimado: decimal(raw.valorTotalEstimado),
    data_publicacao: timestamp(raw.dataPublicacaoPncp),
    url_origem: text(raw.linkSistemaOrigem),
    hash_conteudo: createHash('sha256')
      .update(JSON.stringify(sortKeys(raw)))
      .digest('hex'),
    conteudo_texto: conteudo,
    sistema_origem: text(first(raw, 'sistemaOrigemNome', 'sistemaOrigem')),
    codigo_modalidade: integer(first(raw, 'modalidadeId', 'codigoModalidadeContratacao')),
    codigo_modo_disputa: integer(first(raw, 'modoDisputaId', 'codigoModoDisputa')),
    codigo_instrumento: text(
      first(
        raw,
        'tipoInstrumentoConvocatorioCodigo',
        'tipoInstrumentoConvocatorioId',
        'codigoInstrumento',
      ),
    ),
    instrumento,
    modo_disputa: text(first(raw, 'modoDisputaNome', 'modoDisputa')),
    situacao,
    esfera:
      text(first(raw, 'esferaNome', 'esfera') ?? first(orgaoEntidade, 'esferaNome', 'esfera')) ??
      (esferaId ? (ESFERAS[esferaId] ?? null) : null),
    poder:
      text(first(raw, 'poderNome', 'poder') ?? first(orgaoEntidade, 'poderNome', 'poder')) ??
      (poderId ? (PODERES[poderId] ?? null) : null),
    municipio_ibge: text(
      first(unidade, 'codigoIbge', 'codigoMunicipioIbge', 'municipioIbge') ??
        first(raw, 'codigoMunicipioIbge', 'municipioIbge'),
    ),
    municipio_nome: text(first(unidade, 'municipioNome') ?? first(raw, 'municipioNome')),
    srp: bool(first(raw, 'srp', 'registroPreco', 'registroPrecos')),
    data_atualizacao: timestamp(
      first(raw, 'dataAtualizacao', 'dataAtualizacaoPncp', 'dataAtualizacaoGlobal'),
    ),
    data_abertura_proposta: timestamp(
      first(raw, 'dataAberturaProposta', 'dataAberturaPropostas', 'dataInicioProposta'),
    ),
    data_encerramento_proposta: timestamp(
      first(raw, 'dataEncerramentoProposta', 'dataEncerramentoPropostas', 'dataFimProposta'),
    ),
    valor_homologado: decimal(first(raw, 'valorTotalHomologado', 'valorHomologado')),
    estado_completude: text(first(raw, 'estadoCompletude', 'statusCompletude', 'completude')),
    orgao_cnpj: digits(orgaoEntidade.cnpj),
    numero_compra: text(raw.numeroCompra),
    processo: text(raw.processo),
    amparo_legal: amparoLegal,
    informacao_complementar: informacao,
  };
}

export type SyncStatus = 'ok' | 'parcial' | 'erro';

export type PncpSyncResult = {
  skipped: boolean;
  status: SyncStatus | 'sem_catalogo';
  janela_inicio: string;
  janela_fim: string;
  modalidades: number[];
  paginas: number;
  lidos: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  erros: number;
  ultimo_erro: string | null;
};

export type PncpSyncDeps = {
  pool: Pool;
  config: RuntimeConfig;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Pausa entre chamadas à fonte (padrão 300 ms) para não sobrecarregar o PNCP. */
  pauseMs?: number;
  /** Conta da plataforma que recebe o catálogo (padrão: a configurada ou a primeira). */
  tenantId?: string;
};

export type PncpSyncOptions = {
  origem: 'agendada' | 'manual';
  dias?: number;
  modalidades?: number[];
  maxPaginas?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** AAAAMMDD no fuso de Brasília. */
export function pncpDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts.replace(/-/g, '');
}

const isoDay = (compact: string) =>
  `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;

class SourceError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
  }
}

async function getJson(
  fetchImpl: typeof fetch,
  url: string,
  sleep: (ms: number) => Promise<void>,
): Promise<Json> {
  const retries = 3;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': 'LiciteComigo/1.0 (coleta PNCP)' },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 204) return {};
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after'));
        throw new SourceError(
          `PNCP respondeu HTTP ${response.status}`,
          response.status,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
        );
      }
      const body: unknown = await response.json();
      if (!isObject(body))
        throw new SourceError('PNCP devolveu um corpo que não é objeto JSON', null);
      return body;
    } catch (error) {
      const sourceError =
        error instanceof SourceError
          ? error
          : new SourceError(
              `falha ao falar com o PNCP (${error instanceof Error ? error.message : 'erro'})`,
              null,
            );
      const retryable =
        sourceError.status === null || [429, 500, 502, 503, 504].includes(sourceError.status);
      if (!retryable || attempt >= retries) throw sourceError;
      await sleep(sourceError.retryAfterMs ?? 1000 * 2 ** attempt);
    }
  }
}

/**
 * Uma rodada de coleta. Segura contra duas execuções ao mesmo tempo (trava no banco) e contra
 * ausência da conta da plataforma (sem ela não há onde gravar o catálogo).
 */
export async function runPncpSync(
  deps: PncpSyncDeps,
  options: PncpSyncOptions,
): Promise<PncpSyncResult> {
  const { pool, config } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const pause = deps.pauseMs ?? 300;
  const now = (deps.now ?? (() => new Date()))();
  const dias = Math.min(30, Math.max(1, options.dias ?? config.pncpSyncDays));
  const modalidades = options.modalidades?.length
    ? options.modalidades
    : config.pncpSyncModalidades;
  const maxPaginas = Math.min(200, Math.max(1, options.maxPaginas ?? config.pncpSyncMaxPages));
  const fim = pncpDate(now);
  const inicio = pncpDate(new Date(now.getTime() - (dias - 1) * 86_400_000));

  const result: PncpSyncResult = {
    skipped: false,
    status: 'ok',
    janela_inicio: isoDay(inicio),
    janela_fim: isoDay(fim),
    modalidades,
    paginas: 0,
    lidos: 0,
    inseridos: 0,
    atualizados: 0,
    ignorados: 0,
    erros: 0,
    ultimo_erro: null,
  };

  const lock = await pool.connect();
  let runId: string | null = null;
  try {
    const locked = await lock.query<{ ok: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok',
      [LOCK_KEY],
    );
    if (!locked.rows[0]?.ok) return { ...result, skipped: true };

    const wanted = deps.tenantId ?? config.pncpSyncTenantId ?? null;
    const catalogo = await pool.query<{ id: string }>(
      `SELECT id FROM plataforma_tenants WHERE ($1::uuid IS NULL OR id = $1::uuid)
        ORDER BY created_at, id LIMIT 1`,
      [wanted],
    );
    const tenantId = catalogo.rows[0]?.id;
    if (!tenantId) {
      return {
        ...result,
        status: 'sem_catalogo',
        ultimo_erro:
          'Nenhuma conta da plataforma cadastrada: crie a conta de Administração primeiro.',
      };
    }

    const started = await pool.query<{ id: string }>(
      `INSERT INTO coleta_pncp_execucoes (origem, janela_inicio, janela_fim, modalidades)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [options.origem, result.janela_inicio, result.janela_fim, modalidades],
    );
    runId = started.rows[0]?.id ?? null;

    const fail = (error: unknown, scope: string) => {
      result.erros += 1;
      result.ultimo_erro =
        `${scope}: ${error instanceof Error ? error.message : 'erro desconhecido'}`.slice(0, 500);
    };

    for (const feed of ['publicacao', 'atualizacao'] as const) {
      for (const modalidade of modalidades) {
        for (let pagina = 1; pagina <= maxPaginas; pagina += 1) {
          const query = new URLSearchParams({
            dataInicial: inicio,
            dataFinal: fim,
            codigoModalidadeContratacao: String(modalidade),
            pagina: String(pagina),
            tamanhoPagina: String(PAGE_SIZE),
          });
          let body: Json;
          try {
            body = await getJson(
              fetchImpl,
              `${config.pncpBaseUrl}/v1/contratacoes/${feed}?${query}`,
              sleep,
            );
          } catch (error) {
            fail(error, `${feed} modalidade ${modalidade} página ${pagina}`);
            break;
          }
          result.paginas += 1;
          const rows = Array.isArray(body.data) ? body.data : [];
          const normalized = new Map<string, PncpEdital>();
          for (const row of rows) {
            const item = normalizePncp(row);
            if (item) normalized.set(item.id_externo, item);
            else result.ignorados += 1;
          }
          result.lidos += rows.length;
          if (normalized.size) {
            try {
              const saved = await withTenant(
                pool,
                { tenantId, userId: NIL_UUID },
                async (client) => {
                  const written = await client.query<{ inseridos: number; atualizados: number }>(
                    'SELECT inseridos, atualizados FROM coleta_gravar_editais($1::jsonb)',
                    [JSON.stringify([...normalized.values()])],
                  );
                  return written.rows[0] ?? { inseridos: 0, atualizados: 0 };
                },
              );
              result.inseridos += saved.inseridos;
              result.atualizados += saved.atualizados;
            } catch (error) {
              fail(error, `gravação (${feed}, modalidade ${modalidade}, página ${pagina})`);
              break;
            }
          }
          const totalPaginas = Number(body.totalPaginas ?? 0);
          const restantes = Number(body.paginasRestantes ?? 0);
          if (!rows.length || (restantes <= 0 && (!totalPaginas || pagina >= totalPaginas))) break;
          await sleep(pause);
        }
        await sleep(pause);
      }
    }

    result.status =
      result.erros === 0 ? 'ok' : result.paginas > 0 && result.lidos > 0 ? 'parcial' : 'erro';
    return result;
  } catch (error) {
    result.erros += 1;
    result.status = 'erro';
    result.ultimo_erro = (error instanceof Error ? error.message : 'erro desconhecido').slice(
      0,
      500,
    );
    return result;
  } finally {
    try {
      if (runId) {
        await pool.query(
          `UPDATE coleta_pncp_execucoes
              SET finalizado_em = now(), status = $2, paginas = $3, lidos = $4, inseridos = $5,
                  atualizados = $6, ignorados = $7, erros = $8, ultimo_erro = $9
            WHERE id = $1`,
          [
            runId,
            result.status === 'sem_catalogo' ? 'erro' : result.status,
            result.paginas,
            result.lidos,
            result.inseridos,
            result.atualizados,
            result.ignorados,
            result.erros,
            result.ultimo_erro,
          ],
        );
      }
      await lock.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK_KEY]);
    } finally {
      lock.release();
    }
  }
}

/** Agenda a coleta. A primeira rodada sai 1 minuto depois do início; depois, no intervalo. */
export function startPncpSync(deps: PncpSyncDeps, log: (message: string) => void): () => void {
  let running = false;
  const tick = (): void => {
    if (running) return;
    running = true;
    runPncpSync(deps, { origem: 'agendada' })
      .then((result) => {
        if (!result.skipped) {
          log(
            `coleta pncp: ${result.status} — ${result.lidos} lidos, ${result.inseridos} novos, ${result.atualizados} atualizados, ${result.erros} erro(s)${result.ultimo_erro ? ` (${result.ultimo_erro})` : ''}`,
          );
        }
      })
      .catch((error: unknown) =>
        log(`coleta pncp: falha na rodada (${error instanceof Error ? error.message : 'erro'})`),
      )
      .finally(() => {
        running = false;
      });
  };
  const first = setTimeout(tick, 60_000);
  const timer = setInterval(tick, deps.config.pncpSyncIntervalMinutes * 60_000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
