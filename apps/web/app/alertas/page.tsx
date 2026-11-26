import { getSession } from '../../lib/session';
import Link from 'next/link';
import { PageHeader } from '../components/ui';
import { AlertasApp } from './AlertasApp';
import { AvisosPorNicho } from './AvisosPorNicho';

export const metadata = {
  title: 'Alertas | Licite Comigo',
  description: 'Alertas salvas e preferências de recebimento.',
};

export default async function AlertasPage() {
  const session = await getSession();
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Farol"
        title="Alertas"
        actions={
          <Link className="ui-btn ui-btn-ghost" href="/buscas-salvas">
            Ajustar por busca
          </Link>
        }
      />
      <AvisosPorNicho
        nichos={session?.nicho_preferencias ?? []}
        travados={session?.area === 'colaborador'}
      />
      <AlertasApp />
    </div>
  );
}
