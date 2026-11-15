'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Empty,
  Panel,
  Resource,
  Table,
  formatDate,
  useResource,
} from '../../components/ui';
import { errorText, send } from '../../../lib/api';
import { InviteForm, InviteLink } from '../_components/InviteForm';
import {
  ResetLinkBox,
  UserRowActions,
  lastAccessText,
  type ResetLink,
} from '../_components/UserActions';

type Student = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  matricula_status: string | null;
  turma_nome: string | null;
  mentor_nome: string | null;
  aulas_concluidas: number;
  ultimo_progresso: string | null;
  plano_feitos: number;
  plano_total: number;
  praticas_enviadas: number;
  praticas_devolvidas: number;
  certificados: number;
  ultimo_acesso: string | null;
};
type ClassRow = {
  id: string;
  nome: string;
  status: 'ativa' | 'encerrada';
  inicio: string | null;
  fim: string | null;
  mentor_id: string | null;
  mentor_nome: string | null;
  alunos_ativos: number;
  acesso_ate: string | null;
  mentoria_ate: string | null;
  grupo_url: string | null;
};
type Mentor = { id: string; nome: string; ativo: boolean };
type Invitation = {
  id: string;
  tipo: 'aluno' | 'mentor' | 'empresa' | 'colaborador' | 'equipe';
  nome: string;
  email: string;
  turma_nome: string | null;
  expira_em: string;
  situacao: 'pendente' | 'aceito' | 'revogado' | 'expirado';
  created_at: string;
};
type Reissued = { id: string; expira_em: string; link: string; email_enviado: boolean };

const TABS = [
  ['alunos', 'Alunos'],
  ['turmas', 'Turmas'],
  ['convites', 'Convites'],
] as const;
type Tab = (typeof TABS)[number][0];

const TIPOS = {
  aluno: 'Aluno',
  mentor: 'Mentor',
  empresa: 'Empresa',
  colaborador: 'Colaborador',
  equipe: 'Administrador',
} as const;

