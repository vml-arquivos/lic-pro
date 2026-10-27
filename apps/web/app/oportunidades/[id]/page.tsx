import { OportunidadeDetalhe } from './OportunidadeDetalhe';

export const metadata = {
  title: 'Oportunidade | Licite Comigo',
  description: 'Decisão, checklist, prazos e histórico de uma oportunidade.',
};

export default function OportunidadePage({ params }: Readonly<{ params: { id: string } }>) {
  return <OportunidadeDetalhe id={params.id} />;
}
