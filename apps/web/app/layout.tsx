import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PANEL_COPY, requiresSession } from '@licitecomigo/shared';
import { currentPanel } from '../lib/panel';
import { getSessionResult } from '../lib/session';
import { AnaWidget } from './ana/AnaWidget';
import { AppShell } from './AppShell';
import { WrongPanel } from './WrongPanel';
import './globals.css';
import './areas.css';
import './theme.css';
import './commerce.css';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  const panel = currentPanel();
  return {
    title: panel ? `Licite Comigo · ${PANEL_COPY[panel].title}` : 'Licite Comigo',
    description:
      'Painéis protegidos, licitações, empresas e Academia para organizar decisões públicas.',
    applicationName: 'Licite Comigo',
    manifest: '/site.webmanifest',
    // Painéis com endereço próprio são áreas de trabalho: não entram em buscadores.
    ...(panel ? { robots: { index: false, follow: false } } : {}),
  };
}

export const viewport: Viewport = { themeColor: '#4f46e5' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = headers().get('x-pathname') ?? '/';
  const result = await getSessionResult();
  if (result.status === 'wrong_panel') {
    return (
      <html lang="pt-BR">
        <body>
          <WrongPanel url={result.url} />
        </body>
      </html>
    );
  }
  // Sessão vencida ou inexistente em área protegida: volta ao login.
  if (result.status === 'anonymous' && requiresSession(pathname)) {
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }
  const session = result.status === 'ok' ? result.session : null;
  return (
    <html lang="pt-BR">
      <body>
        <AppShell session={session}>{children}</AppShell>
        {session ? <AnaWidget /> : null}
      </body>
    </html>
  );
}
