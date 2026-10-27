'use client';

import Link from 'next/link';
import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
import {
  Alert,
  Badge,
  Empty,
  PageHeader,
  Panel,
  Resource,
  formatDate,
  useResource,
} from '../../components/ui';
import { DecisionForm } from '../OportunidadesApp';
import {
  DEADLINE_TYPES,
  DECISION_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  dueLabel,
  toIso,
} from '../pipeline-lib';

type Item = {
  id: string;
  titulo: string;
  descricao: string | null;
  obrigatorio: boolean;
  concluido: boolean;
  evidencia_url: string | null;
};
type Checklist = { id: string; titulo: string; itens: Item[] };
type Deadline = {
  id: string;
  titulo: string;
  tipo: string;
  vence_em: string;
  status: string;
  fonte: string | null;
};
type Task = {
  id: string;
  titulo: string;
  prioridade: string;
  status: string;
  vence_em: string | null;
};
type History = {
  id: string;
  tipo: string;
  de_status: string | null;
  para_status: string | null;
  decisao: string | null;
  motivo: string | null;
  created_at: string;
  autor: string | null;
};
type Detail = {
  oportunidade: {
    id: string;
    edital_id: string;
    status: string;
    decisao: string | null;
    motivo_decisao: string | null;
    decidida_em: string | null;
    observacoes: string | null;
    titulo: string;
    orgao: string | null;
    uf: string | null;
    municipio_nome: string | null;
    modalidade: string | null;
    valor_estimado: string | number | null;
    data_abertura_proposta: string | null;
    data_encerramento_proposta: string | null;
    url_origem: string | null;
  };
  checklists: Checklist[];
  prazos: Deadline[];
  tarefas: Task[];
  historico: History[];
  modelo_sugerido: string;
};
type Models = {
  data: Array<{ codigo: string; nome: string; descricao: string; itens: number }>;
  aviso: string;
};

export function OportunidadeDetalhe({ id }: Readonly<{ id: string }>) {
  const [detail, reload] = useResource<Detail>(`/opportunities/${id}`);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

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
      <Resource value={detail}>
        {(data) => (
          <>
            <PageHeader
              eyebrow="Oportunidade"
              title={data.oportunidade.titulo}
              description={[
                data.oportunidade.orgao,
                data.oportunidade.municipio_nome,
                data.oportunidade.uf,
                data.oportunidade.modalidade,
              ]
                .filter(Boolean)
                .join(' · ')}
              actions={
                <>
                  <Link className="ui-btn ui-btn-ghost" href="/oportunidades">
                    ← Pipeline
                  </Link>
                  <Link className="ui-btn" href={`/radar/${data.oportunidade.edital_id}`}>
                    Abrir o edital
                  </Link>
                </>
              }
            />
            {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
            <div className="op-detail">
              <div className="op-detail-main">
                <StatusPanel data={data} run={run} />
                <ChecklistPanel data={data} run={run} />
                <AgendaPanel data={data} run={run} />
              </div>
              <aside className="op-detail-side">
                <NotesPanel data={data} run={run} />
                <HistoryPanel history={data.historico} />
              </aside>
            </div>
          </>
        )}
      </Resource>
    </div>
  );
}

type Run = (action: () => Promise<unknown>, success?: string) => Promise<void>;

function StatusPanel({ data, run }: Readonly<{ data: Detail; run: Run }>) {
  const o = data.oportunidade;
  const [editing, setEditing] = useState(false);
  return (
    <Panel
      title="Etapa e decisão"
      description="A decisão fica no histórico, com o motivo e a data."
    >
      <div className="op-status-row">
        <Badge tone="muted">{STATUS_LABEL[o.status] ?? o.status}</Badge>
        {o.decisao ? (
          <Badge tone={o.decisao === 'participar' ? 'ok' : 'muted'}>
            {DECISION_LABEL[o.decisao] ?? o.decisao}
          </Badge>
        ) : null}
        <label className="op-move">
          Mover para
          <select
            value={o.status}
            onChange={(event) => {
              const status = event.target.value;
              if (status === 'decidida') return setEditing(true);
              void run(
                () => send('PATCH', `/opportunities/${o.id}`, { status }),
                `Movida para “${STATUS_LABEL[status]}”.`,
              );
            }}
          >
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <dl className="op-facts">
        <div>
          <dt>Abertura das propostas</dt>
          <dd>{formatDate(o.data_abertura_proposta, true)}</dd>
        </div>
        <div>
          <dt>Encerramento das propostas</dt>
          <dd>{formatDate(o.data_encerramento_proposta, true)}</dd>
        </div>
        <div>
          <dt>Valor estimado</dt>
          <dd>
            {o.valor_estimado == null
              ? 'Não informado'
              : Number(o.valor_estimado).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
          </dd>
        </div>
      </dl>
      {o.decisao && !editing ? (
        <div className="op-decided">
          <p>
            <strong>{DECISION_LABEL[o.decisao]}.</strong> {o.motivo_decisao}
          </p>
          <small>Decidida em {formatDate(o.decidida_em, true)}</small>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-small"
            onClick={() => setEditing(true)}
          >
            Mudar a decisão
          </button>
        </div>
      ) : null}
      {editing || (!o.decisao && o.status === 'decidida') ? (
        <DecisionForm
          opportunityId={o.id}
          initialDecision={o.decisao}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            void run(async () => undefined, 'Decisão registrada no histórico.');
          }}
        />
      ) : null}
      {!o.decisao && !editing ? (
        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setEditing(true)}>
          Registrar decisão
        </button>
      ) : null}
    </Panel>
  );
}

