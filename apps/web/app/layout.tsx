import type { Metadata } from 'next';
import { AnaWidget } from './ana/AnaWidget';
import { AppShell } from './AppShell';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Licite Comigo',
  description: 'Radar, empresas, Academia e Ana para organizar licitações públicas.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const demoMode = process.env.DEMO_MODE === 'true';

  return (
    <html lang="pt-BR">
      <body>
        <AppShell demoMode={demoMode}>{children}</AppShell>
        <AnaWidget />
      </body>
    </html>
  );
}
