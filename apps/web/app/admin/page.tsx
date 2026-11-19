import { requireArea } from '../../lib/session';
import { AreaHub } from '../components/AreaHub';
import { PageHeader } from '../components/ui';
import { AdminOverview } from './AdminOverview';

export const metadata = {
  title: 'Painel de operações | Licite Comigo',
  description: 'Visão geral da operação: empresas, assinaturas e coleta de editais.',
};

export default async function AdminPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader eyebrow="Administração" title="Painel de operações" />
      <AdminOverview modulo="profissional" />
      <AreaHub area="administracao" />
    </main>
  );
}
