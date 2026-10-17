'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const localTenantId = '00000000-0000-0000-0000-000000000001';

export function LoginForm() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState(localTenantId);
  const [email, setEmail] = useState('admin@local.test');
  const [password, setPassword] = useState('local-dev-password');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, email, password }),
      });
      if (!response.ok) throw new Error('login_failed');
      router.push('/radar');
      router.refresh();
    } catch {
      setError('Não foi possível entrar. Confirme o tenant, e-mail e senha do seed local.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label>
        Tenant ID
        <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} required />
      </label>
      <label>
        E-mail
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        Senha
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error ? (
        <p role="alert" className="error-message">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
