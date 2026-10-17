import Link from 'next/link';
import { EditalWorkspace } from './EditalWorkspace';

type DetailPageProps = { params: { editalId: string } };

export const metadata = { title: 'Detalhe do edital | Licite Comigo' };

export default function EditalDetailPage({ params }: DetailPageProps) {
  return (
    <main className="radar-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Workspace do edital</p>
          <strong>Fonte → evidência → decisão</strong>
        </div>
        <nav aria-label="Navegação principal">
          <Link href="/radar">Radar</Link>
          <Link href="/">Dashboard</Link>
          <Link href="/ana">Ana</Link>
        </nav>
      </header>
      <Link className="back-link" href="/radar">
        ← Voltar ao Radar
      </Link>
      <div className="page-heading">
        <p className="eyebrow">Edital {params.editalId}</p>
        <h1>Leia, corrija e organize sem perder a fonte.</h1>
        <p>
          O Reader só responde com evidências persistidas; correções humanas ficam auditadas e o
          produto não executa ações em portais.
        </p>
      </div>
      <nav className="tabs" aria-label="Abas do edital">
        <a className="tab active" href="#itens">
          Itens
        </a>
        <a className="tab" href="#analise">
          Reader
        </a>
        <a className="tab" href="#versoes">
          Versões
        </a>
        <a className="tab" href="#raio-x">
          Raio-X
        </a>
        <a className="tab" href="#proposta">
          Proposta
        </a>
      </nav>
      <EditalWorkspace editalId={params.editalId} />
    </main>
  );
}
