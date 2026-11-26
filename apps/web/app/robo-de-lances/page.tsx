import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { RoboDeLances } from './RoboDeLances';
import './robo.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Robô de lances | Licite Comigo',
  description: 'Piso, sequência de lances e próximo lance da disputa.',
};

export default async function RoboDeLancesPage() {
  await requireArea('empresa', 'administracao', 'colaborador');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Disputa"
        title="Robô de lances"
        meta="O lance é enviado por você, no portal."
      />
      <RoboDeLances />
    </div>
  );
}
