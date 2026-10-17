import Link from 'next/link';

const modules = [
  {
    id: 'modulo-1',
    title: '1. Como encontrar uma oportunidade',
    summary: 'Radar, fonte original e primeiros filtros.',
    lesson: 'aula-1',
  },
  {
    id: 'modulo-2',
    title: '2. Como ler o objeto e os itens',
    summary: 'Do objeto ao detalhe de cada item.',
    lesson: 'aula-2',
  },
  {
    id: 'modulo-3',
    title: '3. Requisitos e pontos de atenção',
    summary: 'Checklist de confirmação sem promessas de resultado.',
    lesson: 'aula-3',
  },
];

type TrackPageProps = {
  params: { slug: string };
};

export default function TrackPage({ params }: TrackPageProps) {
  return (
    <main className="academy-page">
      <Link className="back-link" href="/academia">
        ← Voltar para Academia
      </Link>
      <p className="eyebrow">Trilha {params.slug}</p>
      <h1>Fundamentos das licitações</h1>
      <p className="lead">Aulas curtas, checklist e um quiz simples ao final de cada módulo.</p>

      <section className="module-list" aria-label="Módulos da trilha">
        {modules.map((module) => (
          <article className="module-card" key={module.id}>
            <div>
              <p className="eyebrow">Módulo</p>
              <h2>{module.title}</h2>
              <p>{module.summary}</p>
            </div>
            <div className="module-actions">
              <Link
                className="button-secondary"
                href={`/academia/trilhas/${params.slug}/aulas/${module.lesson}`}
              >
                Abrir aula
              </Link>
              <button type="button" className="button-quiet">
                Quiz do módulo
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