function ChecklistPanel({ data, run }: Readonly<{ data: Detail; run: Run }>) {
  const [models] = useResource<Models>('/checklist-models');
  const [model, setModel] = useState(data.modelo_sugerido);
  return (
    <Panel
      title="Checklist de habilitação"
      description="Lista de apoio. Cada edital pede coisas diferentes: confira o edital e ajuste os itens."
    >
      <Resource value={models}>
        {(catalog) => (
          <form
            className="ui-form op-inline"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  send('POST', `/opportunities/${data.oportunidade.id}/checklists`, {
                    modelo: model,
                  }),
                'Checklist criado.',
              );
            }}
          >
            <label>
              Modelo
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                {catalog.data.map((entry) => (
                  <option key={entry.codigo} value={entry.codigo}>
                    {entry.nome} ({entry.itens} itens)
                  </option>
                ))}
              </select>
            </label>
            <div className="ui-form-actions">
              <button type="submit" className="ui-btn">
                Criar checklist
              </button>
            </div>
          </form>
        )}
      </Resource>
      {data.checklists.length === 0 ? (
        <Empty>Nenhum checklist ainda. Escolha um modelo e crie.</Empty>
      ) : null}
      {data.checklists.map((list) => (
        <ChecklistBlock key={list.id} list={list} run={run} />
      ))}
    </Panel>
  );
}

