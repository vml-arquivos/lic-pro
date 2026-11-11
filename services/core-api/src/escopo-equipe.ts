import { MODULE_AREAS, AREAS, type Area } from '@licitecomigo/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { withTenant } from './db.js';
import { authContext } from './request-context.js';

/**
 * Escopo da equipe administrativa.
 *
 * A conta `plataforma` pode ser da equipe inteira (`tudo`), só do Painel admin (`profissional`)
 * ou só do Painel da mentoria (`curso`). O escopo vale na API, não só na tela: uma pessoa com
 * escopo `curso` não lê dinheiro, leads, empresas nem coleta do módulo Profissional, e vice-versa,
 * mesmo chamando o core-api direto. Rota administrativa que não está na lista abaixo é negada
 * para quem tem escopo restrito (o que não foi pensado para o escopo não abre por engano).
 */
export const ESCOPOS = ['tudo', 'curso', 'profissional'] as const;
export type Escopo = (typeof ESCOPOS)[number];
export type EscopoRestrito = Exclude<Escopo, 'tudo'>;

export function areasDoEscopo(escopo: Escopo): readonly Area[] {
  return escopo === 'tudo' ? AREAS : MODULE_AREAS[escopo];
}

/** Papéis de conta que cada escopo pode ver e mexer. A própria equipe só o escopo `tudo`. */
const PAPEIS: Record<EscopoRestrito, readonly string[]> = {
  curso: ['aluno', 'mentor'],
  profissional: ['admin', 'operador', 'colaborador'],
};
const TIPOS_CONVITE: Record<EscopoRestrito, readonly string[]> = {
  curso: ['aluno', 'mentor'],
  profissional: ['empresa', 'colaborador'],
};
const TIPO_COBRANCA: Record<EscopoRestrito, string> = {
  curso: 'curso',
  profissional: 'assinatura',
};

export type Alvo =
  | { tipo: 'usuario'; id: string }
  | { tipo: 'convite'; id: string }
  | { tipo: 'cobranca'; id: string }
  | { tipo: 'plano'; slug: string };

export type Decisao =
  | { resultado: 'liberado' }
  | { resultado: 'negado'; motivo: string }
  | { resultado: 'verificar'; alvo: Alvo };

const SOMENTE_PROFISSIONAL = [
  /^\/admin\/(assinantes|assinaturas|alerts|coleta|integracoes|users)(\/|$)/,
  /^\/operations(\/|$)/,
  /^\/platform\/(companies|colaboradores)(\/|$)/,
];
const SOMENTE_CURSO = [/^\/platform\/(students|mentors|classes|materiais)(\/|$)/];
const POR_MODULO = [
  /^\/admin\/(financeiro|planos|cupons|leads)(\/|$)/,
  /^\/platform\/overview(\/|$)/,
];
const UUID = '[0-9a-fA-F-]{36}';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** Decide, só pela rota, se um escopo restrito pode chamá-la (ou o que precisa ser conferido). */
export function decidirRota(escopo: Escopo, method: string, url: string, body?: unknown): Decisao {
  if (escopo === 'tudo') return { resultado: 'liberado' };
  const parsed = new URL(url, 'http://core-api.local');
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  if (!/^\/(admin|platform|operations)(\/|$)/.test(path)) return { resultado: 'liberado' };
  const negar = (motivo: string): Decisao => ({ resultado: 'negado', motivo });
  const outro: EscopoRestrito = escopo === 'curso' ? 'profissional' : 'curso';

  if (path === '/platform/migracoes') return { resultado: 'liberado' };
  if (path === '/platform/team' || path.startsWith('/platform/team/')) {
    return negar('equipe_so_com_acesso_total');
  }
  if (SOMENTE_PROFISSIONAL.some((regra) => regra.test(path))) {
    return escopo === 'profissional' ? { resultado: 'liberado' } : negar('rota_do_outro_painel');
  }
  if (SOMENTE_CURSO.some((regra) => regra.test(path))) {
    return escopo === 'curso' ? { resultado: 'liberado' } : negar('rota_do_outro_painel');
  }
  if (POR_MODULO.some((regra) => regra.test(path))) {
    if (parsed.searchParams.get('modulo') !== escopo) return negar('modulo_do_outro_painel');
    if (method === 'PUT' && path === '/admin/planos') {
      const dados = asRecord(body);
      if (dados.tipo !== TIPO_COBRANCA[escopo]) return negar('plano_do_outro_painel');
      if (typeof dados.slug === 'string')
        return { resultado: 'verificar', alvo: { tipo: 'plano', slug: dados.slug } };
    }
    return { resultado: 'liberado' };
  }
  const usuario = new RegExp(`^/platform/users/(${UUID})(/|$)`).exec(path);
  if (usuario) return { resultado: 'verificar', alvo: { tipo: 'usuario', id: usuario[1]! } };
  if (method === 'POST' && path === '/platform/invitations') {
    const tipo = asRecord(body).tipo;
    return typeof tipo === 'string' && TIPOS_CONVITE[escopo].includes(tipo)
      ? { resultado: 'liberado' }
      : negar(`convite_do_${outro}`);
  }
  if (method === 'GET' && path === '/platform/invitations') return { resultado: 'liberado' };
  const convite = new RegExp(`^/platform/invitations/(${UUID})(/|$)`).exec(path);
  if (convite) return { resultado: 'verificar', alvo: { tipo: 'convite', id: convite[1]! } };
  const cobranca = new RegExp(`^/admin/cobrancas/(${UUID})(/|$)`).exec(path);
  if (cobranca) return { resultado: 'verificar', alvo: { tipo: 'cobranca', id: cobranca[1]! } };
  return negar('rota_fora_do_escopo');
}

