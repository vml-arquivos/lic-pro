import { ContentPage } from '../../components/ContentPage';

export const metadata = {
  title: 'Recursos',
  description:
    'Radar, fontes, empresas, Academia e Ana para apoiar decisões em licitações públicas.',
};
export default function ResourcesPage() {
  return (
    <ContentPage
      eyebrow="Recursos"
      title="Apoio prático, com limites explícitos."
      intro="Os recursos abaixo existem para apoiar análise e organização — não para substituir responsabilidade profissional ou jurídica."
    >
      <div className="feature-list">
        <section>
          <h2>Radar de licitações</h2>
          <p>Busca por oportunidades ingeridas de fontes oficiais, com link de origem e filtros.</p>
        </section>
        <section>
          <h2>Análise de edital com fontes</h2>
          <p>Reader/RAG apresenta trechos, páginas, riscos e checklist para conferência humana.</p>
        </section>
        <section>
          <h2>Ana</h2>
          <p>Assistente somente leitura para explicar conceitos e consultar contexto autorizado.</p>
        </section>
        <section>
          <h2>Agenda e prazos</h2>
          <p>Salve oportunidades, organize checklists e acompanhe prazos da sua operação.</p>
        </section>
      </div>
    </ContentPage>
  );
}
