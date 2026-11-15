'use client';

import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
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

export function TeamAdmin() {
  const [people, reload] = useResource<{ data: Member[] }>('/platform/team');
  const [error, setError] = useState('');
  const [link, setLink] = useState<ResetLink | null>(null);
  const [invitesKey, setInvitesKey] = useState(0);
  return (
    <>
      <Panel
        title="Convidar administrador"
        description="A pessoa recebe um link e cria a senha. Escolha se ela entra só no Painel admin, só no Painel da mentoria ou nos dois. Convide só quem precisa."
      >
        <InviteForm
          kind="equipe"
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
          {({ data }) =>
            data.length ? (
              <Table
                label="Equipe administrativa"
                head={['Administrador', 'Acesso', 'Último acesso', 'Situação', 'Desde', 'Ações']}
              >
                {data.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <strong>{person.nome}</strong>
                      <small>{person.email}</small>
                    </td>
                    <td>
                      <EscopoSelect member={person} onChanged={reload} onError={setError} />
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
      <InvitationsPanel tipos={['equipe']} refreshKey={invitesKey} />
    </>
  );
}
