import Link from 'next/link';
import { SignupForm } from './SignupForm';
export default function SignupPage() {
  const enabled = process.env.SIGNUP_ENABLED === 'true';
  return (
    <main className="auth-page">
      <Link className="back-link" href="/login">
        ← Voltar ao login
      </Link>
      <p className="eyebrow">Conta</p>
      <h1>Criar conta</h1>
      {enabled ? (
        <SignupForm />
      ) : (
        <p className="notice">
          O cadastro ainda não está aberto. Entre na lista de espera ou use uma conta provisionada
          pela operação.
        </p>
      )}
    </main>
  );
}
