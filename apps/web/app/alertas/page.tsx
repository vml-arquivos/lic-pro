import { getSession } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { AlertasApp } from './AlertasApp';
import { AvisosPorNicho } from './AvisosPorNicho';

export const metadata = {
  title: 'Alertas | Licite Comigo',
  description: 'Avisos das suas buscas salvas e preferências de recebimento.',
};

export default async function AlertasPage() {
  const session = await getSession();
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Alertas"
        title="Avisos das suas buscas"
        description="Escolha os nichos e o que quer receber: aberturas, mudanças no edital, prazos e a sessão ao vivo. Para ajustes finos, abra Buscas salvas."
      />
      <AvisosPorNicho
        nichos={session?.nicho_preferencias ?? []}
        travados={session?.area === 'colaborador'}
      />
      <AlertasApp />
    </div>
  );
}
