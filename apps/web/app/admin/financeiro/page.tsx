import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { FinanceAdmin } from './FinanceAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Financeiro | Licite Comigo',
  description: 'Receita e assinantes do sistema profissional.',
};

export default async function FinanceiroPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração profissional"
        title="Financeiro"
        description="Quanto entrou e quem assina o sistema profissional. As vendas do curso ficam na Administração do curso."
      />
      <FinanceAdmin modulo="profissional" />
    </main>
  );
}
