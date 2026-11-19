import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { Devolutivas } from './Devolutivas';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Devolutivas | Licite Comigo' };

export default async function DevolutivasPage() {
  const session = await requireArea('administracao', 'curso', 'mentor');
  return (
    <div className="ui-page">
      <PageHeader eyebrow="Mentoria" title="Devolutivas" />
      <Devolutivas canReply={session.area === 'mentor'} />
    </div>
  );
}
