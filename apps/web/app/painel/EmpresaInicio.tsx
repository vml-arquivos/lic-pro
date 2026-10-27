'use client';

import Link from 'next/link';
import { NICHE_CATALOG } from '@licitecomigo/shared';
import {
  Badge,
  Empty,
  Kpi,
  PageHeader,
  Panel,
  Resource,
  formatDate,
  useResource,
} from '../components/ui';
import { COLUMNS, dueLabel } from '../oportunidades/pipeline-lib';

type Home = {
  empresa: { id: string; razao_social: string } | null;
  buscas_ativas: number;
  hoje: Record<string, number>;
  prazos_semana: Array<{
    id: string;
    titulo: string;
    vence_em: string;
    oportunidade_id: string | null;
    edital_titulo: string | null;
  }>;
  pipeline: Record<string, number>;
  documentos: { total: number; vencidos: number; vencendo: number };
  proximos_passos: Array<{ codigo: string; texto: string; href: string }>;
};

export function EmpresaInicio({
  nome,
  nichos,
  hub,
}: Readonly<{ nome: string; nichos: readonly string[]; hub?: React.ReactNode }>) {
  const [home] = useResource<Home>('/empresa/inicio');
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Minha empresa"
        title={`Olá, ${nome.split(' ')[0] ?? nome}`}
        description="O que mudou hoje, o que vence nesta semana e o que fazer a seguir."
        actions={
          <Link className="ui-btn" href="/radar">
            Buscar no Radar
          </Link>
        }
      />
      {hub}
      <Resource value={home}>
        {(data) => {
          const novos = data.hoje.novo ?? 0;
          const alteracoes = data.hoje.alteracao ?? 0;
          const pipelineTotal = Object.values(data.pipeline).reduce((sum, value) => sum + value, 0);
          const beginner = pipelineTotal === 0;
          return (
            <>
              <section className="ui-kpis" aria-label="Resumo">
                <Kpi
                  label="Novos hoje"
                  value={novos}
                  hint={`${alteracoes} alteração(ões) nos seus editais`}
                />
                <Kpi label="Buscas com aviso" value={data.buscas_ativas} hint="Salvas e ativas" />
                <Kpi
                  label="Prazos em 7 dias"
                  value={data.prazos_semana.length}
                  tone={data.prazos_semana.length ? 'warn' : undefined}
                />
                <Kpi label="No pipeline" value={pipelineTotal} hint="Oportunidades acompanhadas" />
                <Kpi
                  label="Documentos"
                  value={data.documentos.total}
                  hint={`${data.documentos.vencidos} vencido(s), ${data.documentos.vencendo} a vencer`}
                  tone={data.documentos.vencidos ? 'warn' : undefined}
                />
              </section>

              <div className="op-home">
                <Panel
                  title="O que fazer agora"
                  description="Sugestões pelo que está na sua conta."
                >
                  {data.proximos_passos.length === 0 ? (
                    <Empty>Tudo em dia. Quando algo precisar de atenção, aparece aqui.</Empty>
                  ) : (
                    <ul className="op-steps">
                      {data.proximos_passos.map((step) => (
                        <li key={step.codigo}>
                          <Link href={step.href}>{step.texto}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title="Prazos da semana" actions={<Link href="/agenda">Ver agenda</Link>}>
                  {data.prazos_semana.length === 0 ? (
                    <Empty>Nenhum prazo nos próximos 7 dias.</Empty>
                  ) : (
                    <ul className="op-list">
                      {data.prazos_semana.map((item) => {
                        const due = dueLabel(item.vence_em);
                        return (
                          <li key={item.id}>
                            <span>
                              <strong>{item.titulo}</strong>
                              <small>
                                {formatDate(item.vence_em, true)}
                                {item.oportunidade_id && item.edital_titulo ? ' · ' : ''}
                                {item.oportunidade_id && item.edital_titulo ? (
                                  <Link href={`/oportunidades/${item.oportunidade_id}`}>
                                    {item.edital_titulo}
                                  </Link>
                                ) : null}
                              </small>
                            </span>
                            <Badge tone={due.tone}>{due.text}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>

                <Panel title="Pipeline" actions={<Link href="/oportunidades">Abrir pipeline</Link>}>
                  <ul className="op-pipeline-mini">
                    {COLUMNS.map((column) => (
                      <li key={column.key}>
                        <span>{column.title}</span>
                        <strong>
                          {column.statuses.reduce(
                            (sum, status) => sum + (data.pipeline[status] ?? 0),
                            0,
                          )}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </Panel>

                <Panel
                  title="Seu escopo no Radar"
                  actions={<Link href="/onboarding">Mudar nichos</Link>}
                >
                  {nichos.length ? (
                    <div className="tag-row">
                      {nichos.map((code) => (
                        <span className="tag" key={code}>
                          {NICHE_CATALOG.find((niche) => niche.code === code)?.label ?? code}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <Empty>Escolha de um a três nichos para o Radar mostrar o que interessa.</Empty>
                  )}
                  <p className="op-company">
                    {data.empresa
                      ? data.empresa.razao_social
                      : 'Dados da empresa ainda não cadastrados.'}{' '}
                    <Link href="/empresas">{data.empresa ? 'Editar' : 'Cadastrar'}</Link>
                  </p>
                </Panel>
              </div>

              {beginner ? (
                <Panel
                  title="Primeiros passos"
                  description="Um caminho simples para começar. Some quando você tiver a primeira oportunidade no pipeline."
                >
                  <ol className="op-guide">
                    <li data-done={Boolean(data.empresa)}>
                      <Link href="/empresas">Cadastre os dados da empresa</Link>
                    </li>
                    <li data-done={nichos.length > 0}>
                      <Link href="/onboarding">Escolha seus nichos</Link>
                    </li>
                    <li data-done={data.buscas_ativas > 0}>
                      <Link href="/radar">Faça uma busca e salve para receber avisos</Link>
                    </li>
                    <li data-done={data.documentos.total > 0}>
                      <Link href="/documentos">Cadastre os documentos e as validades</Link>
                    </li>
                    <li data-done={false}>
                      <Link href="/radar">Salve o primeiro edital no pipeline</Link>
                    </li>
                  </ol>
                </Panel>
              ) : null}
            </>
          );
        }}
      </Resource>
    </div>
  );
}
