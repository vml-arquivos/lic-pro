import { cookies } from 'next/headers';

export async function proxyAi(request: Request, path: string): Promise<Response> {
  const baseUrl = process.env.AI_INTERNAL_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return Response.json({ error: 'ai_not_configured' }, { status: 503 });
  }

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const authorization = request.headers.get('authorization') ?? sessionAuthorization();
  if (authorization) headers.set('authorization', authorization);

  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  const init: RequestInit = { method: request.method, headers, cache: 'no-store' };
  if (body) init.body = body;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch {
    return Response.json({ error: 'ai_unavailable' }, { status: 503 });
  }

  const responseHeaders = new Headers();
  const responseContentType = response.headers.get('content-type');
  if (responseContentType) responseHeaders.set('content-type', responseContentType);
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) responseHeaders.set('retry-after', retryAfter);
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

function sessionAuthorization(): string | null {
  const token = cookies().get('lc_access_token')?.value;
  return token ? `Bearer ${token}` : null;
}
