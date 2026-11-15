'use client';

import { useState } from 'react';
import { errorText, send } from '../../lib/api';
import { Alert, Empty, Panel, Resource, formatDate, useResource } from '../components/ui';

type Trilha = {
  slug: string;
  titulo: string;
  aulas_total: number;
  aulas_concluidas: number;
  codigo: string | null;
  emitido_em: string | null;
};
type Data = { aluno: string; trilhas: Trilha[]; aviso: string };

export function CertificadoApp({ canIssue }: Readonly<{ canIssue: boolean }>) {
  const [data, reload] = useResource<Data>('/aluno/certificados');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function issue(slug: string) {
    try {
      await send('POST', '/aluno/certificados', { trilha: slug });
      setMessage({ kind: 'success', text: 'Certificado emitido.' });
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <Resource value={data}>
      {({ aluno, trilhas, aviso }) => (
        <>
          {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
          <Alert kind="info">{aviso}</Alert>
          {trilhas.length === 0 ? (
            <Panel title="Trilhas">
              <Empty>Nenhuma trilha disponível ainda.</Empty>
            </Panel>
          ) : null}
          {trilhas.map((track) =>
            track.codigo ? (
              <section className="cs-cert" key={track.slug}>
                <p className="eyebrow">Licite Comigo · Certificado interno</p>
                <h2>{aluno}</h2>
                <p>concluiu todas as {track.aulas_total} aulas da trilha</p>
                <h2>{track.titulo}</h2>
                <p>Emitido em {formatDate(track.emitido_em)}</p>
                <p className="cs-code">Código {track.codigo}</p>
                <p className="cs-hint">{aviso}</p>
                <button className="ui-btn cs-noprint" onClick={() => window.print()}>
                  Imprimir ou salvar em PDF
                </button>
              </section>
            ) : (
              <Panel key={track.slug} title={track.titulo}>
                <div className="ui-progress">
                  <span
                    style={{
                      width: `${track.aulas_total ? Math.round((track.aulas_concluidas / track.aulas_total) * 100) : 0}%`,
                    }}
                  />
                </div>
                <p className="cs-hint">
                  {track.aulas_concluidas} de {track.aulas_total} aulas concluídas.
                </p>
                {canIssue ? (
                  <button
                    className="ui-btn"
                    disabled={track.aulas_total === 0 || track.aulas_concluidas < track.aulas_total}
                    onClick={() => void issue(track.slug)}
                  >
                    Emitir certificado
                  </button>
                ) : null}
              </Panel>
            ),
          )}
        </>
      )}
    </Resource>
  );
}
