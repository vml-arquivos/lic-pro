import { PANEL_COPY } from '@licitecomigo/shared';
import { currentPanel } from '../../lib/panel';
import { LoginForm } from './LoginForm';

export const metadata = {
  title: 'Entrar | Licite Comigo',
  description: 'Acesse o seu painel no Licite Comigo.',
};

export default function LoginPage() {
  const demoMode = process.env.DEMO_MODE === 'true';
  const signupEnabled = process.env.SIGNUP_ENABLED === 'true';
  const panel = currentPanel();
  return (
    <main className="auth-single">
      <section className="auth-card auth-page">
        {panel ? <p className="eyebrow">{PANEL_COPY[panel].title}</p> : null}
        <h1>Entrar</h1>
        {demoMode ? (
          <p className="notice">
            Modo demo ativo: os dados exibidos são locais e não representam produção.
          </p>
        ) : null}
        <LoginForm demoMode={demoMode} signupEnabled={signupEnabled} />
      </section>
    </main>
  );
}
