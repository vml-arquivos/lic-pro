import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Pregões ao vivo | Licite Comigo' };

export default function PregoesPage() {
  requireDemoMode();
  return <ModulePage module="pregoes" />;
}
