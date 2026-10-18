'use client';
import { useState } from 'react';
export function SignupForm() {
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nome: data.get('nome'),
        empresa_nome: data.get('empresa_nome'),
        email: data.get('email'),
        password: data.get('password'),
        termos_aceitos: data.get('termos') === 'on',
        privacidade_aceita: data.get('privacidade') === 'on',
      }),
    });
    setMessage(
      response.ok
        ? 'Cadastro recebido. Verifique seu e-mail para ativar a conta.'
        : 'Não foi possível criar a conta. Confira os dados e tente novamente.',
    );
  }
  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <label>
        Nome
        <input required name="nome" />
      </label>
      <label>
        Empresa
        <input required name="empresa_nome" />
      </label>
      <label>
        E-mail
        <input required type="email" name="email" autoComplete="email" />
      </label>
      <label>
        Senha forte
        <input
          required
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={12}
        />
      </label>
      <label className="check-label">
        <input required type="checkbox" name="termos" /> Aceito os{' '}
        <a href="/termos">Termos de Uso</a>.
      </label>
      <label className="check-label">
        <input required type="checkbox" name="privacidade" /> Aceito a{' '}
        <a href="/privacidade">Política de Privacidade</a>.
      </label>
      <button type="submit">Criar conta</button>
      {message ? (
        <p className="success-message" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
