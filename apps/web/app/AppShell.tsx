'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AREAS,
  AREA_LABELS,
  AREA_MENUS,
  canOpenPage,
  flatMenu,
  type Area,
  type MenuGroup,
} from '@licitecomigo/shared';
import type { Session } from '../lib/session';
import { Icon } from './components/Icon';
import { NotificationBell } from './components/NotificationBell';

type AppShellProps = Readonly<{ session: Session | null; children: React.ReactNode }>;

const ANONYMOUS_MENU: readonly MenuGroup[] = [
  {
    label: 'Visitante',
    items: [
      { label: 'Explorar licitações', href: '/radar', icon: 'search' },
      { label: 'Academia', href: '/academia', icon: 'cap' },
      { label: 'Entrar', href: '/login', icon: 'lock' },
    ],
  },
];

/** Páginas de entrada: sem sessão, aparecem sozinhas, sem o menu do aplicativo. */
const AUTH_PATHS = [
  '/login',
  '/convite',
  '/signup',
  '/password-recovery',
  '/password-reset',
  '/verify-email',
  '/cancelar-alertas',
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]?.[0]}${parts.at(-1)?.[0]}` : parts[0]?.slice(0, 2) || 'LC'
  ).toUpperCase();
}

function isCurrent(pathname: string, href: string) {
  return href === '/painel' || href === '/admin'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function homeFor(area: Area) {
  return area === 'administracao' ? '/admin' : '/painel';
}

export function AccessDenied() {
  return (
    <main className="ui-denied" role="alert">
      <p className="eyebrow">Acesso restrito</p>
      <h1>Esta página não faz parte da sua área.</h1>
      <p>Use o menu ao lado para voltar ao que está liberado para a sua conta.</p>
      <Link className="ui-btn" href="/painel">
        Ir para o meu painel
      </Link>
    </main>
  );
}

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const area = session?.area ?? null;
  const groups = area ? AREA_MENUS[area] : ANONYMOUS_MENU;
  const current = area ? flatMenu(area).find((item) => isCurrent(pathname, item.href)) : undefined;
  const blocked = session ? !canOpenPage(session.areas_permitidas, pathname) : false;
  const viewingAs = Boolean(session?.plataforma && area && area !== 'administracao');
  const name = session?.nome ?? session?.email ?? 'Visitante';

  async function viewAs(next: Area) {
    if (busy || next === area) return;
    setBusy(true);
    try {
      const response = await fetch('/api/view-as', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ area: next }),
      });
      if (response.ok) {
        router.push(homeFor(next));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  if (!session && pathname === '/') {
    return <div className="auth-shell">{children}</div>;
  }

  if (!session && AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return (
      <div className="auth-shell">
        <header className="auth-shell-bar">
          <Link href="/login" className="sidebar-brand" aria-label="Licite Comigo">
            <span className="sidebar-wordmark">
              Licite<span>Comigo</span>
            </span>
          </Link>
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link
          href={area ? homeFor(area) : '/login'}
          className="sidebar-brand"
          aria-label="Licite Comigo — Início"
        >
          <span className="sidebar-wordmark">
            Licite<span>Comigo</span>
          </span>
        </Link>
        {session && area ? (
          <div className="sidebar-area">
            <strong>{AREA_LABELS[area]}</strong>
            <small>
              {viewingAs
                ? 'Visualização da equipe'
                : area === 'empresa' && session.tenant_nome
                  ? session.tenant_nome
                  : name}
            </small>
          </div>
        ) : null}
        <nav aria-label="Menu do aplicativo">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="sidebar-label">{group.label}</p>
              {group.items.map((item) => (
                <Link
                  href={item.href}
                  key={item.href}
                  className={`sidebar-link ${isCurrent(pathname, item.href) ? 'active' : ''}`}
                  title={item.label}
                >
                  <span className="sidebar-icon" aria-hidden="true">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className="sidebar-text">{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        {session?.plataforma ? (
          <div className="view-as">
            <p className="sidebar-label">Ver como</p>
            <label className="audience-select-label">
              <span className="sr-only">Área que você quer visualizar</span>
              <select
                className="audience-select"
                value={area ?? 'administracao'}
                disabled={busy}
                onChange={(event) => void viewAs(event.target.value as Area)}
              >
                {AREAS.map((option) => (
                  <option key={option} value={option}>
                    {AREA_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
            {viewingAs ? (
              <p className="view-as-note">
                Só muda a tela. Suas permissões continuam as da equipe.
              </p>
            ) : null}
          </div>
        ) : null}
        {session ? (
          <button type="button" className="sidebar-signout" onClick={() => void signOut()}>
            Sair
          </button>
        ) : null}
        <div className="sidebar-bottom">
          <span className="status-dot" /> Acesso protegido
        </div>
      </aside>
      <div className="app-shell-body">
        <header className="app-topbar">
          <div className="topbar-title">
            <strong>{current?.label ?? 'Licite Comigo'}</strong>
            <small>{session ? session.email : 'Você ainda não entrou'}</small>
          </div>
          <div className="topbar-actions">
            {area ? (
              <span className={`area-pill ${viewingAs ? 'area-pill-view' : ''}`}>
                {viewingAs ? `Administração · vendo como ${AREA_LABELS[area]}` : AREA_LABELS[area]}
              </span>
            ) : null}
            {viewingAs ? (
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-small"
                onClick={() => void viewAs('administracao')}
                disabled={busy}
              >
                Voltar à Administração
              </button>
            ) : null}
            {session ? <NotificationBell /> : null}
            <Link
              className="user-avatar"
              href={session ? '/conta' : '/login'}
              title={name}
              aria-label={`Conta de ${name}`}
            >
              {initials(name)}
            </Link>
          </div>
        </header>
        <div className="app-shell-content">{blocked ? <AccessDenied /> : children}</div>
      </div>
    </div>
  );
}
