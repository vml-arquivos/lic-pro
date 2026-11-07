import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { EncontrosAluno } from './EncontrosAluno';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Encontros ao vivo | Licite Comigo' };

export default async function EncontrosPage() {
  await requireArea('administracao', 'aluno');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Meu curso"
        title="Encontros ao vivo"
        description="Os encontros em grupo da sua turma e o atalho para o grupo de conversa."
      />
      <EncontrosAluno />
    </div>
  );
}
