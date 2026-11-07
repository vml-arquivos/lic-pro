'use client';

import { Alert, Badge, Empty, Panel, Resource, formatDate, useResource } from '../components/ui';

type Encontro = {
  id: string;
  titulo: string;
  descricao: string | null;
  inicio_at: string;
  link: string | null;
  status: 'agendado' | 'realizado' | 'cancelado';
  turma: string | null;
};
type Data = {
  grupo_url: string | null;
  mentoria_ativa: boolean;
  mentoria_ate: string | null;
  data: Encontro[];
};

const STATUS = {
  agendado: ['Agendado', 'warn'],
  realizado: ['Realizado', 'ok'],
  cancelado: ['Cancelado', 'muted'],
} as const;

export function EncontrosAluno() {
  const [data] = useResource<Data>('/aluno/encontros');
  return (
    <Resource value={data}>
      {({ grupo_url, mentoria_ativa, mentoria_ate, data: items }) => {
        const now = Date.now();
        const proximos = items
          .filter((item) => item.status === 'agendado' && new Date(item.inicio_at).getTime() >= now)
          .sort((a, b) => a.inicio_at.localeCompare(b.inicio_at));
        const anteriores = items.filter((item) => !proximos.includes(item));
        return (
          <>
            {!mentoria_ativa ? (
              <Alert kind="info">
                O período de mentoria da sua turma terminou em {formatDate(mentoria_ate)}. Fale com
                a equipe do curso para renovar.
              </Alert>
            ) : null}
            {grupo_url ? (
              <Panel title="Grupo da turma" description="Dúvidas do dia a dia, com a equipe.">
                <a className="ui-btn" href={grupo_url} target="_blank" rel="noreferrer">
                  Entrar no grupo
                </a>
              </Panel>
            ) : null}
            <Panel title="Próximos encontros">
              {proximos.length === 0 ? (
                <Empty>Nenhum encontro marcado por enquanto.</Empty>
              ) : (
                <ul className="ui-list">
                  {proximos.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.titulo}</strong>
                        <small>
                          {formatDate(item.inicio_at, true)}
                          {item.turma ? ` · ${item.turma}` : ''}
                        </small>
                        {item.descricao ? <p className="cs-answer">{item.descricao}</p> : null}
                        {item.link ? (
                          <small>
                            <a href={item.link} target="_blank" rel="noreferrer">
                              Entrar no encontro
                            </a>
                          </small>
                        ) : null}
                      </div>
                      <Badge tone={STATUS[item.status][1]}>{STATUS[item.status][0]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {anteriores.length ? (
              <Panel title="Anteriores">
                <ul className="ui-list">
                  {anteriores.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.titulo}</strong>
                        <small>{formatDate(item.inicio_at, true)}</small>
                      </div>
                      <Badge tone={STATUS[item.status][1]}>{STATUS[item.status][0]}</Badge>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </>
        );
      }}
    </Resource>
  );
}
