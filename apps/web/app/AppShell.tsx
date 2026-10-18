'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type Audience = 'empresario' | 'mentorado';
type AppShellProps = Readonly<{ children: React.ReactNode; demoMode: boolean }>;

type Me = { nome?: string; papel?: string };

const menu = [
  ['Início', '/', '⌂'],
  ['Explorar licitações', '/radar', '⌕'],
  ['Empresas', '/empresas', '▥'],
  ['Academia', '/academia', '◎'],
  ['Ana', '/ana', '✦'],
] as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]?.[0]}${parts.at(-1)?.[0]}` : parts[0]?.slice(0, 2) || 'UM'
  ).toUpperCase();
}

export function AppShell({ children, demoMode }: AppShellProps) {
  const pathname = usePathname();
  const [audience, setAudience] = useState<Audience>('empresario');
  const [name, setName] = useState('Usuário Licite Comigo');
  const [role, setRole] = useState('');

  useEffect(() => {
    const saved = window.localStorage.getItem('lc-audience');
    if (demoMode && (saved === 'empresario' || saved === 'mentorado')) setAudience(saved);
    const onAudienceChange = () => {
      const next = window.localStorage.getItem('lc-audience');
      if (demoMode && (next === 'empresario' || next === 'mentorado')) setAudience(next);
    };
    window.addEventListener('lc-audience-change', onAudienceChange);
    void fetch('/api/core/me', { cache: 'no-store' })
      .then(async (response) => (response.ok ? ((await response.json()) as Me) : null))
      .then((me) => {
        if (!me) return;
        if (me.nome) setName(me.nome);
        if (me.papel) setRole(me.papel);
      })
      .catch(() => undefined);
    return () => window.removeEventListener('lc-audience-change', onAudienceChange);
  }, [demoMode]);

  const currentLabel = useMemo(
    () => menu.find(([, href]) => href === pathname)?.[0] ?? 'Início',
    [pathname],
  );

  function toggleAudience() {
    if (!demoMode) return;
    const next = audience === 'empresario' ? 'mentorado' : 'empresario';
    setAudience(next);
    window.localStorage.setItem('lc-audience', next);
    window.dispatchEvent(new Event('lc-audience-change'));
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/" className="sidebar-brand" aria-label="Licite Comigo — Início">
          <span className="sidebar-wordmark">
            Licite<span>Comigo</span>
          </span>
        </Link>
        <p className="sidebar-label">Meu espaço</p>
        <nav aria-label="Menu do aplicativo">
          {menu.map(([label, href, icon]) => (
            <Link
              href={href}
              key={href}
              className={`sidebar-link ${pathname === href ? 'active' : ''}`}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </Link>
          ))}
        </nav>
        {demoMode ? (
          <>
            <p className="sidebar-label sidebar-experience-label">Experiência</p>
            <button className="audience-toggle" type="button" onClick={toggleAudience}>
              Alternar público <span aria-hidden="true">↔</span>
            </button>
          </>
        ) : null}
        {role === 'admin' ? (
          <>
            <p className="sidebar-label">Administração</p>
            <Link className={`sidebar-link ${pathname === '/leads' ? 'active' : ''}`} href="/leads">
              <span aria-hidden="true">✉</span>
              Leads
            </Link>
          </>
        ) : null}
        <div className="sidebar-bottom">
          <span className="status-dot" /> Serviços operacionais protegidos
        </div>
      </aside>
      <div className="app-shell-body">
        <header className="app-topbar">
          <div className="topbar-title">
            <strong>{currentLabel}</strong>
            <small>Informação para decidir o próximo passo.</small>
          </div>
          <div className="topbar-actions">
            {demoMode ? (
              <button className="audience-pill" type="button" onClick={toggleAudience}>
                {audience === 'empresario' ? '👔 Empresário' : '🎓 Mentorado'}
              </button>
            ) : (
              <span className="audience-pill">👔 Empresário</span>
            )}
            <button className="notification-button" type="button" aria-label="Notificações">
              🔔
            </button>
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