/** Tipos de convite que a lista de convites mostra a cada escopo (null = todos). */
export function tiposDeConviteVisiveis(escopo: Escopo): readonly string[] | null {
  return escopo === 'tudo' ? null : TIPOS_CONVITE[escopo];
}

export function alvoPermitido(escopo: EscopoRestrito, alvo: Alvo, valor: string | null): boolean {
  if (valor === null) return alvo.tipo === 'plano'; // plano novo ainda não existe: pode criar
  switch (alvo.tipo) {
    case 'usuario':
      return PAPEIS[escopo].includes(valor);
    case 'convite':
      return TIPOS_CONVITE[escopo].includes(valor);
    case 'cobranca':
    case 'plano':
      return valor === TIPO_COBRANCA[escopo];
  }
}

const cache = new Map<string, { escopo: Escopo; em: number }>();
const TTL_MS = 10_000;

export function esquecerEscopo(userId: string): void {
  cache.delete(userId);
}

/**
 * Escopo atual da conta. Banco ainda sem a migration 0031 (coluna inexistente) vale como `tudo`:
 * nesse caso ninguém tem escopo restrito. Qualquer outra falha propaga (nunca abre por engano).
 */
export async function lerEscopo(pool: Pool, request: FastifyRequest): Promise<Escopo> {
  if (request.user.role !== 'plataforma') return 'tudo';
  const chave = request.user.sub;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < TTL_MS) return guardado.escopo;
  let escopo: Escopo = 'tudo';
  try {
    escopo = await withTenant(pool, authContext(request), async (client) => {
      const found = await client.query<{ escopo_equipe: Escopo }>(
        'SELECT escopo_equipe FROM usuarios WHERE tenant_id = $1 AND id = $2',
        [request.user.tenantId, request.user.sub],
      );
      return found.rows[0]?.escopo_equipe ?? 'tudo';
    });
  } catch (error) {
    if ((error as { code?: string }).code !== '42703') throw error;
  }
  cache.set(chave, { escopo, em: Date.now() });
  return escopo;
}

async function valorDoAlvo(
  pool: Pool,
  request: FastifyRequest,
  alvo: Alvo,
): Promise<string | null> {
  return withTenant(pool, { ...authContext(request), platform: true }, async (client) => {
    const consulta =
      alvo.tipo === 'usuario'
        ? client.query<{ v: string }>('SELECT papel::text AS v FROM usuarios WHERE id = $1', [
            alvo.id,
          ])
        : alvo.tipo === 'convite'
          ? client.query<{ v: string }>('SELECT tipo AS v FROM convites WHERE id = $1', [alvo.id])
          : alvo.tipo === 'cobranca'
            ? client.query<{ v: string }>('SELECT tipo AS v FROM cobrancas WHERE id = $1', [
                alvo.id,
              ])
            : client.query<{ v: string }>('SELECT tipo AS v FROM planos WHERE slug = $1', [
                alvo.slug,
              ]);
    return (await consulta).rows[0]?.v ?? null;
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    escopoEquipe?: Escopo;
  }
}

/** Hook global: roda depois da autenticação e antes de qualquer rota. */
export function registerEscopoEquipe(
  app: FastifyInstance,
  { pool }: { pool: Pool | undefined },
): void {
  app.addHook('preHandler', async (request, reply) => {
    if (!pool || !request.user || request.user.role !== 'plataforma') return;
    const escopo = await lerEscopo(pool, request);
    request.escopoEquipe = escopo;
    if (escopo === 'tudo') return;
    const decisao = decidirRota(escopo, request.method, request.url, request.body);
    if (decisao.resultado === 'liberado') return;
    if (decisao.resultado === 'negado') {
      return reply.code(403).send({ error: 'escopo_da_equipe', motivo: decisao.motivo });
    }
    const valor = await valorDoAlvo(pool, request, decisao.alvo);
    if (!alvoPermitido(escopo, decisao.alvo, valor)) {
      return reply.code(403).send({ error: 'escopo_da_equipe', motivo: 'alvo_do_outro_painel' });
    }
  });
}
