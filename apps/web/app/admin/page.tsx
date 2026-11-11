import { requireArea } from '../../lib/session';
import { AreaHub } from '../components/AreaHub';
import { PageHeader } from '../components/ui';
import { AdminOverview } from './AdminOverview';

export const metadata = {
  title: 'Administração profissional | Licite Comigo',
  description: 'Visão geral da operação: empresas, assinaturas e coleta de editais.',
};

export default async function AdminPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração profissional"
        title="Visão geral"
        description="Como está a operação hoje: empresas clientes, assinaturas e coleta de editais."
      />
      <AreaHub area="administracao" />
      <AdminOverview modulo="profissional" />
    </main>
  );
}
