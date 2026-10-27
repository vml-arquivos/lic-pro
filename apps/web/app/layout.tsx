import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requiresSession } from '@licitecomigo/shared';
import { getSessionResult } from '../lib/session';
import { AnaWidget } from './ana/AnaWidget';
import { AppShell } from './AppShell';
import './globals.css';
import './areas.css';
import './theme.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Licite Comigo',
  description:
    'Painéis protegidos, licitações, empresas e Academia para organizar decisões públicas.',
  applicationName: 'Licite Comigo',
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = { themeColor: '#4f46e5' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = headers().get('x-pathname') ?? '/';
  const result = await getSessionResult();
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
