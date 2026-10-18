import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Central de automações | Licite Comigo' };

export default function AutomacoesPage() {
  requireDemoMode();
  return <ModulePage module="automacoes" />;
}
