import Link from 'next/link';
import { getSession } from '../../../lib/session';
import { EditalWorkspace } from './EditalWorkspace';

type DetailPageProps = { params: { editalId: string } };

export const metadata = { title: 'Detalhe do edital | Licite Comigo' };

export default async function EditalDetailPage({ params }: DetailPageProps) {
  const session = await getSession();
  const canPipeline = session?.area === 'empresa' || session?.area === 'administracao';
  const canPractice = session?.area === 'aluno';
  return (
    <div className="ui-page rd-page">
      <Link className="back-link" href="/radar">
        ← Voltar ao Radar
      </Link>
      <header className="ui-header">
        <div>
          <p className="eyebrow">Workspace do edital</p>
          <h1>Leia, confira a fonte e decida com calma</h1>
          <p>
            O Reader só responde com evidências salvas; correções ficam registradas e o produto não
            executa ações em portais.
          </p>
        </div>
      </header>
      <nav className="tabs" aria-label="Seções do edital">
        <a className="tab active" href="#ficha">
          Ficha
        </a>
        <a className="tab" href="#itens">
          Itens
        </a>
        <a className="tab" href="#historico">
          O que mudou
        </a>
        <a className="tab" href="#analise">
          Reader
        </a>
        <a className="tab" href="#versoes">
          Versões
        </a>
      </nav>
      <EditalWorkspace
        editalId={params.editalId}
        canPipeline={canPipeline}
        canPractice={canPractice}
        signedIn={Boolean(session)}
      />
    </div>
  );
}
