import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { FinanceAdmin } from '../../admin/financeiro/FinanceAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Vendas do curso | Licite Comigo',
  description: 'Receita e vendas do curso.',
};

export default async function VendasPage() {
  await requireArea('curso');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração do curso"
        title="Vendas do curso"
        description="Quanto entrou e quem comprou o curso. As assinaturas das empresas ficam na Administração profissional."
      />
      <FinanceAdmin modulo="curso" />
    </main>
  );
}
