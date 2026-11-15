import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { AssinaturaPanel } from './AssinaturaPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Assinatura | Licite Comigo',
  description: 'Plano da sua empresa, pagamento e limites.',
};

export default async function AssinaturaPage() {
  await requireArea('empresa');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Conta"
        title="Assinatura"
        description="O plano da sua empresa, a situação do pagamento e o que ele inclui."
      />
      <AssinaturaPanel />
    </main>
  );
}
