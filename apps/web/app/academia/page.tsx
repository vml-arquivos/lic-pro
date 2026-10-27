'use client';

import Link from 'next/link';
import { Badge, Empty, PageHeader, Panel, Resource, useResource } from '../components/ui';

type Track = {
  id: string;
  slug: string;
  titulo: string;
  descricao: string;
  status: string;
  modulos: number;
  aulas: number;
};
type Progress = { aulas: Array<{ trilha_slug: string; concluida: boolean }> };

export default function AcademyPage() {
  const [tracks] = useResource<Track[]>('/academy/tracks');
  const [progress] = useResource<Progress>('/aluno/progresso');
  const done = (slug: string) =>
    progress.state === 'ready'
      ? progress.data.aulas.filter((lesson) => lesson.trilha_slug === slug && lesson.concluida)
          .length
      : null;
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Academia"
        title="Estude licitações no seu ritmo"
        description="Trilhas com aulas, questionários e progresso salvo. O conteúdo vem direto da plataforma; o que ainda está em revisão aparece marcado."
      />
      <Resource value={tracks}>
        {(list) =>
          list.length === 0 ? (
            <Panel title="Nenhuma trilha publicada">
              <Empty>O conteúdo da Academia ainda não está disponível para esta conta.</Empty>
            </Panel>
          ) : (
            <div className="ui-grid">
              {list.map((track) => {
                const concluidas = done(track.slug);
                return (
                  <Panel key={track.id} title={track.titulo} description={track.descricao}>
                    <div className="ui-table-actions">
                      <Badge tone={track.status === 'publicado' ? 'ok' : 'warn'}>
                        {track.status === 'publicado' ? 'Publicada' : 'Em revisão'}
                      </Badge>
                      <small>
                        {track.modulos} módulo(s) · {track.aulas} aula(s)
                      </small>
                    </div>
                    {concluidas !== null && track.aulas ? (
                      <>
                        <div className="ui-progress">
                          <span
                            style={{ width: `${Math.round((concluidas / track.aulas) * 100)}%` }}
                          />
                        </div>
                        <small>
                          {concluidas} de {track.aulas} aulas concluídas
                        </small>
                      </>
                    ) : null}
                    <Link className="ui-btn" href={`/academia/trilhas/${track.slug}`}>
                      Abrir trilha
                    </Link>
                  </Panel>
                );
              })}
            </div>
          )
        }
      </Resource>
    </div>
  );
}
