import Link from 'next/link';

const mentees = [
  { name: 'Mentorado de exemplo', profile: 'iniciante', progress: '2 de 8 aulas', next: 'Aula 3' },
  {
    name: 'Outro mentorado',
    profile: 'mentorado',
    progress: '5 de 8 aulas',
    next: 'Quiz do módulo 2',
  },
];

export default function MentorDashboardPage() {
  return (
    <main className="academy-page">
      <Link className="back-link" href="/academia">
        ← Voltar para Academia
      </Link>
      <p className="eyebrow">Painel do mentor</p>
      <h1>Acompanhe o próximo passo, não só a nota.</h1>
      <p className="lead">
        O painel mostra progresso, perfil de jornada e indicação de próxima ação. Dados reais entram
        pelo endpoint protegido do core API.
      </p>

      <section className="mentor-grid" aria-label="Mentorados">
        {mentees.map((mentee) => (
          <article className="mentor-card" key={mentee.name}>
            <div>
              <p className="eyebrow">{mentee.profile}</p>
              <h2>{mentee.name}</h2>
              <p>{mentee.progress}</p>
            </div>
            <strong>Próximo: {mentee.next}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}
