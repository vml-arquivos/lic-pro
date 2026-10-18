import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { CookieBanner } from '../components/CookieBanner';

const siteUrl = process.env.SITE_URL ?? 'http://localhost:3100';
const appUrl = process.env.APP_URL ?? '/';
const description =
  'Encontre oportunidades, confira editais e organize os próximos passos em licitações públicas.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Licite Comigo | Organize licitações públicas',
    template: '%s | Licite Comigo',
  },
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Licite Comigo',
    url: siteUrl,
    title: 'Licite Comigo | Organize licitações públicas',
    description,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Licite Comigo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Licite Comigo | Organize licitações públicas',
    description,
    images: ['/opengraph-image'],
  },
  robots: { index: true, follow: true },
};

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const signupEnabled = process.env.SIGNUP_ENABLED === 'true';
  return (
    <html lang="pt-BR">
      <body>
        <header className="site-header">
          <Link className="wordmark" href="/" aria-label="Licite Comigo — início">
            <span className="mark">LC</span>
            <span>Licite Comigo</span>
          </Link>
          <nav aria-label="Navegação principal">
            <Link href="/como-funciona">Como funciona</Link>
            <Link href="/recursos">Recursos</Link>
            <Link href="/para-quem-e">Para quem é</Link>
            <Link href="/faq">FAQ</Link>
          </nav>
          <div className="header-actions">
            <a className="button button-quiet" href={appUrl}>
              Entrar
            </a>
            {signupEnabled ? (
              <a className="button button-primary" href={`${appUrl.replace(/\/$/, '')}/signup`}>
                Criar conta
              </a>
            ) : (
              <a className="button button-primary" href="#lista-de-espera">
                Entrar na lista de espera
              </a>
            )}
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div>
            <span className="wordmark">
              <span className="mark">LC</span>
              <span>Licite Comigo</span>
            </span>
            <p>Encontre, confira e organize licitações públicas.</p>
          </div>
          <div className="footer-links">
            <Link href="/sobre">Sobre</Link>
            <Link href="/contato">Contato</Link>
            <Link href="/termos">Termos</Link>
            <Link href="/privacidade">Privacidade</Link>
          </div>
          <small>
            Ferramenta de apoio à decisão. Não é consultoria jurídica e não envia propostas ou
            lances.
          </small>
        </footer>
        <CookieBanner />
      </body>
    </html>
  );
}
