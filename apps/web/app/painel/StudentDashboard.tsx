'use client';

import Link from 'next/link';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import {
  Badge,
  Kpi,
  PageHeader,
  Panel,
  Resource,
  formatDate,
  formatNumber,
  useResource,
} from '../components/ui';

type Home = {
  progresso: { aulas_total: number; aulas_concluidas: number };
  continuar: { aula_id: string; titulo: string; trilha_slug: string; percentual: number } | null;
  plano_criado: boolean;
  proxima_atividade: {
    dia: number;
    objetivo: string;
    atividade: string;
    tipo: string;
    data: string;
  } | null;
  meta_semana: { total: number; feitos: number };
  recado_mentor: { texto: string; created_at: string; mentor: string } | null;
  proxima_sessao: { titulo: string; inicio_at: string; link: string | null } | null;
  praticas: { devolvidas: number; aguardando: number; rascunhos: number };
  certificados: number;
};

export function StudentDashboard({
  nome,
  nichos,
  onboardingConcluido,
  hub,
}: Readonly<{
  nome: string;
  nichos: string[];
  onboardingConcluido: boolean;
  hub?: React.ReactNode;
}>) {
  const [home] = useResource<Home>('/aluno/inicio');
  const first = nome.split(/\s+/)[0] ?? nome;
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Aluno"
        title={`Olá, ${first}`}
        description="Seu espaço do curso: estude, pratique com editais reais e acompanhe o que o mentor comentou."
      />
      {hub}
      <Resource value={home}>
        {(data) => {
          const percent = data.progresso.aulas_total
            ? Math.round((data.progresso.aulas_concluidas / data.progresso.aulas_total) * 100)
            : 0;
          return (
            <>
              <div className="ui-kpis">
                <Kpi
                  label="Aulas concluídas"
                  value={`${formatNumber(data.progresso.aulas_concluidas)}/${formatNumber(data.progresso.aulas_total)}`}
                  hint={`${percent}% do conteúdo`}
                />
                <Kpi
                  label="Meta da semana"
                  value={
                    data.meta_semana.total
                      ? `${data.meta_semana.feitos}/${data.meta_semana.total} dias`
                      : '—'
                  }
                  hint={
                    data.plano_criado ? 'Dias do plano nesta semana' : 'Gere o plano de 30 dias'
                  }
                />
                <Kpi
                  label="Práticas devolvidas"
                  value={formatNumber(data.praticas.devolvidas)}
                  hint={`${data.praticas.aguardando} aguardando o mentor`}
                  tone={data.praticas.devolvidas ? 'ok' : undefined}
                />
                <Kpi label="Certificados" value={formatNumber(data.certificados)} />
              </div>
              <div className="ui-grid">
                <Panel title="Continuar de onde parou">
                  {data.continuar ? (
                    <>
                      <p>
                        <strong>{data.continuar.titulo}</strong>
                        {data.continuar.percentual ? ` · ${data.continuar.percentual}% visto` : ''}
                      </p>
                      <Link
                        className="ui-btn"
                        href={`/academia/trilhas/${data.continuar.trilha_slug}/aulas/${data.continuar.aula_id}`}
                      >
                        Continuar a aula
                      </Link>
                    </>
                  ) : (
                    <p className="ui-empty">
                      Você concluiu todas as aulas disponíveis. Veja o certificado.
                    </p>
                  )}
                </Panel>
                <Panel title="Próxima atividade do plano">
                  {data.proxima_atividade ? (
                    <>
                      <p>
                        <Badge tone="muted">{`Dia ${data.proxima_atividade.dia}`}</Badge>{' '}
                        <strong>{data.proxima_atividade.objetivo}</strong>
                      </p>
                      <p>{data.proxima_atividade.atividade}</p>
                      <Link className="ui-btn ui-btn-ghost" href="/plano-30-dias">
                        Ver o plano
                      </Link>
                    </>
                  ) : data.plano_criado ? (
                    <p className="ui-empty">Todos os dias do plano estão feitos. Bom trabalho!</p>
                  ) : (
                    <>
                      <p className="ui-empty">Você ainda não tem um plano de 30 dias.</p>
                      <Link className="ui-btn" href="/plano-30-dias">
                        Gerar meu plano
                      </Link>
                    </>
                  )}
                </Panel>
                <Panel title="Recado do mentor">
                  {data.recado_mentor ? (
                    <>
                      <p className="cs-answer">{data.recado_mentor.texto}</p>
                      <small>
                        {data.recado_mentor.mentor} · {formatDate(data.recado_mentor.created_at)}
                      </small>
                    </>
                  ) : (
                    <p className="ui-empty">Nenhum recado por enquanto.</p>
                  )}
                  {data.proxima_sessao ? (
                    <p>
                      Próxima sessão: <strong>{data.proxima_sessao.titulo}</strong> em{' '}
                      {formatDate(data.proxima_sessao.inicio_at, true)}
                    </p>
                  ) : null}
                  <Link href="/mentoria">Abrir mentoria</Link>
                </Panel>
                <Panel title="Praticar com editais reais">
                  <p>
                    {data.praticas.rascunhos} rascunho(s), {data.praticas.aguardando} aguardando o
                    mentor, {data.praticas.devolvidas} devolvida(s).
                  </p>
                  <Link className="ui-btn ui-btn-ghost" href="/praticar">
                    Minhas práticas
                  </Link>
                </Panel>
              </div>
            </>
          );
        }}
      </Resource>
      <Panel title="Seus nichos de prática" description="Definem o que o Radar mostra para você.">
        {nichos.length ? (
          <ul className="ui-list">
            {nichos.map((code) => (
              <li key={code}>{NICHE_CATALOG.find((n) => n.code === code)?.label ?? code}</li>
            ))}
          </ul>
        ) : (
          <p className="ui-empty">Você ainda não escolheu seus nichos.</p>
        )}
        <Link href="/onboarding">
          {onboardingConcluido ? 'Atualizar nichos' : 'Escolher meus nichos'}
        </Link>
      </Panel>
    </main>
  );
}
