'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { send, errorText } from '../../lib/api';
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
import { COLUMNS, DECISION_LABEL, STATUS_LABEL, STATUS_ORDER, dueLabel } from './pipeline-lib';

export type Opportunity = {
  id: string;
  edital_id: string;
  status: string;
  decisao: string | null;
  motivo_decisao: string | null;
  titulo: string;
  orgao: string | null;
  uf: string | null;
  modalidade: string | null;
  proximo_prazo: string | null;
  checklist_itens: number;
  checklist_concluidos: number;
  updated_at: string;
};

const HELP_KEY = 'lc_pipeline_ajuda_fechada';

function useHelpFlag(): [boolean, () => void] {
  const [closed, setClosed] = useState(true);
  useEffect(() => {
    try {
      setClosed(window.localStorage.getItem(HELP_KEY) === '1');
    } catch {
      setClosed(false);
    }
  }, []);
  return [
    closed,
    () => {
      setClosed(true);
      try {
        window.localStorage.setItem(HELP_KEY, '1');
      } catch {
        /* sem armazenamento: só fecha agora */
      }
    },
  ];
}

export function OportunidadesApp() {
  const [list, reload] = useResource<{ data: Opportunity[] }>('/opportunities');
  const [helpClosed, closeHelp] = useHelpFlag();
  const [filter, setFilter] = useState<'todas' | 'participar' | 'nao_participar'>('todas');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [deciding, setDeciding] = useState<Opportunity | null>(null);

  async function move(item: Opportunity, status: string) {
    if (status === item.status) return;
    if (status === 'decidida') {
      setDeciding(item);
      return;
    }
    try {
      await send('PATCH', `/opportunities/${item.id}`, { status });
      setNotice({ kind: 'success', text: `Movida para “${STATUS_LABEL[status]}”.` });
      reload();
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Oportunidades"
        title="Seu pipeline de licitações"
        description="Acompanhe cada edital do primeiro olhar até a decisão. Mova o card de etapa quando avançar, e registre o motivo de participar ou não."
        actions={
          <Link className="ui-btn" href="/radar">
            Buscar no Radar
          </Link>
        }
      />
      {!helpClosed ? (
        <section className="ui-panel op-help" aria-label="Como funciona">
          <h2>Como funciona</h2>
          <ol>
            <li>No Radar, salve o edital no pipeline.</li>
            <li>Leia o edital e mova para “Analisando”.</li>
            <li>Se for seguir, monte o checklist de habilitação em “Preparando documentos”.</li>
            <li>Decida participar ou não e escreva o motivo. Fica guardado no histórico.</li>
          </ol>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-small" onClick={closeHelp}>
            Entendi, não mostrar de novo
          </button>
        </section>
      ) : null}
      {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
      <Resource value={list}>
        {({ data }) => (
          <Board
            items={data}
            filter={filter}
            onFilter={setFilter}
            onMove={(item, status) => void move(item, status)}
          />
        )}
      </Resource>
      {deciding ? (
        <DecisionDialog
          item={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            setNotice({ kind: 'success', text: 'Decisão registrada no histórico.' });
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function Board({
  items,
  filter,
  onFilter,
  onMove,
}: Readonly<{
  items: Opportunity[];
  filter: 'todas' | 'participar' | 'nao_participar';
  onFilter: (value: 'todas' | 'participar' | 'nao_participar') => void;
  onMove: (item: Opportunity, status: string) => void;
}>) {
  const visible = useMemo(
    () => items.filter((item) => filter === 'todas' || item.decisao === filter),
    [items, filter],
  );
  if (items.length === 0)
    return (
      <Panel title="Nenhuma oportunidade ainda">
        <Empty>
          Quando você salvar um edital no Radar, ele aparece aqui. Comece por uma busca e use
          “Salvar no pipeline”.
        </Empty>
        <Link className="ui-btn" href="/radar">
          Ir para o Radar
        </Link>
      </Panel>
    );
  return (
    <>
      <div className="op-toolbar">
        <label>
          Mostrar
          <select
            value={filter}
            onChange={(event) => onFilter(event.target.value as typeof filter)}
          >
            <option value="todas">Todas</option>
            <option value="participar">Decididas para participar</option>
            <option value="nao_participar">Decididas para não participar</option>
          </select>
        </label>
        <span>{visible.length} oportunidade(s)</span>
      </div>
      <div className="op-board">
        {COLUMNS.map((column) => {
          const cards = visible.filter((item) => column.statuses.includes(item.status));
          return (
            <section key={column.key} className="op-col" aria-label={column.title}>
              <header>
                <h2>{column.title}</h2>
                <span>{cards.length}</span>
              </header>
              <p className="op-col-hint">{column.hint}</p>
              {cards.length === 0 ? <p className="op-col-empty">Nada aqui.</p> : null}
              {cards.map((item) => (
                <Card key={item.id} item={item} onMove={onMove} />
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Card({
  item,
  onMove,
}: Readonly<{ item: Opportunity; onMove: (item: Opportunity, status: string) => void }>) {
  const due = dueLabel(item.proximo_prazo);
  return (
    <article className="op-card">
      <Link href={`/oportunidades/${item.id}`} className="op-card-title">
        {item.titulo}
      </Link>
      <small>{[item.orgao, item.uf].filter(Boolean).join(' · ') || 'Órgão não informado'}</small>
      <div className="op-card-tags">
        {item.decisao ? (
          <Badge tone={item.decisao === 'participar' ? 'ok' : 'muted'}>
            {DECISION_LABEL[item.decisao] ?? item.decisao}
          </Badge>
        ) : null}
        {['proposta', 'ganha', 'perdida', 'arquivada'].includes(item.status) ? (
          <Badge tone={item.status === 'ganha' ? 'ok' : 'muted'}>
            {STATUS_LABEL[item.status]!}
          </Badge>
        ) : null}
        {item.proximo_prazo ? (
          <Badge tone={due.tone}>{`Prazo ${formatDate(item.proximo_prazo)} · ${due.text}`}</Badge>
        ) : null}
      </div>
      {item.checklist_itens > 0 ? (
        <div className="op-progress" aria-label="Checklist">
          <progress max={item.checklist_itens} value={item.checklist_concluidos} />
          <small>
            Checklist {item.checklist_concluidos}/{item.checklist_itens}
          </small>
        </div>
      ) : null}
      <label className="op-move">
        Mover para
        <select value={item.status} onChange={(event) => onMove(item, event.target.value)}>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

export function DecisionForm({
  opportunityId,
  initialDecision,
  onDone,
  onCancel,
}: Readonly<{
  opportunityId: string;
  initialDecision?: string | null;
  onDone: () => void;
  onCancel?: () => void;
}>) {
  const [decision, setDecision] = useState(initialDecision ?? 'participar');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 5) {
      setError('Escreva o motivo da decisão (pelo menos 5 letras).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await send('PATCH', `/opportunities/${opportunityId}`, {
        status: 'decidida',
        decisao: decision,
        motivo_decisao: reason.trim(),
      });
      onDone();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ui-form op-decision" onSubmit={(event) => void submit(event)}>
      <label>
        Decisão
        <select value={decision} onChange={(event) => setDecision(event.target.value)}>
          <option value="participar">Participar</option>
          <option value="nao_participar">Não participar</option>
        </select>
      </label>
      <label className="op-wide">
        Motivo
        <textarea
          rows={3}
          maxLength={1000}
          value={reason}
          placeholder="Ex.: objeto dentro do nosso ramo e prazo viável"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <div className="ui-form-actions">
        <button type="submit" className="ui-btn" disabled={busy}>
          Registrar decisão
        </button>
        {onCancel ? (
          <button type="button" className="ui-btn ui-btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function DecisionDialog({
  item,
  onClose,
  onDone,
}: Readonly<{ item: Opportunity; onClose: () => void; onDone: () => void }>) {
  return (
    <div className="op-modal" role="dialog" aria-modal="true" aria-label="Registrar decisão">
      <div className="op-modal-box">
        <h2>Registrar decisão</h2>
        <p>{item.titulo}</p>
        <DecisionForm
          opportunityId={item.id}
          initialDecision={item.decisao}
          onDone={onDone}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
