'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function PasswordResetContent() {
  const params = useSearchParams();
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    const response = await fetch('/api/auth/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: params.get('token'), password }),
    });
    setMessage(
      response.ok ? 'Senha atualizada. Você pode entrar.' : 'Não foi possível redefinir a senha.',
    );
  }
  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <label>
        Senha forte
        <input required minLength={12} type="password" name="password" />
      </label>
      <button type="submit">Atualizar senha</button>
      {message ? (
        <p className="success-message" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export default function PasswordResetPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Conta</p>
      <h1>Nova senha</h1>
      <Suspense fallback={<p className="notice">Carregando…</p>}>
        <PasswordResetContent />
      </Suspense>
    </main>
  );
}
