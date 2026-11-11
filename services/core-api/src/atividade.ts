import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { withTenant } from './db.js';
import { authContext } from './request-context.js';

/**
 * Registro de uso, para a Administração enxergar o que cada usuário abriu e o que buscou.
 *
 * Guarda só o recurso usado (radar, preços pagos, Ana…), a contagem por dia e os filtros das
 * buscas. Nunca guarda o conteúdo de documentos, mensagens da Ana nem senhas. Falha de
 * registro nunca atrapalha a resposta ao usuário.
 */

export type RecursoUso =
  | 'login'
  | 'radar'
  | 'edital'
  | 'precos'
  | 'ana'
  | 'oportunidades'
  | 'alertas'
  | 'empresa'
  | 'agenda'
  | 'checklists'
  | 'curso'
  | 'mentoria'
  | 'assinatura'
  | 'diagnostico';

export const RECURSO_LABEL: Record<RecursoUso, string> = {
  login: 'Entrou no sistema',
  radar: 'Radar de editais',
  edital: 'Abriu editais',
  precos: 'Preços pagos',
  ana: 'Conversou com a Ana',
  oportunidades: 'Oportunidades salvas',
  alertas: 'Buscas e alertas',
  empresa: 'Dados da empresa',
  agenda: 'Agenda e tarefas',
  checklists: 'Checklists',
  curso: 'Curso e aulas',
  mentoria: 'Mentoria',
  assinatura: 'Assinatura',
  diagnostico: 'Diagnóstico',
};

const PREFIXES: [string, RecursoUso][] = [
  ['/radar', 'radar'],
  ['/editais/:editalId', 'edital'],
  ['/editais/:id', 'edital'],
  ['/editais', 'radar'],
  ['/precos', 'precos'],
  ['/ana', 'ana'],
  ['/opportunities', 'oportunidades'],
  ['/saved-searches', 'alertas'],
  ['/alert-rules', 'alertas'],
  ['/empresa', 'empresa'],
  ['/companies', 'empresa'],
  ['/agenda', 'agenda'],
  ['/tasks', 'agenda'],
  ['/checklist', 'checklists'],
  ['/academy', 'curso'],
  ['/aluno', 'curso'],
  ['/mentor', 'mentoria'],
  ['/mentorado', 'mentoria'],
  ['/billing', 'assinatura'],
  ['/me/diagnostico', 'diagnostico'],
];

/** Chamadas de fundo (sondagem, avisos, sessão) não contam como uso. */
const IGNORED = [
  '/me',
  '/health',
  '/ready',
  '/notifications',
  '/alerts',
  '/dashboard',
  '/auth',
  '/platform',
];

export function recursoDaRota(routeUrl: string | undefined): RecursoUso | null {
  if (!routeUrl) return null;
  if (routeUrl === '/me/diagnostico') return 'diagnostico';
  if (IGNORED.some((prefix) => routeUrl === prefix || routeUrl.startsWith(`${prefix}/`)))
    return null;
  for (const [prefix, recurso] of PREFIXES) {
    if (routeUrl === prefix || routeUrl.startsWith(`${prefix}/`)) return recurso;
  }
  return null;
}

const FILTER_KEYS = [
  'q',
  'nicho',
  'uf',
  'regiao',
  'modalidade',
  'orgao',
  'municipio',
  'catmat',
  'catmat_catser',
  'item',
  'periodo',
  'situacao_prazo',
  'valor_min',
  'valor_max',
];
/** Só estes filtros, somados ao nicho do usuário, indicam que houve uma busca de verdade. */
const SEARCH_SIGNAL = FILTER_KEYS.filter((key) => key !== 'nicho');

export function buscaDaRequisicao(
  recurso: RecursoUso,
  query: unknown,
): { origem: 'radar' | 'precos'; termo: string | null; filtros: Record<string, string> } | null {
  if (recurso !== 'radar' && recurso !== 'precos') return null;
  if (!query || typeof query !== 'object') return null;
  const raw = query as Record<string, unknown>;
  const filtros: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = raw[key];
    const text = Array.isArray(value) ? value.join(', ') : value;
    if (typeof text === 'string' || typeof text === 'number') {
      const clean = String(text).trim().slice(0, 100);
      if (clean) filtros[key] = clean;
    }
  }
  if (!SEARCH_SIGNAL.some((key) => key in filtros)) return null;
  const termo = filtros.q ?? null;
  delete filtros.q;
  return { origem: recurso, termo, filtros };
}

type Deps = { pool: Pool | undefined };

export function registerActivityTracking(app: FastifyInstance, { pool }: Deps): void {
  if (!pool) return;
  // Contagem por minuto: evita uma gravação por requisição na mesma tela.
  const recentUse = new Map<string, number>();
  const recentSearch = new Map<string, number>();
  const prune = (map: Map<string, number>, ttl: number) => {
    if (map.size < 5000) return;
    const limit = Date.now() - ttl;
    for (const [key, at] of map) if (at < limit) map.delete(key);
  };

  app.addHook('onResponse', async (request: FastifyRequest, reply) => {
    try {
      if (reply.statusCode >= 400 || !request.user?.sub) return;
      const recurso = recursoDaRota(request.routeOptions?.url);
      if (!recurso) return;
      const context = authContext(request);
      const now = Date.now();
      const busca = request.method === 'GET' ? buscaDaRequisicao(recurso, request.query) : null;
      const useKey = `${context.userId}:${recurso}`;
      const writeUse = now - (recentUse.get(useKey) ?? 0) > 60_000;
      const searchKey = busca
        ? `${context.userId}:${busca.origem}:${busca.termo ?? ''}:${JSON.stringify(busca.filtros)}`
        : '';
      const writeSearch = Boolean(busca) && now - (recentSearch.get(searchKey) ?? 0) > 10 * 60_000;
      if (!writeUse && !writeSearch) return;
      if (writeUse) recentUse.set(useKey, now);
      if (writeSearch) recentSearch.set(searchKey, now);
      prune(recentUse, 60_000);
      prune(recentSearch, 10 * 60_000);
      await withTenant(pool, context, async (client) => {
        if (writeUse) {
          await client.query(
            `INSERT INTO atividade_usuario (tenant_id, usuario_id, dia, recurso)
             VALUES ($1, $2, (now() AT TIME ZONE 'America/Sao_Paulo')::date, $3)
             ON CONFLICT (tenant_id, usuario_id, dia, recurso)
             DO UPDATE SET total = atividade_usuario.total + 1, ultimo_em = now()`,
            [context.tenantId, context.userId, recurso],
          );
        }
        if (writeSearch && busca) {
          await client.query(
            `INSERT INTO atividade_buscas (tenant_id, usuario_id, origem, termo, filtros)
             VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [
              context.tenantId,
              context.userId,
              busca.origem,
              busca.termo,
              JSON.stringify(busca.filtros),
            ],
          );
        }
      });
    } catch (error) {
      request.log.warn({ err: error }, 'activity_tracking_failed');
    }
  });
}
