'use client';
import { useState } from 'react';
export default function RecoveryPage() {
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    const response = await fetch('/api/auth/password-recovery', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setMessage(
      response.ok
        ? 'Se o e-mail estiver cadastrado, enviaremos instruções.'
        : 'Não foi possível processar agora.',
    );
  }
  return (
    <main className="auth-page">
      <p className="eyebrow">Conta</p>
      <h1>Recuperar senha</h1>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          E-mail
          <input required type="email" name="email" />
        </label>
        <button type="submit">Enviar instruções</button>
        {message ? (
          <p className="success-message" role="status">
            {message}
          </p>
        ) : null}
      </form>
    </main>
  );
}
