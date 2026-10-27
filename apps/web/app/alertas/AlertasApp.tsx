'use client';

import Link from 'next/link';
import { useState } from 'react';
import { send, errorText } from '../../lib/api';
import { Alert, Badge, Empty, Panel, Resource, formatDate, useResource } from '../components/ui';

type Entrega = {
  id: string;
  edital_id: string;
  status: 'pendente' | 'lida';
  tipo: string;
  busca_nome: string | null;
  titulo: string;
  orgao: string | null;
  fonte: string | null;
  data_encerramento_proposta: string | null;
  created_at: string;
};
type Inbox = { data: Entrega[]; nao_lidas: number };
type Preferencias = { pausar_tudo: boolean; email_ativo: boolean; em_app_ativo: boolean };
type PreferenciasResposta = { preferencias: Preferencias; email_disponivel: boolean };

const TIPOS: Record<string, string> = {
  novos: 'Nova oportunidade',
  alteracao: 'Edital alterado',
  prazo: 'Prazo chegando',
};

export function AlertasApp() {
  const [only, setOnly] = useState(false);
  const [inbox, reloadInbox] = useResource<Inbox>(`/alerts?page_size=50&apenas_nao_lidas=${only}`);
  const [prefs, reloadPrefs] = useResource<PreferenciasResposta>('/alerts/preferences');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function markRead(id: string) {
    await send('PATCH', `/alerts/${id}/read`, { lida: true }).catch(() => undefined);
    reloadInbox();
  }

  async function readAll() {
    try {
      await send('POST', '/alerts/read-all');
      reloadInbox();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  async function savePref(change: Partial<Preferencias>) {
    setMessage(null);
    try {
      await send('PUT', '/alerts/preferences', change);
      setMessage({ kind: 'success', text: 'Preferências salvas.' });
      reloadPrefs();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <>
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      <Panel
        title="Como você recebe"
        description="Vale para todas as suas buscas. Cada busca ainda tem frequência e tipos próprios."
      >
        <Resource value={prefs}>
          {({ preferencias, email_disponivel }) => (
            <div className="ui-form al-form">
              <label className="ui-check">
                <input
                  type="checkbox"
                  checked={preferencias.pausar_tudo}
                  onChange={(event) => void savePref({ pausar_tudo: event.target.checked })}
                />
                Pausar todos os avisos
              </label>
              <label className="ui-check">
                <input
                  type="checkbox"
                  checked={preferencias.em_app_ativo}
                  onChange={(event) => void savePref({ em_app_ativo: event.target.checked })}
                />
                Mostrar no sino e nesta página
              </label>
              <label className="ui-check">
                <input
                  type="checkbox"
                  checked={preferencias.email_ativo}
                  disabled={!email_disponivel}
                  onChange={(event) => void savePref({ email_ativo: event.target.checked })}
                />
                Receber resumo por e-mail
              </label>
              {email_disponivel ? null : (
                <p className="rd-hint">
                  O envio de e-mail ainda não foi configurado neste ambiente. Por enquanto os avisos
                  aparecem aqui e no sino.
                </p>
              )}
            </div>
          )}
        </Resource>
      </Panel>

      <Panel
        title="Avisos recebidos"
        actions={
          <div className="ui-table-actions">
            <label className="ui-check">
              <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
              Só não lidos
            </label>
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-small"
              onClick={() => void readAll()}
            >
              Marcar todos como lidos
            </button>
          </div>
        }
      >
        <Resource value={inbox}>
          {({ data }) =>
            data.length === 0 ? (
              <Empty>
                Nenhum aviso ainda. Salve uma busca no <Link href="/radar">Radar</Link>: quando
                surgir algo novo, ele aparece aqui.
              </Empty>
            ) : (
              <ul className="ui-list">
                {data.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>
                        <Link
                          href={`/radar/${item.edital_id}`}
                          onClick={() => void markRead(item.id)}
                        >
                          {item.titulo}
                        </Link>
                      </strong>
                      <small>
                        {item.orgao ?? 'Órgão não informado'} ·{' '}
                        {item.fonte ?? 'fonte não informada'}
                        {item.busca_nome ? ` · busca “${item.busca_nome}”` : ''}
                      </small>
                      <small>
                        Recebido em {formatDate(item.created_at, true)}
                        {item.data_encerramento_proposta
                          ? ` · propostas até ${formatDate(item.data_encerramento_proposta, true)}`
                          : ''}
                      </small>
                    </div>
                    <div className="ui-table-actions">
                      <Badge
                        tone={
                          item.tipo === 'prazo' ? 'warn' : item.tipo === 'alteracao' ? 'bad' : 'ok'
                        }
                      >
                        {TIPOS[item.tipo] ?? item.tipo}
                      </Badge>
                      {item.status === 'pendente' ? <Badge tone="warn">Novo</Badge> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Resource>
      </Panel>
    </>
  );
}
