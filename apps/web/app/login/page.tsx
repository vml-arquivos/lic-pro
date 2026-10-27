import { AuthAside } from '../components/AuthAside';
import { LoginForm } from './LoginForm';

export const metadata = {
  title: 'Entrar | Licite Comigo',
  description: 'Acesse o seu painel no Licite Comigo.',
};

export default function LoginPage() {
  const demoMode = process.env.DEMO_MODE === 'true';
  const signupEnabled = process.env.SIGNUP_ENABLED === 'true';
  return (
    <main className="auth-split">
      <AuthAside />
      <section className="auth-card auth-page">
        <p className="eyebrow">Licite Comigo</p>
        <h1>Entrar na conta</h1>
        <p className="lead">
          Use o e-mail e a senha da sua conta. Cada pessoa cai direto no painel da própria área:
          Administração, Empresa, Aluno ou Mentor.
        </p>
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
