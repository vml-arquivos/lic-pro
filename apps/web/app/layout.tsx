import type { Metadata } from 'next';
import { AnaWidget } from './ana/AnaWidget';
import { AppShell } from './AppShell';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Licite Comigo',
  description:
    'Painéis protegidos, licitações, empresas e Academia para organizar decisões públicas.',
  applicationName: 'Licite Comigo',
  manifest: '/site.webmanifest',
  themeColor: '#10273b',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <AppShell>{children}</AppShell>
        <AnaWidget />
      </body>
    </html>
  );
}
