'use client';

import { useEffect, useRef } from 'react';
import { AnaLinks, AnaResumo } from './AnaResumo';
import { useAnaChat, useAnaContexto } from './useAnaChat';

/** Caixa de conversa aberta na página da Ana: histórico e campo de pergunta livre. */
export function AnaChat() {
  const { message, setMessage, messages, loading, askAna } = useAnaChat(
    'Oi! Sou a Ana. Pergunte o que quiser sobre licitações, um edital ou o sistema.',
  );
  const contexto = useAnaContexto(true);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages.length, loading]);

  return (
    <section className="ana-box" aria-label="Conversa com a Ana">
      <div className="ana-box-messages" aria-live="polite">
        {messages.map((item, index) => (
          <div className={`ana-message ${item.role}`} key={`${item.role}-${index}`}>
            <small>{item.role === 'usuario' ? 'Você' : 'Ana'}</small>
            <p>{item.text}</p>
            {item.links?.length ? <AnaLinks links={item.links} /> : null}
          </div>
        ))}
        {contexto && messages.length < 2 ? <AnaResumo contexto={contexto} /> : null}
        {loading ? (
          <div className="ana-message assistente">
            <small>Ana</small>
            <p>Pensando…</p>
          </div>
        ) : null}
        <div ref={end} />
      </div>
      <form
        className="ana-box-input"
        onSubmit={(event) => {
          event.preventDefault();
          void askAna();
        }}
      >
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Pergunte o que quiser…"
          aria-label="Mensagem para Ana"
          disabled={loading}
          maxLength={2000}
          autoFocus
        />
        <button type="submit" disabled={loading || !message.trim()}>
          {loading ? '…' : 'Perguntar'}
        </button>
      </form>
      <p className="ana-box-note">
        Respostas de apoio. A fonte final é sempre o edital oficial e seus anexos.
      </p>
    </section>
  );
}
