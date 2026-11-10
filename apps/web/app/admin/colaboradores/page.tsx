import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { ColaboradoresAdmin } from './ColaboradoresAdmin';

export const metadata = {
  title: 'Colaboradores | Licite Comigo',
  description: 'Equipe da operação: convite, nichos liberados e situação.',
};

export default async function ColaboradoresPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração"
        title="Colaboradores"
        description="Equipe que busca e acompanha licitações pela operação do Licite Comigo. Cada colaborador só enxerga os nichos que você liberar."
      />
      <ColaboradoresAdmin />
    </main>
  );
}
