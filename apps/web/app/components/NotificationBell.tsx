'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, send } from '../../lib/api';

type Notification = {
  id: string;
  titulo: string;
  mensagem: string;
  lida_em: string | null;
  created_at: string;
  dados?: { link?: string } | null;
};

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      const result = await api<{ data: Notification[]; nao_lidas: number }>(
        '/notifications?limit=10',
      );
      setItems(result.data);
      setUnread(result.nao_lidas);
    } catch {
      /* sem sessão ou serviço fora: o sino fica vazio */
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function markRead(id: string) {
    setItems((list) =>
      list.map((item) => (item.id === id ? { ...item, lida_em: new Date().toISOString() } : item)),
    );
    setUnread((value) => Math.max(0, value - 1));
    await send('PATCH', `/notifications/${id}/read`).catch(() => undefined);
  }

  async function readAll() {
    setItems((list) =>
      list.map((item) => ({ ...item, lida_em: item.lida_em ?? new Date().toISOString() })),
    );
    setUnread(0);
    await send('POST', '/notifications/read-all').catch(() => undefined);
  }

  return (
    <div className="bell" ref={box}>
      <button
        type="button"
        className="bell-button"
        aria-label={unread ? `Notificações: ${unread} não lida(s)` : 'Notificações'}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load();
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 ? <span className="bell-count">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="bell-panel" role="dialog" aria-label="Notificações">
          <div className="bell-head">
            <strong>Notificações</strong>
            {unread > 0 ? (
              <button type="button" className="bell-link" onClick={() => void readAll()}>
                Marcar todas como lidas
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="bell-empty">Nada por aqui ainda.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id} className={item.lida_em ? '' : 'bell-unread'}>
                  <Link
                    href={item.dados?.link ?? '/alertas'}
                    onClick={() => {
                      setOpen(false);
                      if (!item.lida_em) void markRead(item.id);
                    }}
                  >
                    <strong>{item.titulo}</strong>
                    {item.mensagem ? <span>{item.mensagem}</span> : null}
                    <small>{when(item.created_at)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
