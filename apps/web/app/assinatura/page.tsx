import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Assinatura e notas | Licite Comigo' };

export default function AssinaturaPage() {
  requireDemoMode();
  return <ModulePage module="assinatura" />;
}
