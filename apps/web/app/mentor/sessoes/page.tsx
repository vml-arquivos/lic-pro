import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { Sessoes } from './Sessoes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sessões de mentoria | Licite Comigo' };

export default async function SessoesPage() {
  const session = await requireArea('administracao', 'mentor');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Mentoria"
        title="Sessões"
        description="Marque conversas com seus alunos, registre o que foi combinado e compartilhe o resumo."
      />
      <Sessoes canEdit={session.area === 'mentor'} />
    </div>
  );
}
