import Link from 'next/link';
import { Suspense } from 'react';
import { RadarResults } from './RadarResults';

export const metadata = {
  title: 'Radar | Licite Comigo',
  description: 'Busque oportunidades públicas com filtros de apoio à decisão.',
};

export default function RadarPage() {
  return (
    <main className="radar-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Radar</p>
          <strong>Oportunidades com fonte</strong>
        </div>
        <nav aria-label="Navegação principal">
          <Link href="/">Dashboard</Link>
          <Link href="/empresas">Empresas</Link>
          <Link href="/academia">Academia</Link>
          <Link href="/ana">Ana</Link>
        </nav>
      </header>
      <div className="page-heading">
        <p className="eyebrow">Radar de editais</p>
        <h1>Encontre oportunidades para analisar com calma.</h1>
        <p>
          Use palavras-chave e filtros para organizar sua pesquisa. Os dados vêm de fontes públicas;
          confira sempre o edital e a fonte original antes de tomar uma decisão.
        </p>
      </div>
      <form className="filter-card" action="/radar" method="get">
        <label>
          Palavra-chave
          <input name="q" placeholder="ex.: material de escritório" />
        </label>
        <label>
          UF
          <input name="uf" maxLength={2} placeholder="DF" />
        </label>
        <label>
          Modalidade
          <input name="modalidade" placeholder="Pregão - Eletrônico" />
        </label>
        <label>
          CATMAT/CATSER
          <input name="catmat_catser" placeholder="código ou descrição" />
        </label>
        <button type="submit">Buscar editais</button>
      </form>
      <Suspense
        fallback={
          <section className="radar-empty">
            <p>Carregando resultados…</p>
          </section>
        }
      >
        <RadarResults />
      </Suspense>
    </main>
  );
}
