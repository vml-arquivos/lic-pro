import { cepValido, cnpjValido, somenteDigitos } from '@licitecomigo/shared';
import type { DadosCep, DadosCnpj } from '@licitecomigo/shared';
import type { FastifyInstance } from 'fastify';

/**
 * Consulta de CNPJ e CEP em fontes públicas (BrasilAPI, com ViaCEP / CNPJ.ws de reserva).
 *
 * A consulta é feita pelo servidor, nunca pelo navegador: o navegador não fica preso a limites
 * de CORS, a resposta é validada e normalizada num formato só, o resultado fica em cache e dá
 * para trocar de fonte sem mexer nas telas. Se as fontes estiverem fora do ar, a tela avisa e a
 * pessoa preenche à mão — nada trava.
 */

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export type LookupOptions = {
  fetchImpl?: FetchLike;
  /** Tempo máximo por fonte. */
  timeoutMs?: number;
};

export type LookupResult<T> =
  | { ok: true; data: T; fonte: string; cache: boolean }
  | { ok: false; erro: 'invalido' | 'nao_encontrado' | 'indisponivel'; mensagem: string };

const OK_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE = 500;

type CacheEntry = { at: number; ttl: number; value: LookupResult<unknown> };
const cache = new Map<string, CacheEntry>();

function fromCache<T>(key: string): LookupResult<T> | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return null;
  }
  const value = hit.value as LookupResult<T>;
  return value.ok ? { ...value, cache: true } : value;
}

function toCache(key: string, value: LookupResult<unknown>): void {
  // Só guarda acerto e "não existe"; falha de rede nunca fica guardada.
  if (!value.ok && value.erro === 'indisponivel') return;
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), ttl: value.ok ? OK_TTL_MS : MISS_TTL_MS, value });
}

export function limparCacheDeConsultas(): void {
  cache.clear();
}

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out ? out : null;
};

function titulo(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  // A Receita devolve tudo em maiúsculas; deixa legível sem mexer em siglas curtas.
  const small = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) =>
      small.has(word.toUpperCase()) && index > 0
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

function porteDe(raw: unknown, mei: unknown): DadosCnpj['porte'] {
  if (mei === true) return 'mei';
  const value = (text(raw) ?? '').toUpperCase();
  if (value.includes('MICRO')) return 'micro';
  if (value.includes('PEQUENO')) return 'pequena';
  if (value.includes('DEMAIS')) return 'media';
  if (value.includes('GRANDE')) return 'grande';
  return null;
}

