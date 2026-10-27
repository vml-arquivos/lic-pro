import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { Devolutivas } from './Devolutivas';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Devolutivas | Licite Comigo' };

export default async function DevolutivasPage() {
  const session = await requireArea('administracao', 'mentor');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Mentoria"
        title="Devolutivas"
        description="Práticas com edital real que os alunos enviaram. Comente, dê uma nota de 1 a 5 e devolva."
      />
      <Devolutivas canReply={session.area === 'mentor'} />
    </div>
  );
}
