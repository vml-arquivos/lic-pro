import { PageHeader } from '../components/ui';
import { AlertasApp } from './AlertasApp';

export const metadata = {
  title: 'Alertas | Licite Comigo',
  description: 'Avisos das suas buscas salvas e preferências de recebimento.',
};

export default function AlertasPage() {
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Alertas"
        title="Avisos das suas buscas"
        description="Aqui aparecem as oportunidades novas, as alterações e os prazos das buscas que você salvou. Para mudar horário e destinatários, abra Buscas salvas."
      />
      <AlertasApp />
    </div>
  );
}
