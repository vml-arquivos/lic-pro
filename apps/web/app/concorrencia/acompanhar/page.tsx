import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { AcompanharApp } from './AcompanharApp';
import '../concorrencia.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Fornecedores acompanhados | Licite Comigo',
  description: 'Contratos novos dos fornecedores que você acompanha.',
};

export default async function AcompanharPage() {
  await requireArea('empresa', 'administracao', 'colaborador');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Concorrência e disputa"
        title="Fornecedores acompanhados"
        meta="Fonte: PNCP"
      />
      <AcompanharApp />
    </div>
  );
}
