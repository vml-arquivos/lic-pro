export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const baseUrl = process.env.CORE_API_INTERNAL_URL?.replace(/\/$/, '');
  if (!baseUrl) return Response.json({ error: 'core_api_not_configured' }, { status: 503 });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: await request.text(),
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'core_api_unavailable' }, { status: 503 });
  }

  if (!response.ok) {
    return Response.json(await response.json().catch(() => ({ error: 'invalid_credentials' })), {
      status: response.status,
    });
  }
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token)
    return Response.json({ error: 'invalid_login_response' }, { status: 502 });

  const result = Response.json({ ok: true });
  result.headers.append(
    'set-cookie',
    [
      `lc_access_token=${encodeURIComponent(payload.access_token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      process.env.NODE_ENV === 'production' ? 'Secure' : '',
      `Max-Age=${payload.expires_in ?? 3600}`,
    ]
      .filter(Boolean)
      .join('; '),
  );
  return result;
}