function dataIso(value: unknown): string | null {
  const raw = text(value);
  return raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

function telefone(ddd: unknown, numero: unknown): string | null {
  const joined = somenteDigitos(`${text(ddd) ?? ''}${text(numero) ?? ''}`);
  return joined.length >= 10 ? joined : null;
}

type Json = Record<string, unknown>;

export function mapearBrasilApiCnpj(cnpj: string, json: Json): DadosCnpj | null {
  const razao = text(json.razao_social);
  if (!razao) return null;
  const situacao = titulo(json.descricao_situacao_cadastral);
  const rua = titulo(
    [text(json.descricao_tipo_de_logradouro), text(json.logradouro)].filter(Boolean).join(' '),
  );
  const cep = somenteDigitos(text(json.cep));
  return {
    cnpj,
    razao_social: razao,
    nome_fantasia: titulo(json.nome_fantasia),
    porte: porteDe(json.porte, json.opcao_pelo_mei),
    situacao,
    ativa: (situacao ?? 'Ativa').toLowerCase() === 'ativa',
    data_abertura: dataIso(json.data_inicio_atividade),
    natureza_juridica: titulo(json.natureza_juridica),
    cnae_principal: text(json.cnae_fiscal),
    cnae_descricao: titulo(json.cnae_fiscal_descricao),
    cep: cep.length === 8 ? cep : null,
    logradouro: rua,
    numero: text(json.numero),
    complemento: titulo(json.complemento),
    bairro: titulo(json.bairro),
    cidade: titulo(json.municipio),
    uf: text(json.uf)?.toUpperCase().slice(0, 2) ?? null,
    telefone: telefone(null, json.ddd_telefone_1),
    email: text(json.email)?.toLowerCase() ?? null,
  };
}

export function mapearCnpjWs(cnpj: string, json: Json): DadosCnpj | null {
  const razao = text(json.razao_social);
  const est = (json.estabelecimento ?? {}) as Json;
  if (!razao) return null;
  const situacao = titulo(est.situacao_cadastral);
  const rua = titulo([text(est.tipo_logradouro), text(est.logradouro)].filter(Boolean).join(' '));
  const cep = somenteDigitos(text(est.cep));
  const atividade = (est.atividade_principal ?? {}) as Json;
  const cidade = (est.cidade ?? {}) as Json;
  const estado = (est.estado ?? {}) as Json;
  const porte = (json.porte ?? {}) as Json;
  const natureza = (json.natureza_juridica ?? {}) as Json;
  return {
    cnpj,
    razao_social: razao,
    nome_fantasia: titulo(est.nome_fantasia),
    porte: porteDe(porte.descricao, false),
    situacao,
    ativa: (situacao ?? 'Ativa').toLowerCase() === 'ativa',
    data_abertura: dataIso(est.data_inicio_atividade),
    natureza_juridica: titulo(natureza.descricao),
    cnae_principal: text(atividade.subclasse)?.replace(/\D/g, '') ?? null,
    cnae_descricao: titulo(atividade.descricao),
    cep: cep.length === 8 ? cep : null,
    logradouro: rua,
    numero: text(est.numero),
    complemento: titulo(est.complemento),
    bairro: titulo(est.bairro),
    cidade: titulo(cidade.nome),
    uf: text(estado.sigla)?.toUpperCase().slice(0, 2) ?? null,
    telefone: telefone(est.ddd1, est.telefone1),
    email: text(est.email)?.toLowerCase() ?? null,
  };
}

async function getJson(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<{ status: number; json: Json | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (response.status === 404 || response.status === 400) return { status: 404, json: null };
    if (!response.ok) throw new Error(`status ${response.status}`);
    const json = (await response.json()) as unknown;
    return {
      status: 200,
      json: json && typeof json === 'object' ? (json as Json) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

const SEM_FONTE =
  'Não consegui consultar agora. Preencha manualmente — você pode tentar de novo depois.';

export async function consultarCnpj(
  entrada: string,
  options: LookupOptions = {},
): Promise<LookupResult<DadosCnpj>> {
  const cnpj = somenteDigitos(entrada);
  if (!cnpjValido(cnpj)) {
    return { ok: false, erro: 'invalido', mensagem: 'CNPJ inválido. Confira os números.' };
  }
  const key = `cnpj:${cnpj}`;
  const cached = fromCache<DadosCnpj>(key);
  if (cached) return cached;

  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? 6000;
  const fontes: Array<{
    nome: string;
    url: string;
    map: (cnpj: string, json: Json) => DadosCnpj | null;
  }> = [
    {
      nome: 'brasilapi',
      url: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      map: mapearBrasilApiCnpj,
    },
    { nome: 'cnpj.ws', url: `https://publica.cnpj.ws/cnpj/${cnpj}`, map: mapearCnpjWs },
  ];
  let naoEncontrado = 0;
  for (const fonte of fontes) {
    try {
      const { status, json } = await getJson(fetchImpl, fonte.url, timeoutMs);
      if (status === 404 || !json) {
        naoEncontrado += 1;
        continue;
      }
      const data = fonte.map(cnpj, json);
      if (!data) {
        naoEncontrado += 1;
        continue;
      }
      const result: LookupResult<DadosCnpj> = { ok: true, data, fonte: fonte.nome, cache: false };
      toCache(key, result);
      return result;
    } catch {
      // tenta a próxima fonte
    }
  }
  const result: LookupResult<DadosCnpj> =
    naoEncontrado === fontes.length
      ? {
          ok: false,
          erro: 'nao_encontrado',
          mensagem: 'CNPJ válido, mas não encontrado na Receita. Preencha manualmente.',
        }
      : { ok: false, erro: 'indisponivel', mensagem: SEM_FONTE };
  toCache(key, result);
  return result;
}

export async function consultarCep(
  entrada: string,
  options: LookupOptions = {},
): Promise<LookupResult<DadosCep>> {
  const cep = somenteDigitos(entrada);
  if (!cepValido(cep)) {
    return { ok: false, erro: 'invalido', mensagem: 'CEP inválido. Use 8 números.' };
  }
  const key = `cep:${cep}`;
  const cached = fromCache<DadosCep>(key);
  if (cached) return cached;

  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? 5000;
  const fontes: Array<{ nome: string; url: string; map: (json: Json) => DadosCep | null }> = [
    {
      nome: 'brasilapi',
      url: `https://brasilapi.com.br/api/cep/v2/${cep}`,
      map: (json) => {
        const uf = text(json.state);
        if (!uf) return null;
        return {
          cep,
          logradouro: titulo(json.street),
          bairro: titulo(json.neighborhood),
          cidade: titulo(json.city),
          uf: uf.toUpperCase().slice(0, 2),
        };
      },
    },
    {
      nome: 'viacep',
      url: `https://viacep.com.br/ws/${cep}/json/`,
      map: (json) => {
        if (json.erro) return null;
        const uf = text(json.uf);
        if (!uf) return null;
        return {
          cep,
          logradouro: titulo(json.logradouro),
          bairro: titulo(json.bairro),
          cidade: titulo(json.localidade),
          uf: uf.toUpperCase().slice(0, 2),
        };
      },
    },
  ];
  let naoEncontrado = 0;
  for (const fonte of fontes) {
    try {
      const { status, json } = await getJson(fetchImpl, fonte.url, timeoutMs);
      const data = status === 404 || !json ? null : fonte.map(json);
      if (!data) {
        naoEncontrado += 1;
        continue;
      }
      const result: LookupResult<DadosCep> = { ok: true, data, fonte: fonte.nome, cache: false };
      toCache(key, result);
      return result;
    } catch {
      // tenta a próxima fonte
    }
  }
  const result: LookupResult<DadosCep> =
    naoEncontrado === fontes.length
      ? {
          ok: false,
          erro: 'nao_encontrado',
          mensagem: 'CEP não encontrado. Preencha o endereço manualmente.',
        }
      : { ok: false, erro: 'indisponivel', mensagem: SEM_FONTE };
  toCache(key, result);
  return result;
}

// Limite simples por usuário para ninguém usar a consulta como atalho para varrer a Receita.
const LIMITE_POR_MINUTO = 20;
const janelas = new Map<string, { inicio: number; usos: number }>();

function dentroDoLimite(chave: string): boolean {
  const agora = Date.now();
  const atual = janelas.get(chave);
  if (!atual || agora - atual.inicio > 60_000) {
    if (janelas.size > 5000) janelas.clear();
    janelas.set(chave, { inicio: agora, usos: 1 });
    return true;
  }
  atual.usos += 1;
  return atual.usos <= LIMITE_POR_MINUTO;
}

export function limparLimitesDeConsulta(): void {
  janelas.clear();
}

const STATUS = { invalido: 422, nao_encontrado: 404, indisponivel: 503 } as const;

export function registerLookupRoutes(app: FastifyInstance, options: LookupOptions = {}): void {
  app.get('/lookup/cnpj/:cnpj', async (request, reply) => {
    if (!dentroDoLimite(`${request.user.sub}:cnpj`)) {
      return reply.code(429).send({
        error: 'muitas_consultas',
        mensagem: 'Muitas consultas seguidas. Aguarde 1 minuto.',
      });
    }
    const { cnpj } = request.params as { cnpj: string };
    const result = await consultarCnpj(cnpj, options);
    if (!result.ok) {
      return reply
        .code(STATUS[result.erro])
        .send({ error: result.erro, mensagem: result.mensagem });
    }
    return reply.send({ data: result.data, fonte: result.fonte });
  });

  app.get('/lookup/cep/:cep', async (request, reply) => {
    if (!dentroDoLimite(`${request.user.sub}:cep`)) {
      return reply.code(429).send({
        error: 'muitas_consultas',
        mensagem: 'Muitas consultas seguidas. Aguarde 1 minuto.',
      });
    }
    const { cep } = request.params as { cep: string };
    const result = await consultarCep(cep, options);
    if (!result.ok) {
      return reply
        .code(STATUS[result.erro])
        .send({ error: result.erro, mensagem: result.mensagem });
    }
    return reply.send({ data: result.data, fonte: result.fonte });
  });
}
