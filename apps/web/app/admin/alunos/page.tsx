import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { StudentsAdmin } from './StudentsAdmin';

export const metadata = {
  title: 'Alunos e turmas | Licite Comigo',
  description: 'Matrícula, turmas, convites e progresso dos alunos do curso.',
};

export default async function StudentsPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração"
        title="Alunos e turmas"
        description="O aluno só entra por matrícula feita aqui. Crie a turma, gere o convite e acompanhe o progresso."
      />
      <StudentsAdmin />
    </main>
  );
}
