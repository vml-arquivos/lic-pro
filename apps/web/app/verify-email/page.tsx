'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function VerifyEmailContent() {
  const params = useSearchParams();
  const [message, setMessage] = useState('Confirmando…');
  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setMessage('Token ausente.');
      return;
    }
    void fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then((response) =>
      setMessage(
        response.ok ? 'E-mail verificado. Você já pode entrar.' : 'Token inválido ou expirado.',
      ),
    );
  }, [params]);
  return (
    <p className="notice" role="status">
      {message}
    </p>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Conta</p>
      <h1>Verificação de e-mail</h1>
      <Suspense fallback={<p className="notice">Confirmando…</p>}>
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
