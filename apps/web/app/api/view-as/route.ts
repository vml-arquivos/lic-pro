import { cookies } from 'next/headers';
import { isArea } from '@licitecomigo/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const secure = process.env.NODE_ENV === 'production';

/**
 * "Ver como": a equipe da plataforma escolhe qual área quer visualizar. O core-api só aceita
 * de contas da plataforma; o cookie serve apenas para registrar a escolha na auditoria.
 */
export async function POST(request: Request): Promise<Response> {
  const baseUrl = process.env.CORE_API_INTERNAL_URL?.replace(/\/$/, '');
  if (!baseUrl) return Response.json({ error: 'core_api_not_configured' }, { status: 503 });
  const token = cookies().get('lc_access_token')?.value;
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { area?: unknown };
  if (!isArea(body.area)) return Response.json({ error: 'invalid_area' }, { status: 400 });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/me/view-as`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ area: body.area }),
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'core_api_unavailable' }, { status: 503 });
  }
  if (!response.ok) {
    return Response.json(await response.json().catch(() => ({ error: 'request_failed' })), {
      status: response.status,
    });
  }
  const result = Response.json({ area: body.area });
  result.headers.append(
    'set-cookie',
    [
      `lc_view_as=${body.area}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      secure ? 'Secure' : '',
      'Max-Age=2592000',
    ]
      .filter(Boolean)
      .join('; '),
  );
  return result;
}
