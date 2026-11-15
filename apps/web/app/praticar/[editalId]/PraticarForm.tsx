'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorText, send } from '../../../lib/api';
import { Alert, Badge, Panel, formatDate } from '../../components/ui';

type Question = { id: string; pergunta: string; dica: string };
type Data = {
  edital: {
    id: string;
    titulo: string;
    orgao: string | null;
    uf: string | null;
    municipio_nome: string | null;
    modalidade: string | null;
    situacao: string | null;
    valor_estimado: string | number | null;
    data_encerramento_proposta: string | null;
    url_origem: string | null;
    fonte: string | null;
    conteudo_texto: string | null;
  };
  pratica: {
    status: 'rascunho' | 'enviada' | 'devolvida';
    respostas: Record<string, string>;
    devolutiva: string | null;
    nota: number | null;
    devolvida_em: string | null;
  } | null;
  perguntas: Question[];
  minimo_caracteres: number;
};

export function PraticarForm({
  editalId,
  canEdit,
}: Readonly<{ editalId: string; canEdit: boolean }>) {
  const [data, setData] = useState<Data | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const result = await api<Data>(`/aluno/praticas/${editalId}`);
      setData(result);
      setAnswers(result.pratica?.respostas ?? {});
    } catch (caught) {
      setError(errorText(caught));
    }
  }
  useEffect(() => {
    void load();
  }, [editalId]);

  async function save(): Promise<boolean> {
    try {
      await send('PUT', `/aluno/praticas/${editalId}`, { respostas: answers });
      return true;
    } catch (caught) {
      setMessage({ kind: 'error', text: errorText(caught) });
      return false;
    }
  }

  async function onSave() {
    setBusy(true);
    setMessage(null);
    if (await save()) setMessage({ kind: 'success', text: 'Rascunho salvo.' });
    setBusy(false);
    void load();
  }

  async function onSend() {
    setBusy(true);
    setMessage(null);
    if (await save()) {
      try {
        await send('POST', `/aluno/praticas/${editalId}/enviar`);
        setMessage({
          kind: 'success',
          text: 'Enviado ao mentor. Você será avisado quando ele devolver.',
        });
      } catch (caught) {
        setMessage({ kind: 'error', text: errorText(caught) });
      }
    }
    setBusy(false);
    void load();
  }

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <p className="ui-loading">Carregando…</p>;
  const { edital, pratica, perguntas } = data;
  const status = pratica?.status ?? 'rascunho';
  const locked = status === 'enviada' || !canEdit;

  return (
    <>
      <header className="ui-header">
        <div>
          <p className="eyebrow">Prática com edital real</p>
          <h1>{edital.titulo}</h1>
          <p>
            {edital.orgao ?? 'Órgão não informado'}
            {edital.uf ? ` · ${edital.uf}` : ''}
            {edital.modalidade ? ` · ${edital.modalidade}` : ''}
            {edital.data_encerramento_proposta
              ? ` · propostas até ${formatDate(edital.data_encerramento_proposta, true)}`
              : ''}
          </p>
        </div>
        <div className="ui-header-actions">
          <Link className="ui-btn ui-btn-ghost" href={`/radar/${edital.id}`}>
            Abrir a ficha do edital
          </Link>
          {edital.url_origem ? (
            <a
              className="ui-btn ui-btn-ghost"
              href={edital.url_origem}
              target="_blank"
              rel="noreferrer"
            >
              Ver no portal oficial
            </a>
          ) : null}
        </div>
      </header>
      <Alert kind="info">
        Exercício de leitura. Nada aqui é uma proposta ou participação em licitação. Confira sempre
        o edital e o portal oficial.
      </Alert>
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}

      {pratica?.status === 'devolvida' ? (
        <Panel
          title={`Devolutiva do mentor${pratica.nota ? ` · nota ${pratica.nota}/5` : ''}`}
          description={pratica.devolvida_em ? `Em ${formatDate(pratica.devolvida_em, true)}` : ''}
        >
          <p className="cs-answer">{pratica.devolutiva}</p>
          <p className="cs-hint">Você pode ajustar as respostas e enviar de novo.</p>
        </Panel>
      ) : null}
      {status === 'enviada' ? (
        <Alert kind="info">Enviada. Aguardando a devolutiva do mentor.</Alert>
      ) : null}

      <Panel
        title="Perguntas guiadas"
        actions={
          <Badge>
            {status === 'rascunho' ? 'Rascunho' : status === 'enviada' ? 'Enviada' : 'Devolvida'}
          </Badge>
        }
      >
        <div className="ui-form al-form" style={{ maxWidth: '48rem' }}>
          {perguntas.map((question) => (
            <div className="cs-question" key={question.id}>
              <label htmlFor={`q-${question.id}`}>
                <strong>{question.pergunta}</strong>
              </label>
              <small>{question.dica}</small>
              <textarea
                id={`q-${question.id}`}
                value={answers[question.id] ?? ''}
                disabled={locked}
                maxLength={4000}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                }
              />
            </div>
          ))}
          {canEdit ? (
            <div className="ui-table-actions">
              <button
                className="ui-btn ui-btn-ghost"
                disabled={busy || locked}
                onClick={() => void onSave()}
              >
                Salvar rascunho
              </button>
              <button className="ui-btn" disabled={busy || locked} onClick={() => void onSend()}>
                Enviar ao mentor
              </button>
            </div>
          ) : (
            <p className="cs-hint">Visualização da equipe: só o aluno edita e envia.</p>
          )}
        </div>
      </Panel>
    </>
  );
}
