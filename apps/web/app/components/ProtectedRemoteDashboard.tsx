'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Me = {
  nome?: string;
  email?: string;
  papel?: string;
  publico?: string | null;
  perfil_jornada?: string | null;
  nivel_diagnostico?: string | null;
};

type DashboardKind =
  | 'painel'
  | 'mentor'
  | 'mentorado'
  | 'profissional'
  | 'admin'
  | 'alertas'
  | 'buscas-salvas'
  | 'oportunidades';

type ResourceConfig = {
  label: string;
  endpoint: string;
};

type ResourceState = ResourceConfig & {
  status: 'loading' | 'ready' | 'error';
  data: unknown;
  error?: string;
};

const dashboardConfig: Record<
  DashboardKind,
  {
    eyebrow: string;
    title: string;
    description: string;
    resources: ResourceConfig[];
    allowedRoles?: string[];
    requiredProfile?: string;
  }
> = {
  painel: {
    eyebrow: 'Painel',
    title: 'Painel da conta',
    description: 'Resumo operacional retornado pela sua conta e pelo tenant atual.',
    resources: [{ label: 'Resumo', endpoint: '/api/core/dashboard/summary' }],
  },
  mentor: {
    eyebrow: 'Mentoria',
    title: 'Painel do mentor',
    description: 'Acompanhamento de mentorados e empresas com concessão explícita.',
    allowedRoles: ['admin', 'mentor'],
    resources: [
      { label: 'Mentorados', endpoint: '/api/core/mentor/dashboard' },
      { label: 'Empresas concedidas', endpoint: '/api/core/mentor/companies' },
    ],
  },
  mentorado: {
    eyebrow: 'Mentorado',
    title: 'Meu acompanhamento',
    description: 'Dados da jornada e do acompanhamento vinculados à sua conta.',
    requiredProfile: 'mentorado',
    resources: [{ label: 'Dashboard do mentorado', endpoint: '/api/core/mentorado/dashboard' }],
  },
  profissional: {
    eyebrow: 'Profissional',
    title: 'Painel profissional',
    description: 'Indicadores profissionais retornados pelo backend para o seu perfil.',
    requiredProfile: 'profissional',
    resources: [{ label: 'Dashboard profissional', endpoint: '/api/core/professional/dashboard' }],
  },
  admin: {
    eyebrow: 'Administração',
    title: 'Operação e governança',
    description: 'Usuários, auditoria e status de ingestão sem dados de demonstração.',
    allowedRoles: ['admin'],
    resources: [
      { label: 'Usuários', endpoint: '/api/core/users' },
      { label: 'Auditoria', endpoint: '/api/core/admin/audit' },
      { label: 'Ingestão', endpoint: '/api/core/operations/ingest' },
    ],
  },
  alertas: {
    eyebrow: 'Alertas',
    title: 'Alertas da conta',
    description: 'Notificações retornadas pelos serviços autorizados para esta conta.',
    resources: [{ label: 'Alertas', endpoint: '/api/core/alerts' }],
  },
  'buscas-salvas': {
    eyebrow: 'Buscas salvas',
    title: 'Buscas salvas',
    description: 'Consultas salvas e retornadas pelo backend para o seu escopo.',
    resources: [{ label: 'Buscas', endpoint: '/api/core/saved-searches' }],
  },
  oportunidades: {
    eyebrow: 'Oportunidades',
    title: 'Oportunidades salvas',
    description: 'Editais que sua conta colocou no pipeline, sempre vinculados à fonte original.',
    resources: [{ label: 'Pipeline', endpoint: '/api/core/opportunities' }],
  },
};

function roleName(me: Me) {
  return (me.papel ?? '').trim().toLowerCase();
}

function isAllowed(kind: DashboardKind, me: Me) {
  const config = dashboardConfig[kind];
  const role = roleName(me);
  if (config.allowedRoles && !config.allowedRoles.includes(role)) return false;
  if (config.requiredProfile && config.requiredProfile !== me.perfil_jornada && role !== 'admin') {
    return false;
  }
  return true;
}

function messageForStatus(status: number) {
  if (status === 401) return 'Entre na sua conta para acessar este painel.';
  if (status === 403) return 'Sua conta não possui permissão para acessar este painel.';
  if (status === 404) return 'Este serviço ainda não está disponível para esta conta.';
  return 'Não foi possível carregar este serviço agora.';
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { response: text };
  }
}

function unwrapData(data: unknown): unknown {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'data' in data) {
    return (data as { data?: unknown }).data;
  }
  return data;
}

