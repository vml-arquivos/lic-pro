import { requireArea } from '../../lib/session';
import { LeadsTable } from './LeadsTable';

export const metadata = {
  title: 'Leads de empresas | Licite Comigo',
  description: 'Empresas interessadas, captadas pelo site.',
};

export default async function LeadsPage() {
  await requireArea('administracao');
  return <LeadsTable modulo="profissional" />;
}
