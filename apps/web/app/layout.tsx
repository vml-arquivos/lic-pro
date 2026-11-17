import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PANEL_COPY, requiresSession } from '@licitecomigo/shared';
import { panelUrl, type Area } from '@licitecomigo/shared';
import { configuredPanels, currentPanel } from '../lib/panel';
import { getSessionResult } from '../lib/session';
import { AnaWidget } from './ana/AnaWidget';
import { AppShell } from './AppShell';
import { WrongPanel } from './WrongPanel';
import { SincronizarAoAcessar } from './components/SincronizarAoAcessar';
import '@fontsource-variable/inter/wght.css';
import './globals.css';
import './areas.css';
import './theme.css';
import './commerce.css';
import './holo.css';
import './polish.css';

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

/** Atalhos para os outros painéis (só a equipe, e só com endereços próprios configurados). */
function painelLinks(
  session: { plataforma: boolean; areas_permitidas: Area[] } | null,
): { area: Area; url: string; atual: boolean }[] {
  if (!session?.plataforma) return [];
  const panels = configuredPanels();
  const atual = currentPanel();
  const vistos = new Set<string>();
  const lista: { area: Area; url: string; atual: boolean }[] = [];
  for (const area of ['administracao', 'curso', 'empresa', 'aluno'] as const) {
    const base = panelUrl(panels, area);
    if (!base || vistos.has(base)) continue;
    vistos.add(base);
    const casa = area === 'administracao' ? '/admin' : area === 'curso' ? '/gestao' : '/painel';
    lista.push({ area, url: `${base}${casa}`, atual: atual === area });
  }
  return lista.length > 1 ? lista : [];
}

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
        <AppShell session={session} paineis={painelLinks(session)}>
          {children}
        </AppShell>
        {session ? <AnaWidget /> : null}
        {session ? <SincronizarAoAcessar /> : null}
      </body>
    </html>
  );
}
