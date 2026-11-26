import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { CompaniesAdmin } from './CompaniesAdmin';

export const metadata = {
  title: 'Empresas clientes | Licite Comigo',
  description:
    'Contas de empresas que usam o Alerta de Licitações, com convite e situação de cada uma.',
};

export default async function CompaniesPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader eyebrow="Painel admin" title="Empresas clientes" />
      <CompaniesAdmin />
    </main>
  );
}
