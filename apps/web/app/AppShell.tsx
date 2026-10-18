'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

const menu = [
  ['Início', '/', '⌂'],
  ['Central de automações', '/automacoes', '⚡'],
  ['Aprovações da ANA', '/aprovacoes', '✓'],
  ['Minha jornada', '/jornada', '◎'],
  ['Explorar licitações', '/radar', '⌕'],
  ['Analisar oportunidade', '/oportunidade', '◈'],
  ['Analisar edital', '/edital', '▤'],
  ['Precificação', '/precificacao', '▦'],
  ['Documentos', '/documentos', '▣'],
  ['Pregões ao vivo', '/pregoes', '◉'],
  ['Mercado e concorrentes', '/mercado', '▥'],
  ['Agenda e participações', '/agenda', '▦'],
  ['Meus fornecedores', '/fornecedores', '♧'],
  ['Plano de 30 dias', '/plano-30-dias', '◷'],
  ['Mentoria', '/mentoria', '✧'],
  ['Assinatura e notas', '/assinatura', '◉'],
] as const;

type Audience = 'empresario' | 'mentorado';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0]}${parts.at(-1)?.[0]}` : parts[0]?.slice(0, 2) || 'UM').toUpperCase();
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [audience, setAudience] = useState<Audience>('empresario');
  const [name, setName] = useState('Usuário Licite Comigo');
  const [role, setRole] = useState('');

  useEffect(() => {
    const saved = window.localStorage.getItem('lc-audience');
    if (saved === 'empresario' || saved === 'mentorado') setAudience(saved);
    const onAudienceChange = () => {
      const next = window.localStorage.getItem('lc-audience');
      if (next === 'empresario' || next === 'mentorado') setAudience(next);
    };
    window.addEventListener('lc-audience-change', onAudienceChange);
    void fetch('/api/core/me', { cache: 'no-store' })
      .then(async (response) => (response.ok ? ((await response.json()) as { nome?: string; publico?: string; papel?: string }) : null))
      .then((me) => {
        if (!me) return;
        if (me.nome) setName(me.nome);
        if (me.papel) setRole(me.papel);
        if (!saved && (me.publico === 'mentoria' || me.papel === 'mentor')) {
          setAudience('mentorado');
          window.localStorage.setItem('lc-audience', 'mentorado');
        }
      })
      .catch(() => undefined);
    return () => window.removeEventListener('lc-audience-change', onAudienceChange);
  }, []);

  const currentLabel = useMemo(
    () => menu.find(([, href]) => href === pathname)?.[0] ?? 'Início',
    [pathname],
  );

  function toggleAudience() {
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
        <p className="sidebar-label sidebar-experience-label">Experiência</p>
        <button className="audience-toggle" type="button" onClick={toggleAudience}>
          Alternar público <span aria-hidden="true">↔</span>
        </button>
        {role === 'admin' ? (
          <>
            <p className="sidebar-label">Administração</p>
            <Link className={`sidebar-link ${pathname === '/leads' ? 'active' : ''}`} href="/leads">
              <span aria-hidden="true">✉</span>
              Painel administrativo
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
            <small>Da oportunidade ao contrato fechado!</small>
          </div>
          <div className="topbar-actions">
            <button className="audience-pill" type="button" onClick={toggleAudience}>
              {audience === 'empresario' ? '👔 Empresário' : '🎓 Mentorado'}
            </button>
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
