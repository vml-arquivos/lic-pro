export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const baseUrl = process.env.CORE_API_INTERNAL_URL;
  if (!baseUrl) return Response.json({ error: 'core_api_not_configured' }, { status: 503 });
  const body = await request.text();
  const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/public/leads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
    },
    body,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
