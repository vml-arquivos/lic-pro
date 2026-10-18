import Link from 'next/link';
import { requireDemoMode } from '../../../../../workspace/demo';

export const dynamic = 'force-dynamic';

const checklist = [
  'Entendi qual é a fonte original da informação.',
  'Separei o que está confirmado do que ainda preciso conferir.',
  'Registrei uma dúvida para revisar com o mentor ou com a Ana.',
];

type LessonPageProps = {
  params: { slug: string; aulaId: string };
};

export default function LessonPage({ params }: LessonPageProps) {
  requireDemoMode();
  return (
    <main className="academy-page lesson-page">
      <Link className="back-link" href={`/academia/trilhas/${params.slug}`}>
        ← Voltar para trilha
      </Link>
      <p className="eyebrow">Aula {params.aulaId}</p>
      <h1>Como encontrar uma oportunidade</h1>
      <p className="lead">Player de texto/vídeo com progresso salvo por usuário e tenant.</p>

      <section className="lesson-player">
        <div
          className="video-placeholder"
          role="img"
          aria-label="Área reservada para vídeo da aula"
        >
          <span>Vídeo da aula</span>
          <strong>▶</strong>
        </div>
        <div className="lesson-copy">
          <h2>O ponto central</h2>
          <p>
            Comece pela fonte original e confirme o prazo, a modalidade e o objeto. O Radar ajuda a
            encontrar, mas a leitura responsável acontece no edital e nos anexos oficiais.
          </p>
        </div>
      </section>

      <section className="checklist-card">
        <h2>Checklist da aula</h2>
        {checklist.map((item) => (
          <label key={item}>
            <input type="checkbox" /> {item}
          </label>
        ))}
        <button type="button">Marcar aula como concluída</button>
      </section>

      <section className="quiz-card">
        <p className="eyebrow">Quiz do módulo</p>
        <h2>Qual é o próximo passo responsável?</h2>
        <label>
          <input type="radio" name="quiz" /> Ler a fonte original e conferir os requisitos
        </label>
        <label>
          <input type="radio" name="quiz" /> Ignorar os anexos
        </label>
        <label>
          <input type="radio" name="quiz" /> Assumir que todos os dados estão completos
        </label>
        <button type="button">Enviar resposta</button>
      </section>
    </main>
  );
}
