import { requireArea } from '../../lib/session';
import { LicitacoesNav } from '../components/LicitacoesNav';
import { PageHeader } from '../components/ui';
import { PortaisApp } from './PortaisApp';
import './portais.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Portais de compras | Licite Comigo',
  description: 'Veja de qual portal vem cada licitação (BLL, BNC, Compras.gov.br e outros).',
};

export default async function PortaisPage() {
  const session = await requireArea('empresa', 'aluno', 'administracao', 'colaborador');
  return (
    <div className="ui-page">
      <LicitacoesNav atual="/portais" area={session.area} />
      <PageHeader
        eyebrow="Portais de compras"
        title="De onde vêm as licitações"
        description="O PNCP reúne as contratações do país, mas a disputa acontece no portal de cada órgão. Veja quais portais aparecem, quantos editais cada um tem e abra a lista só daquele portal."
      />
      <PortaisApp />
    </div>
  );
}
