'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAnaChat } from './useAnaChat';

export function AnaWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { message, setMessage, messages, loading, askAna } = useAnaChat(
    'Pergunte sobre licitações, um edital ou o próximo ponto para conferir.',
  );

  // Na página da Ana a conversa já está aberta: sem botão flutuante repetido.
  if (pathname === '/ana') return null;

  return (
    <aside className={`ana-widget ${open ? 'open' : ''}`} aria-label="Assistente Ana">
      {open ? (
        <div className="ana-panel">
          <div className="ana-panel-heading">
            <div>
              <strong>✦ ANA · sua assistente</strong>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Minimizar Ana">
              −
            </button>
          </div>
          <p className="ana-intro">
            Respostas de apoio, com limites claros. A fonte final continua sendo o edital oficial e
            seus anexos.
          </p>
          <div className="ana-quick-actions">
            <button type="button" onClick={() => void askAna('Qual é o próximo passo?')}>
              Próximo passo
            </button>
            <button type="button" onClick={() => void askAna('Quais documentos devo conferir?')}>
              Documentos
            </button>
            <button type="button" onClick={() => void askAna('Como analisar uma oportunidade?')}>
              Analisar oportunidade
            </button>
          </div>
          <div className="ana-messages" aria-live="polite">
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
          </div>
          <div className="ana-input-row">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void askAna();
              }}
              placeholder="Ex.: o que é habilitação?"
              aria-label="Mensagem para Ana"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => void askAna()}
              disabled={loading || !message.trim()}
            >
              {loading ? '…' : 'Enviar'}
            </button>
          </div>
        </div>
      ) : null}
      <button className="ana-fab" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Minimizar Ana' : '✦ ANA · sua assistente'}
      </button>
    </aside>
  );
}
