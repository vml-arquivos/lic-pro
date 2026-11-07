import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { CouponsAdmin } from './CouponsAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Cupons | Licite Comigo',
  description: 'Códigos de desconto para o curso e as assinaturas.',
};

export default async function CuponsPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração"
        title="Cupons de desconto"
        description="Crie códigos para campanhas e parcerias. O desconto vale para o curso e para as assinaturas escolhidas."
      />
      <CouponsAdmin />
    </main>
  );
}
