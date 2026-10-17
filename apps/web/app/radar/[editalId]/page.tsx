import Link from 'next/link';
import { AnaWidget } from '../../ana/AnaWidget';

type DetailPageProps = {
  params: { editalId: string };
};

export const metadata = {
  title: 'Detalhe do edital | Licite Comigo',
};

const checklist = [
  'Objeto e itens estão compatíveis com o que procuro?',
  'Prazos, anexos e critérios foram confirmados na fonte original?',
  'Há requisito que preciso levar para revisão de um especialista?',
];

export default function EditalDetailPage({ params }: DetailPageProps) {
  return (
    <main className="radar-page">
      <Link className="back-link" href="/radar">
        ← Voltar ao Radar
      </Link>
      <p className="eyebrow">Edital {params.editalId}</p>
      <h1>Detalhe do edital</h1>
      <p className="lead">Leitura por abas, com evidências e limites claros para a análise.</p>

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
        <p>Os itens e códigos CATMAT/CATSER serão carregados do core API com escopo de tenant.</p>
      </section>
      <section id="analise" className="detail-card analysis-card">
        <div className="analysis-heading">
          <div>
            <p className="eyebrow">Reader v1 · prompt reader-v1-evidence-first</p>
            <h2>Análise IA</h2>
          </div>
          <span className="status-pill">Concluída</span>
        </div>
        <p>
          A leitura organiza resumo, riscos, pontos de atenção e perguntas. Cada afirmação deve
          apontar para um trecho do documento; ausência de evidência aparece como dúvida, não como
          fato.
        </p>
        <div className="analysis-columns">
          <div>
            <h3>Checklist inicial</h3>
            {checklist.map((item) => (
              <label key={item}>
                <input type="checkbox" /> {item}
              </label>
            ))}
          </div>
          <div>
            <h3>Evidências</h3>
            <blockquote>
              “Confirme prazos, requisitos e anexos na fonte oficial.”
              <cite>p. 1 · seção Objeto</cite>
            </blockquote>
          </div>
        </div>
        <p className="analysis-warning">
          Apoio de leitura, não é conclusão jurídica nem promessa de resultado.
        </p>
      </section>
      <section id="raio-x" className="detail-card placeholder">
        <h2>Raio-X</h2>
        <p>Placeholder reservado para uma fase posterior.</p>
      </section>
      <section id="proposta" className="detail-card placeholder">
        <h2>Proposta</h2>
        <p>Placeholder reservado para uma fase posterior.</p>
      </section>
      <AnaWidget />
    </main>
  );
}
