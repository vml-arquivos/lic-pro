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
import { ActiveToggle } from '../_components/ActiveToggle';
import { InviteForm } from '../_components/InviteForm';

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
};

const nicheLabel = (code: string) => NICHE_CATALOG.find((n) => n.code === code)?.label ?? code;

export function CompaniesAdmin() {
  const [companies, reload] = useResource<{ data: Company[] }>('/platform/companies');
  const [error, setError] = useState('');
  return (
    <>
      <Panel
        title="Convidar empresa"
        description="Gera um link de cadastro. A empresa cria a própria senha e entra com um usuário."
      >
        <InviteForm kind="empresa" onCreated={reload} />
      </Panel>
      <Panel title="Empresas cadastradas">
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Resource value={companies}>
          {({ data }) =>
            data.length ? (
              <Table
                label="Empresas clientes"
                head={['Empresa', 'Responsável', 'Nichos do Radar', 'Uso', 'Situação', 'Desde', '']}
              >
                {data.map((company) => (
                  <tr key={company.tenant_id}>
                    <td>
                      <strong>{company.razao_social ?? company.nome}</strong>
                      <small>{company.cnpj ?? 'CNPJ não informado'}</small>
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
                      {company.buscas_ativas} busca(s)
                      <small>{company.oportunidades} oportunidade(s) salva(s)</small>
                    </td>
                    <td>
                      <Badge>{company.ativo === false ? 'Inativo' : 'Ativo'}</Badge>
                    </td>
                    <td>{formatDate(company.created_at)}</td>
                    <td>
                      {company.usuario_id ? (
                        <ActiveToggle
                          userId={company.usuario_id}
                          ativo={company.ativo !== false}
                          onDone={() => {
                            setError('');
                            reload();
                          }}
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
    </>
  );
}
