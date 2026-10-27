import Link from 'next/link';
import { requireArea } from '../../../lib/session';
import { PraticarForm } from './PraticarForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Praticar com edital | Licite Comigo' };

export default async function PraticarEditalPage({ params }: { params: { editalId: string } }) {
  const session = await requireArea('administracao', 'aluno');
  return (
    <div className="ui-page">
      <Link className="back-link" href="/praticar">
        ← Minhas práticas
      </Link>
      <PraticarForm editalId={params.editalId} canEdit={session.area === 'aluno'} />
    </div>
  );
}
