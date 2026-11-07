import { PANEL_COPY, panelUrl } from '@licitecomigo/shared';
import { configuredPanels, currentPanel } from '../../lib/panel';
import { AuthAside } from '../components/AuthAside';
import { LoginForm } from './LoginForm';

export const metadata = {
  title: 'Entrar | Licite Comigo',
  description: 'Acesse o seu painel no Licite Comigo.',
};

export default function LoginPage() {
  const demoMode = process.env.DEMO_MODE === 'true';
  const signupEnabled = process.env.SIGNUP_ENABLED === 'true';
  const panel = currentPanel();
  const copy = panel ? PANEL_COPY[panel] : null;
  const panels = configuredPanels();
  // Links para os outros painéis públicos. A Administração nunca é divulgada aqui.
  const others = panel
    ? (['empresa', 'aluno'] as const)
        .filter((area) => area !== panel && !(panel === 'mentor' && area === 'aluno'))
        .map((area) => ({ area, url: panelUrl(panels, area) }))
        .filter((entry): entry is { area: 'empresa' | 'aluno'; url: string } => Boolean(entry.url))
    : [];
  return (
    <main className="auth-split">
      <AuthAside />
      <section className="auth-card auth-page">
        <p className="eyebrow">{copy ? `Licite Comigo · ${copy.title}` : 'Licite Comigo'}</p>
        <h1>{copy ? copy.headline : 'Entrar na conta'}</h1>
        <p className="lead">
          {copy
            ? copy.lead
            : 'Use o e-mail e a senha da sua conta. Cada pessoa cai direto no painel da própria área: Administração, Empresa, Aluno ou Mentor.'}
        </p>
        {demoMode ? (
          <p className="notice">
            Modo demo ativo: os dados exibidos são locais e não representam produção.
          </p>
        ) : null}
        <LoginForm demoMode={demoMode} signupEnabled={signupEnabled} />
        {others.length ? (
          <p className="auth-help">
            {others.map((entry, index) => (
              <span key={entry.area}>
                {index > 0 ? ' · ' : ''}
                <a href={`${entry.url}/login`}>
                  {entry.area === 'empresa' ? 'Sou empresa' : 'Sou aluno'}
                </a>
              </span>
            ))}
          </p>
        ) : null}
      </section>
    </main>
  );
}
