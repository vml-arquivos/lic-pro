import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { PraticarList } from './PraticarList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Praticar com editais | Licite Comigo' };

export default async function PraticarPage() {
  await requireArea('administracao', 'curso', 'aluno');
  return (
    <div className="ui-page">
      <PageHeader eyebrow="Meu curso" title="Praticar" />
      <PraticarList />
    </div>
  );
}
