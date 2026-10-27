'use client';

import { useState } from 'react';
import { errorText, send } from '../../../../lib/api';
import {
  Alert,
  Badge,
  Empty,
  Kpi,
  PageHeader,
  Panel,
  Resource,
  formatDate,
  useResource,
} from '../../../components/ui';
import { PraticaCard, type Pergunta, type Pratica } from '../../devolutivas/Devolutivas';
import { NovaSessao, SessaoItem, type Sessao } from '../../sessoes/Sessoes';

type Dia = {
  dia: number;
  objetivo: string;
  atividade: string;
  tipo: string;
  status: 'pendente' | 'feito' | 'revisado';
  data: string;
  comentario_mentor: string | null;
  ajustado_pelo_mentor: boolean;
};
type Detail = {
  aluno: { id: string; nome: string; email: string };
  aulas: Array<{
    trilha: string;
    modulo: string;
    aula: string;
    concluida: boolean;
    percentual: number;
    updated_at: string | null;
  }>;
  questionarios: Array<{ titulo: string; melhor_nota: number | null; tentativas: number }>;
  plano: {
    inicio: string;
    dias: Dia[];
    resumo: { total: number; feitos: number; revisados: number; percentual: number };
  } | null;
  praticas: Pratica[];
  notas: Array<{
    id: string;
    texto: string;
    visibilidade: 'privada' | 'compartilhada';
    created_at: string;
  }>;
  sessoes: Sessao[];
  certificados: Array<{ codigo: string; emitido_em: string; titulo: string }>;
  perguntas: Pergunta[];
};

const TABS = [
  ['progresso', 'Progresso'],
  ['plano', 'Plano de 30 dias'],
  ['praticas', 'Práticas'],
  ['notas', 'Anotações'],
  ['sessoes', 'Sessões'],
] as const;
type Tab = (typeof TABS)[number][0];

const textarea = {
  minHeight: '5rem',
  border: '1px solid #c4d1d9',
  borderRadius: '0.5rem',
  padding: '0.6rem',
  font: 'inherit',
  width: '100%',
} as const;

