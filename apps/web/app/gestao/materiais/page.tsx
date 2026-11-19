import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { MateriaisAdmin } from '../../admin/materiais/MateriaisAdmin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Materiais | Licite Comigo' };

export default async function GestaoMateriaisPage() {
  await requireArea('curso');
  return (
    <div className="ui-page">
      <PageHeader eyebrow="Painel da mentoria" title="Materiais do aluno" />
      <MateriaisAdmin />
    </div>
  );
}
