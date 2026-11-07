import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { SubscribersAdmin } from './SubscribersAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Assinantes | Licite Comigo',
  description: 'Empresas em teste grátis e com plano, com ações de ajuste.',
};

export default async function AssinantesPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração"
        title="Assinantes"
        description="Quem está em teste grátis, quem assina e o que fazer com cada conta."
      />
      <SubscribersAdmin />
    </main>
  );
}
