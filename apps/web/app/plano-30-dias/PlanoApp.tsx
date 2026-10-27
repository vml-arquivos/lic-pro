'use client';

import Link from 'next/link';
import { useState } from 'react';
import { errorText, send } from '../../lib/api';
import { Alert, Badge, Empty, Panel, Resource, formatDate, useResource } from '../components/ui';

type Dia = {
  dia: number;
  objetivo: string;
  atividade: string;
  tipo: 'aula' | 'quiz' | 'pratica' | 'revisao' | 'livre';
  aula_id: string | null;
  trilha_slug: string | null;
  status: 'pendente' | 'feito' | 'revisado';
  data: string;
  comentario_mentor: string | null;
  ajustado_pelo_mentor: boolean;
};
type Plano = {
  inicio: string;
  trilha: string | null;
  dias: Dia[];
  resumo: { total: number; feitos: number; revisados: number; percentual: number };
};

const TIPO: Record<Dia['tipo'], string> = {
  aula: 'Aula',
  quiz: 'Questionário',
  pratica: 'Prática com edital',
  revisao: 'Revisão',
  livre: 'Dia livre',
};
const STATUS: Record<Dia['status'], [string, string]> = {
  pendente: ['Pendente', 'muted'],
  feito: ['Feito', 'ok'],
  revisado: ['Revisado pelo mentor', 'ok'],
};

export function PlanoApp({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [plan, reload] = useResource<{ plano: Plano | null }>('/aluno/plano');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const todayIso = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

  async function generate(replace: boolean) {
    if (
      replace &&
      !window.confirm('Gerar de novo apaga o andamento atual do plano. Quer continuar?')
    )
      return;
    setBusy(true);
    setMessage(null);
    try {
      await send('POST', '/aluno/plano/gerar', {});
      setMessage({ kind: 'success', text: 'Plano gerado. Comece pelo primeiro dia pendente.' });
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(dia: number, feito: boolean) {
    try {
      await send('PATCH', `/aluno/plano/dias/${dia}`, { feito });
      reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorText(error) });
    }
  }

  return (
    <>
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      <Resource value={plan}>
        {({ plano }) =>
          !plano ? (
            <Panel title="Você ainda não tem um plano">
              <Empty>
                O plano distribui as aulas da trilha em 30 dias, com uma prática com edital real por
                semana.
              </Empty>
              {canEdit ? (
                <button className="ui-btn" disabled={busy} onClick={() => void generate(false)}>
                  {busy ? 'Gerando…' : 'Gerar meu plano de 30 dias'}
                </button>
              ) : null}
            </Panel>
          ) : (
            <>
              <Panel
                title={`${plano.resumo.feitos} de ${plano.resumo.total} dias concluídos`}
                description={`Início em ${formatDate(plano.inicio)}${plano.trilha ? ` · trilha “${plano.trilha}”` : ''} · ${plano.resumo.revisados} revisado(s) pelo mentor`}
                actions={
                  canEdit ? (
                    <button
                      className="ui-btn ui-btn-ghost ui-btn-small"
                      disabled={busy}
                      onClick={() => void generate(true)}
                    >
                      Gerar de novo
                    </button>
                  ) : null
                }
              >
                <div className="ui-progress" aria-label={`${plano.resumo.percentual}% concluído`}>
                  <span style={{ width: `${plano.resumo.percentual}%` }} />
                </div>
              </Panel>
              <ol className="cs-days">
                {plano.dias.map((day) => (
                  <li className="cs-day" key={day.dia} data-today={day.data === todayIso}>
                    <div className="cs-day-num">
                      {day.dia}
                      <small>{formatDate(day.data).slice(0, 5)}</small>
                    </div>
                    <div>
                      <strong>{day.objetivo}</strong>
                      <p>{day.atividade}</p>
                      <div className="ui-table-actions">
                        <Badge tone="muted">{TIPO[day.tipo]}</Badge>
                        <Badge tone={STATUS[day.status][1]}>{STATUS[day.status][0]}</Badge>
                        {day.ajustado_pelo_mentor ? (
                          <Badge tone="warn">Ajustado pelo mentor</Badge>
                        ) : null}
                        {day.aula_id && day.trilha_slug ? (
                          <Link href={`/academia/trilhas/${day.trilha_slug}/aulas/${day.aula_id}`}>
                            Abrir aula
                          </Link>
                        ) : null}
                        {day.tipo === 'pratica' ? (
                          <Link href="/radar">Escolher edital no Radar</Link>
                        ) : null}
                      </div>
                      {day.comentario_mentor ? (
                        <p className="cs-note">Mentor: {day.comentario_mentor}</p>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <label className="ui-check">
                        <input
                          type="checkbox"
                          checked={day.status !== 'pendente'}
                          onChange={(event) => void toggle(day.dia, event.target.checked)}
                        />
                        Feito
                      </label>
                    ) : null}
                  </li>
                ))}
              </ol>
            </>
          )
        }
      </Resource>
    </>
  );
}
