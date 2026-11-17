'use client';

import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
import { AcessosEditor } from '../_components/AcessosEditor';
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
import { InvitationsPanel } from '../_components/InvitationsPanel';
import { InviteForm } from '../_components/InviteForm';
import {
  ResetLinkBox,
  UserRowActions,
  lastAccessText,
  type ResetLink,
} from '../_components/UserActions';

type Member = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  created_at: string;
  ultimo_acesso: string | null;
  escopo_equipe: 'tudo' | 'profissional' | 'curso';
  acessos_bloqueados: string[];
  superadmin: boolean;
};

const ESCOPOS = [
  { value: 'profissional', label: 'Só o Painel admin' },
  { value: 'curso', label: 'Só o Painel da mentoria' },
  { value: 'tudo', label: 'Acesso total' },
] as const;

function EscopoSelect({
  member,
  onChanged,
  onError,
}: Readonly<{ member: Member; onChanged: () => void; onError: (message: string) => void }>) {
  const [busy, setBusy] = useState(false);
  async function change(value: string) {
    setBusy(true);
    onError('');
    try {
      await send('PATCH', `/platform/users/${member.id}/escopo`, { escopo_equipe: value });
      onChanged();
    } catch (cause) {
      onError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <select
      aria-label={`Acesso de ${member.nome}`}
      value={member.escopo_equipe}
      disabled={busy}
      onChange={(event) => void change(event.target.value)}
    >
      {ESCOPOS.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function AcessosPanel({
  member,
  onClose,
  onChanged,
  onError,
}: Readonly<{
  member: Member;
  onClose: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}>) {
  const [lista, setLista] = useState<string[]>(member.acessos_bloqueados);
  const [busy, setBusy] = useState(false);
  const [salvo, setSalvo] = useState(false);

  async function salvar() {
    setBusy(true);
    setSalvo(false);
    onError('');
    try {
      await send('PATCH', `/platform/users/${member.id}/acessos`, { bloqueados: lista });
      setSalvo(true);
      onChanged();
    } catch (cause) {
      onError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={`Funções de ${member.nome}`}>
      <AcessosEditor
        bloqueados={lista}
        onChange={(proxima) => {
          setSalvo(false);
          setLista(proxima);
        }}
        disabled={busy}
      />
      <p>
        <button
          type="button"
          className="ui-btn ui-btn-small"
          disabled={busy}
          onClick={() => void salvar()}
        >
          {busy ? 'Salvando…' : 'Salvar'}
        </button>{' '}
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-small" onClick={onClose}>
          Fechar
        </button>{' '}
        {salvo ? <span role="status">Salvo.</span> : null}
      </p>
    </Panel>
  );
}

export function TeamAdmin() {
  const [people, reload] = useResource<{ data: Member[]; ha_superadmin: boolean }>(
    '/platform/team',
  );
  const [error, setError] = useState('');
  const [link, setLink] = useState<ResetLink | null>(null);
  const [invitesKey, setInvitesKey] = useState(0);
  const [editando, setEditando] = useState<Member | null>(null);
  return (
    <>
      <Panel
        title="Convidar administrador"
        description="A pessoa recebe um link e cria a senha. Escolha o painel e marque o que ela não pode abrir."
      >
        <InviteForm
          kind="equipe"
          podeBloquear
          onCreated={() => {
            reload();
            setInvitesKey((key) => key + 1);
          }}
        />
      </Panel>
      <Panel title="Administradores">
        {error ? <Alert kind="error">{error}</Alert> : null}
        {link ? <ResetLinkBox link={link} onClose={() => setLink(null)} /> : null}
        <Resource value={people}>
          {({ data, ha_superadmin: haSuperadmin }) =>
            data.length ? (
              <Table
                label="Equipe administrativa"
                head={[
                  'Administrador',
                  'Acesso',
                  'Funções',
                  'Último acesso',
                  'Situação',
                  'Desde',
                  'Ações',
                ]}
              >
                {data.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <strong>{person.nome}</strong>
                      <small>{person.email}</small>
                    </td>
                    <td>
                      {person.superadmin ? (
                        <Badge>Superadmin</Badge>
                      ) : (
                        <EscopoSelect member={person} onChanged={reload} onError={setError} />
                      )}
                    </td>
                    <td>
                      {person.superadmin ? (
                        'Tudo liberado'
                      ) : haSuperadmin ? (
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost ui-btn-small"
                          onClick={() => setEditando(person)}
                        >
                          {person.acessos_bloqueados.length
                            ? `${person.acessos_bloqueados.length} bloqueadas`
                            : 'Escolher'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{lastAccessText(person.ultimo_acesso)}</td>
                    <td>
                      <Badge>{person.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td>{formatDate(person.created_at)}</td>
                    <td>
                      <UserRowActions
                        userId={person.id}
                        ativo={person.ativo}
                        onGenerated={setLink}
                        onChanged={reload}
                        onError={setError}
                      />
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nenhum administrador encontrado.</Empty>
            )
          }
        </Resource>
      </Panel>
      {editando ? (
        <AcessosPanel
          key={`${editando.id}-${editando.acessos_bloqueados.join(',')}`}
          member={editando}
          onClose={() => setEditando(null)}
          onChanged={reload}
          onError={setError}
        />
      ) : null}
      <InvitationsPanel tipos={['equipe']} refreshKey={invitesKey} />
    </>
  );
}
