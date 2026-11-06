import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { PlansAdmin } from './PlansAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Planos e preços | Licite Comigo',
  description: 'Defina o que é vendido, por quanto e o que cada plano inclui.',
};

export default async function PlanosPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração"
        title="Planos e preços"
        description="O curso e as assinaturas. Um plano só aparece para venda depois de ativado."
      />
      <PlansAdmin />
    </main>
  );
}
