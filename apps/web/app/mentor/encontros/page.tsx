import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { EncontrosEquipe } from './EncontrosEquipe';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Encontros ao vivo | Licite Comigo' };

export default async function EncontrosEquipePage() {
  await requireArea('administracao', 'mentor');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Mentoria"
        title="Encontros ao vivo"
        description="Marque encontros para a turma toda. Os alunos são avisados e veem o link na página deles."
      />
      <EncontrosEquipe />
    </div>
  );
}
