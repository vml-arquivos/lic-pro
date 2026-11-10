'use client';

import { useEffect, useRef } from 'react';
import { useAnaChat } from './useAnaChat';

/** Caixa de conversa aberta na página da Ana: perguntas sugeridas, histórico e campo de envio. */
export function AnaChat({ sugestoes }: Readonly<{ sugestoes: readonly string[] }>) {
  const { message, setMessage, messages, loading, askAna } = useAnaChat(
    'Oi! Sou a Ana. Pergunte sobre licitações, um edital ou quanto o governo pagou por um item.',
  );
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
          </div>
        ))}
        {loading ? (
          <div className="ana-message assistente">
            <small>Ana</small>
            <p>Consultando o contexto autorizado…</p>
          </div>
        ) : null}
        <div ref={end} />
      </div>
      {messages.length < 2 ? (
        <div className="ana-box-suggestions">
          {sugestoes.map((text) => (
            <button key={text} type="button" onClick={() => void askAna(text)} disabled={loading}>
              {text}
            </button>
          ))}
        </div>
      ) : null}
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
          placeholder="Pergunte alguma coisa à Ana…"
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
