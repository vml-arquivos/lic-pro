import { NextResponse, type NextRequest } from 'next/server';
import {
  panelForHost,
  panelPathAllowed,
  panelPathPublic,
  panelsConfigured,
  parsePanels,
  requiresSession,
} from '@licitecomigo/shared';

/**
 * Passa o caminho para o layout e leva ao login quem tenta abrir uma área protegida sem
 * sessão. A decisão de acesso de verdade continua no servidor (core-api e guardas de página).
 *
 * Com endereços por painel (`PANEL_URL_*`), cada endereço só abre as páginas do seu painel;
 * as demais não existem ali (404). Sem essas variáveis, nada disso se aplica.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get('lc_access_token')?.value);

  const panels = parsePanels(process.env);
  if (panelsConfigured(panels)) {
    const panel = panelForHost(panels, request.headers.get('host'));
    if (panel) {
      if (!panelPathAllowed(panels, panel, pathname)) {
        return NextResponse.rewrite(new URL('/__painel_nao_encontrado', request.url));
      }
      const needsSession = pathname === '/' ? false : !panelPathPublic(panel, pathname);
      const anonymousHome = pathname === '/' && !hasSession;
      if (!hasSession && (needsSession || anonymousHome)) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.search = '';
        if (needsSession) url.searchParams.set('next', pathname);
        return NextResponse.redirect(url);
      }
      const headers = new Headers(request.headers);
      headers.set('x-pathname', pathname);
      return NextResponse.next({ request: { headers } });
    }
  }

  if (requiresSession(pathname) && !hasSession) {
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
