import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Plano de 30 dias | Licite Comigo' };

export default function Plano30Page() {
  requireDemoMode();
  return <ModulePage module="plano30" />;
}
