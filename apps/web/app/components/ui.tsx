'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../lib/api';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: Readonly<{
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}>) {
  return (
    <header className="ui-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ui-header-actions">{actions}</div> : null}
    </header>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone,
}: Readonly<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'warn' | 'ok' | undefined;
}>) {
  return (
    <article className={`ui-kpi ${tone ? `ui-kpi-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
}: Readonly<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

const TONES: Record<string, 'ok' | 'warn' | 'bad' | 'muted'> = {
  ativo: 'ok',
  ativa: 'ok',
  aceito: 'ok',
  pendente: 'warn',
  expirado: 'muted',
  revogado: 'muted',
  encerrada: 'muted',
  inativo: 'bad',
  novo: 'warn',
};

export function Badge({ children, tone }: Readonly<{ children: string; tone?: string }>) {
  const resolved = tone ?? TONES[children.toLowerCase()] ?? 'muted';
  const label = children.charAt(0).toUpperCase() + children.slice(1);
  return <span className={`ui-badge ui-badge-${resolved}`}>{label}</span>;
}

export function Empty({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="ui-empty">{children}</p>;
}

export function Alert({
  kind,
  children,
}: Readonly<{ kind: 'error' | 'success' | 'info'; children: React.ReactNode }>) {
  return (
    <p className={`ui-alert ui-alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

export function Table({
  head,
  children,
  label,
}: Readonly<{ head: string[]; children: React.ReactNode; label: string }>) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table" aria-label={label}>
        <thead>
          <tr>
            {head.map((title) => (
              <th key={title} scope="col">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function formatDate(value?: string | null, withTime = false): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return withTime
    ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : date.toLocaleDateString('pt-BR');
}

export function formatNumber(value?: number | null): string {
  return typeof value === 'number' ? value.toLocaleString('pt-BR') : '—';
}

export type Loaded<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

/** Carrega um recurso do core-api e permite recarregar depois de uma ação. */
export function useResource<T>(path: string): [Loaded<T>, () => void] {
  const [value, setValue] = useState<Loaded<T>>({ state: 'loading' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    api<T>(path)
      .then((data) => active && setValue({ state: 'ready', data }))
      .catch((error: unknown) => active && setValue({ state: 'error', message: errorText(error) }));
    return () => {
      active = false;
    };
  }, [path, version]);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  return [value, reload];
}

export function Resource<T>({
  value,
  children,
}: Readonly<{ value: Loaded<T>; children: (data: T) => React.ReactNode }>) {
  if (value.state === 'loading') return <p className="ui-loading">Carregando…</p>;
  if (value.state === 'error') return <Alert kind="error">{value.message}</Alert>;
  return <>{children(value.data)}</>;
}
