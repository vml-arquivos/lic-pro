import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { MateriaisBiblioteca } from './MateriaisBiblioteca';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Materiais | Licite Comigo' };

export default async function MateriaisPage() {
  await requireArea('administracao', 'aluno', 'mentor');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Meu curso"
        title="Materiais"
        description="Modelos, checklists e guias organizados pela etapa em que você está."
      />
      <MateriaisBiblioteca />
    </div>
  );
}
