import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Minha jornada | Licite Comigo' };

export default function JornadaPage() {
  requireDemoMode();
  return <ModulePage module="jornada" />;
}
