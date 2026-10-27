import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { PraticarList } from './PraticarList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Praticar com editais | Licite Comigo' };

export default async function PraticarPage() {
  await requireArea('administracao', 'aluno');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Meu curso"
        title="Praticar com editais reais"
        description="Leia um edital de verdade, responda perguntas guiadas e receba a devolutiva do mentor. Aqui não existe proposta, lance nem acesso a portal."
      />
      <PraticarList />
    </div>
  );
}
