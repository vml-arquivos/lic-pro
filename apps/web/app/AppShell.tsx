'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type Me = {
  nome?: string;
  email?: string;
  papel?: string;
  publico?: 'empresa' | 'mentoria' | string | null;
  perfil_jornada?: string | null;
  nivel_diagnostico?: string | null;
};

type MenuItem = { label: string; href: string; icon: string };
type AppShellProps = Readonly<{ children: React.ReactNode }>;

const publicMenu: MenuItem[] = [
  { label: 'Início', href: '/painel', icon: '⌂' },
  { label: 'Explorar licitações', href: '/radar', icon: '⌕' },
  { label: 'Empresas', href: '/empresas', icon: '▥' },
  { label: 'Academia', href: '/academia', icon: '◎' },
  { label: 'Ana', href: '/ana', icon: '✦' },
];

function normalized(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]?.[0]}${parts.at(-1)?.[0]}` : parts[0]?.slice(0, 2) || 'LC'
  ).toUpperCase();
}

function isCurrent(pathname: string, href: string) {
  return href === '/painel'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [switchingProfile, setSwitchingProfile] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/core/me', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as Me;
      })
      .then((account) => {
        if (!controller.signal.aborted) {
          setMe(account);
          setSessionChecked(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setSessionChecked(true);
      });
    return () => controller.abort();
  }, []);

  const role = normalized(me?.papel);
  const profile = normalized(me?.perfil_jornada);
  const canSwitchProfile = Boolean(me && (me.publico === 'empresa' || me.publico === 'mentoria'));
  const currentAudience = me?.publico === 'mentoria' ? 'mentorado' : 'empresário';

  const menu = useMemo(() => {
    const items = [...publicMenu];
    if (sessionChecked && me) {
      items.push(
        { label: 'Alertas', href: '/alertas', icon: '◌' },
        { label: 'Busca salva', href: '/buscas-salvas', icon: '⌑' },
      );
      if (role === 'mentor' || role === 'admin') {
        items.push({ label: 'Painel do mentor', href: '/mentor', icon: '◉' });
      }
      if (role === 'aluno' || profile === 'mentorado' || role === 'admin') {
        items.push({ label: 'Área do mentorado', href: '/mentorado', icon: '◉' });
      }
      if (profile === 'profissional' || role === 'operador' || role === 'admin') {
        items.push({ label: 'Profissional', href: '/profissional', icon: '◈' });
      }
      if (role === 'admin') {
        items.push({ label: 'Leads / admin', href: '/leads', icon: '✉' });
        items.push({ label: 'Admin', href: '/admin', icon: '⚙' });
      }
    }
    return items;
  }, [me, profile, role, sessionChecked]);

  const currentLabel = useMemo(
    () => menu.find((item) => isCurrent(pathname, item.href))?.label ?? 'Licite Comigo',
    [menu, pathname],
  );

  async function toggleProfile() {
    if (!canSwitchProfile || switchingProfile) return;
    const nextPublico = me?.publico === 'mentoria' ? 'empresa' : 'mentoria';
    setSwitchingProfile(true);
    try {
      const response = await fetch('/api/core/me/diagnostico', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publico: nextPublico }),
      });
      if (!response.ok) return;
      const updated = (await response.json()) as Partial<Me>;
      setMe((current) => (current ? { ...current, ...updated, publico: nextPublico } : current));
    } finally {
      setSwitchingProfile(false);
    }
  }

  const name = me?.nome ?? me?.email ?? 'Conta';
  const context =
    me?.perfil_jornada ??
    me?.papel ??
    (sessionChecked ? 'Conta não conectada' : 'Validando sessão…');

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/painel" className="sidebar-brand" aria-label="Licite Comigo — Início">
          <span className="sidebar-wordmark">
            Licite<span>Comigo</span>
          </span>
        </Link>
        <p className="sidebar-label">Meu espaço</p>
        <nav aria-label="Menu do aplicativo">
          {menu.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              className={`sidebar-link ${isCurrent(pathname, item.href) ? 'active' : ''}`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        {canSwitchProfile ? (
          <>
            <p className="sidebar-label sidebar-experience-label">Perfil autorizado</p>
            <button
              className="audience-toggle"
              type="button"
              onClick={toggleProfile}
              disabled={switchingProfile}
            >
              {switchingProfile ? 'Atualizando…' : `Contexto ${currentAudience}`}{' '}
              <span aria-hidden="true">↔</span>
            </button>
          </>
        ) : null}
        {role === 'admin' ? (
          <div className="sidebar-admin-note">
            Permissões administrativas validadas pelo backend.
          </div>
        ) : null}
        <div className="sidebar-bottom">
          <span className="status-dot" /> Serviços operacionais protegidos
        </div>
      </aside>
      <div className="app-shell-body">
        <header className="app-topbar">
          <div className="topbar-title">
            <strong>{currentLabel}</strong>
            <small>{context}</small>
          </div>
          <div className="topbar-actions">
            {canSwitchProfile ? (
              <button
                className="audience-pill"
                type="button"
                onClick={toggleProfile}
                disabled={switchingProfile}
              >
                {currentAudience}
              </button>
            ) : null}
            {me ? (
              <Link className="notification-button" href="/alertas" aria-label="Alertas">
                ◌
              </Link>
            ) : null}
            <span className="user-avatar" title={name} aria-label={`Conta de ${name}`}>
              {initials(name)}
            </span>
          </div>
        </header>
        <div className="app-shell-content">{children}</div>
      </div>
    </div>
  );
}
