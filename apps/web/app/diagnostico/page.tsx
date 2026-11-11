import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { DiagnosticoForm } from './DiagnosticoForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Meu diagnóstico | Licite Comigo' };

export default async function DiagnosticoPage() {
  const session = await requireArea('administracao', 'curso', 'aluno');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Meu curso"
        title="Meu diagnóstico"
        description="Algumas perguntas para o seu mentor conhecer o seu ponto de partida. Leva uns cinco minutos e você pode mudar depois."
      />
      <DiagnosticoForm canEdit={session.area === 'aluno'} />
    </div>
  );
}
