import { PageHeader } from '../components/ui';
import { BuscasApp } from './BuscasApp';

export const metadata = {
  title: 'Buscas salvas | Licite Comigo',
  description: 'Suas buscas salvas e os avisos de cada uma.',
};

export default function BuscasSalvasPage() {
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Buscas salvas"
        title="Suas buscas e os avisos de cada uma"
        description="Abra uma busca no Radar, ou escolha quando e como quer ser avisado quando aparecer algo novo."
      />
      <BuscasApp />
    </div>
  );
}
