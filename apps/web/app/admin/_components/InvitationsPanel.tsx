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
import { InviteLink } from './InviteForm';

type Invitation = {
  id: string;
  tipo: 'aluno' | 'mentor' | 'empresa' | 'colaborador' | 'equipe';
  nome: string;
  email: string;
  empresa_nome: string | null;
  expira_em: string;
  situacao: 'pendente' | 'aceito' | 'revogado' | 'expirado';
};
type Reissued = { id: string; expira_em: string; link: string; email_enviado: boolean };

/** Convites de cadastro de um tipo: ver quem ainda não entrou, gerar outro link ou revogar. */
export function InvitationsPanel({
  tipos,
  refreshKey = 0,
}: Readonly<{ tipos: Invitation['tipo'][]; refreshKey?: number }>) {
  const [invitations, reload] = useResource<{ data: Invitation[] }>(
    `/platform/invitations?r=${refreshKey}`,
  );
  const [fresh, setFresh] = useState<Record<string, Reissued>>({});
  const [error, setError] = useState('');

  async function revoke(id: string) {
    setError('');
    try {
      await send('POST', `/platform/invitations/${id}/revoke`);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  }
  async function reissue(id: string) {
    setError('');
    try {
      const result = await send<Reissued>('POST', `/platform/invitations/${id}/reissue`);
      setFresh((current) => ({ ...current, [id]: result }));
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  return (
    <Panel
      title="Convites de cadastro"
      description="Quem foi convidado e ainda não criou a senha. “Novo link” gera outro link de cadastro (o anterior deixa de valer)."
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      <Resource value={invitations}>
        {({ data }) => {
          const rows = data.filter((invite) => tipos.includes(invite.tipo));
          return rows.length ? (
            <>
              <Table label="Convites" head={['Pessoa', 'Situação', 'Validade', '']}>
                {rows.map((invite) => (
                  <tr key={invite.id}>
                    <td>
                      <strong>{invite.empresa_nome ?? invite.nome}</strong>
                      <small>
                        {invite.empresa_nome ? `${invite.nome} · ` : ''}
                        {invite.email}
                      </small>
                    </td>
                    <td>
                      <Badge>{invite.situacao}</Badge>
                    </td>
                    <td>{formatDate(invite.expira_em)}</td>
                    <td>
                      {invite.situacao !== 'aceito' ? (
                        <span className="ui-table-actions">
                          <button
                            type="button"
                            className="ui-btn ui-btn-small ui-btn-ghost"
                            onClick={() => void reissue(invite.id)}
                          >
                            Novo link
                          </button>
                          {invite.situacao === 'pendente' ? (
                            <button
                              type="button"
                              className="ui-btn ui-btn-small ui-btn-danger"
                              onClick={() => void revoke(invite.id)}
                            >
                              Revogar
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Table>
              {Object.entries(fresh).map(([id, created]) => (
                <InviteLink key={id} created={created} />
              ))}
            </>
          ) : (
            <Empty>Nenhum convite deste tipo ainda.</Empty>
          );
        }}
      </Resource>
    </Panel>
  );
}
