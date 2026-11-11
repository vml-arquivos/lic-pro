import { requireArea } from '../../lib/session';
import { AreaHub } from '../components/AreaHub';
import { PageHeader } from '../components/ui';
import { AdminOverview } from '../admin/AdminOverview';

export const metadata = {
  title: 'Painel da mentoria | Licite Comigo',
  description: 'Visão geral do curso: alunos, turmas, mentores, vendas e leads.',
};

export default async function GestaoPage() {
  await requireArea('curso');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Painel da mentoria"
        title="Visão geral"
        description="Como está o curso hoje: alunos, turmas, mentores, vendas e leads de alunos."
      />
      <AreaHub area="curso" />
      <AdminOverview modulo="curso" />
    </main>
  );
}
