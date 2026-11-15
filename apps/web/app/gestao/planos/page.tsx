import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { PlansAdmin } from '../../admin/planos/PlansAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Preço do curso | Licite Comigo',
  description: 'Defina o preço e o que o curso inclui.',
};

export default async function PlanosPage() {
  await requireArea('curso');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Painel da mentoria"
        title="Preço do curso"
        description="O curso e a turma que ele libera. O curso só aparece para venda depois de ativado."
      />
      <PlansAdmin modulo="curso" />
    </main>
  );
}
