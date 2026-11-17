export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const response = Response.json({ ok: true });
  // Apaga o cookie do endereço e, se houver login único, o do domínio inteiro.
  const cookieDomain = process.env.COOKIE_DOMAIN?.trim();
  for (const dominio of cookieDomain ? ['', `Domain=${cookieDomain}`] : ['']) {
    response.headers.append(
      'set-cookie',
      [
        'lc_access_token=',
        dominio,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        process.env.NODE_ENV === 'production' ? 'Secure' : '',
        'Max-Age=0',
      ]
        .filter(Boolean)
        .join('; '),
    );
  }
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
