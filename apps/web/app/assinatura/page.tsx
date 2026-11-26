import Link from 'next/link';
import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { AssinaturaPanel } from './AssinaturaPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Assinatura | Licite Comigo',
  description: 'Plano da sua empresa, pagamento e limites.',
};

export default async function AssinaturaPage() {
  const session = await requireArea('empresa');
  return (
    <main className="ui-page">
      <PageHeader eyebrow="Conta" title="Assinatura" />
      {session.nicho_preferencias?.length ? null : (
        <p className="notice">
          Falta criar seu perfil. <Link href="/radar">Criar perfil no Farol</Link>
        </p>
      )}
      <AssinaturaPanel />
    </main>
  );
}
