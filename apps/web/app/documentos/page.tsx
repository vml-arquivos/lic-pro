import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Documentos | Licite Comigo' };

export default function DocumentosPage() {
  requireDemoMode();
  return <ModulePage module="documentos" />;
}
