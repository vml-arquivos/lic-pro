'use client';

import { useState } from 'react';

type LeadFormProps = { id?: string };

export function LeadForm({ id = 'lista-de-espera' }: LeadFormProps) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams(window.location.search);
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome: data.get('nome'),
          email: data.get('email'),
          whatsapp: data.get('whatsapp'),
          perfil: data.get('perfil'),
          consentimento_lgpd: data.get('consentimento_lgpd') === 'on',
          origem: document.referrer || 'site',
          utm_source: params.get('utm_source'),
          utm_medium: params.get('utm_medium'),
          utm_campaign: params.get('utm_campaign'),
          website: data.get('website'),
        }),
      });
      setMessage(
        response.ok
          ? 'Recebemos seu interesse. Obrigado.'
          : 'Não foi possível enviar agora. Tente novamente em instantes.',
      );
      if (response.ok) event.currentTarget.reset();
    } catch {
      setMessage('Não foi possível enviar agora. Tente novamente em instantes.');
    } finally {
      setPending(false);
    }
  }
  return (
    <form id={id} className="lead-form" onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        <label>
          Nome
          <input required name="nome" autoComplete="name" />
        </label>
        <label>
          E-mail
          <input required type="email" name="email" autoComplete="email" />
        </label>
        <label>
          WhatsApp <span>(opcional)</span>
          <input name="whatsapp" autoComplete="tel" />
        </label>
        <label>
          Perfil
          <select name="perfil" defaultValue="empresario">
            <option value="empresario">Empresário</option>
            <option value="mentorado">Mentorado</option>
            <option value="iniciante">Iniciante</option>
          </select>
        </label>
      </div>
      <label className="honeypot" aria-hidden="true">
        Website
        <input tabIndex={-1} name="website" autoComplete="off" />
      </label>
      <label className="consent">
        <input required type="checkbox" name="consentimento_lgpd" /> Li e aceito o uso destes dados
        para contato, conforme a <a href="/privacidade">política de privacidade</a>.
      </label>
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? 'Enviando…' : 'Quero acompanhar'}
      </button>
      {message ? (
        <p role="status" className="form-message">
          {message}
        </p>
      ) : null}
    </form>
  );
}
