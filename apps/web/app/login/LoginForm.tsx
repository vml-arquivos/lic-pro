'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type TenantChoice = { id: string; nome: string };

/** Mensagem por causa real: senha errada não pode se confundir com servidor fora do ar. */
export function loginErrorText(status: number, code?: string): string {
  if (code === 'email_not_verified') return 'Confirme seu e-mail antes de entrar.';
  if (status === 401 || code === 'invalid_credentials') return 'E-mail ou senha incorretos.';
  if (status === 429 || code === 'public_rate_limit') {
    return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
  }
  if (status === 400) return 'Confira o e-mail digitado.';
  return 'Não foi possível falar com o servidor. Isso não é erro de senha: tente de novo em instantes ou avise a equipe técnica.';
}

/** Volta para a página que o usuário queria abrir, só se for um caminho interno. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next') ?? '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/painel';
}

export function LoginForm({
  demoMode,
  signupEnabled,
}: {
  demoMode: boolean;
  signupEnabled: boolean;
}) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string>();
  const [email, setEmail] = useState(demoMode ? 'admin@local.test' : '');
  const [password, setPassword] = useState(demoMode ? 'local-dev-password' : '');
  const [tenants, setTenants] = useState<TenantChoice[]>([]);
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
      const payload = (await response.json().catch(() => ({}))) as {
        tenants?: TenantChoice[];
        error?: string;
      };
      if (response.status === 409 && payload.tenants) {
        setTenants(payload.tenants);
        return;
      }
      if (!response.ok) {
        setError(loginErrorText(response.status, payload.error));
        return;
      }
      router.push(nextPath());
      router.refresh();
    } catch {
      setError(loginErrorText(0, 'network'));
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
        E-mail
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label>
        Senha
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {tenants.length ? (
        <fieldset className="tenant-choices">
          <legend>Escolha a organização</legend>
          {tenants.map((tenant) => (
            <label key={tenant.id}>
              <input
                type="radio"
                name="tenant"
                value={tenant.id}
                checked={tenantId === tenant.id}
                onChange={() => setTenantId(tenant.id)}
                required
              />{' '}
              {tenant.nome}
            </label>
          ))}
          <button type="submit" disabled={loading || !tenantId}>
            {loading ? 'Entrando…' : 'Continuar'}
          </button>
        </fieldset>
      ) : (
        <button type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      )}
      {error ? (
        <p role="alert" className="error-message">
          {error}
        </p>
      ) : null}
      <p className="auth-help">
        <a href="/password-recovery">Esqueci minha senha</a>
        {signupEnabled ? (
          <>
            {' '}
            · <a href="/signup">Criar conta</a>
          </>
        ) : null}
      </p>
    </form>
  );
}
