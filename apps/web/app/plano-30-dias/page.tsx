import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { PlanoApp } from './PlanoApp';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plano de 30 dias | Licite Comigo' };

export default async function Plano30Page() {
  const session = await requireArea('administracao', 'aluno');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Meu curso"
        title="Plano de 30 dias"
        description="Um passo por dia: aulas, práticas com editais reais e revisão. O mentor pode ajustar o plano e comentar cada dia."
      />
      <PlanoApp canEdit={session.area === 'aluno'} />
    </div>
  );
}
