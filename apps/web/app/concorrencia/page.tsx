import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { ConcorrenciaApp } from './ConcorrenciaApp';
import './concorrencia.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Consulta de concorrência | Licite Comigo',
  description: 'Contratos de fornecedores com o governo, direto do PNCP.',
};

export default async function ConcorrenciaPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ cnpj?: string; q?: string }> | { cnpj?: string; q?: string };
}>) {
  await requireArea('empresa', 'administracao', 'colaborador');
  const params = await searchParams;
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Concorrência e disputa"
        title="Consulta de concorrência"
        meta="Fonte: PNCP"
      />
      <ConcorrenciaApp cnpjInicial={params.cnpj ?? ''} assuntoInicial={params.q ?? ''} />
    </div>
  );
}
