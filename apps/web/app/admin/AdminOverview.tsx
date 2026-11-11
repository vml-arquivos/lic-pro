'use client';

import Link from 'next/link';
import type { Modulo } from '../../lib/modulo';
import {
  Alert,
  Kpi,
  Panel,
  Resource,
  formatDate,
  formatNumber,
  useResource,
} from '../components/ui';
import { MigrationNotice } from './_components/MigrationNotice';

type Overview = {
  contas_por_papel: { papel: string; total: number; ativos: number }[];
  empresas_clientes: { total: number; novos_30d: number };
  curso: {
    alunos_ativos: number;
    turmas_ativas: number;
    mentores_ativos: number;
    convites_pendentes: number;
  };
  alertas: { ultimas_24h: number };
  buscas_salvas: { ativas: number };
  leads: { total: number; novos_7d: number; novos: number };
  editais: { total: number; capturados_24h: number; ultima_captura: string | null };
  ingestao: {
    checkpoints: number;
    ultima_execucao: string | null;
    dead_letters_pendentes: number;
  };
  ana: { conversas_7d: number };
};

const PAPEIS: Record<string, string> = {
  plataforma: 'Administração',
  admin: 'Empresas (responsável)',
  operador: 'Empresas (operador)',
  colaborador: 'Colaboradores',
  aluno: 'Alunos',
  mentor: 'Mentores',
};

export function AdminOverview({ modulo = 'profissional' }: Readonly<{ modulo?: Modulo }>) {
  const [overview] = useResource<Overview>(`/platform/overview?modulo=${modulo}`);
  const doCurso = modulo === 'curso';
  return (
    <>
      <MigrationNotice />
      <Resource value={overview}>
        {(data) => (
          <>
            <div className="ui-kpis" aria-label="Indicadores principais">
              {doCurso ? (
                <>
                  <Kpi
                    label="Alunos ativos"
                    value={formatNumber(data.curso.alunos_ativos)}
                    hint={`${data.curso.turmas_ativas} turma(s) ativa(s)`}
                  />
                  <Kpi label="Mentores ativos" value={formatNumber(data.curso.mentores_ativos)} />
                  <Kpi
                    label="Convites pendentes"
                    value={formatNumber(data.curso.convites_pendentes)}
                    tone={data.curso.convites_pendentes ? 'warn' : undefined}
                  />
                  <Kpi
                    label="Leads de alunos"
                    value={formatNumber(data.leads.total)}
                    hint={`${data.leads.novos_7d} nos últimos 7 dias`}
                    tone={data.leads.novos ? 'warn' : undefined}
                  />
                </>
              ) : (
                <>
                  <Kpi
                    label="Empresas clientes"
                    value={formatNumber(data.empresas_clientes.total)}
                    hint={`${data.empresas_clientes.novos_30d} nos últimos 30 dias`}
                  />
                  <Kpi
                    label="Leads de empresas"
                    value={formatNumber(data.leads.total)}
                    hint={`${data.leads.novos_7d} nos últimos 7 dias`}
                    tone={data.leads.novos ? 'warn' : undefined}
                  />
                  <Kpi
                    label="Editais no catálogo"
                    value={formatNumber(data.editais.total)}
                    hint={`${data.editais.capturados_24h} capturados em 24 h`}
                  />
                </>
              )}
            </div>

            <div className="ui-grid">
              <Panel
                title="Uso da plataforma"
                description={
                  doCurso ? 'Atividade dos alunos e da mentoria.' : 'Atividade das empresas.'
                }
              >
                <ul className="ui-list">
                  {doCurso ? null : (
                    <>
                      <li>
                        <span>Buscas salvas ativas</span>
                        <strong>{formatNumber(data.buscas_salvas.ativas)}</strong>
                      </li>
                      <li>
                        <span>Alertas entregues (24 h)</span>
                        <strong>{formatNumber(data.alertas.ultimas_24h)}</strong>
                      </li>
                    </>
                  )}
                  <li>
                    <span>Conversas com a Ana (7 dias)</span>
                    <strong>{formatNumber(data.ana.conversas_7d)}</strong>
                  </li>
                </ul>
              </Panel>
              <Panel
                title="Contas por tipo"
                description={doCurso ? 'Alunos e mentores.' : 'Empresas, colaboradores e equipe.'}
              >
                <ul className="ui-list">
                  {data.contas_por_papel.map((row) => (
                    <li key={row.papel}>
                      <span>{PAPEIS[row.papel] ?? row.papel}</span>
                      <span>
                        <strong>{row.total}</strong> <small>({row.ativos} ativas)</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
              {doCurso ? null : (
                <Panel
                  title="Coleta de editais"
                  description="Situação da leitura das fontes públicas."
                  actions={<Link href="/admin/fontes">Ver detalhes</Link>}
                >
                  <ul className="ui-list">
                    <li>
                      <span>Última captura de edital</span>
                      <strong>{formatDate(data.editais.ultima_captura, true)}</strong>
                    </li>
                    <li>
                      <span>Última execução da coleta</span>
                      <strong>{formatDate(data.ingestao.ultima_execucao, true)}</strong>
                    </li>
                    <li>
                      <span>Falhas aguardando análise</span>
                      <strong>{formatNumber(data.ingestao.dead_letters_pendentes)}</strong>
                    </li>
                  </ul>
                  {data.ingestao.dead_letters_pendentes > 0 ? (
                    <Alert kind="info">
                      Há falhas de coleta sem resolução. Veja em Fontes de dados.
                    </Alert>
                  ) : null}
                </Panel>
              )}
            </div>

            <Panel title="Atalhos">
              <div className="ui-table-actions">
                {doCurso ? (
                  <>
                    <Link className="ui-btn" href="/gestao/alunos">
                      Matricular aluno
                    </Link>
                    <Link className="ui-btn ui-btn-ghost" href="/gestao/mentores">
                      Convidar mentor
                    </Link>
                    <Link className="ui-btn ui-btn-ghost" href="/gestao/financeiro">
                      Ver vendas
                    </Link>
                    <Link className="ui-btn ui-btn-ghost" href="/gestao/leads">
                      Ver leads
                    </Link>
                  </>
                ) : (
                  <>
                    <Link className="ui-btn" href="/admin/empresas">
                      Convidar empresa
                    </Link>
                    <Link className="ui-btn ui-btn-ghost" href="/admin/colaboradores">
                      Convidar colaborador
                    </Link>
                    <Link className="ui-btn ui-btn-ghost" href="/admin/assinantes">
                      Ver assinantes
                    </Link>
                    <Link className="ui-btn ui-btn-ghost" href="/leads">
                      Ver leads
                    </Link>
                  </>
                )}
              </div>
            </Panel>
          </>
        )}
      </Resource>
    </>
  );
}
