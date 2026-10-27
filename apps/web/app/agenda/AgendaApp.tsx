'use client';

import Link from 'next/link';
import { useState } from 'react';
import { errorText, send } from '../../lib/api';
import {
  Alert,
  Badge,
  Empty,
  PageHeader,
  Panel,
  Resource,
  formatDate,
  useResource,
} from '../components/ui';
import { DEADLINE_TYPES, PRIORITY_LABEL, dueLabel, toIso } from '../oportunidades/pipeline-lib';

type Deadline = {
  id: string;
  titulo: string;
  tipo: string;
  vence_em: string;
  status: string;
  fonte: string | null;
  oportunidade_id: string | null;
  edital_titulo: string | null;
};
type Task = {
  id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  status: string;
  vence_em: string | null;
  oportunidade_id: string | null;
  edital_titulo: string | null;
};

export function AgendaApp() {
  const [days, setDays] = useState(60);
  const [agenda, reload] = useResource<{ prazos: Deadline[]; tarefas: Task[] }>(
    `/agenda?dias=${days}`,
  );
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [deadline, setDeadline] = useState({ titulo: '', tipo: 'outro', quando: '' });
  const [task, setTask] = useState({ titulo: '', prioridade: 'normal', quando: '' });

  async function run(action: () => Promise<unknown>, success?: string) {
    try {
      await action();
      if (success) setNotice({ kind: 'success', text: success });
      reload();
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Agenda"
        title="Prazos e tarefas"
        description="Os prazos dos editais que você salvou entram sozinhos. Você recebe um aviso no sino 3 dias e 1 dia antes."
        actions={
          <label className="op-move">
            Mostrar próximos
            <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={30}>30 dias</option>
              <option value={60}>60 dias</option>
              <option value={180}>6 meses</option>
            </select>
          </label>
        }
      />
      {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
      <Resource value={agenda}>
        {(data) => (
          <div className="op-agenda">
            <Panel
              title="Prazos"
              description="Em ordem de vencimento. Atrasados dos últimos 7 dias aparecem primeiro."
            >
              {data.prazos.length === 0 ? (
                <Empty>
                  Nenhum prazo no período. Salve oportunidades no pipeline ou adicione um prazo
                  abaixo.
                </Empty>
              ) : null}
              <ul className="op-list">
                {data.prazos.map((item) => {
                  const due = dueLabel(item.vence_em);
                  return (
                    <li key={item.id}>
                      <span>
                        <strong>{item.titulo}</strong>
                        <small>
                          {formatDate(item.vence_em, true)}
                          {item.edital_titulo ? ' · ' : ''}
                          {item.oportunidade_id && item.edital_titulo ? (
                            <Link href={`/oportunidades/${item.oportunidade_id}`}>
                              {item.edital_titulo}
                            </Link>
                          ) : null}
                        </small>
                      </span>
                      <Badge tone={due.tone}>{due.text}</Badge>
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost ui-btn-small"
                        onClick={() =>
                          void run(
                            () =>
                              send('PATCH', `/agenda/prazos/${item.id}`, { status: 'concluido' }),
                            'Prazo concluído.',
                          )
                        }
                      >
                        Concluir
                      </button>
                      {item.fonte !== 'edital' ? (
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost ui-btn-small"
                          aria-label={`Remover ${item.titulo}`}
                          onClick={() =>
                            void run(
                              () => send('DELETE', `/agenda/prazos/${item.id}`),
                              'Prazo removido.',
                            )
                          }
                        >
                          Remover
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <form
                className="ui-form op-inline"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!deadline.quando || deadline.titulo.trim().length < 2) return;
                  void run(
                    () =>
                      send('POST', '/agenda/prazos', {
                        titulo: deadline.titulo.trim(),
                        tipo: deadline.tipo,
                        vence_em: toIso(deadline.quando),
                      }),
                    'Prazo adicionado.',
                  );
                  setDeadline({ titulo: '', tipo: 'outro', quando: '' });
                }}
              >
                <label>
                  Prazo
                  <input
                    required
                    value={deadline.titulo}
                    maxLength={200}
                    onChange={(event) => setDeadline({ ...deadline, titulo: event.target.value })}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={deadline.tipo}
                    onChange={(event) => setDeadline({ ...deadline, tipo: event.target.value })}
                  >
                    {Object.entries(DEADLINE_TYPES).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quando
                  <input
                    type="datetime-local"
                    required
                    value={deadline.quando}
                    onChange={(event) => setDeadline({ ...deadline, quando: event.target.value })}
                  />
                </label>
                <div className="ui-form-actions">
                  <button type="submit" className="ui-btn">
                    Adicionar prazo
                  </button>
                </div>
              </form>
            </Panel>

            <Panel title="Tarefas" description="O que precisa ser feito, com ou sem data.">
              {data.tarefas.length === 0 ? <Empty>Nenhuma tarefa aberta.</Empty> : null}
              <ul className="op-list">
                {data.tarefas.map((item) => {
                  const due = item.vence_em ? dueLabel(item.vence_em) : null;
                  return (
                    <li key={item.id}>
                      <span>
                        <strong>{item.titulo}</strong>
                        <small>
                          {PRIORITY_LABEL[item.prioridade] ?? item.prioridade}
                          {item.vence_em ? ` · até ${formatDate(item.vence_em, true)}` : ''}
                          {item.oportunidade_id && item.edital_titulo ? ' · ' : ''}
                          {item.oportunidade_id && item.edital_titulo ? (
                            <Link href={`/oportunidades/${item.oportunidade_id}`}>
                              {item.edital_titulo}
                            </Link>
                          ) : null}
                        </small>
                      </span>
                      {due ? <Badge tone={due.tone}>{due.text}</Badge> : null}
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost ui-btn-small"
                        onClick={() =>
                          void run(
                            () => send('PATCH', `/tasks/${item.id}`, { status: 'concluida' }),
                            'Tarefa concluída.',
                          )
                        }
                      >
                        Concluir
                      </button>
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost ui-btn-small"
                        aria-label={`Remover ${item.titulo}`}
                        onClick={() =>
                          void run(() => send('DELETE', `/tasks/${item.id}`), 'Tarefa removida.')
                        }
                      >
                        Remover
                      </button>
                    </li>
                  );
                })}
              </ul>
              <form
                className="ui-form op-inline"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (task.titulo.trim().length < 2) return;
                  void run(
                    () =>
                      send('POST', '/tasks', {
                        titulo: task.titulo.trim(),
                        prioridade: task.prioridade,
                        ...(task.quando ? { vence_em: toIso(task.quando) } : {}),
                      }),
                    'Tarefa adicionada.',
                  );
                  setTask({ titulo: '', prioridade: 'normal', quando: '' });
                }}
              >
                <label>
                  Tarefa
                  <input
                    required
                    value={task.titulo}
                    maxLength={200}
                    onChange={(event) => setTask({ ...task, titulo: event.target.value })}
                  />
                </label>
                <label>
                  Prioridade
                  <select
                    value={task.prioridade}
                    onChange={(event) => setTask({ ...task, prioridade: event.target.value })}
                  >
                    {Object.entries(PRIORITY_LABEL).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Até quando (opcional)
                  <input
                    type="datetime-local"
                    value={task.quando}
                    onChange={(event) => setTask({ ...task, quando: event.target.value })}
                  />
                </label>
                <div className="ui-form-actions">
                  <button type="submit" className="ui-btn">
                    Adicionar tarefa
                  </button>
                </div>
              </form>
            </Panel>
          </div>
        )}
      </Resource>
    </div>
  );
}
