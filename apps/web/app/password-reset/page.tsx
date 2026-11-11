'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH, PASSWORD_WEAK_MESSAGE } from '@licitecomigo/shared';

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
    if (response.ok) {
      setMessage('Senha atualizada. Você já pode entrar com a nova senha.');
      return;
    }
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(
      payload.error === 'weak_password'
        ? PASSWORD_WEAK_MESSAGE
        : 'Este link não vale mais. Peça um novo link de redefinição à equipe ou use "Esqueci minha senha".',
    );
  }
  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <label>
        Nova senha
        <input required minLength={PASSWORD_MIN_LENGTH} type="password" name="password" />
        <small>{PASSWORD_HINT}</small>
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
