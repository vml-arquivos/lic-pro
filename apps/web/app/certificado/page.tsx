import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { CertificadoApp } from './CertificadoApp';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certificado | Licite Comigo' };

export default async function CertificadoPage() {
  const session = await requireArea('administracao', 'curso', 'aluno');
  return (
    <div className="ui-page">
      <PageHeader eyebrow="Meu curso" title="Certificado" />
      <CertificadoApp canIssue={session.area === 'aluno'} />
    </div>
  );
}
