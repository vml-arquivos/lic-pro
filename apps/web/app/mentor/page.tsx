import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { MentorAlunos } from './MentorAlunos';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Meus alunos | Licite Comigo',
  description: 'Acompanhamento dos alunos do curso.',
};

export default async function MentorPage() {
  await requireArea('administracao', 'mentor');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Mentoria"
        title="Meus alunos"
        description="Só aparecem os alunos que você acompanha. Abra um aluno para ver o plano, as práticas e as anotações."
      />
      <MentorAlunos />
    </div>
  );
}