function isEmpty(data: unknown) {
  const value = unwrapData(data);
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    const values = Object.values(value as Record<string, unknown>);
    return values.length === 0 || values.every((item) => Array.isArray(item) && item.length === 0);
  }
  return false;
}

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ResourceCard({ resource }: { resource: ResourceState }) {
  const value = unwrapData(resource.data);
  const items = Array.isArray(value) ? value : null;

  return (
    <section className="remote-resource" aria-labelledby={`resource-${resource.label}`}>
      <div className="remote-resource-heading">
        <div>
          <p className="eyebrow">Fonte protegida</p>
          <h2 id={`resource-${resource.label}`}>{resource.label}</h2>
        </div>
        <code>{resource.endpoint}</code>
      </div>
      {resource.status === 'loading' ? <p className="remote-state">Carregando…</p> : null}
      {resource.status === 'error' ? (
        <div className="remote-error" role="alert">
          <strong>Não foi possível consultar este recurso.</strong>
          <p>{resource.error}</p>
        </div>
      ) : null}
      {resource.status === 'ready' && isEmpty(resource.data) ? (
        <div className="remote-empty">
          <h3>Nenhum registro retornado</h3>
          <p>O backend respondeu sem dados para este escopo.</p>
        </div>
      ) : null}
      {resource.status === 'ready' && !isEmpty(resource.data) && items ? (
        <div className="remote-items">
          {items.map((item, index) => (
            <article
              className="remote-item"
              key={typeof item === 'object' && item && 'id' in item ? String(item.id) : index}
            >
              {item && typeof item === 'object' ? (
                Object.entries(item as Record<string, unknown>).map(([key, itemValue]) => (
                  <div className="remote-field" key={key}>
                    <span>{key.replaceAll('_', ' ')}</span>
                    <strong>{valueLabel(itemValue)}</strong>
                  </div>
                ))
              ) : (
                <strong>{valueLabel(item)}</strong>
              )}
            </article>
          ))}
        </div>
      ) : null}
      {resource.status === 'ready' && !isEmpty(resource.data) && !items ? (
        <pre className="remote-json">{JSON.stringify(value, null, 2)}</pre>
      ) : null}
    </section>
  );
}

export function ProtectedRemoteDashboard({ kind }: { kind: DashboardKind }) {
  const config = dashboardConfig[kind];
  const [me, setMe] = useState<Me | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'loading' | 'ready' | 'denied' | 'error'>(
    'loading',
  );
  const [sessionMessage, setSessionMessage] = useState('');
  const [resources, setResources] = useState<ResourceState[]>(
    config.resources.map((resource) => ({ ...resource, status: 'loading', data: null })),
  );

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const meResponse = await fetch('/api/core/me', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (meResponse.status === 401 || meResponse.status === 403) {
          setSessionStatus('denied');
          setSessionMessage(messageForStatus(meResponse.status));
          return;
        }
        if (!meResponse.ok) throw new Error(messageForStatus(meResponse.status));
        const account = (await meResponse.json()) as Me;
        setMe(account);
        if (!isAllowed(kind, account)) {
          setSessionStatus('denied');
          setSessionMessage('Seu perfil não possui contexto autorizado para esta área.');
          return;
        }
        setSessionStatus('ready');
        const next = await Promise.all(
          config.resources.map(async (resource): Promise<ResourceState> => {
            try {
              const response = await fetch(resource.endpoint, {
                cache: 'no-store',
                signal: controller.signal,
              });
              const data = await readResponse(response);
              return response.ok
                ? { ...resource, status: 'ready', data }
                : {
                    ...resource,
                    status: 'error',
                    data: null,
                    error: messageForStatus(response.status),
                  };
            } catch {
              return {
                ...resource,
                status: 'error',
                data: null,
                error: 'O serviço não respondeu. Tente novamente mais tarde.',
              };
            }
          }),
        );
        setResources(next);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSessionStatus('error');
        setSessionMessage(
          error instanceof Error ? error.message : 'Não foi possível validar a sessão.',
        );
      }
    }
    void load();
    return () => controller.abort();
  }, [config.resources, kind]);

  const accountLabel = useMemo(() => me?.nome ?? me?.email ?? 'conta', [me]);

  return (
    <main className="account-dashboard">
      <div className="page-heading">
        <p className="eyebrow">{config.eyebrow}</p>
        <h1>{config.title}</h1>
        <p>{config.description}</p>
      </div>
      {sessionStatus === 'loading' ? (
        <p className="notice">Validando o acesso de {accountLabel}…</p>
      ) : null}
      {sessionStatus === 'denied' ? (
        <section className="access-denied" role="alert">
          <p className="eyebrow">Acesso negado</p>
          <h2>Esta área não está disponível para sua conta.</h2>
          <p>{sessionMessage}</p>
          <Link className="button-secondary" href="/login">
            Entrar com outra conta
          </Link>
        </section>
      ) : null}
      {sessionStatus === 'error' ? (
        <section className="remote-error" role="alert">
          <strong>Não foi possível validar o acesso.</strong>
          <p>{sessionMessage}</p>
        </section>
      ) : null}
      {sessionStatus === 'ready' ? (
        <div className="remote-resource-grid">
          {resources.map((resource) => (
            <ResourceCard key={resource.endpoint} resource={resource} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
