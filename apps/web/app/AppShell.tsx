import Link from 'next/link';

const existing = [
  ['Início', '/', '⌂'],
  ['Radar', '/radar', '⌕'],
  ['Empresas', '/empresas', '▦'],
  ['Leads', '/leads', '✉'],
  ['Academia', '/academia', '◇'],
  ['Ana', '/ana', '✦'],
  ['Onboarding', '/onboarding', '◌'],
] as const;
const future = ['Agenda', 'Automações', 'Aprovações'];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const demoMode = process.env.DEMO_MODE === 'true';
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/" className="sidebar-brand">
          <span className="sidebar-mark">LC</span>
          <span>
            Licite
            <br />
            Comigo
          </span>
        </Link>
        <p className="sidebar-label">Operação</p>
        <nav aria-label="Menu do aplicativo">
          {existing.map(([label, href, icon]) => (
            <Link href={href} key={href} className="sidebar-link">
              <span aria-hidden="true">{icon}</span>
              {label}
            </Link>
          ))}
          {future.map((label) => (
            <span className="sidebar-link disabled" key={label} aria-disabled="true">
              <span aria-hidden="true">—</span>
              {label}
              <small>Em breve</small>
            </span>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Serviços operacionais protegidos
        </div>
      </aside>
      <div className="app-shell-body">
        <header className="app-topbar">
          <div>
            <span className="topbar-context">Licite Comigo /</span>
            <strong>Área de trabalho</strong>
          </div>
          <div className="topbar-actions">
            <span className={demoMode ? 'demo-chip' : 'secure-chip'}>
              {demoMode ? 'Modo demo' : 'Sessão protegida'}
            </span>
            <Link href="/login">Conta</Link>
          </div>
        </header>
        <div className="app-shell-content">{children}</div>
      </div>
    </div>
  );
}
