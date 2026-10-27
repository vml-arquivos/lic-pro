import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Area } from '@licitecomigo/shared';

export type Session = {
  id: string;
  nome: string;
  tenant_nome: string | null;
  email: string;
  papel: string;
  area: Area;
  areas_permitidas: Area[];
  plataforma: boolean;
  visualizar_como: Area | null;
  perfil_jornada: string | null;
  nicho_preferencias: string[] | null;
  onboarding_concluido: boolean;
};

export type SessionResult =
  { status: 'ok'; session: Session } | { status: 'anonymous' } | { status: 'unavailable' };

/** Lê a conta atual no core-api, usando o cookie de sessão. Nunca confia em dados do navegador. */
export async function getSessionResult(): Promise<SessionResult> {
  const token = cookies().get('lc_access_token')?.value;
  if (!token) return { status: 'anonymous' };
  const baseUrl = process.env.CORE_API_INTERNAL_URL?.replace(/\/$/, '');
  if (!baseUrl) return { status: 'unavailable' };
  try {
    const response = await fetch(`${baseUrl}/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) return { status: 'anonymous' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'ok', session: (await response.json()) as Session };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function getSession(): Promise<Session | null> {
  const result = await getSessionResult();
  return result.status === 'ok' ? result.session : null;
}

/**
 * Guarda de página no servidor. Sem sessão vai para o login; com sessão de outra área, a
 * página não existe para ela (404), sem revelar o que há ali.
 */
export async function requireArea(...areas: Area[]): Promise<Session> {
  const result = await getSessionResult();
  if (result.status === 'anonymous') redirect('/login');
  if (result.status === 'unavailable') throw new Error('Serviço de contas indisponível.');
  const allowed = result.session.areas_permitidas;
  if (!areas.some((area) => allowed.includes(area))) notFound();
  return result.session;
}
