'use client';

import { useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';

export function SignupForm() {
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nichos = [
      ...new Set(
        ['nicho_1', 'nicho_2', 'nicho_3']
          .map((key) => data.get(key))
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      ),
    ];
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nome: data.get('nome'),
        empresa_nome: data.get('empresa_nome'),
        email: data.get('email'),
        password: data.get('password'),
        nichos,
        termos_aceitos: data.get('termos') === 'on',
        privacidade_aceita: data.get('privacidade') === 'on',
      }),
    });
    setMessage(
      response.ok
        ? 'Cadastro recebido. Verifique seu e-mail para ativar a conta.'
        : response.status === 400
          ? 'Escolha de um a três nichos e confira os demais dados.'
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
      <fieldset className="auth-fieldset">
        <legend>Nichos de atuação</legend>
        <p className="form-hint">
          Escolha de um a três nichos para receber oportunidades e alertas do seu escopo.
        </p>
        {[1, 2, 3].map((index) => (
          <label key={index}>
            {`Nicho ${index}`}
            <select name={`nicho_${index}`} required={index === 1} defaultValue="">
              <option value="">{index === 1 ? 'Selecione um nicho' : 'Não usar este campo'}</option>
              {NICHE_CATALOG.map((niche) => (
                <option key={niche.code} value={niche.code}>
                  {niche.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <small>Os resultados continuam dependendo de edital e fonte oficial capturados.</small>
      </fieldset>
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
