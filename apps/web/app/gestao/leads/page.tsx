import { requireArea } from '../../../lib/session';
import { LeadsTable } from '../../leads/LeadsTable';

export const metadata = {
  title: 'Leads de alunos | Licite Comigo',
  description: 'Interessados no curso, captados pelo site.',
};

export default async function LeadsPage() {
  await requireArea('curso');
  return <LeadsTable modulo="curso" />;
}
