import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Agenda e participações | Licite Comigo' };

export default function AgendaPage() {
  requireDemoMode();
  return <ModulePage module="agenda" />;
}
