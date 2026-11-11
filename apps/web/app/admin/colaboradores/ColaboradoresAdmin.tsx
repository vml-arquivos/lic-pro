'use client';

import { useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';
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

type Colaborador = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  created_at: string;
  ultimo_acesso: string | null;
  nichos: string[] | null;
  buscas_ativas: number;
  oportunidades: number;
};

const labelOf = (code: string) => NICHE_CATALOG.find((niche) => niche.code === code)?.label ?? code;

function NichosEditor({
  colaborador,
  onSaved,
  onError,
}: Readonly<{
  colaborador: Colaborador;
  onSaved: () => void;
  onError: (message: string) => void;
}>) {
  const [selected, setSelected] = useState<string[]>(colaborador.nichos ?? []);
  const [busy, setBusy] = useState(false);

  function toggle(code: string) {
    setSelected((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  async function save() {
    setBusy(true);
    onError('');
    try {
      await send('PUT', `/platform/colaboradores/${colaborador.id}/nichos`, { nichos: selected });
      onSaved();
    } catch (cause) {
      onError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="ui-details">
      <summary>
        {(colaborador.nichos ?? []).length
          ? (colaborador.nichos ?? []).map(labelOf).join(' · ')
          : 'Nenhum nicho liberado'}{' '}
        <small>— editar</small>
      </summary>
      <div className="ui-form">
        <fieldset>
          <legend>Nichos que {colaborador.nome.split(' ')[0]} pode ver</legend>
          {NICHE_CATALOG.map((niche) => (
            <label className="ui-check" key={niche.code}>
              <input
                type="checkbox"
                checked={selected.includes(niche.code)}
                onChange={() => toggle(niche.code)}
              />
              {niche.label}
            </label>
          ))}
        </fieldset>
        <div className="ui-table-actions">
          <button
            type="button"
            className="ui-btn ui-btn-small"
            disabled={busy || selected.length === 0}
            onClick={() => void save()}
          >
            {busy ? 'Salvando…' : 'Salvar nichos'}
          </button>
          {selected.length === 0 ? <small>Escolha pelo menos um nicho.</small> : null}
        </div>
      </div>
    </details>
  );
}

export function ColaboradoresAdmin() {
  const [people, reload] = useResource<{ data: Colaborador[] }>('/platform/colaboradores');
  const [error, setError] = useState('');
  const [link, setLink] = useState<ResetLink | null>(null);
  const [invitesKey, setInvitesKey] = useState(0);
  return (
    <>
      <Panel
        title="Convidar colaborador"
        description="A pessoa recebe um link, cria a senha e entra na área de Colaborador. Depois do convite, libere os nichos dela abaixo."
      >
        <InviteForm
          kind="colaborador"
          onCreated={() => {
            reload();
            setInvitesKey((key) => key + 1);
          }}
        />
      </Panel>
      <Panel
        title="Colaboradores cadastrados"
        description="Para salvar oportunidades e agenda, cadastre os dados da empresa do Licite Comigo em Dados da empresa (área de Colaborador)."
      >
        {error ? <Alert kind="error">{error}</Alert> : null}
        {link ? <ResetLinkBox link={link} onClose={() => setLink(null)} /> : null}
        <Resource value={people}>
          {({ data }) =>
            data.length ? (
              <Table
                label="Colaboradores"
                head={[
                  'Colaborador',
                  'Nichos liberados',
                  'Buscas',
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
                      <NichosEditor
                        key={(person.nichos ?? []).join(',')}
                        colaborador={person}
                        onSaved={() => {
                          setError('');
                          reload();
                        }}
                        onError={setError}
                      />
                    </td>
                    <td>{person.buscas_ativas}</td>
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
              <Empty>Nenhum colaborador cadastrado ainda.</Empty>
            )
          }
        </Resource>
      </Panel>
      <InvitationsPanel tipos={['colaborador']} refreshKey={invitesKey} />
    </>
  );
}
