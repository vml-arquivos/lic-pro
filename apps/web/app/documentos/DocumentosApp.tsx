'use client';

import { useState } from 'react';
import { errorText, send } from '../../lib/api';
import {
  Alert,
  Badge,
  Empty,
  PageHeader,
  Panel,
  Resource,
  Table,
  formatDate,
  useResource,
} from '../components/ui';

type Doc = {
  id: string;
  tipo: string;
  nome: string;
  numero: string | null;
  emitido_em: string | null;
  valido_ate: string | null;
  link_url: string | null;
  observacao: string | null;
  situacao: 'valido' | 'vencendo' | 'vencido' | 'sem_validade';
  dias_restantes: number | null;
};

const TYPE_LABEL: Record<string, string> = {
  contrato_social: 'Contrato social',
  certidao_federal: 'Certidão federal',
  certidao_fgts: 'Certidão FGTS',
  certidao_trabalhista: 'Certidão trabalhista',
  certidao_estadual: 'Certidão estadual',
  certidao_municipal: 'Certidão municipal',
  certidao_falencia: 'Certidão de falência',
  balanco: 'Balanço patrimonial',
  atestado_capacidade: 'Atestado de capacidade técnica',
  declaracao: 'Declaração',
  outro: 'Outro',
};

const SITUATION: Record<Doc['situacao'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> =
  {
    valido: { label: 'Válido', tone: 'ok' },
    vencendo: { label: 'A vencer', tone: 'warn' },
    vencido: { label: 'Vencido', tone: 'bad' },
    sem_validade: { label: 'Sem validade', tone: 'muted' },
  };

const EMPTY = {
  tipo: 'certidao_federal',
  nome: '',
  numero: '',
  emitido_em: '',
  valido_ate: '',
  link_url: '',
  observacao: '',
};

export function DocumentosApp() {
  const [docs, reload] = useResource<{ data: Doc[]; aviso: string }>('/empresa/documentos');
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  function body() {
    return {
      tipo: form.tipo,
      nome: form.nome.trim(),
      numero: form.numero.trim() || null,
      emitido_em: form.emitido_em || null,
      valido_ate: form.valido_ate || null,
      link_url: form.link_url.trim() || null,
      observacao: form.observacao.trim() || null,
    };
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editing) await send('PATCH', `/empresa/documentos/${editing}`, body());
      else await send('POST', '/empresa/documentos', body());
      setNotice({
        kind: 'success',
        text: editing ? 'Documento atualizado.' : 'Documento cadastrado.',
      });
      setForm(EMPTY);
      setEditing(null);
      reload();
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error) });
    }
  }

  async function remove(doc: Doc) {
    if (!window.confirm(`Remover “${doc.nome}”?`)) return;
    try {
      await send('DELETE', `/empresa/documentos/${doc.id}`);
      setNotice({ kind: 'success', text: 'Documento removido.' });
      reload();
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error) });
    }
  }

  function edit(doc: Doc) {
    setEditing(doc.id);
    setForm({
      tipo: doc.tipo,
      nome: doc.nome,
      numero: doc.numero ?? '',
      emitido_em: doc.emitido_em ?? '',
      valido_ate: doc.valido_ate ?? '',
      link_url: doc.link_url ?? '',
      observacao: doc.observacao ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Documentos"
        title="Documentos da empresa e validades"
        description="Cadastre o que costuma ser pedido na habilitação e a data de validade. Você recebe um aviso no sino 30 e 7 dias antes de vencer."
      />
      <Resource value={docs}>
        {({ data, aviso }) => (
          <>
            <Alert kind="info">{aviso}</Alert>
            {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
            <Panel
              title={editing ? 'Editar documento' : 'Novo documento'}
              description="O arquivo fica com você. Aqui guardamos o nome, a validade e, se quiser, o link de onde ele está."
            >
              <form className="ui-form" onSubmit={(event) => void save(event)}>
                <label>
                  Tipo
                  <select
                    value={form.tipo}
                    onChange={(event) => setForm({ ...form, tipo: event.target.value })}
                  >
                    {Object.entries(TYPE_LABEL).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nome
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    value={form.nome}
                    onChange={(event) => setForm({ ...form, nome: event.target.value })}
                  />
                </label>
                <label>
                  Número (opcional)
                  <input
                    maxLength={120}
                    value={form.numero}
                    onChange={(event) => setForm({ ...form, numero: event.target.value })}
                  />
                </label>
                <label>
                  Emitido em
                  <input
                    type="date"
                    value={form.emitido_em}
                    onChange={(event) => setForm({ ...form, emitido_em: event.target.value })}
                  />
                </label>
                <label>
                  Válido até
                  <input
                    type="date"
                    value={form.valido_ate}
                    onChange={(event) => setForm({ ...form, valido_ate: event.target.value })}
                  />
                </label>
                <label>
                  Link do arquivo (opcional)
                  <input
                    type="url"
                    maxLength={500}
                    value={form.link_url}
                    onChange={(event) => setForm({ ...form, link_url: event.target.value })}
                  />
                </label>
                <div className="ui-form-actions">
                  <button type="submit" className="ui-btn">
                    {editing ? 'Salvar alterações' : 'Cadastrar documento'}
                  </button>
                  {editing ? (
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost"
                      onClick={() => {
                        setEditing(null);
                        setForm(EMPTY);
                      }}
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </form>
            </Panel>
            <Panel title="Seus documentos">
              {data.length === 0 ? (
                <Empty>
                  Nenhum documento cadastrado. Comece pelas certidões federal, FGTS e trabalhista,
                  que quase todo edital pede.
                </Empty>
              ) : (
                <Table
                  label="Documentos da empresa"
                  head={['Documento', 'Validade', 'Situação', 'Ações']}
                >
                  {data.map((doc) => {
                    const state = SITUATION[doc.situacao];
                    return (
                      <tr key={doc.id}>
                        <td>
                          {doc.link_url ? (
                            <a href={doc.link_url} target="_blank" rel="noreferrer">
                              {doc.nome}
                            </a>
                          ) : (
                            doc.nome
                          )}
                          <small>
                            {TYPE_LABEL[doc.tipo] ?? doc.tipo}
                            {doc.numero ? ` · nº ${doc.numero}` : ''}
                          </small>
                        </td>
                        <td>
                          {formatDate(doc.valido_ate)}
                          {doc.dias_restantes != null ? (
                            <small>
                              {doc.dias_restantes < 0
                                ? `venceu há ${-doc.dias_restantes} dia(s)`
                                : `faltam ${doc.dias_restantes} dia(s)`}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <Badge tone={state.tone}>{state.label}</Badge>
                        </td>
                        <td>
                          <div className="ui-table-actions">
                            <button
                              type="button"
                              className="ui-btn ui-btn-ghost ui-btn-small"
                              onClick={() => edit(doc)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="ui-btn ui-btn-ghost ui-btn-small"
                              onClick={() => void remove(doc)}
                            >
                              Remover
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              )}
            </Panel>
          </>
        )}
      </Resource>
    </div>
  );
}
