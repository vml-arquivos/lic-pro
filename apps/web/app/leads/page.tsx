import { requireArea } from '../../lib/session';
import { LeadsTable } from './LeadsTable';

export const metadata = {
  title: 'Leads | Licite Comigo',
  description: 'Contatos captados pelo site.',
};

export default async function LeadsPage() {
  await requireArea('administracao');
  return <LeadsTable />;
}
