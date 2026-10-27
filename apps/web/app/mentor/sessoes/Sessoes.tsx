'use client';

import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
import { Alert, Badge, Empty, Panel, Resource, formatDate, useResource } from '../../components/ui';
import type { Aluno } from '../../painel/MentorDashboard';

export type Sessao = {
  id: string;
  aluno_id: string;
  aluno?: string;
  titulo: string;
  status: 'agendada' | 'realizada' | 'cancelada';
  inicio_at: string | null;
  fim_at: string | null;
  link: string | null;
  notas: string | null;
  resumo: string | null;
};

const STATUS = {
  agendada: ['Agendada', 'warn'],
  realizada: ['Realizada', 'ok'],
  cancelada: ['Cancelada', 'muted'],
} as const;

export function NovaSessao({
  alunos,
  fixedAluno,
  onDone,
}: Readonly<{
  alunos: Array<Pick<Aluno, 'id' | 'nome'>>;
  fixedAluno?: string;
  onDone: () => void;
}>) {
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  async function submit(form: FormData) {
    setMessage(null);
    const local = String(form.get('inicio') ?? '');
    try {
      await send('POST', '/mentor/sessoes', {
        aluno_id: fixedAluno ?? String(form.get('aluno')),
        titulo: String(form.get('titulo')),
        inicio_at: new Date(`${local}:00-03:00`).toISOString(),
        ...(form.get('link') ? { link: String(form.get('link')) } : {}),
      });
      setMessage({ kind: 'success', text: 'Sessão marcada. O aluno foi avisado.' });
      onDone();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }
  return (
    <>
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      <form
        className="ui-form al-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(new FormData(event.currentTarget));
        }}
      >
        {fixedAluno ? null : (
          <label>
            Aluno
            <select name="aluno" required>
              {alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Assunto
          <input name="titulo" required minLength={3} maxLength={200} />
        </label>
        <label>
          Data e hora (Brasília)
          <input name="inicio" type="datetime-local" required />
        </label>
        <label>
          Link da conversa (opcional)
          <input name="link" type="url" placeholder="https://" />
        </label>
        <button className="ui-btn">Marcar sessão</button>
      </form>
    </>
  );
}

export function SessaoItem({
  sessao,
  canEdit,
  onDone,
}: Readonly<{ sessao: Sessao; canEdit: boolean; onDone: () => void }>) {
  const [resumo, setResumo] = useState(sessao.resumo ?? '');
  const [notas, setNotas] = useState(sessao.notas ?? '');
  const [error, setError] = useState('');
  async function patch(body: Record<string, unknown>) {
    setError('');
    try {
      await send('PATCH', `/mentor/sessoes/${sessao.id}`, body);
      onDone();
    } catch (caught) {
      setError(errorText(caught));
    }
  }
  return (
    <li>
      <div style={{ width: '100%' }}>
        <strong>{sessao.titulo}</strong>
        <small>
          {sessao.aluno ? `${sessao.aluno} · ` : ''}
          {formatDate(sessao.inicio_at, true)}
        </small>
        {error ? <Alert kind="error">{error}</Alert> : null}
        {canEdit ? (
          <div className="ui-form al-form">
            <label>
              Resumo para o aluno
              <textarea
                style={{
                  minHeight: '4rem',
                  border: '1px solid #c4d1d9',
                  borderRadius: '0.5rem',
                  padding: '0.5rem',
                  font: 'inherit',
                }}
                value={resumo}
                onChange={(e) => setResumo(e.target.value)}
              />
            </label>
            <label>
              Anotações privadas
              <textarea
                style={{
                  minHeight: '4rem',
                  border: '1px solid #c4d1d9',
                  borderRadius: '0.5rem',
                  padding: '0.5rem',
                  font: 'inherit',
                }}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </label>
            <div className="ui-table-actions">
              <button
                className="ui-btn ui-btn-small"
                onClick={() =>
                  void patch({
                    resumo,
                    notas,
                    status: sessao.status === 'agendada' ? 'realizada' : sessao.status,
                  })
                }
              >
                {sessao.status === 'agendada' ? 'Salvar e marcar como realizada' : 'Salvar'}
              </button>
              {sessao.status === 'agendada' ? (
                <button
                  className="ui-btn ui-btn-danger ui-btn-small"
                  onClick={() => void patch({ status: 'cancelada' })}
                >
                  Cancelar sessão
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>{sessao.resumo ? <p className="cs-answer">{sessao.resumo}</p> : null}</>
        )}
      </div>
      <Badge tone={STATUS[sessao.status][1]}>{STATUS[sessao.status][0]}</Badge>
    </li>
  );
}

export function Sessoes({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [list, reload] = useResource<{ data: Sessao[] }>('/mentor/sessoes');
  const [alunos] = useResource<{ data: Aluno[] }>('/mentor/alunos');
  return (
    <>
      {canEdit && alunos.state === 'ready' ? (
        <Panel title="Marcar nova sessão">
          {alunos.data.data.length ? (
            <NovaSessao alunos={alunos.data.data} onDone={reload} />
          ) : (
            <Empty>Sem alunos vinculados.</Empty>
          )}
        </Panel>
      ) : null}
      <Panel title="Sessões">
        <Resource value={list}>
          {({ data }) =>
            data.length === 0 ? (
              <Empty>Nenhuma sessão ainda.</Empty>
            ) : (
              <ul className="ui-list">
                {data.map((s) => (
                  <SessaoItem key={s.id} sessao={s} canEdit={canEdit} onDone={reload} />
                ))}
              </ul>
            )
          }
        </Resource>
      </Panel>
    </>
  );
}
