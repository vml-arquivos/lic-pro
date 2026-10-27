import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { MentorsAdmin } from './MentorsAdmin';

export const metadata = {
  title: 'Mentores | Licite Comigo',
  description: 'Mentores do curso: convite, alunos acompanhados e situação.',
};

export default async function MentorsPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração"
        title="Mentores"
        description="Quem acompanha os alunos do curso."
      />
      <MentorsAdmin />
    </main>
  );
}
