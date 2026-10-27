'use client';

import Link from 'next/link';
import { Badge, Empty, PageHeader, Panel, Resource, useResource } from '../../../components/ui';

type Lesson = { id: string; ordem: number; titulo: string; tipo: string; status: string };
type TrackModule = {
  id: string;
  ordem: number;
  titulo: string;
  resumo: string;
  status: string;
  aulas: Lesson[];
};
type Track = {
  slug: string;
  titulo: string;
  descricao: string;
  status: string;
  modulos: TrackModule[];
};
type Progress = {
  aulas: Array<{ aula_id: string; concluida: boolean; percentual: number }>;
  quizzes: Array<{ modulo_id: string; melhor_nota: number | null; tentativas: number }>;
};

export default function TrackPage({ params }: { params: { slug: string } }) {
  const [track] = useResource<Track>(`/academy/tracks/${encodeURIComponent(params.slug)}`);
  const [progress] = useResource<Progress>('/aluno/progresso');
  const lessonState = (id: string) =>
    progress.state === 'ready'
      ? progress.data.aulas.find((item) => item.aula_id === id)
      : undefined;
  const quizState = (moduleId: string) =>
    progress.state === 'ready'
      ? progress.data.quizzes.find((item) => item.modulo_id === moduleId)
      : undefined;

  return (
    <div className="ui-page">
      <Link className="back-link" href="/academia">
        ← Voltar para a Academia
      </Link>
      <Resource value={track}>
        {(data) => (
          <>
            <PageHeader eyebrow="Trilha" title={data.titulo} description={data.descricao} />
            {data.modulos.map((module) => {
              const lessons = module.aulas.filter((lesson) => lesson.id);
              const quiz = quizState(module.id);
              return (
                <Panel
                  key={module.id}
                  title={`Módulo ${module.ordem} · ${module.titulo}`}
                  description={module.resumo}
                  actions={
                    module.status !== 'publicado' ? <Badge tone="warn">Em revisão</Badge> : null
                  }
                >
                  {lessons.length === 0 ? (
                    <Empty>Sem aulas neste módulo ainda.</Empty>
                  ) : (
                    <ul className="ui-list">
                      {lessons.map((lesson) => {
                        const state = lessonState(lesson.id);
                        return (
                          <li key={lesson.id}>
                            <Link href={`/academia/trilhas/${data.slug}/aulas/${lesson.id}`}>
                              {lesson.ordem}. {lesson.titulo}
                            </Link>
                            {state?.concluida ? (
                              <Badge tone="ok">Concluída</Badge>
                            ) : state && state.percentual > 0 ? (
                              <Badge tone="warn">Em andamento</Badge>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <Link
                    className="ui-btn ui-btn-ghost ui-btn-small"
                    href={`/academia/trilhas/${data.slug}/quiz/${module.id}`}
                  >
                    Questionário do módulo
                    {quiz?.melhor_nota !== null && quiz?.melhor_nota !== undefined
                      ? ` · melhor nota ${Math.round(quiz.melhor_nota)}%`
                      : ''}
                  </Link>
                </Panel>
              );
            })}
          </>
        )}
      </Resource>
    </div>
  );
}
