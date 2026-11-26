import type { Pool } from 'pg';
import type { RuntimeConfig } from './config.js';
import { temCamposPncp } from './colunas-opcionais.js';
import { withTenant } from './db.js';

/**
 * Enriquecimento dos editais do PNCP com campos que a coleta principal não traz: fonte
 * orçamentária, emenda parlamentar, normativo base, critério de julgamento, orçamento sigiloso
 * e NF-e. Lê a busca pública do PNCP (a mesma do portal), poucas páginas por vez, e grava só
 * nos editais que já estão no catálogo. Campo que o PNCP não informa fica nulo.
 */

export type CamposPncp = {
  id_externo: string;
  fonte_orcamentaria: string | null;
  emenda_parlamentar: boolean | null;
  normativo_base: string | null;
  criterio_julgamento: string | null;
  orcamento_sigiloso: boolean | null;
  possui_nfe: boolean | null;
};

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const LOCK_KEY = 'licite-comigo:pncp-enriquecimento';
const POR_PAGINA = 100;
/** Editais do catálogo ainda sem os campos, buscados um a um pelo número do PNCP a cada rodada. */
const PENDENTES_POR_RODADA = 30;
const STATUS_DA_BUSCA = ['recebendo_proposta', 'propostas_encerradas'] as const;

const texto = (valor: unknown): string | null => {
  if (Array.isArray(valor)) {
    const itens = valor.map(texto).filter((item): item is string => Boolean(item));
    return itens.length ? itens.join(', ') : null;
  }
  if (typeof valor === 'string' && valor.trim()) return valor.trim();
  if (typeof valor === 'number') return String(valor);
  return null;
};

const booleano = (valor: unknown): boolean | null => {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'string') {
    const t = valor.trim().toLowerCase();
    if (['true', 's', 'sim', '1'].includes(t)) return true;
    if (['false', 'n', 'nao', 'não', '0'].includes(t)) return false;
  }
  return null;
};

/** Item da busca pública (`tipos_documento=edital`) → campos para gravar. Sem número, descarta. */
export function camposDoItem(bruto: unknown): CamposPncp | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const linha = bruto as Record<string, unknown>;
  const candidatos = [linha.numero_controle_pncp, linha.numero_contratacao];
  const id = candidatos
    .map(texto)
    .find((valor): valor is string => Boolean(valor && /^\d{14}-\d+-\d+\/\d{4}$/.test(valor)));
  if (!id) return null;
  return {
    id_externo: id,
    fonte_orcamentaria: texto(linha.fonte_orcamentaria_nome),
    emenda_parlamentar: booleano(linha.possui_emenda_parlamentar),
    normativo_base: texto(linha.normativo_base_nome),
    criterio_julgamento: texto(linha.criterio_julgamento_nome),
    orcamento_sigiloso: booleano(linha.indicador_orcamento_sigiloso),
    possui_nfe: booleano(linha.possui_nfe),
  };
}

/**
 * Busca pública do PNCP. O campo `status` é obrigatório (sem ele o PNCP responde 400):
 * `recebendo_proposta`, `propostas_encerradas`, `encerradas` ou `todos`.
 */
export function urlDaBuscaDeEditais(
  config: Pick<RuntimeConfig, 'pncpBaseUrl'>,
  opcoes: { pagina: number; status: string; q?: string; porPagina?: number },
): string {
  const parametros = new URLSearchParams({
    tipos_documento: 'edital',
    ordenacao: '-data',
    pagina: String(opcoes.pagina),
    tam_pagina: String(opcoes.porPagina ?? POR_PAGINA),
    status: opcoes.status,
  });
  if (opcoes.q) parametros.set('q', opcoes.q);
  return `${new URL(config.pncpBaseUrl).origin}/api/search/?${parametros.toString()}`;
}

export type ResultadoDoEnriquecimento = {
  skipped: boolean;
  paginas: number;
  lidos: number;
  gravados: number;
  erros: number;
};

