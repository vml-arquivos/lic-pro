import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { CookieBanner } from '../components/CookieBanner';

const siteUrl = process.env.SITE_URL ?? 'http://localhost:3100';
const appUrl = process.env.APP_URL ?? '/';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Licite Comigo | Apoio para licitações públicas',
    template: '%s | Licite Comigo',
  },
  description:
    'Radar, leitura de editais com fontes, Academia e organização de prazos para quem participa de licitações públicas.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Licite Comigo',
    url: siteUrl,
    title: 'Licite Comigo',
    description: 'Apoio à decisão e formação para licitações públicas.',
  },
};

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const slogan = process.env.BRAND_SLOGAN ?? 'Clareza para decidir o próximo passo';
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
            <Link href="/planos">Planos</Link>
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
        <div className="draft-ribbon">
          Slogan e textos institucionais em rascunho para revisão jurídica
        </div>
        <main>{children}</main>
        <footer className="site-footer">
          <div>
            <span className="wordmark">
              <span className="mark">LC</span>
              <span>Licite Comigo</span>
            </span>
            <p>{slogan}</p>
          </div>
          <div className="footer-links">
            <Link href="/sobre">Sobre</Link>
            <Link href="/contato">Contato</Link>
            <Link href="/termos">Termos</Link>
            <Link href="/privacidade">Privacidade</Link>
          </div>
          <small>
            Ferramenta de apoio. Não é consultoria jurídica, não promete resultado e não executa
            lances ou automações em portais.
          </small>
        </footer>
        <CookieBanner />
      </body>
    </html>
  );
}
