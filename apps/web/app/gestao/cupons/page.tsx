import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { CouponsAdmin } from '../../admin/cupons/CouponsAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Cupons do curso | Licite Comigo',
  description: 'Códigos de desconto para o curso.',
};

export default async function CuponsPage() {
  await requireArea('curso');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração do curso"
        title="Cupons do curso"
        description="Crie códigos para campanhas e parcerias. O desconto vale para o curso."
      />
      <CouponsAdmin modulo="curso" />
    </main>
  );
}
