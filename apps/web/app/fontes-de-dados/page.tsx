import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { FontesApp } from './FontesApp';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Fonte de dados | Licite Comigo',
  description: 'De onde vêm os dados e quando foram atualizados.',
};

export default async function FontesDeDadosPage() {
  await requireArea('empresa', 'administracao', 'colaborador');
  return (
    <div className="ui-page">
      <PageHeader eyebrow="Minha empresa" title="Fonte de dados" />
      <FontesApp />
    </div>
  );
}
