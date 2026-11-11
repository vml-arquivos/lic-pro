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
};

export function TeamAdmin() {
  const [people, reload] = useResource<{ data: Member[] }>('/platform/team');
  const [error, setError] = useState('');
  const [link, setLink] = useState<ResetLink | null>(null);
  const [invitesKey, setInvitesKey] = useState(0);
  return (
    <>
      <Panel
        title="Convidar administrador"
        description="A pessoa recebe um link, cria a senha e entra no painel da Administração, com acesso a tudo o que está aqui. Convide só quem precisa."
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
                head={['Administrador', 'Último acesso', 'Situação', 'Desde', 'Ações']}
              >
                {data.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <strong>{person.nome}</strong>
                      <small>{person.email}</small>
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