export function StudentsAdmin() {
  const [tab, setTab] = useState<Tab>('alunos');
  const [students, reloadStudents] = useResource<{ data: Student[] }>('/platform/students');
  const [classes, reloadClasses] = useResource<{ data: ClassRow[] }>('/platform/classes');
  const [mentors] = useResource<{ data: Mentor[] }>('/platform/mentors');
  const [invitations, reloadInvitations] = useResource<{ data: Invitation[] }>(
    '/platform/invitations',
  );
  const [error, setError] = useState('');
  const [link, setLink] = useState<ResetLink | null>(null);

  const activeClasses =
    classes.state === 'ready' ? classes.data.data.filter((c) => c.status === 'ativa') : [];
  const activeMentors = mentors.state === 'ready' ? mentors.data.data.filter((m) => m.ativo) : [];
  const reloadAll = () => {
    reloadStudents();
    reloadClasses();
    reloadInvitations();
  };

  return (
    <>
      <div className="ui-tabs" role="tablist" aria-label="Seções">
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
      {error ? <Alert kind="error">{error}</Alert> : null}

      {tab === 'alunos' ? (
        <>
          <Panel
            title="Matricular aluno"
            description="Gera um convite com a turma escolhida. O aluno cria a senha e entra na área do curso."
          >
            <InviteForm
              kind="aluno"
              classes={activeClasses}
              mentors={activeMentors}
              onCreated={reloadAll}
            />
          </Panel>
          <Panel
            title="Alunos matriculados"
            description="Abra a ficha para ver o que o aluno já acessou e o andamento no curso. “Link de senha” gera um link para ele definir uma nova senha."
          >
            {link ? <ResetLinkBox link={link} onClose={() => setLink(null)} /> : null}
            <Resource value={students}>
              {({ data }) =>
                data.length ? (
                  <Table
                    label="Alunos"
                    head={[
                      'Aluno',
                      'Turma',
                      'Mentor',
                      'Aulas concluídas',
                      'Plano de 30 dias',
                      'Práticas (devolvidas/enviadas)',
                      'Certificados',
                      'Último acesso',
                      'Situação',
                      'Ações',
                    ]}
                  >
                    {data.map((student) => (
                      <tr key={student.id}>
                        <td>
                          <strong>{student.nome}</strong>
                          <small>{student.email}</small>
                        </td>
                        <td>{student.turma_nome ?? '—'}</td>
                        <td>{student.mentor_nome ?? '—'}</td>
                        <td>{student.aulas_concluidas}</td>
                        <td>
                          {student.plano_total
                            ? `${student.plano_feitos}/${student.plano_total} dias`
                            : '—'}
                        </td>
                        <td>
                          {student.praticas_devolvidas}/{student.praticas_enviadas}
                        </td>
                        <td>{student.certificados}</td>
                        <td>
                          {lastAccessText(student.ultimo_acesso)}
                          <small>Última aula: {formatDate(student.ultimo_progresso)}</small>
                        </td>
                        <td>
                          <Badge>{student.ativo ? 'Ativo' : 'Inativo'}</Badge>
                        </td>
                        <td>
                          <UserRowActions
                            userId={student.id}
                            ativo={student.ativo}
                            onGenerated={setLink}
                            onChanged={reloadStudents}
                            onError={setError}
                          />
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <Empty>Nenhum aluno matriculado ainda.</Empty>
                )
              }
            </Resource>
          </Panel>
        </>
      ) : null}

      {tab === 'turmas' ? (
        <ClassesTab
          classes={classes}
          mentors={activeMentors}
          onChanged={() => {
            setError('');
            reloadClasses();
          }}
          onError={setError}
        />
      ) : null}

      {tab === 'convites' ? (
        <InvitationsTab
          invitations={invitations}
          onChanged={() => {
            setError('');
            reloadInvitations();
          }}
          onError={setError}
        />
      ) : null}
    </>
  );
}

function ClassesTab({
  classes,
  mentors,
  onChanged,
  onError,
}: Readonly<{
  classes: ReturnType<typeof useResource<{ data: ClassRow[] }>>[0];
  mentors: Mentor[];
  onChanged: () => void;
  onError: (message: string) => void;
}>) {
  const [nome, setNome] = useState('');
  const [mentor, setMentor] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [acessoAte, setAcessoAte] = useState('');
  const [mentoriaAte, setMentoriaAte] = useState('');
  const [grupo, setGrupo] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await send('POST', '/platform/classes', {
        nome,
        mentor_id: mentor || null,
        inicio: inicio || null,
        fim: fim || null,
        acesso_ate: acessoAte || null,
        mentoria_ate: mentoriaAte || null,
        grupo_url: grupo || null,
      });
      setAcessoAte('');
      setMentoriaAte('');
      setGrupo('');
      setNome('');
      setMentor('');
      setInicio('');
      setFim('');
      onChanged();
    } catch (cause) {
      onError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: 'ativa' | 'encerrada') {
    try {
      await send('PATCH', `/platform/classes/${id}`, { status });
      onChanged();
    } catch (cause) {
      onError(errorText(cause));
    }
  }

  return (
    <>
      <Panel
        title="Nova turma"
        description="A turma agrupa os alunos e define o mentor responsável."
      >
        <form className="ui-form" onSubmit={(event) => void create(event)} aria-label="Nova turma">
          <label>
            Nome da turma
            <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={2} required />
          </label>
          <label>
            Mentor responsável
            <select value={mentor} onChange={(e) => setMentor(e.target.value)}>
              <option value="">Definir depois</option>
              {mentors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label>
            Fim
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </label>
          <label>
            Aulas e materiais até
            <input type="date" value={acessoAte} onChange={(e) => setAcessoAte(e.target.value)} />
            <small>Vazio = sem prazo.</small>
          </label>
          <label>
            Mentoria e encontros até
            <input
              type="date"
              value={mentoriaAte}
              onChange={(e) => setMentoriaAte(e.target.value)}
            />
          </label>
          <label>
            Link do grupo de conversa (https)
            <input type="url" value={grupo} onChange={(e) => setGrupo(e.target.value)} />
          </label>
          <div className="ui-form-actions">
            <button className="ui-btn" type="submit" disabled={busy}>
              {busy ? 'Criando…' : 'Criar turma'}
            </button>
          </div>
        </form>
      </Panel>
      <TurmaPrazos classes={classes} onChanged={onChanged} onError={onError} />
      <Panel title="Turmas">
        <Resource value={classes}>
          {({ data }) =>
            data.length ? (
              <Table
                label="Turmas"
                head={[
                  'Turma',
                  'Mentor',
                  'Período',
                  'Acesso até',
                  'Mentoria até',
                  'Alunos ativos',
                  'Situação',
                  '',
                ]}
              >
                {data.map((turma) => (
                  <tr key={turma.id}>
                    <td>
                      <strong>{turma.nome}</strong>
                    </td>
                    <td>{turma.mentor_nome ?? '—'}</td>
                    <td>
                      {formatDate(turma.inicio)} → {formatDate(turma.fim)}
                    </td>
                    <td>{turma.acesso_ate ? formatDate(turma.acesso_ate) : 'Sem prazo'}</td>
                    <td>{turma.mentoria_ate ? formatDate(turma.mentoria_ate) : 'Sem prazo'}</td>
                    <td>{turma.alunos_ativos}</td>
                    <td>
                      <Badge>{turma.status === 'ativa' ? 'Ativa' : 'Encerrada'}</Badge>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ui-btn ui-btn-small ui-btn-ghost"
                        onClick={() =>
                          void setStatus(turma.id, turma.status === 'ativa' ? 'encerrada' : 'ativa')
                        }
                      >
                        {turma.status === 'ativa' ? 'Encerrar' : 'Reabrir'}
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nenhuma turma criada. Crie a primeira para poder matricular alunos.</Empty>
            )
          }
        </Resource>
      </Panel>
    </>
  );
}

function InvitationsTab({
  invitations,
  onChanged,
  onError,
}: Readonly<{
  invitations: ReturnType<typeof useResource<{ data: Invitation[] }>>[0];
  onChanged: () => void;
  onError: (message: string) => void;
}>) {
  const [fresh, setFresh] = useState<Record<string, Reissued>>({});

  async function revoke(id: string) {
    try {
      await send('POST', `/platform/invitations/${id}/revoke`);
      onChanged();
    } catch (cause) {
      onError(errorText(cause));
    }
  }
  async function reissue(id: string) {
    try {
      const result = await send<Reissued>('POST', `/platform/invitations/${id}/reissue`);
      setFresh((current) => ({ ...current, [id]: result }));
      onChanged();
    } catch (cause) {
      onError(errorText(cause));
    }
  }

  return (
    <Panel
      title="Convites enviados"
      description="O link de um convite só aparece quando ele é criado ou reenviado. Para gerar outro, use “Novo link”."
    >
      <Resource value={invitations}>
        {({ data }) =>
          data.length ? (
            <>
              <Table
                label="Convites"
                head={['Pessoa', 'Tipo', 'Turma', 'Situação', 'Validade', '']}
              >
                {data.map((invite) => (
                  <tr key={invite.id}>
                    <td>
                      <strong>{invite.nome}</strong>
                      <small>{invite.email}</small>
                    </td>
                    <td>{TIPOS[invite.tipo]}</td>
                    <td>{invite.turma_nome ?? '—'}</td>
                    <td>
                      <Badge>{invite.situacao}</Badge>
                    </td>
                    <td>{formatDate(invite.expira_em)}</td>
                    <td>
                      {invite.situacao !== 'aceito' ? (
                        <span className="ui-table-actions">
                          <button
                            type="button"
                            className="ui-btn ui-btn-small ui-btn-ghost"
                            onClick={() => void reissue(invite.id)}
                          >
                            Novo link
                          </button>
                          {invite.situacao === 'pendente' ? (
                            <button
                              type="button"
                              className="ui-btn ui-btn-small ui-btn-danger"
                              onClick={() => void revoke(invite.id)}
                            >
                              Revogar
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Table>
              {Object.entries(fresh).map(([id, created]) => (
                <InviteLink key={id} created={created} />
              ))}
            </>
          ) : (
            <Empty>Nenhum convite criado ainda.</Empty>
          )
        }
      </Resource>
    </Panel>
  );
}

function TurmaPrazos({
  classes,
  onChanged,
  onError,
}: Readonly<{
  classes: ReturnType<typeof useResource<{ data: ClassRow[] }>>[0];
  onChanged: () => void;
  onError: (message: string) => void;
}>) {
  const [turmaId, setTurmaId] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const rows = classes.state === 'ready' ? classes.data.data : [];
  const turma = rows.find((item) => item.id === turmaId);

  async function save(form: FormData) {
    const text = (name: string) => String(form.get(name) ?? '').trim();
    setBusy(true);
    setSaved(false);
    try {
      await send('PATCH', `/platform/classes/${turmaId}`, {
        acesso_ate: text('acesso') || null,
        mentoria_ate: text('mentoria') || null,
        grupo_url: text('grupo') || null,
      });
      setSaved(true);
      onChanged();
    } catch (cause) {
      onError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length) return null;
  return (
    <Panel
      title="Prazos e grupo da turma"
      description="Depois do prazo, o aluno deixa de abrir aulas e materiais (acesso) ou de ver encontros e o grupo (mentoria). Deixe vazio para não ter prazo."
    >
      <form
        className="ui-form"
        key={turmaId}
        onSubmit={(event) => {
          event.preventDefault();
          void save(new FormData(event.currentTarget));
        }}
      >
        <label>
          Turma
          <select value={turmaId} onChange={(e) => setTurmaId(e.target.value)} required>
            <option value="">Escolha a turma</option>
            {rows.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        {turma ? (
          <>
            <label>
              Aulas e materiais até
              <input
                name="acesso"
                type="date"
                defaultValue={turma.acesso_ate?.slice(0, 10) ?? ''}
              />
            </label>
            <label>
              Mentoria e encontros até
              <input
                name="mentoria"
                type="date"
                defaultValue={turma.mentoria_ate?.slice(0, 10) ?? ''}
              />
            </label>
            <label>
              Link do grupo de conversa (https)
              <input name="grupo" type="url" defaultValue={turma.grupo_url ?? ''} />
            </label>
            <div className="ui-form-actions">
              <button className="ui-btn" type="submit" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar prazos'}
              </button>
              {saved ? <small>Salvo.</small> : null}
            </div>
          </>
        ) : null}
      </form>
    </Panel>
  );
}