type Deps = {
  pool: Pool;
  config: RuntimeConfig;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  tenantId?: string;
};

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Uma rodada: páginas de editais recebendo propostas e em julgamento, depois os pendentes um a um. */
export async function enriquecerEditais(
  deps: Deps,
  opcoes: { paginas?: number } = {},
): Promise<ResultadoDoEnriquecimento> {
  const { pool, config } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const esperar = deps.sleep ?? dormir;
  const maximo = Math.min(40, Math.max(1, opcoes.paginas ?? config.pncpEnrichPages));
  const resultado: ResultadoDoEnriquecimento = {
    skipped: false,
    paginas: 0,
    lidos: 0,
    gravados: 0,
    erros: 0,
  };
  const trava = await pool.connect();
  try {
    const travou = await trava.query<{ ok: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok',
      [LOCK_KEY],
    );
    if (!travou.rows[0]?.ok) return { ...resultado, skipped: true };
    const catalogo = await pool.query<{ id: string }>(
      `SELECT id FROM plataforma_tenants WHERE ($1::uuid IS NULL OR id = $1::uuid)
        ORDER BY created_at, id LIMIT 1`,
      [deps.tenantId ?? config.pncpSyncTenantId ?? null],
    );
    const tenantId = catalogo.rows[0]?.id;
    if (!tenantId) return { ...resultado, skipped: true };
    // Migration 0039 ainda não rodou: não há onde gravar, então a rodada é pulada sem erro.
    if (!(await temCamposPncp(trava))) return { ...resultado, skipped: true };

    for (const status of STATUS_DA_BUSCA) {
      for (let pagina = 1; pagina <= maximo; pagina += 1) {
        let corpo: { items?: unknown } | null = null;
        try {
          const controle = new AbortController();
          const relogio = setTimeout(() => controle.abort(), 20_000);
          try {
            const resposta = await fetchImpl(urlDaBuscaDeEditais(config, { pagina, status }), {
              headers: { accept: 'application/json', 'user-agent': 'LiciteComigo/1.0' },
              signal: controle.signal,
            });
            if (!resposta.ok) throw new Error(`status_${resposta.status}`);
            corpo = (await resposta.json()) as { items?: unknown };
          } finally {
            clearTimeout(relogio);
          }
        } catch {
          resultado.erros += 1;
          break;
        }
        resultado.paginas += 1;
        const itens = Array.isArray(corpo?.items) ? corpo!.items : [];
        const campos = new Map<string, CamposPncp>();
        for (const item of itens) {
          const dados = camposDoItem(item);
          if (dados) campos.set(dados.id_externo, dados);
        }
        resultado.lidos += itens.length;
        if (campos.size) {
          try {
            const gravados = await withTenant(
              pool,
              { tenantId, userId: NIL_UUID },
              async (client) => {
                const feito = await client.query<{ total: number }>(
                  'SELECT coleta_enriquecer_editais($1::jsonb) AS total',
                  [JSON.stringify([...campos.values()])],
                );
                return feito.rows[0]?.total ?? 0;
              },
            );
            resultado.gravados += gravados;
          } catch {
            resultado.erros += 1;
            break;
          }
        }
        if (itens.length < POR_PAGINA) break;
        await esperar(400);
      }
    }
    await enriquecerPendentes({ ...deps, fetchImpl, sleep: esperar }, tenantId, resultado);
    return resultado;
  } finally {
    await trava
      .query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK_KEY])
      .catch(() => undefined);
    trava.release();
  }
}

