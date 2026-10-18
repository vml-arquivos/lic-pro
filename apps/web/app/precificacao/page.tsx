import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Precificação | Licite Comigo' };

export default function PrecificacaoPage() {
  requireDemoMode();
  return <ModulePage module="precificacao" />;
}
