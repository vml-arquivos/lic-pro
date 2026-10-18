import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Analisar edital | Licite Comigo' };

export default function EditalPage() {
  requireDemoMode();
  return <ModulePage module="edital" />;
}
