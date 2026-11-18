import { pageAreas, type Area } from '@licitecomigo/shared';
import { getSession } from '../../../lib/session';
import { VoltarAoRadar } from '../VoltarAoRadar';
import { EditalWorkspace } from './EditalWorkspace';

type DetailPageProps = { params: { editalId: string } };

export const metadata = { title: 'Detalhe do edital | Licite Comigo' };

export default async function EditalDetailPage({ params }: DetailPageProps) {
  const session = await getSession();
  const canPipeline = session?.area === 'empresa' || session?.area === 'administracao';
  const canPractice = session?.area === 'aluno';
  const canAnalyze = Boolean(session && pageAreas('/analise')?.includes(session.area as Area));
  return (
    <div className="ui-page rd-page">
      <VoltarAoRadar usuario={session?.id ?? 'anonimo'} />
      <header className="ui-header">
        <div>
          <p className="eyebrow">Workspace do edital</p>
          <h1>Leia, confira a fonte e decida com calma</h1>
          <p>Tudo do edital em um só lugar.</p>
        </div>
      </header>
      <nav className="tabs" aria-label="Seções do edital">
        <a className="tab active" href="#ficha">
          Ficha
        </a>
        <a className="tab" href="#itens">
          Itens
        </a>
        <a className="tab" href="#documentacao">
          Documentação técnica
        </a>
        <a className="tab" href="#documentos">
          Documentos
        </a>
        <a className="tab" href="#precos">
          Preços pagos
        </a>
        <a className="tab" href="#concorrentes">
          Concorrentes
        </a>
        <a className="tab" href="#historico">
          O que mudou
        </a>
        <a className="tab" href="#analise">
          Perguntas
        </a>
        <a className="tab" href="#versoes">
          Versões
        </a>
      </nav>
      <EditalWorkspace
        editalId={params.editalId}
        canPipeline={canPipeline}
        canPractice={canPractice}
        canAnalyze={canAnalyze}
        signedIn={Boolean(session)}
        usuario={session?.id ?? 'anonimo'}
      />
    </div>
  );
}