export function AlunoDetalhe({
  alunoId,
  canEdit,
}: Readonly<{ alunoId: string; canEdit: boolean }>) {
  const [detail, reload] = useResource<Detail>(`/mentor/alunos/${alunoId}`);
  const [tab, setTab] = useState<Tab>('progresso');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function act(action: () => Promise<unknown>, ok: string) {
    setMessage(null);
    try {
      await action();
      setMessage({ kind: 'success', text: ok });
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <Resource value={detail}>
      {(data) => {
        const done = data.aulas.filter((a) => a.concluida).length;
        const pendingPractices = data.praticas.filter((p) => p.status === 'enviada').length;
        return (
          <>
            <PageHeader eyebrow="Aluno" title={data.aluno.nome} description={data.aluno.email} />
            <div className="ui-kpis">
              <Kpi label="Aulas concluídas" value={`${done}/${data.aulas.length}`} />
              <Kpi
                label="Plano de 30 dias"
                value={
                  data.plano
                    ? `${data.plano.resumo.feitos}/${data.plano.resumo.total}`
                    : 'Sem plano'
                }
              />
              <Kpi
                label="Práticas para devolver"
                value={pendingPractices}
                tone={pendingPractices ? 'warn' : 'ok'}
              />
              <Kpi label="Certificados" value={data.certificados.length} />
            </div>
            <div className="ui-tabs" role="tablist" aria-label="Seções do aluno">
              {TABS.map(([key, label]) => (
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
            {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}

            {tab === 'progresso' ? (
              <>
                <Panel title="Aulas">
                  {data.aulas.length === 0 ? (
                    <Empty>Nenhuma aula cadastrada.</Empty>
                  ) : (
                    <ul className="ui-list">
                      {data.aulas.map((lesson) => (
                        <li key={`${lesson.trilha}-${lesson.modulo}-${lesson.aula}`}>
                          <div>
                            <strong>{lesson.aula}</strong>
                            <small>
                              {lesson.trilha} · {lesson.modulo}
                              {lesson.updated_at ? ` · ${formatDate(lesson.updated_at)}` : ''}
                            </small>
                          </div>
                          {lesson.concluida ? (
                            <Badge tone="ok">Concluída</Badge>
                          ) : lesson.percentual ? (
                            <Badge tone="warn">Em andamento</Badge>
                          ) : (
                            <Badge tone="muted">Não iniciada</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
                <Panel title="Questionários">
                  {data.questionarios.length === 0 ? (
                    <Empty>Nenhuma tentativa ainda.</Empty>
                  ) : (
                    <ul className="ui-list">
                      {data.questionarios.map((quiz) => (
                        <li key={quiz.titulo}>
                          {quiz.titulo}
                          <span>
                            {quiz.melhor_nota !== null
                              ? `melhor nota ${Math.round(quiz.melhor_nota)}%`
                              : 'sem nota'}{' '}
                            · {quiz.tentativas} tentativa(s)
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </>
            ) : null}

            {tab === 'plano' ? (
              <Panel
                title="Plano de 30 dias"
                description={
                  data.plano ? `Início em ${formatDate(data.plano.inicio)}` : 'Sem plano ainda'
                }
                actions={
                  canEdit ? (
                    <button
                      className="ui-btn ui-btn-ghost ui-btn-small"
                      onClick={() => {
                        if (
                          !data.plano ||
                          window.confirm('Gerar de novo apaga o andamento atual. Continuar?')
                        )
                          void act(
                            () => send('POST', `/mentor/alunos/${alunoId}/plano/gerar`, {}),
                            'Plano gerado e aluno avisado.',
                          );
                      }}
                    >
                      {data.plano ? 'Gerar de novo' : 'Gerar plano'}
                    </button>
                  ) : null
                }
              >
                {!data.plano ? (
                  <Empty>O aluno ainda não tem plano.</Empty>
                ) : (
                  <ul className="ui-list">
                    {data.plano.dias.map((day) => (
                      <DiaPlano
                        key={day.dia}
                        day={day}
                        canEdit={canEdit}
                        onSave={(body, ok) =>
                          act(
                            () =>
                              send(
                                'PATCH',
                                `/mentor/alunos/${alunoId}/plano/dias/${day.dia}`,
                                body,
                              ),
                            ok,
                          )
                        }
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            ) : null}

            {tab === 'praticas' ? (
              data.praticas.length === 0 ? (
                <Panel title="Práticas">
                  <Empty>O aluno ainda não enviou nenhuma prática.</Empty>
                </Panel>
              ) : (
                data.praticas.map((p) => (
                  <PraticaCard
                    key={p.id}
                    pratica={{ ...p, aluno: data.aluno.nome }}
                    perguntas={data.perguntas}
                    canReply={canEdit}
                    onDone={reload}
                  />
                ))
              )
            ) : null}

            {tab === 'notas' ? (
              <>
                {canEdit ? (
                  <NotaForm
                    onSave={(body) =>
                      act(
                        () => send('POST', `/mentor/alunos/${alunoId}/notas`, body),
                        'Anotação salva.',
                      )
                    }
                  />
                ) : null}
                <Panel title="Anotações">
                  {data.notas.length === 0 ? (
                    <Empty>Nenhuma anotação.</Empty>
                  ) : (
                    <ul className="ui-list">
                      {data.notas.map((note) => (
                        <li key={note.id}>
                          <div>
                            <p className="cs-answer">{note.texto}</p>
                            <small>{formatDate(note.created_at, true)}</small>
                          </div>
                          <div className="ui-table-actions">
                            <Badge tone={note.visibilidade === 'compartilhada' ? 'ok' : 'muted'}>
                              {note.visibilidade === 'compartilhada'
                                ? 'Visível ao aluno'
                                : 'Só você'}
                            </Badge>
                            {canEdit ? (
                              <button
                                className="ui-btn ui-btn-danger ui-btn-small"
                                onClick={() =>
                                  void act(
                                    () => send('DELETE', `/mentor/notas/${note.id}`),
                                    'Anotação excluída.',
                                  )
                                }
                              >
                                Excluir
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </>
            ) : null}

            {tab === 'sessoes' ? (
              <>
                {canEdit ? (
                  <Panel title="Marcar sessão">
                    <NovaSessao alunos={[]} fixedAluno={alunoId} onDone={reload} />
                  </Panel>
                ) : null}
                <Panel title="Sessões">
                  {data.sessoes.length === 0 ? (
                    <Empty>Nenhuma sessão.</Empty>
                  ) : (
                    <ul className="ui-list">
                      {data.sessoes.map((s) => (
                        <SessaoItem key={s.id} sessao={s} canEdit={canEdit} onDone={reload} />
                      ))}
                    </ul>
                  )}
                </Panel>
              </>
            ) : null}
          </>
        );
      }}
    </Resource>
  );
}

function DiaPlano({
  day,
  canEdit,
  onSave,
}: Readonly<{
  day: Dia;
  canEdit: boolean;
  onSave: (body: Record<string, unknown>, ok: string) => void;
}>) {
  const [comment, setComment] = useState(day.comentario_mentor ?? '');
  const [activity, setActivity] = useState(day.atividade);
  return (
    <li>
      <div style={{ width: '100%' }}>
        <strong>
          Dia {day.dia} · {day.objetivo}
        </strong>
        <small>
          {formatDate(day.data)} · {day.tipo}
        </small>
        {canEdit ? (
          <div className="ui-form al-form">
            <label>
              Atividade
              <textarea
                style={textarea}
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
              />
            </label>
            <label>
              Comentário para o aluno
              <textarea
                style={textarea}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <div className="ui-table-actions">
              <button
                className="ui-btn ui-btn-ghost ui-btn-small"
                onClick={() =>
                  onSave(
                    {
                      ...(activity !== day.atividade ? { atividade: activity } : {}),
                      ...(comment !== (day.comentario_mentor ?? '') ? { comentario: comment } : {}),
                    },
                    'Dia atualizado.',
                  )
                }
              >
                Salvar ajustes
              </button>
              {day.status === 'feito' ? (
                <button
                  className="ui-btn ui-btn-small"
                  onClick={() =>
                    onSave(
                      { revisado: true, ...(comment ? { comentario: comment } : {}) },
                      'Dia revisado e aluno avisado.',
                    )
                  }
                >
                  Marcar como revisado
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p>{day.atividade}</p>
        )}
      </div>
      <Badge tone={day.status === 'pendente' ? 'muted' : 'ok'}>
        {day.status === 'pendente' ? 'Pendente' : day.status === 'feito' ? 'Feito' : 'Revisado'}
      </Badge>
    </li>
  );
}

function NotaForm({
  onSave,
}: Readonly<{ onSave: (body: { texto: string; visibilidade: string }) => void }>) {
  const [text, setText] = useState('');
  const [shared, setShared] = useState(false);
  return (
    <Panel title="Nova anotação">
      <div className="ui-form al-form">
        <textarea
          style={textarea}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva o que observou. Por padrão só você vê."
        />
        <label className="ui-check">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Compartilhar com o aluno (ele é avisado)
        </label>
        <button
          className="ui-btn"
          disabled={!text.trim()}
          onClick={() => {
            onSave({ texto: text, visibilidade: shared ? 'compartilhada' : 'privada' });
            setText('');
            setShared(false);
          }}
        >
          Salvar anotação
        </button>
      </div>
    </Panel>
  );
}
