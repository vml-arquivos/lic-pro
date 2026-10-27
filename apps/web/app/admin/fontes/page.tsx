import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { SourcesAdmin } from './SourcesAdmin';

export const metadata = {
  title: 'Fontes de dados | Licite Comigo',
  description: 'Situação da coleta de editais nas fontes públicas.',
};

export default async function SourcesPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração"
        title="Fontes de dados"
        description="De onde vêm os editais e se a coleta está rodando."
      />
      <SourcesAdmin />
    </main>
  );
}
