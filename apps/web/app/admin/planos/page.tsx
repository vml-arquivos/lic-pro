import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { PlansAdmin } from './PlansAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Planos e preços | Licite Comigo',
  description: 'Defina as assinaturas, o preço e o que cada plano inclui.',
};

export default async function PlanosPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração profissional"
        title="Planos e preços"
        description="As assinaturas do sistema profissional. Um plano só aparece para venda depois de ativado."
      />
      <PlansAdmin modulo="profissional" />
    </main>
  );
}
