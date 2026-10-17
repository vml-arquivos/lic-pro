import Link from 'next/link';
import { GlossaryTooltip } from '@licitecomigo/ui';

const tracks = [
  {
    slug: 'fundamentos',
    title: 'Fundamentos das licitações',
    description: 'Uma entrada guiada para entender oportunidade, edital, itens e fontes.',
    progress: '0 de 4 aulas',
  },
  {
    slug: 'leitura-de-edital',
    title: 'Leitura de edital',
    description: 'Checklist de leitura, anexos, critérios e pontos que pedem confirmação.',
    progress: '0 de 4 aulas',
  },
];

export default function AcademyPage() {
  const demoMode = process.env.DEMO_MODE === 'true';
  return (
    <main className="academy-page">
      <Link className="back-link" href="/">
        ← Licite Comigo
      </Link>
      <div className="page-heading">
        <p className="eyebrow">Academia</p>
        <h1>Aprenda no seu ritmo e pratique com responsabilidade.</h1>
        <p>
          O modo guiado explica o porquê de cada etapa. No modo profissional, a mesma base aparece
          de forma mais direta, com atalhos para quem já conhece o processo.
        </p>
      </div>

      <section className="journey-callout">
        {demoMode ? (
          <strong className="demo-warning">
            Modo demo ativo: não use estes dados como conteúdo de produção.
          </strong>
        ) : null}
        <strong>Próximo passo sugerido: fundamentos.</strong>
        <span>
          Glossário rápido:{' '}
          <GlossaryTooltip
            term="edital"
            simpleDefinition="Documento que reúne regras, prazos e requisitos da oportunidade."
          />
        </span>
        <small>Conteúdo em revisão, confirme na norma vigente.</small>
      </section>

      <section className="track-grid" aria-label="Trilhas disponíveis">
        {tracks.map((track) => (
          <article className="track-card" key={track.slug}>
            <p className="eyebrow">Trilha em revisão</p>
            <h2>{track.title}</h2>
            <p>{track.description}</p>
            <div className="progress-line">
              <span style={{ width: '8%' }} />
            </div>
            <div className="track-footer">
              <span>{track.progress}</span>
              <Link className="button-secondary" href={`/academia/trilhas/${track.slug}`}>
                Abrir trilha
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="academy-links">
        <Link href="/academia/mentor">Painel do mentor</Link>
        <Link href="/onboarding">Revisar meu onboarding</Link>
      </section>
    </main>
  );
}
