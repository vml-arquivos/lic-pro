import Link from 'next/link';

export const metadata = {
  title: 'Radar | Licite Comigo',
  description: 'Busque oportunidades públicas com filtros de apoio à decisão.',
};

export default function RadarPage() {
  return (
    <main className="radar-page">
      <Link className="back-link" href="/">
        ← Licite Comigo
      </Link>
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

      <section className="radar-empty" aria-live="polite">
        <strong>Conecte os filtros ao core API para carregar resultados.</strong>
        <p>
          A busca já está preparada no backend com paginação, texto em português e escopo por
          tenant.
        </p>
      </section>

      <section className="radar-example">
        <div>
          <p className="eyebrow">Exemplo de navegação</p>
          <h2>Detalhe do edital</h2>
          <p>Itens, análise IA, raio-x e proposta aparecem como áreas separadas.</p>
        </div>
        <Link className="button-secondary" href="/radar/00000000-0000-0000-0000-000000000001">
          Ver detalhe demonstrativo
        </Link>
      </section>
    </main>
  );
}
