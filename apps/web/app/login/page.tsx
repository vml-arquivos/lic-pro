import { LoginForm } from './LoginForm';

export default function LoginPage() {
  const demoMode = process.env.DEMO_MODE === 'true';
  const signupEnabled = process.env.SIGNUP_ENABLED === 'true';
  return (
    <main className="auth-page">
      <p className="eyebrow">Licite Comigo</p>
      <h1>Entrar na conta</h1>
      <p className="lead">
        Use seu e-mail e senha. Se o e-mail estiver vinculado a mais de uma organização, você poderá
        escolher depois da validação.
      </p>
      {demoMode ? (
        <p className="notice">
          Modo demo ativo: os dados exibidos são locais e não representam produção.
        </p>
      ) : null}
      <LoginForm demoMode={demoMode} signupEnabled={signupEnabled} />
    </main>
  );
}
