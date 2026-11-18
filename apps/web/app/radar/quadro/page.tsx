import { Suspense } from 'react';
import { requireArea } from '../../../lib/session';
import { LicitacoesNav } from '../../components/LicitacoesNav';
import { PageHeader } from '../../components/ui';
import { Quadro } from './Quadro';
import './quadro.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Quadro de decisão | Licite Comigo',
  description: 'As melhores oportunidades abertas, já analisadas.',
};

export default async function QuadroPage() {
  const session = await requireArea('administracao', 'empresa', 'colaborador', 'aluno');
  return (
    <main className="ui-page qd-page">
      <div className="qd-no-print">
        <LicitacoesNav atual="/radar/quadro" area={session.area} />
      </div>
      <PageHeader
        eyebrow="Radar"
        title="Quadro de decisão"
        description="As melhores oportunidades abertas, já analisadas."
      />
      <Suspense fallback={<p className="ui-loading">Carregando…</p>}>
        <Quadro />
      </Suspense>
    </main>
  );
}
