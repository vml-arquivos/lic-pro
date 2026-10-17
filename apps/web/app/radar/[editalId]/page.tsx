import Link from 'next/link';

type DetailPageProps = {
  params: { editalId: string };
};

export const metadata = {
  title: 'Detalhe do edital | Licite Comigo',
};

export default function EditalDetailPage({ params }: DetailPageProps) {
  return (
    <main className="radar-page">
      <Link className="back-link" href="/radar">
        ← Voltar ao Radar
      </Link>
      <p className="eyebrow">Edital {params.editalId}</p>
      <h1>Detalhe do edital</h1>
      <p className="lead">Os dados serão carregados do core API respeitando o tenant da sessão.</p>

      <nav className="tabs" aria-label="Abas do edital">
        <a className="tab active" href="#itens">
          Itens
        </a>
        <a className="tab" href="#analise">
          Análise IA
        </a>
        <a className="tab" href="#raio-x">
          Raio-X
        </a>
        <a className="tab" href="#proposta">
          Proposta
        </a>
      </nav>

      <section id="itens" className="detail-card">
        <h2>Itens</h2>
        <p>
          Quando o edital estiver persistido, os itens e seus códigos CATMAT/CATSER aparecerão aqui.
        </p>
      </section>
      <section id="analise" className="detail-card placeholder">
        <h2>Análise IA</h2>
        <p>Placeholder da Fase 2. A análise Reader entra somente na Fase 3.</p>
      </section>
      <section id="raio-x" className="detail-card placeholder">
        <h2>Raio-X</h2>
        <p>Placeholder reservado para uma fase posterior.</p>
      </section>
      <section id="proposta" className="detail-card placeholder">
        <h2>Proposta</h2>
        <p>Placeholder reservado para uma fase posterior.</p>
      </section>
    </main>
  );
}
