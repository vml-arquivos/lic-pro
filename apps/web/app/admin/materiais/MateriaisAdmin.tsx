'use client';

import { useState } from 'react';
import { api, errorText, send } from '../../../lib/api';
import { Alert, Badge, Empty, Panel, Resource, Table, useResource } from '../../components/ui';
import { ATUACAO, ETAPAS, TIPOS } from '../../materiais/etapas';

type Linha = {
  id: string;
  codigo: string;
  titulo: string;
  etapa: string;
  tipo: string;
  para: string;
  url: string | null;
  tem_conteudo: boolean;
  publicado: boolean;
};
type Completo = Linha & { descricao: string | null; conteudo: string | null; ordem: number };

const PARA: Record<string, string> = { todos: 'Todos', ...ATUACAO };

function situacao(item: Linha): [string, string] {
  if (!item.tem_conteudo && !item.url) return ['Falta o link', 'warn'];
  return item.publicado ? ['Publicado', 'ok'] : ['Oculto', 'muted'];
}

export function MateriaisAdmin() {
  const [lista, reload] = useResource<{ data: Linha[] }>('/platform/materiais');
  const [editing, setEditing] = useState<Completo | 'novo' | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function loadCatalog() {
    setMessage(null);
    try {
      const result = await send<{ inseridos: number; total: number }>(
        'POST',
        '/platform/materiais/catalogo',
      );
      setMessage({
        kind: 'success',
        text: result.inseridos
          ? `${result.inseridos} materiais adicionados. Nada que já existia foi alterado.`
          : 'O catálogo inicial já estava carregado.',
      });
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  async function edit(id: string) {
    try {
      setEditing(await api<Completo>(`/platform/materiais/${id}`));
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  async function remove(id: string) {
    try {
      await send('DELETE', `/platform/materiais/${id}`);
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <>
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      <Panel
        title="Biblioteca"
        actions={
          <>
            <button
              className="ui-btn ui-btn-ghost"
              type="button"
              onClick={() => void loadCatalog()}
            >
              Carregar catálogo inicial
            </button>
            <button className="ui-btn" type="button" onClick={() => setEditing('novo')}>
              Novo material
            </button>
          </>
        }
      >
        <Resource value={lista}>
          {({ data }) =>
            data.length === 0 ? (
              <Empty>
                Nenhum material ainda. Use “Carregar catálogo inicial” para começar com os materiais
                do curso.
              </Empty>
            ) : (
              <Table label="Materiais" head={['Material', 'Etapa', 'Tipo', 'Para', 'Situação', '']}>
                {data.map((item) => {
                  const [text, tone] = situacao(item);
                  return (
                    <tr key={item.id}>
                      <td>{item.titulo}</td>
                      <td>{ETAPAS.find(([id]) => id === item.etapa)?.[1] ?? item.etapa}</td>
                      <td>{TIPOS[item.tipo] ?? item.tipo}</td>
                      <td>{PARA[item.para] ?? item.para}</td>
                      <td>
                        <Badge tone={tone}>{text}</Badge>
                      </td>
                      <td>
                        <button
                          className="ui-link"
                          type="button"
                          onClick={() => void edit(item.id)}
                        >
                          Editar
                        </button>{' '}
                        <button
                          className="ui-link"
                          type="button"
                          onClick={() => void remove(item.id)}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )
          }
        </Resource>
      </Panel>
      {editing ? (
        <MaterialForm
          key={editing === 'novo' ? 'novo' : editing.id}
          initial={editing === 'novo' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onError={(text) => setMessage({ kind: 'error', text })}
        />
      ) : null}
    </>
  );
}

function MaterialForm({
  initial,
  onClose,
  onSaved,
  onError,
}: Readonly<{
  initial: Completo | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (text: string) => void;
}>) {
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const body = {
      titulo: text('titulo'),
      descricao: text('descricao') || null,
      etapa: text('etapa'),
      tipo: text('tipo'),
      para: text('para'),
      url: text('url') || null,
      conteudo: text('conteudo') || null,
      ordem: Number(text('ordem')) || 100,
      publicado: form.get('publicado') === 'on',
    };
    setBusy(true);
    try {
      if (initial) await send('PATCH', `/platform/materiais/${initial.id}`, body);
      else await send('POST', '/platform/materiais', { ...body, codigo: text('codigo') });
      onSaved();
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title={initial ? 'Editar material' : 'Novo material'}>
      <form
        className="ui-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(new FormData(event.currentTarget));
        }}
      >
        {initial ? null : (
          <label>
            Código (letras minúsculas, números e hífen)
            <input name="codigo" required minLength={2} maxLength={80} pattern="[a-z0-9\-]+" />
          </label>
        )}
        <label>
          Título
          <input
            name="titulo"
            required
            minLength={2}
            maxLength={200}
            defaultValue={initial?.titulo}
          />
        </label>
        <label>
          Descrição curta
          <input name="descricao" maxLength={600} defaultValue={initial?.descricao ?? ''} />
        </label>
        <label>
          Etapa
          <select name="etapa" defaultValue={initial?.etapa ?? 'comecar'}>
            {ETAPAS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select name="tipo" defaultValue={initial?.tipo ?? 'guia'}>
            {Object.entries(TIPOS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Para quem
          <select name="para" defaultValue={initial?.para ?? 'todos'}>
            {Object.entries(PARA).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Link do arquivo (https)
          <input name="url" type="url" maxLength={1000} defaultValue={initial?.url ?? ''} />
        </label>
        <label>
          Texto (abre dentro do sistema)
          <textarea name="conteudo" rows={8} defaultValue={initial?.conteudo ?? ''} />
        </label>
        <label>
          Ordem
          <input
            name="ordem"
            type="number"
            min={1}
            max={9999}
            defaultValue={initial?.ordem ?? 100}
          />
        </label>
        <label>
          <input name="publicado" type="checkbox" defaultChecked={initial?.publicado ?? true} />{' '}
          Visível para o aluno
        </label>
        <div className="ui-form-actions">
          <button className="ui-btn" type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
          <button className="ui-btn ui-btn-ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}
