import { cookies } from 'next/headers';
import { isArea } from '@licitecomigo/shared';

export async function proxyCore(request: Request, path: string): Promise<Response> {
  const baseUrl = process.env.CORE_API_INTERNAL_URL?.replace(/\/$/, '');
  if (!baseUrl) return Response.json({ error: 'core_api_not_configured' }, { status: 503 });

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const authorization = request.headers.get('authorization') ?? sessionAuthorization();
  if (authorization) headers.set('authorization', authorization);
  // Só registra na auditoria o "ver como" da equipe; não muda nenhuma permissão.
  const viewAs = cookies().get('lc_view_as')?.value;
  if (viewAs && isArea(viewAs)) headers.set('x-acting-as', viewAs);
  const body =
    request.method === 'GET' || request.method === 'HEAD' || request.method === 'DELETE'
      ? undefined
      : await request.text();
  const init: RequestInit = { method: request.method, headers, cache: 'no-store' };
  if (body) init.body = body;
  else headers.delete('content-type'); // o Fastify recusa JSON declarado sem corpo

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch {
    return Response.json({ error: 'core_api_unavailable' }, { status: 503 });
  }
  const responseHeaders = new Headers();
  const responseContentType = response.headers.get('content-type');
  if (responseContentType) responseHeaders.set('content-type', responseContentType);
  for (const name of [
    'content-disposition',
    'x-total-linhas',
    'x-limite-linhas',
    'cache-control',
  ]) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

function sessionAuthorization(): string | null {
  const token = cookies().get('lc_access_token')?.value;
  return token ? `Bearer ${token}` : null;
}
