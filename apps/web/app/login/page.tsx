import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Licite Comigo</p>
      <h1>Entrar na conta</h1>
      <p className="lead">
        A sessão é multi-tenant. Em desenvolvimento, use as credenciais criadas pelo seed local; em
        produção, conecte o provedor de identidade revisado pela operação.
      </p>
      <LoginForm />
    </main>
  );
}
