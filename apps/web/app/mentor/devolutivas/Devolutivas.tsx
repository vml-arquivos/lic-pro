'use client';

import Link from 'next/link';
import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
import { Alert, Empty, Panel, Resource, formatDate, useResource } from '../../components/ui';

export type Pratica = {
  id: string;
  aluno_id: string;
  aluno: string;
  edital_id: string;
  titulo: string;
  orgao: string | null;
  status: string;
  respostas: Record<string, string>;
  enviada_em: string | null;
  devolutiva: string | null;
  nota: number | null;
  devolvida_em: string | null;
};
export type Pergunta = { id: string; pergunta: string };

export function PraticaCard({
  pratica,
  perguntas,
  canReply,
  onDone,
}: Readonly<{ pratica: Pratica; perguntas: Pergunta[]; canReply: boolean; onDone: () => void }>) {
  const [text, setText] = useState(pratica.devolutiva ?? '');
  const [nota, setNota] = useState(pratica.nota ?? 0);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function reply() {
    setMessage(null);
    try {
      await send('POST', `/mentor/praticas/${pratica.id}/devolutiva`, {
        devolutiva: text,
        ...(nota ? { nota } : {}),
      });
      onDone();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <Panel
      title={pratica.titulo}
      description={`${pratica.aluno} · ${pratica.orgao ?? 'órgão não informado'} · enviada em ${formatDate(pratica.enviada_em, true)}`}
      actions={
        <Link className="ui-btn ui-btn-ghost ui-btn-small" href={`/radar/${pratica.edital_id}`}>
          Abrir o edital
        </Link>
      }
    >
      {perguntas.map((question) => (
        <div key={question.id}>
          <strong>{question.pergunta}</strong>
          <p className="cs-answer">{pratica.respostas[question.id] || '—'}</p>
        </div>
      ))}
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      {canReply ? (
        <div className="ui-form al-form" style={{ maxWidth: '40rem' }}>
          <label>
            Devolutiva
            <textarea
              className="cs-form"
              style={{
                minHeight: '6rem',
                border: '1px solid #c4d1d9',
                borderRadius: '0.5rem',
                padding: '0.6rem',
                font: 'inherit',
              }}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="O que ele acertou, o que faltou olhar e o próximo passo."
            />
          </label>
          <label>
            Nota (1 a 5, opcional)
            <select value={nota} onChange={(event) => setNota(Number(event.target.value))}>
              <option value={0}>Sem nota</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            className="ui-btn"
            disabled={text.trim().length < 10}
            onClick={() => void reply()}
          >
            {pratica.status === 'devolvida' ? 'Atualizar devolutiva' : 'Devolver ao aluno'}
          </button>
        </div>
      ) : null}
    </Panel>
  );
}

export function Devolutivas({ canReply }: Readonly<{ canReply: boolean }>) {
  const [tab, setTab] = useState<'enviada' | 'devolvida'>('enviada');
  const [list, reload] = useResource<{ data: Pratica[]; perguntas: Pergunta[] }>(
    `/mentor/devolutivas?status=${tab}`,
  );
  return (
    <>
      <div className="ui-tabs" role="tablist" aria-label="Situação">
        {(
          [
            ['enviada', 'Para devolver'],
            ['devolvida', 'Já devolvidas'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="ui-tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <Resource value={list}>
        {({ data, perguntas }) =>
          data.length === 0 ? (
            <Panel title={tab === 'enviada' ? 'Nada para devolver' : 'Nenhuma devolutiva ainda'}>
              <Empty>
                {tab === 'enviada'
                  ? 'Quando um aluno enviar uma prática, ela aparece aqui.'
                  : 'As práticas que você devolver ficam aqui.'}
              </Empty>
            </Panel>
          ) : (
            data.map((pratica) => (
              <PraticaCard
                key={pratica.id}
                pratica={pratica}
                perguntas={perguntas}
                canReply={canReply}
                onDone={reload}
              />
            ))
          )
        }
      </Resource>
    </>
  );
}
