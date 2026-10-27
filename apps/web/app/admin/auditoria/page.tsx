import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { AuditAdmin } from './AuditAdmin';

export const metadata = {
  title: 'Auditoria | Licite Comigo',
  description: 'Registro das ações administrativas.',
};

export default async function AuditPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração"
        title="Auditoria"
        description="Quem fez o quê na administração, incluindo as visualizações “ver como”."
      />
      <AuditAdmin />
    </main>
  );
}
