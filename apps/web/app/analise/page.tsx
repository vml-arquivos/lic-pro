import { Suspense } from 'react';
import { requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { AnaliseApp } from './AnaliseApp';
import { DadosAtualizados } from '../components/DadosAtualizados';
import { LicitacoesNav } from '../components/LicitacoesNav';
import './analise.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Análise de oportunidades | Licite Comigo',
  description:
    'Compare editais, veja quais valem mais a pena e simule o preço da sua proposta antes de disputar.',
};

export default async function AnalisePage() {
  const session = await requireArea('empresa', 'administracao', 'colaborador', 'aluno', 'mentor');
  return (
    <main className="ui-page an-page">
      <LicitacoesNav atual="/analise" area={session.area} />
      <DadosAtualizados />
      <PageHeader
        eyebrow="Ferramentas"
        title="Análise de oportunidades"
        description="Veja quais editais valem mais a pena, compare lado a lado e simule o preço da proposta antes de disputar."
      />
      <Suspense fallback={<p className="ui-loading">Carregando…</p>}>
        <AnaliseApp />
      </Suspense>
    </main>
  );
}
