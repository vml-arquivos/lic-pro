'use client';

import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
import { Alert, Badge, Empty, Panel, Resource, formatDate, useResource } from '../../components/ui';

type Encontro = {
  id: string;
  titulo: string;
  inicio_at: string;
  link: string | null;
  status: 'agendado' | 'realizado' | 'cancelado';
  turma: string | null;
};
type Data = { data: Encontro[]; turmas: Array<{ id: string; nome: string }> };

const STATUS = {
  agendado: ['Agendado', 'warn'],
  realizado: ['Realizado', 'ok'],
  cancelado: ['Cancelado', 'muted'],
} as const;

export function EncontrosEquipe() {
  const [data, reload] = useResource<Data>('/mentor/encontros');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function create(form: FormData) {
    setMessage(null);
    const local = String(form.get('inicio') ?? '');
    const turma = String(form.get('turma') ?? '');
    const link = String(form.get('link') ?? '').trim();
    try {
      await send('POST', '/mentor/encontros', {
        titulo: String(form.get('titulo')),
        turma_id: turma || null,
        inicio_at: new Date(`${local}:00-03:00`).toISOString(),
        ...(link ? { link } : {}),
      });
      setMessage({ kind: 'success', text: 'Encontro marcado. Os alunos foram avisados.' });
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  async function setStatus(id: string, status: 'realizado' | 'cancelado') {
    try {
      await send('PATCH', `/mentor/encontros/${id}`, { status });
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <Resource value={data}>
      {({ data: items, turmas }) => (
        <>
          {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
          <Panel title="Marcar encontro">
            <form
              className="ui-form"
              onSubmit={(event) => {
                event.preventDefault();
                void create(new FormData(event.currentTarget));
              }}
            >
              <label>
                Assunto
                <input name="titulo" required minLength={2} maxLength={200} />
              </label>
              <label>
                Turma
                <select name="turma" defaultValue="">
                  <option value="">Todas as turmas</option>
                  {turmas.map((turma) => (
                    <option key={turma.id} value={turma.id}>
                      {turma.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data e hora (Brasília)
                <input name="inicio" type="datetime-local" required />
              </label>
              <label>
                Link do encontro (https)
                <input name="link" type="url" maxLength={500} />
              </label>
              <div className="ui-form-actions">
                <button className="ui-btn" type="submit">
                  Marcar encontro
                </button>
              </div>
            </form>
          </Panel>
          <Panel title="Encontros">
            {items.length === 0 ? (
              <Empty>Nenhum encontro marcado.</Empty>
            ) : (
              <ul className="ui-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.titulo}</strong>
                      <small>
                        {formatDate(item.inicio_at, true)} · {item.turma ?? 'Todas as turmas'}
                      </small>
                      {item.status === 'agendado' ? (
                        <small>
                          <button
                            className="ui-link"
                            type="button"
                            onClick={() => void setStatus(item.id, 'realizado')}
                          >
                            Marcar como realizado
                          </button>{' '}
                          <button
                            className="ui-link"
                            type="button"
                            onClick={() => void setStatus(item.id, 'cancelado')}
                          >
                            Cancelar
                          </button>
                        </small>
                      ) : null}
                    </div>
                    <Badge tone={STATUS[item.status][1]}>{STATUS[item.status][0]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </Resource>
  );
}
