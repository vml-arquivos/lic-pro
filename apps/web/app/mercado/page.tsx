import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Mercado e concorrentes | Licite Comigo' };

export default function MercadoPage() {
  requireDemoMode();
  return <ModulePage module="mercado" />;
}
