'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AnaAvatar } from '../components/AnaAvatar';
import { AnaLinks, AnaResumo } from './AnaResumo';
import { EVENTO_ABRIR_ANA } from './estado';
import { useAnaChat, useAnaContexto } from './useAnaChat';

type Modo = 'canto' | 'centro';

export function AnaWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<Modo>('canto');
  const campo = useRef<HTMLInputElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const { message, setMessage, messages, loading, askAna } = useAnaChat(
    'Oi! Sou a Ana. Pergunte o que quiser sobre licitações, um edital ou o sistema.',
  );

  const contexto = useAnaContexto(open);

  // O centro da rede (início de cada painel) pede para abrir a conversa no meio da tela.
  useEffect(() => {
    function abrir() {
      setModo('centro');
      setOpen(true);
    }
    window.addEventListener(EVENTO_ABRIR_ANA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ANA, abrir);
  }, []);

  // Esc fecha a janela do centro; ao abrir, o cursor já vai para o campo de pergunta.
  useEffect(() => {
    if (!open || modo !== 'centro') return undefined;
    function aoTeclar(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        setModo('canto');
      }
    }
    window.addEventListener('keydown', aoTeclar);
    const timer = window.setTimeout(() => campo.current?.focus(), 120);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      window.clearTimeout(timer);
    };
  }, [open, modo]);

  useEffect(() => {
    if (open) fim.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, messages.length, loading]);

  // Na página da Ana a conversa já está aberta: sem botão flutuante repetido.
  if (pathname === '/ana') return null;

  if (open && modo === 'centro') {
    const fechar = () => {
      setOpen(false);
      setModo('canto');
    };
    return (
      <aside className="ana-widget open centro" aria-label="Assistente Ana">
        <div
          className="ana-overlay"
          onMouseDown={(event) => event.target === event.currentTarget && fechar()}
        >
          <section
            className="ana-dialogo"
            role="dialog"
            aria-modal="true"
            aria-label="Conversa com a Ana"
          >
            <header className="ana-dialogo-topo">
              <AnaAvatar tamanho="sm" />
              <div>
                <strong>Ana</strong>
                <small>Sua assistente</small>
              </div>
              <button type="button" onClick={fechar} aria-label="Fechar a conversa">
                ×
              </button>
            </header>
            <div className="ana-dialogo-corpo" aria-live="polite">
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
              <div ref={fim} />
            </div>
            <form
              className="ana-dialogo-form"
              onSubmit={(event) => {
                event.preventDefault();
                void askAna();
              }}
            >
              <input
                ref={campo}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Pergunte o que quiser…"
                aria-label="Mensagem para a Ana"
                disabled={loading}
                maxLength={2000}
              />
              <button type="submit" disabled={loading || !message.trim()}>
                {loading ? '…' : 'Enviar'}
              </button>
            </form>
            <p className="ana-dialogo-nota">
              Respostas de apoio. A fonte final é sempre o edital oficial e seus anexos.
            </p>
          </section>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`ana-widget ${open ? 'open' : ''}`} aria-label="Assistente Ana">
      {open ? (
        <div className="ana-panel">
          <div className="ana-panel-heading">
            <div>
              <AnaAvatar tamanho="sm" />
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
          {contexto && messages.length < 2 ? <AnaResumo contexto={contexto} /> : null}
          <div className="ana-messages" aria-live="polite">
            {messages.map((item, index) => (
              <div className={`ana-message ${item.role}`} key={`${item.role}-${index}`}>
                <small>{item.role === 'usuario' ? 'Você' : 'Ana'}</small>
                <p>{item.text}</p>
                {item.links?.length ? <AnaLinks links={item.links} /> : null}
              </div>
            ))}
            {loading ? (
              <div className="ana-message assistente">
                <small>Ana</small>
                <p>Pensando…</p>
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
              placeholder="Pergunte o que quiser…"
              aria-label="Mensagem para Ana"
              disabled={loading}
              maxLength={2000}
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
        {open ? (
          'Minimizar Ana'
        ) : (
          <>
            <AnaAvatar tamanho="mini" />✦ ANA · sua assistente
          </>
        )}
      </button>
    </aside>
  );
}
