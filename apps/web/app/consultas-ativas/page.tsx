import Link from 'next/link';
import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { ConsultasAtivasApp } from './ConsultasAtivasApp';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Consultas ativas | Licite Comigo',
  description: 'Suas buscas ligadas e quantas licitações abertas cada uma encontra agora.',
};

export default async function ConsultasAtivasPage() {
  await requireArea('empresa', 'administracao', 'colaborador');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Acompanhamento"
        title="Consultas ativas"
        actions={
          <Link className="ui-btn ui-btn-ghost" href="/buscas-salvas">
            Gerenciar buscas
          </Link>
        }
      />
      <ConsultasAtivasApp />
    </div>
  );
}
