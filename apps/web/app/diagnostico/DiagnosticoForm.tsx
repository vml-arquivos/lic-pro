'use client';

import { useEffect, useState } from 'react';
import { errorText, send } from '../../lib/api';
import { Alert, Panel, Resource, useResource } from '../components/ui';
import { ATUACAO } from '../materiais/etapas';

type Pergunta = {
  id: string;
  texto: string;
  tipo: 'texto' | 'opcoes';
  obrigatoria: boolean;
  opcoes?: ReadonlyArray<readonly [string, string]>;
};
type Data = {
  perguntas: Pergunta[];
  diagnostico: { atuacao: string; respostas: Record<string, string>; concluido_em: string } | null;
};

export function DiagnosticoForm({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [data, reload] = useResource<Data>('/aluno/diagnostico');
  return (
    <Resource value={data}>
      {(loaded) => <Formulario data={loaded} canEdit={canEdit} onSaved={reload} />}
    </Resource>
  );
}

function Formulario({
  data,
  canEdit,
  onSaved,
}: Readonly<{ data: Data; canEdit: boolean; onSaved: () => void }>) {
  const [atuacao, setAtuacao] = useState(data.diagnostico?.atuacao ?? '');
  const [respostas, setRespostas] = useState<Record<string, string>>(
    data.diagnostico?.respostas ?? {},
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => {
    setAtuacao(data.diagnostico?.atuacao ?? '');
    setRespostas(data.diagnostico?.respostas ?? {});
  }, [data.diagnostico]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!atuacao) {
      setMessage({ kind: 'error', text: 'Escolha como você pretende atuar.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await send('PUT', '/aluno/diagnostico', { atuacao, respostas });
      setMessage({
        kind: 'success',
        text: 'Diagnóstico salvo. Os materiais agora seguem o seu caminho.',
      });
      onSaved();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} aria-label="Diagnóstico inicial">
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      {!canEdit ? (
        <Alert kind="info">Só o aluno responde ao diagnóstico. Você está vendo como equipe.</Alert>
      ) : null}
      <Panel
        title="Como você pretende atuar?"
        description="Isso ajusta os materiais e o plano. Você pode trocar quando quiser."
      >
        <div className="ui-form">
          {Object.entries(ATUACAO).map(([value, label]) => (
            <label key={value} className="ui-choice">
              <input
                type="radio"
                name="atuacao"
                value={value}
                checked={atuacao === value}
                disabled={!canEdit}
                onChange={() => setAtuacao(value)}
              />
              <strong>{label}</strong>
              <small>
                {value === 'fornecedor'
                  ? 'Vender produtos, serviços ou engenharia direto para o governo.'
                  : 'Participar das licitações em nome de empresários e cobrar por isso.'}
              </small>
            </label>
          ))}
        </div>
      </Panel>
      <Panel title="Seu ponto de partida">
        <div className="ui-form">
          {data.perguntas.map((pergunta) => (
            <label key={pergunta.id}>
              {pergunta.texto}
              {pergunta.obrigatoria ? ' *' : ''}
              {pergunta.tipo === 'opcoes' ? (
                <select
                  value={respostas[pergunta.id] ?? ''}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setRespostas((current) => ({ ...current, [pergunta.id]: event.target.value }))
                  }
                >
                  <option value="">Escolha</option>
                  {pergunta.opcoes?.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={respostas[pergunta.id] ?? ''}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setRespostas((current) => ({ ...current, [pergunta.id]: event.target.value }))
                  }
                />
              )}
            </label>
          ))}
          {canEdit ? (
            <div className="ui-form-actions">
              <button className="ui-btn" type="submit" disabled={busy}>
                {busy
                  ? 'Salvando…'
                  : data.diagnostico
                    ? 'Atualizar diagnóstico'
                    : 'Salvar diagnóstico'}
              </button>
            </div>
          ) : null}
        </div>
      </Panel>
    </form>
  );
}
