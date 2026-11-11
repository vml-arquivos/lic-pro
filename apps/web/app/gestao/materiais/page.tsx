import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { MateriaisAdmin } from '../../admin/materiais/MateriaisAdmin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Materiais | Licite Comigo' };

export default async function GestaoMateriaisPage() {
  await requireArea('curso');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Administração do curso"
        title="Materiais do aluno"
        description="A biblioteca que o aluno vê. Item sem texto e sem link fica oculto até você anexar o link do arquivo."
      />
      <MateriaisAdmin />
    </div>
  );
}
