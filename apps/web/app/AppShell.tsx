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
  nicho_preferencias?: string[] | null;
};

type MenuItem = { label: string; href: string; icon: string };
type AppShellProps = Readonly<{ children: React.ReactNode }>;

const publicMenu: MenuItem[] = [
  { label: 'Início', href: '/painel', icon: '⌂' },
  { label: 'Explorar licitações', href: '/radar', icon: '⌕' },
  { label: 'Pregões publicados', href: '/pregoes', icon: '◫' },
  { label: 'Oportunidades', href: '/oportunidades', icon: '▣' },
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

const profileOptions = [
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'mentorado', label: 'Mentorado' },
  { value: 'profissional', label: 'Empresário avançado' },
] as const;

function profileLabel(value?: string | null) {
  return profileOptions.find((option) => option.value === value)?.label ?? 'Perfil de jornada';
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
  const canSwitchProfile = Boolean(me);
  const currentAudience = profileLabel(profile);

  const menu = useMemo(() => {
    const items = [...publicMenu];
    if (sessionChecked && me) {
      items.push(
        { label: 'Minha conta', href: '/conta', icon: '◎' },
        { label: 'Alertas', href: '/alertas', icon: '◌' },
        { label: 'Buscas salvas', href: '/buscas-salvas', icon: '⌑' },
      );
      if (role === 'mentor' || role === 'admin') {
        items.push({ label: 'Painel do mentor', href: '/mentor', icon: '◉' });
      }
      if (role === 'aluno' || profile === 'mentorado') {
        items.push({ label: 'Área do mentorado', href: '/mentorado', icon: '◉' });
      }
      if (profile === 'profissional' || role === 'operador') {
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

  async function switchProfile(nextProfile: string) {
    if (
      !canSwitchProfile ||
      switchingProfile ||
      !profileOptions.some((option) => option.value === nextProfile)
    )
      return;
    setSwitchingProfile(true);
    try {
      const response = await fetch('/api/core/me/diagnostico', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ perfil_jornada: nextProfile }),
      });
      if (!response.ok) return;
      const updated = (await response.json()) as Partial<Me>;
      setMe((current) =>
        current ? { ...current, ...updated, perfil_jornada: nextProfile } : current,
      );
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
            <p className="sidebar-label sidebar-experience-label">Mudar público</p>
            <label className="audience-select-label">
              <span className="sr-only">Público da jornada</span>
              <select
                className="audience-select"
                value={profile || 'iniciante'}
                onChange={(event) => void switchProfile(event.target.value)}
                disabled={switchingProfile}
              >
                {profileOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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
            {canSwitchProfile ? <span className="audience-pill">{currentAudience}</span> : null}
            {me ? (
              <Link className="notification-button" href="/alertas" aria-label="Alertas">
                ◌
              </Link>
            ) : null}
            <Link
              className="user-avatar"
              href={me ? '/conta' : '/login'}
              title={name}
              aria-label={`Conta de ${name}`}
            >
              {initials(name)}
            </Link>
          </div>
        </header>
        <div className="app-shell-content">{children}</div>
      </div>
    </div>
  );
}
