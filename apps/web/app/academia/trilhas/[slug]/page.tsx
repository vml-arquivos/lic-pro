'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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
type TrackPageProps = { params: { slug: string } };

export default function TrackPage({ params }: TrackPageProps) {
  const [track, setTrack] = useState<Track | null>(null);
  const [message, setMessage] = useState('Carregando trilha…');

  useEffect(() => {
    void fetch(`/api/core/academy/tracks/${encodeURIComponent(params.slug)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (response.status === 404) {
          setMessage('Trilha não encontrada.');
          return;
        }
        if (!response.ok) throw new Error('track_unavailable');
        setTrack((await response.json()) as Track);
        setMessage('');
      })
      .catch(() => setMessage('Não foi possível carregar esta trilha agora.'));
  }, [params.slug]);

  return (
    <main className="academy-page">
      <Link className="back-link" href="/academia">
        ← Voltar para Academia
      </Link>
      {message ? <p className="notice">{message}</p> : null}
      {track ? (
        <>
          <p className="eyebrow">{track.status}</p>
          <h1>{track.titulo}</h1>
          <p className="lead">{track.descricao}</p>
          <section className="module-list" aria-label="Módulos da trilha">
            {track.modulos.map((module) => {
              const lessons = module.aulas.filter((lesson) => lesson.id);
              return (
                <article className="module-card" key={module.id}>
                  <div>
                    <p className="eyebrow">Módulo {module.ordem}</p>
                    <h2>{module.titulo}</h2>
                    <p>{module.resumo}</p>
                    <small>
                      {lessons.length} aula(s) · {module.status}
                    </small>
                  </div>
                  <div className="module-actions">
                    {lessons.map((lesson) => (
                      <span className="tag" key={lesson.id}>
                        {lesson.titulo}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
        </>
      ) : null}
    </main>
  );
}
