'use client';

import Link from 'next/link';
import {
  Badge,
  Empty,
  Kpi,
  PageHeader,
  Panel,
  Resource,
  formatDate,
  formatNumber,
  useResource,
} from '../components/ui';

export type Aluno = {
  id: string;
  nome: string;
  email: string;
  onboarding_concluido: boolean;
  aulas_concluidas: number;
  aulas_total: number;
  ultimo_progresso: string | null;
  plano_feitos: number;
  plano_total: number;
  plano_a_revisar: number;
  praticas_a_devolver: number;
  proxima_sessao: string | null;
};

const DAY = 24 * 60 * 60 * 1000;
export const parado = (aluno: Aluno) =>
  !aluno.ultimo_progresso || Date.now() - new Date(aluno.ultimo_progresso).getTime() > 7 * DAY;

export function MentorDashboard({ nome, hub }: Readonly<{ nome: string; hub?: React.ReactNode }>) {
  const [list] = useResource<{ data: Aluno[] }>('/mentor/alunos');
  const first = nome.split(/\s+/)[0] ?? nome;
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Mentor"
        title={`Olá, ${first}`}
        description="O que precisa da sua atenção hoje."
        actions={
          <Link className="ui-btn" href="/mentor/devolutivas">
            Devolutivas pendentes
          </Link>
        }
      />
      {hub}
      <Resource value={list}>
        {({ data }) => {
          const devolver = data.reduce((sum, a) => sum + a.praticas_a_devolver, 0);
          const revisar = data.reduce((sum, a) => sum + a.plano_a_revisar, 0);
          const atencao = data.filter(
            (a) => a.praticas_a_devolver || a.plano_a_revisar || parado(a),
          );
          return (
            <>
              <div className="ui-kpis">
                <Kpi label="Alunos acompanhados" value={formatNumber(data.length)} />
                <Kpi
                  label="Práticas para devolver"
                  value={formatNumber(devolver)}
                  tone={devolver ? 'warn' : 'ok'}
                />
                <Kpi
                  label="Dias do plano para revisar"
                  value={formatNumber(revisar)}
                  tone={revisar ? 'warn' : 'ok'}
                />
                <Kpi
                  label="Sem estudar há 7 dias"
                  value={formatNumber(data.filter(parado).length)}
                />
              </div>
              <Panel title="Precisam de atenção">
                {atencao.length === 0 ? (
                  <Empty>Tudo em dia. Nenhum aluno com pendência.</Empty>
                ) : (
                  <ul className="ui-list">
                    {atencao.map((a) => (
                      <li key={a.id}>
                        <div>
                          <strong>
                            <Link href={`/mentor/alunos/${a.id}`}>{a.nome}</Link>
                          </strong>
                          <small>Último estudo: {formatDate(a.ultimo_progresso)}</small>
                        </div>
                        <div className="ui-table-actions">
                          {a.praticas_a_devolver ? (
                            <Badge tone="warn">{`${a.praticas_a_devolver} prática(s)`}</Badge>
                          ) : null}
                          {a.plano_a_revisar ? (
                            <Badge tone="warn">{`${a.plano_a_revisar} dia(s) a revisar`}</Badge>
                          ) : null}
                          {parado(a) ? <Badge tone="bad">Parado</Badge> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          );
        }}
      </Resource>
    </main>
  );
}
