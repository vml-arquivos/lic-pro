import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { CouponsAdmin } from './CouponsAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Cupons | Licite Comigo',
  description: 'Códigos de desconto para as assinaturas.',
};

export default async function CuponsPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração profissional"
        title="Cupons de desconto"
        description="Crie códigos para campanhas e parcerias. O desconto vale para as assinaturas escolhidas."
      />
      <CouponsAdmin modulo="profissional" />
    </main>
  );
}
