'use client';

import { useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';
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

type Company = {
  tenant_id: string;
  nome: string;
  created_at: string;
  usuario_id: string | null;
  responsavel: string | null;
  email: string | null;
  ativo: boolean | null;
  onboarding_concluido: boolean | null;
  nicho_preferencias: string[] | null;
  razao_social: string | null;
  cnpj: string | null;
  buscas_ativas: number;
  oportunidades: number;
  ultimo_acesso: string | null;
  plano: string | null;
  plano_status: string | null;
};

const nicheLabel = (code: string) => NICHE_CATALOG.find((n) => n.code === code)?.label ?? code;

export function CompaniesAdmin() {
  const [companies, reload] = useResource<{ data: Company[] }>('/platform/companies');
  const [error, setError] = useState('');
  const [link, setLink] = useState<ResetLink | null>(null);
  const [invitesKey, setInvitesKey] = useState(0);
  return (
    <>
      <Panel
        title="Convidar empresa"
        description="Gera um link de cadastro. A empresa cria a própria senha e entra com um usuário."
      >
        <InviteForm
          kind="empresa"
          onCreated={() => {
            reload();
            setInvitesKey((key) => key + 1);
          }}
        />
      </Panel>
      <Panel
        title="Empresas cadastradas"
        description="Abra a ficha para ver o que cada empresa já acessou, buscou e está procurando. Em “Editar” você corrige nome, e-mail e empresa; “Link de senha” gera um novo link para a empresa definir a senha."
      >
        {error ? <Alert kind="error">{error}</Alert> : null}
        {link ? <ResetLinkBox link={link} onClose={() => setLink(null)} /> : null}
        <Resource value={companies}>
          {({ data }) =>
            data.length ? (
              <Table
                label="Empresas clientes"
                head={[
                  'Empresa',
                  'Responsável',
                  'O que procura',
                  'O que já fez',
                  'Plano',
                  'Situação',
                  'Ações',
                ]}
              >
                {data.map((company) => (
                  <tr key={company.tenant_id}>
                    <td>
                      <strong>{company.razao_social ?? company.nome}</strong>
                      <small>{company.cnpj ?? 'CNPJ não informado'}</small>
                      <small>Cliente desde {formatDate(company.created_at)}</small>
                    </td>
                    <td>
                      {company.responsavel ?? '—'}
                      <small>{company.email ?? ''}</small>
                    </td>
                    <td>
                      {company.nicho_preferencias?.length
                        ? company.nicho_preferencias.map(nicheLabel).join(', ')
                        : company.onboarding_concluido === false
                          ? 'Ainda não definiu'
                          : '—'}
                    </td>
                    <td>
                      Último acesso: {lastAccessText(company.ultimo_acesso)}
                      <small>
                        {company.buscas_ativas} busca(s) salva(s) · {company.oportunidades}{' '}
                        oportunidade(s)
                      </small>
                    </td>
                    <td>
                      {company.plano ?? 'Sem plano'}
                      {company.plano_status ? <small>{company.plano_status}</small> : null}
                    </td>
                    <td>
                      <Badge>{company.ativo === false ? 'Inativo' : 'Ativo'}</Badge>
                    </td>
                    <td>
                      {company.usuario_id ? (
                        <UserRowActions
                          userId={company.usuario_id}
                          ativo={company.ativo !== false}
                          onGenerated={setLink}
                          onChanged={reload}
                          onError={setError}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nenhuma empresa cadastrada ainda. Gere o primeiro convite acima.</Empty>
            )
          }
        </Resource>
      </Panel>
      <InvitationsPanel tipos={['empresa']} refreshKey={invitesKey} />
    </>
  );
}