/** Busca um edital pelo número do PNCP e devolve os campos; `null` quando a busca não o encontra. */
async function buscarPorNumero(
  deps: Required<Pick<Deps, 'config'>> & { fetchImpl: typeof fetch },
  id: string,
): Promise<CamposPncp | null> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 20_000);
  try {
    const resposta = await deps.fetchImpl(
      urlDaBuscaDeEditais(deps.config, { pagina: 1, status: 'todos', q: id, porPagina: 5 }),
      {
        headers: { accept: 'application/json', 'user-agent': 'LiciteComigo/1.0' },
        signal: controle.signal,
      },
    );
    if (!resposta.ok) throw new Error(`status_${resposta.status}`);
    const corpo = (await resposta.json()) as { items?: unknown };
    const itens = Array.isArray(corpo.items) ? corpo.items : [];
    for (const item of itens) {
      const dados = camposDoItem(item);
      if (dados?.id_externo === id) return dados;
    }
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Os mais recentes do catálogo que ainda não receberam os campos são buscados pelo número.
 * O que o PNCP não devolve é marcado como tentado (campos nulos) para não travar a fila.
 */
async function enriquecerPendentes(
  deps: Deps & { fetchImpl: typeof fetch; sleep: (ms: number) => Promise<void> },
  tenantId: string,
  resultado: ResultadoDoEnriquecimento,
): Promise<void> {
  const { pool, config } = deps;
  let pendentes: string[];
  try {
    pendentes = await withTenant(pool, { tenantId, userId: NIL_UUID }, async (client) => {
      const lista = await client.query<{ id_externo: string }>(
        `SELECT id_externo FROM editais
          WHERE tenant_id = $1 AND fonte = 'pncp' AND enriquecido_em IS NULL
            AND id_externo ~ '^[0-9]{14}-[0-9]+-[0-9]+/[0-9]{4}$'
          ORDER BY data_publicacao DESC NULLS LAST
          LIMIT $2`,
        [tenantId, PENDENTES_POR_RODADA],
      );
      return lista.rows.map((linha) => linha.id_externo);
    });
  } catch {
    resultado.erros += 1;
    return;
  }
  const campos: CamposPncp[] = [];
  for (const id of pendentes) {
    try {
      const dados = await buscarPorNumero({ config, fetchImpl: deps.fetchImpl }, id);
      campos.push(
        dados ?? {
          id_externo: id,
          fonte_orcamentaria: null,
          emenda_parlamentar: null,
          normativo_base: null,
          criterio_julgamento: null,
          orcamento_sigiloso: null,
          possui_nfe: null,
        },
      );
    } catch {
      resultado.erros += 1;
      break;
    }
    resultado.lidos += 1;
    await deps.sleep(400);
  }
  if (!campos.length) return;
  try {
    const gravados = await withTenant(pool, { tenantId, userId: NIL_UUID }, async (client) => {
      const feito = await client.query<{ total: number }>(
        'SELECT coleta_enriquecer_editais($1::jsonb) AS total',
        [JSON.stringify(campos)],
      );
      return feito.rows[0]?.total ?? 0;
    });
    resultado.gravados += gravados;
  } catch {
    resultado.erros += 1;
  }
}

/** Agenda a rotina: roda pouco tempo depois da subida e depois a cada intervalo. */
export function startEnriquecimento(deps: Deps, log: (mensagem: string) => void): () => void {
  const { config } = deps;
  let rodando = false;
  const tick = (): void => {
    if (rodando) return;
    rodando = true;
    enriquecerEditais(deps)
      .then((r) => {
        if (!r.skipped && (r.gravados > 0 || r.erros > 0)) {
          log(
            `enriquecimento pncp: ${r.lidos} lidos, ${r.gravados} editais atualizados, ${r.erros} erro(s)`,
          );
        }
      })
      .catch((erro: unknown) =>
        log(`enriquecimento pncp: falha (${erro instanceof Error ? erro.message : 'erro'})`),
      )
      .finally(() => {
        rodando = false;
      });
  };
  const primeira = setTimeout(tick, 3 * 60_000);
  const relogio = setInterval(tick, config.pncpEnrichMinutes * 60_000);
  primeira.unref();
  relogio.unref();
  return () => {
    clearTimeout(primeira);
    clearInterval(relogio);
  };
}
