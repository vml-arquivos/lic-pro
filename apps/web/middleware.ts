import { NextResponse, type NextRequest } from 'next/server';
import { requiresSession } from '@licitecomigo/shared';

/**
 * Passa o caminho para o layout e leva ao login quem tenta abrir uma área protegida sem
 * sessão. A decisão de acesso de verdade continua no servidor (core-api e guardas de página).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (requiresSession(pathname) && !request.cookies.get('lc_access_token')?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  const headers = new Headers(request.headers);
  headers.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|site.webmanifest|.*\\..*).*)'],
};
