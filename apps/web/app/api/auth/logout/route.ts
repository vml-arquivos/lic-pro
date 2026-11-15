export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const response = Response.json({ ok: true });
  response.headers.append(
    'set-cookie',
    [
      'lc_access_token=',
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      process.env.NODE_ENV === 'production' ? 'Secure' : '',
      'Max-Age=0',
    ]
      .filter(Boolean)
      .join('; '),
  );
  response.headers.append(
    'set-cookie',
    [
      'lc_view_as=',
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      process.env.NODE_ENV === 'production' ? 'Secure' : '',
      'Max-Age=0',
    ]
      .filter(Boolean)
      .join('; '),
  );
  return response;
}
