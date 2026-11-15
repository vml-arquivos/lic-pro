'use client';

import { Badge, Empty, Panel, Resource, formatDate, useResource } from '../components/ui';

type Data = {
  mentores: Array<{ id: string; nome: string }>;
  sessoes: Array<{
    id: string;
    titulo: string;
    status: 'agendada' | 'realizada' | 'cancelada';
    inicio_at: string | null;
    link: string | null;
    resumo: string | null;
    mentor: string;
  }>;
  notas: Array<{ id: string; texto: string; created_at: string; mentor: string }>;
};

const STATUS = {
  agendada: ['Agendada', 'warn'],
  realizada: ['Realizada', 'ok'],
  cancelada: ['Cancelada', 'muted'],
} as const;

export function MentoriaAluno() {
  const [data] = useResource<Data>('/aluno/mentoria');
  return (
    <Resource value={data}>
      {({ mentores, sessoes, notas }) => (
        <>
          <Panel title="Seu mentor">
            {mentores.length ? (
              <ul className="ui-list">
                {mentores.map((mentor) => (
                  <li key={mentor.id}>{mentor.nome}</li>
                ))}
              </ul>
            ) : (
              <Empty>
                Você ainda não tem um mentor definido. A equipe do curso faz esse vínculo.
              </Empty>
            )}
          </Panel>
          <Panel title="Sessões">
            {sessoes.length === 0 ? (
              <Empty>Nenhuma sessão marcada.</Empty>
            ) : (
              <ul className="ui-list">
                {sessoes.map((session) => (
                  <li key={session.id}>
                    <div>
                      <strong>{session.titulo}</strong>
                      <small>
                        {formatDate(session.inicio_at, true)} · {session.mentor}
                      </small>
                      {session.link ? (
                        <small>
                          <a href={session.link} target="_blank" rel="noreferrer">
                            Entrar na sessão
                          </a>
                        </small>
                      ) : null}
                      {session.resumo ? <p className="cs-answer">{session.resumo}</p> : null}
                    </div>
                    <Badge tone={STATUS[session.status][1]}>{STATUS[session.status][0]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel
            title="Recados do mentor"
            description="Só aparece o que o mentor escolheu compartilhar com você."
          >
            {notas.length === 0 ? (
              <Empty>Nenhum recado por enquanto.</Empty>
            ) : (
              <ul className="ui-list">
                {notas.map((note) => (
                  <li key={note.id}>
                    <div>
                      <p className="cs-answer">{note.texto}</p>
                      <small>
                        {note.mentor} · {formatDate(note.created_at, true)}
                      </small>
                    </div>
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
