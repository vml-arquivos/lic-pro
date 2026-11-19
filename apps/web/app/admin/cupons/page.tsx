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
      <PageHeader eyebrow="Painel admin" title="Cupons de desconto" />
      <CouponsAdmin modulo="profissional" />
    </main>
  );
}