function ChecklistBlock({ list, run }: Readonly<{ list: Checklist; run: Run }>) {
  const [title, setTitle] = useState('');
  const done = list.itens.filter((item) => item.concluido).length;
  return (
    <section className="op-checklist">
      <header>
        <h3>{list.titulo}</h3>
        <span>
          {done}/{list.itens.length}
        </span>
        <button
          type="button"
          className="ui-btn ui-btn-ghost ui-btn-small ui-btn-danger"
          onClick={() => {
            if (window.confirm('Remover este checklist e os itens dele?'))
              void run(() => send('DELETE', `/checklists/${list.id}`), 'Checklist removido.');
          }}
        >
          Remover
        </button>
      </header>
      <progress max={list.itens.length || 1} value={done} aria-label="Progresso do checklist" />
      <ul>
        {list.itens.map((item) => (
          <li key={item.id}>
            <label className="op-item">
              <input
                type="checkbox"
                checked={item.concluido}
                onChange={(event) =>
                  void run(() =>
                    send('PATCH', `/checklist-items/${item.id}`, {
                      concluido: event.target.checked,
                    }),
                  )
                }
              />
              <span>
                {item.titulo}
                {!item.obrigatorio ? <em> (opcional)</em> : null}
                {item.descricao ? <small>{item.descricao}</small> : null}
              </span>
            </label>
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-small"
              aria-label={`Remover ${item.titulo}`}
              onClick={() => void run(() => send('DELETE', `/checklist-items/${item.id}`))}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
      <form
        className="op-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim().length < 2) return;
          void run(() => send('POST', `/checklists/${list.id}/items`, { titulo: title.trim() }));
          setTitle('');
        }}
      >
        <input
          aria-label="Novo item"
          placeholder="Adicionar item ao checklist"
          value={title}
          maxLength={300}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" className="ui-btn ui-btn-small">
          Adicionar
        </button>
      </form>
    </section>
  );
}

function AgendaPanel({ data, run }: Readonly<{ data: Detail; run: Run }>) {
  const id = data.oportunidade.id;
  const [deadline, setDeadline] = useState({ titulo: '', tipo: 'esclarecimento', quando: '' });
  const [task, setTask] = useState({ titulo: '', prioridade: 'normal', quando: '' });
  return (
    <Panel
      title="Prazos e tarefas desta oportunidade"
      description="As datas do edital entram sozinhas. Acrescente as suas."
    >
      <h3 className="op-sub">Prazos</h3>
      {data.prazos.length === 0 ? <Empty>Sem prazos. O edital não trouxe datas.</Empty> : null}
      <ul className="op-list">
        {data.prazos.map((item) => {
          const due = dueLabel(item.vence_em);
          return (
            <li key={item.id}>
              <span>
                <strong>{item.titulo}</strong>
                <small>
                  {DEADLINE_TYPES[item.tipo] ?? item.tipo} · {formatDate(item.vence_em, true)}
                  {item.fonte === 'edital' ? ' · do edital' : ''}
                </small>
              </span>
              {item.status === 'concluido' ? (
                <Badge tone="ok">Concluído</Badge>
              ) : (
                <Badge tone={due.tone}>{due.text}</Badge>
              )}
              {item.status === 'aberto' ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-small"
                  onClick={() =>
                    void run(() =>
                      send('PATCH', `/agenda/prazos/${item.id}`, { status: 'concluido' }),
                    )
                  }
                >
                  Concluir
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
          if (!deadline.quando) return;
          void run(
            () =>
              send('POST', '/agenda/prazos', {
                oportunidade_id: id,
                titulo: deadline.titulo.trim() || DEADLINE_TYPES[deadline.tipo],
                tipo: deadline.tipo,
                vence_em: toIso(deadline.quando),
              }),
            'Prazo adicionado.',
          );
          setDeadline({ titulo: '', tipo: 'esclarecimento', quando: '' });
        }}
      >
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
          Título (opcional)
          <input
            value={deadline.titulo}
            maxLength={200}
            onChange={(event) => setDeadline({ ...deadline, titulo: event.target.value })}
          />
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

      <h3 className="op-sub">Tarefas</h3>
      {data.tarefas.length === 0 ? <Empty>Nenhuma tarefa.</Empty> : null}
      <ul className="op-list">
        {data.tarefas.map((item) => (
          <li key={item.id}>
            <span>
              <strong className={item.status === 'concluida' ? 'op-done' : ''}>
                {item.titulo}
              </strong>
              <small>
                {PRIORITY_LABEL[item.prioridade] ?? item.prioridade}
                {item.vence_em ? ` · até ${formatDate(item.vence_em)}` : ''}
              </small>
            </span>
            {item.status === 'concluida' ? (
              <Badge tone="ok">Concluída</Badge>
            ) : (
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-small"
                onClick={() =>
                  void run(() => send('PATCH', `/tasks/${item.id}`, { status: 'concluida' }))
                }
              >
                Concluir
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="ui-form op-inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (task.titulo.trim().length < 2) return;
          void run(
            () =>
              send('POST', '/tasks', {
                oportunidade_id: id,
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
  );
}

function NotesPanel({ data, run }: Readonly<{ data: Detail; run: Run }>) {
  const [text, setText] = useState(data.oportunidade.observacoes ?? '');
  return (
    <Panel title="Anotações">
      <textarea
        className="op-notes"
        rows={5}
        maxLength={5000}
        value={text}
        aria-label="Anotações da oportunidade"
        onChange={(event) => setText(event.target.value)}
      />
      <button
        type="button"
        className="ui-btn ui-btn-small"
        onClick={() =>
          void run(
            () => send('PATCH', `/opportunities/${data.oportunidade.id}`, { observacoes: text }),
            'Anotação salva.',
          )
        }
      >
        Salvar anotação
      </button>
    </Panel>
  );
}

function HistoryPanel({ history }: Readonly<{ history: History[] }>) {
  const describe = (entry: History) => {
    if (entry.tipo === 'criada') return 'Salva no pipeline';
    if (entry.tipo === 'etapa')
      return `Etapa: ${STATUS_LABEL[entry.de_status ?? ''] ?? entry.de_status} → ${STATUS_LABEL[entry.para_status ?? ''] ?? entry.para_status}`;
    if (entry.tipo === 'decisao')
      return `Decisão: ${DECISION_LABEL[entry.decisao ?? ''] ?? entry.decisao}${entry.motivo ? ` — ${entry.motivo}` : ''}`;
    return entry.motivo ?? 'Nota';
  };
  return (
    <Panel title="Histórico">
      {history.length === 0 ? <Empty>Sem registros.</Empty> : null}
      <ol className="op-history">
        {history.map((entry) => (
          <li key={entry.id}>
            <span>{describe(entry)}</span>
            <small>
              {formatDate(entry.created_at, true)}
              {entry.autor ? ` · ${entry.autor}` : ''}
            </small>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
