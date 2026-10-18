import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Meus fornecedores | Licite Comigo' };

export default function FornecedoresPage() {
  requireDemoMode();
  return <ModulePage module="fornecedores" />;
}
