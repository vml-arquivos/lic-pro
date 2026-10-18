'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Track = {
  id: string;
  slug: string;
  titulo: string;
  descricao: string;
  status: string;
  modulos: number;
  aulas: number;
};

export default function AcademyPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [message, setMessage] = useState('Carregando trilhas publicadas…');

  useEffect(() => {
    void fetch('/api/core/academy/tracks', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('academy_unavailable');
        const payload = (await response.json()) as Track[];
        setTracks(payload);
        setMessage('');
      })
      .catch(() => setMessage('Não foi possível carregar as trilhas agora.'));
  }, []);

  return (
    <main className="academy-page">
      <Link className="back-link" href="/">
        ← Início
      </Link>
      <div className="page-heading">
        <p className="eyebrow">Academia</p>
        <h1>Conteúdo publicado para estudar licitações.</h1>
        <p>
          As trilhas abaixo vêm do conteúdo publicado no ambiente. Quando não houver conteúdo, a
          página informa o estado real em vez de exibir exemplos.
        </p>
      </div>
      {message ? <p className="notice">{message}</p> : null}
      {!message && !tracks.length ? (
        <section className="dashboard-empty">
          <h2>Nenhuma trilha publicada</h2>
          <p>O conteúdo da Academia ainda não está disponível para esta conta.</p>
        </section>
      ) : null}
      <section className="track-grid" aria-label="Trilhas publicadas">
        {tracks.map((track) => (
          <article className="track-card" key={track.id}>
            <p className="eyebrow">{track.status}</p>
            <h2>{track.titulo}</h2>
            <p>{track.descricao}</p>
            <div className="track-footer">
              <span>
                {track.modulos} módulo(s) · {track.aulas} aula(s)
              </span>
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
