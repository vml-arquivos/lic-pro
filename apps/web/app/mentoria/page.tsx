import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { MentoriaAluno } from './MentoriaAluno';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mentoria | Licite Comigo' };

export default async function MentoriaPage() {
  await requireArea('administracao', 'aluno');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Meu curso"
        title="Mentoria"
        description="Suas sessões, os resumos e os recados que o mentor liberou para você."
      />
      <MentoriaAluno />
    </div>
  );
}
