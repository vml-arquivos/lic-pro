import { requireDemoMode } from '../workspace/demo';
export const dynamic = 'force-dynamic';
import { ModulePage } from '../workspace/ModulePage';

export const metadata = { title: 'Mentoria | Licite Comigo' };

export default function MentoriaPage() {
  requireDemoMode();
  return <ModulePage module="mentoria" />;
}
