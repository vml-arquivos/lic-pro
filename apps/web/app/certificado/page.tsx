import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { CertificadoApp } from './CertificadoApp';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certificado | Licite Comigo' };

export default async function CertificadoPage() {
  const session = await requireArea('administracao', 'aluno');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Meu curso"
        title="Certificado de conclusão"
        description="Emitido quando você conclui todas as aulas de uma trilha."
      />
      <CertificadoApp canIssue={session.area === 'aluno'} />
    </div>
  );
}
