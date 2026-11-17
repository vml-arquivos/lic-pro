import { requireArea } from '../../lib/session';
import { LicitacoesNav } from '../components/LicitacoesNav';
import { PageHeader } from '../components/ui';
import { PortaisApp } from './PortaisApp';
import './portais.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Portais de compras | Licite Comigo',
  description: 'Editais por portal de compras.',
};

export default async function PortaisPage() {
  const session = await requireArea('empresa', 'aluno', 'administracao', 'colaborador');
  return (
    <div className="ui-page">
      <LicitacoesNav atual="/portais" area={session.area} />
      <PageHeader
        eyebrow="Portais de compras"
        title="Portais de compras"
        description="Quantos editais cada portal tem."
      />
      <PortaisApp />
    </div>
  );
}
