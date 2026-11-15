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

type Mentor = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  created_at: string;
  ultimo_acesso: string | null;
  alunos_ativos: number;
  concessoes_ativas: number;
};

export function MentorsAdmin() {
  const [mentors, reload] = useResource<{ data: Mentor[] }>('/platform/mentors');
  const [error, setError] = useState('');
  const [link, setLink] = useState<ResetLink | null>(null);
  const [invitesKey, setInvitesKey] = useState(0);
  return (
    <>
      <Panel
        title="Convidar mentor"
        description="O mentor recebe um link, cria a senha e já entra na área de Mentor."
      >
        <InviteForm
          kind="mentor"
          onCreated={() => {
            reload();
            setInvitesKey((key) => key + 1);
          }}
        />
      </Panel>
      <Panel
        title="Mentores cadastrados"
        description="Ficha, edição e link para o mentor definir uma nova senha."
      >
        {error ? <Alert kind="error">{error}</Alert> : null}
        {link ? <ResetLinkBox link={link} onClose={() => setLink(null)} /> : null}
        <Resource value={mentors}>
          {({ data }) =>
            data.length ? (
              <Table
                label="Mentores"
                head={['Mentor', 'Alunos ativos', 'Último acesso', 'Situação', 'Desde', 'Ações']}
              >
                {data.map((mentor) => (
                  <tr key={mentor.id}>
                    <td>
                      <strong>{mentor.nome}</strong>
                      <small>{mentor.email}</small>
                    </td>
                    <td>{mentor.alunos_ativos}</td>
                    <td>{lastAccessText(mentor.ultimo_acesso)}</td>
                    <td>
                      <Badge>{mentor.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td>{formatDate(mentor.created_at)}</td>
                    <td>
                      <UserRowActions
                        userId={mentor.id}
                        ativo={mentor.ativo}
                        onGenerated={setLink}
                        onChanged={reload}
                        onError={setError}
                      />
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nenhum mentor cadastrado ainda.</Empty>
            )
          }
        </Resource>
      </Panel>
      <InvitationsPanel tipos={['mentor']} refreshKey={invitesKey} />
    </>
  );
}
