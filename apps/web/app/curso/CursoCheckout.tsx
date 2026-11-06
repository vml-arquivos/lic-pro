'use client';

import { useState } from 'react';
import { errorText, send } from '../../lib/api';
import { maskDocumento } from '../../lib/money';
import { Alert } from '../components/ui';

type Created = { claim: string; acompanhar_url: string; link_pagamento: string | null };

export function CursoCheckout({ plano }: Readonly<{ plano: string }>) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [documento, setDocumento] = useState('');
  const [aceite, setAceite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await send<Created>('POST', '/public/checkout/curso', {
        plano,
        nome,
        email,
        documento,
        termos_aceitos: aceite,
      });
      // A página da compra acompanha o pagamento e mostra o acesso quando for confirmado.
      window.location.href = `/compra?c=${encodeURIComponent(created.claim)}`;
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  return (
    <form className="shop-form" onSubmit={(event) => void submit(event)}>
      <h2>Quero me matricular</h2>
      <p>Preencha seus dados. Na próxima tela você escolhe Pix, boleto ou cartão.</p>
      <div className="ui-form">
        <label>
          Nome completo
          <input
            required
            minLength={3}
            autoComplete="name"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
          />
        </label>
        <label>
          E-mail
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          CPF ou CNPJ
          <input
            required
            inputMode="numeric"
            autoComplete="off"
            value={documento}
            onChange={(event) => setDocumento(maskDocumento(event.target.value))}
          />
        </label>
      </div>
      <label className="invite-check">
        <input
          type="checkbox"
          checked={aceite}
          onChange={(event) => setAceite(event.target.checked)}
          required
        />
        <span>
          Li e aceito os <a href="/termos">Termos de Uso</a> e a{' '}
          <a href="/privacidade">Política de Privacidade</a>.
        </span>
      </label>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <div className="ui-form-actions">
        <button className="ui-btn" type="submit" disabled={busy || !aceite}>
          {busy ? 'Gerando pagamento…' : 'Ir para o pagamento'}
        </button>
      </div>
      <small className="plan-note">
        O CPF/CNPJ é enviado só ao meio de pagamento, que exige o dado. Não guardamos o número
        completo.
      </small>
    </form>
  );
}
