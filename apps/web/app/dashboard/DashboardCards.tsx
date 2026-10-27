'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { NICHE_CATALOG } from '@licitecomigo/shared';

type Summary = {
  oportunidades?: { total?: number; triagem?: number; em_analise?: number; proposta?: number };
  prazos?: { total?: number; atrasados?: number };
  tarefas?: { abertas?: number };
  notificacoes_nao_lidas?: number;
};

type Me = {
  nome?: string;
  publico?: string;
  nivel_diagnostico?: string;
  empresa_id?: string;
  nicho_preferencias?: string[];
};

type Company = { id: string; razao_social: string; cnpj: string; usuarios?: number };

export function DashboardCards() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch('/api/core/me'),
      fetch('/api/core/dashboard/summary'),
      fetch('/api/core/companies'),
    ]).then(async ([meResponse, summaryResponse, companiesResponse]) => {
      if (
        [meResponse, summaryResponse, companiesResponse].some((response) => response.status === 401)
      ) {
        setUnauthorized(true);
        return;
      }
      if (meResponse.ok) setMe((await meResponse.json()) as Me);
      if (summaryResponse.ok) setSummary((await summaryResponse.json()) as Summary);
      if (companiesResponse.ok) {
        const payload = (await companiesResponse.json()) as { data?: Company[] };
        setCompanies(payload.data ?? []);
      }
    });
  }, []);

  if (unauthorized) {
    return (
      <section className="dashboard-empty">
        <h2>Entre para ver sua operação</h2>
        <p>Seu painel mostra apenas os dados da sua empresa.</p>
        <Link className="button-secondary" href="/login">
          Entrar
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow">Minha empresa</p>
          <h2>{me?.nome ?? 'Carregando…'}</h2>
          <p>
            {companies[0]?.razao_social ?? 'Complete os dados da empresa para melhorar o Radar.'}
          </p>
        </div>
        <Link className="button-secondary" href="/onboarding">
          Atualizar preferências
        </Link>
      </section>
      <section className="dashboard-card dashboard-scope-card">
        <p className="eyebrow">Escopo do Radar</p>
        <h2>Seus nichos de atuação</h2>
        {me?.nicho_preferencias?.length ? (
          <div className="tag-row">
            {me.nicho_preferencias.map((code) => (
              <span className="tag" key={code}>
                {NICHE_CATALOG.find((niche) => niche.code === code)?.label ?? code}
              </span>
            ))}
          </div>
        ) : (
          <p>
            Defina de um a três nichos. Eles definem o que o Radar, as buscas salvas e os alertas
            mostram.
          </p>
        )}
        <Link href="/onboarding">Atualizar nichos</Link>
      </section>
      <section className="metric-grid" aria-label="Resumo da operação">
        <article className="metric-card">
          <span>Oportunidades</span>
          <strong>{summary?.oportunidades?.total ?? '—'}</strong>
          <small>{summary?.oportunidades?.triagem ?? 0} em triagem</small>
        </article>
        <article className="metric-card">
          <span>Em análise</span>
          <strong>{summary?.oportunidades?.em_analise ?? '—'}</strong>
          <small>{summary?.oportunidades?.proposta ?? 0} em proposta</small>
        </article>
        <article className="metric-card">
          <span>Prazos</span>
          <strong>{summary?.prazos?.total ?? '—'}</strong>
          <small>{summary?.prazos?.atrasados ?? 0} atrasados</small>
        </article>
        <article className="metric-card">
          <span>Tarefas</span>
          <strong>{summary?.tarefas?.abertas ?? '—'}</strong>
          <small>{summary?.notificacoes_nao_lidas ?? 0} notificações</small>
        </article>
      </section>
      <section className="dashboard-columns">
        <div className="dashboard-card">
          <p className="eyebrow">Empresa</p>
          <h2>Dados cadastrados</h2>
          {companies.length ? (
            <ul className="simple-list">
              {companies.map((company) => (
                <li key={company.id}>
                  <strong>{company.razao_social}</strong>
                  <span>{company.cnpj}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma empresa cadastrada ainda.</p>
          )}
          <Link href="/empresas">Editar dados da empresa</Link>
        </div>
        <div className="dashboard-card">
          <p className="eyebrow">Próximos passos</p>
          <h2>Decida com evidência</h2>
          <p>
            Use o Radar para encontrar oportunidades, salve as que interessam e confira sempre o
            edital original.
          </p>
          <div className="dashboard-links">
            <Link href="/radar">Abrir Radar</Link>
            <Link href="/academia">Ir para Academia</Link>
            <Link href="/ana">Falar com a Ana</Link>
          </div>
        </div>
      </section>
    </>
  );
}
