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
import { ActiveToggle } from '../_components/ActiveToggle';
import { InviteForm } from '../_components/InviteForm';

type Mentor = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  created_at: string;
  alunos_ativos: number;
  concessoes_ativas: number;
};

export function MentorsAdmin() {
  const [mentors, reload] = useResource<{ data: Mentor[] }>('/platform/mentors');
  const [error, setError] = useState('');
  return (
    <>
      <Panel
        title="Convidar mentor"
        description="O mentor recebe um link, cria a senha e já entra na área de Mentor."
      >
        <InviteForm kind="mentor" onCreated={reload} />
      </Panel>
      <Panel title="Mentores cadastrados">
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Resource value={mentors}>
          {({ data }) =>
            data.length ? (
              <Table label="Mentores" head={['Mentor', 'Alunos ativos', 'Situação', 'Desde', '']}>
                {data.map((mentor) => (
                  <tr key={mentor.id}>
                    <td>
                      <strong>{mentor.nome}</strong>
                      <small>{mentor.email}</small>
                    </td>
                    <td>{mentor.alunos_ativos}</td>
                    <td>
                      <Badge>{mentor.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td>{formatDate(mentor.created_at)}</td>
                    <td>
                      <ActiveToggle
                        userId={mentor.id}
                        ativo={mentor.ativo}
                        onDone={() => {
                          setError('');
                          reload();
                        }}
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
    </>
  );
}
