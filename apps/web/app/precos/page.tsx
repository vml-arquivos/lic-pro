import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { PrecosApp } from './PrecosApp';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Preços de referência | Licite Comigo',
  description: 'Preços praticados pelo governo para um item, a partir do Compras.gov.br.',
};

export default async function PrecosPage() {
  await requireArea('empresa', 'aluno', 'administracao', 'colaborador');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Ferramentas"
        title="Preços de referência"
        description="Quanto o governo pagou por um item (CATMAT) nos últimos meses, com a fonte oficial."
      />
      <PrecosApp />
    </main>
  );
}
