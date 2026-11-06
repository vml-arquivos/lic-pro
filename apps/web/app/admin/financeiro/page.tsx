import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { FinanceAdmin } from './FinanceAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Financeiro | Licite Comigo',
  description: 'Receita, assinantes e vendas do curso.',
};

export default async function FinanceiroPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração"
        title="Financeiro"
        description="Quanto entrou, quem assina e quem comprou o curso."
      />
      <FinanceAdmin />
    </main>
  );
}
