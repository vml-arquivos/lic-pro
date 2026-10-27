'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { errorText, send } from '../../../../../../lib/api';
import {
  Alert,
  Badge,
  PageHeader,
  Panel,
  Resource,
  useResource,
} from '../../../../../components/ui';

type Neighbor = { id: string; titulo: string } | null;
type Lesson = {
  id: string;
  titulo: string;
  tipo: string;
  conteudo: string | null;
  video_url: string | null;
  status: string;
  modulo: string;
  trilha: string;
  trilha_slug: string;
  anterior: Neighbor;
  proxima: Neighbor;
  quiz: { id: string; titulo: string } | null;
  modulo_id: string;
  progresso: { concluida: boolean; percentual: number };
};

export function LessonView({
  aulaId,
  slug,
  canTrack,
}: Readonly<{ aulaId: string; slug: string; canTrack: boolean }>) {
  const [lesson, reload] = useResource<Lesson>(`/academy/lessons/${aulaId}`);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Abrir a aula já marca "em andamento", para o início do aluno saber onde ele parou.
  useEffect(() => {
    if (
      lesson.state !== 'ready' ||
      !canTrack ||
      lesson.data.progresso.concluida ||
      lesson.data.progresso.percentual > 0
    )
      return;
    void send('PUT', `/academy/progress/${aulaId}`, { concluida: false, percentual: 10 }).catch(
      () => undefined,
    );
  }, [lesson, aulaId, canTrack]);

  async function setDone(done: boolean) {
    try {
      await send('PUT', `/academy/progress/${aulaId}`, {
        concluida: done,
        percentual: done ? 100 : 10,
      });
      setMessage({
        kind: 'success',
        text: done ? 'Aula marcada como concluída.' : 'Aula reaberta.',
      });
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <div className="ui-page">
      <Link className="back-link" href={`/academia/trilhas/${slug}`}>
        ← Voltar para a trilha
      </Link>
      <Resource value={lesson}>
        {(data) => (
          <>
            <PageHeader eyebrow={`${data.trilha} · ${data.modulo}`} title={data.titulo} />
            {data.status !== 'publicado' ? (
              <Alert kind="info">Conteúdo ainda em revisão pela equipe.</Alert>
            ) : null}
            {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
            {data.video_url ? (
              <Panel title="Vídeo da aula">
                <a className="ui-btn" href={data.video_url} target="_blank" rel="noreferrer">
                  Assistir ao vídeo
                </a>
              </Panel>
            ) : null}
            <article className="cs-lesson">
              {data.conteudo?.trim() || 'Esta aula ainda não tem texto publicado.'}
            </article>
            <Panel
              title="Concluir"
              actions={data.progresso.concluida ? <Badge tone="ok">Concluída</Badge> : null}
            >
              {canTrack ? (
                <div className="ui-table-actions">
                  <button
                    className="ui-btn"
                    onClick={() => void setDone(!data.progresso.concluida)}
                  >
                    {data.progresso.concluida ? 'Reabrir aula' : 'Marcar como concluída'}
                  </button>
                  {data.quiz ? (
                    <Link
                      className="ui-btn ui-btn-ghost"
                      href={`/academia/trilhas/${slug}/quiz/${data.modulo_id}`}
                    >
                      Fazer o questionário do módulo
                    </Link>
                  ) : null}
                </div>
              ) : (
                <p className="cs-hint">O progresso é salvo só para contas de aluno.</p>
              )}
            </Panel>
            <div className="cs-nav">
              {data.anterior ? (
                <Link
                  className="ui-btn ui-btn-ghost"
                  href={`/academia/trilhas/${slug}/aulas/${data.anterior.id}`}
                >
                  ← {data.anterior.titulo}
                </Link>
              ) : (
                <span />
              )}
              {data.proxima ? (
                <Link
                  className="ui-btn"
                  href={`/academia/trilhas/${slug}/aulas/${data.proxima.id}`}
                >
                  {data.proxima.titulo} →
                </Link>
              ) : null}
            </div>
          </>
        )}
      </Resource>
    </div>
  );
}
