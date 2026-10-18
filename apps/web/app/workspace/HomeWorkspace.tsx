'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Me = { nome?: string };
type Company = { id: string; razao_social: string; nome_fantasia?: string | null };
type HomeWorkspaceProps = Readonly<{ demoMode: boolean }>;

const realAreas = [
  [
    '⌕',
    'Explorar licitações',
    'Busque oportunidades em fontes públicas e abra o edital original.',
    '/radar',
  ],
  ['▥', 'Empresas', 'Cadastre os CNPJs e mantenha os dados usados no Radar.', '/empresas'],
  ['◎', 'Academia', 'Consulte trilhas e aulas publicadas para aprender o processo.', '/academia'],
  ['✦', 'Ana', 'Faça uma pergunta e receba apoio com fontes e limites claros.', '/ana'],
] as const;

export function HomeWorkspace({ demoMode }: HomeWorkspaceProps) {
  const [me, setMe] = useState<Me | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    void Promise.all([
      fetch('/api/core/me', { cache: 'no-store' }),
      fetch('/api/core/companies', { cache: 'no-store' }),
    ])
      .then(async ([meResponse, companiesResponse]) => {
        if (meResponse.ok) setMe((await meResponse.json()) as Me);
        if (companiesResponse.ok) {
          const payload = (await companiesResponse.json()) as { data?: Company[] };
          setCompanies(payload.data ?? []);
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <p className="eyebrow">LiciteComigo · Empresas</p>
        <h1>O que você precisa verificar hoje?</h1>
        <p>Encontre a informação certa, confira a fonte e registre o próximo passo.</p>
      </div>
      <section className="workspace-hero" aria-labelledby="hero-title">
        <div>
          <p className="hero-kicker">✦ PRÓXIMO PASSO</p>
          <h2 id="hero-title">Comece pelo Radar de licitações.</h2>
          <p>
            Pesquise oportunidades compatíveis e abra a fonte oficial antes de tomar uma decisão.
          </p>
        </div>
        <Link className="button-light" href="/radar">
          Explorar licitações →
        </Link>
      </section>
      <section className="workspace-module-grid" aria-label="Áreas disponíveis">
        {realAreas.map(([icon, title, description, href]) => (
          <Link className="workspace-module-card" href={href} key={href}>
            <span className="module-icon" aria-hidden="true">
              {icon}
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
            <span className="module-link">Abrir →</span>
          </Link>
        ))}
      </section>
      <section className="workspace-summary-grid">
        <article className="workspace-card">
          <p className="eyebrow">Como usar</p>
          <h2>Uma decisão por vez</h2>
          <div className="workspace-step">
            <span className="step-number">1</span>
            <div>
              <strong>Pesquise no Radar</strong>
              <small>Use palavras-chave e filtros.</small>
            </div>
          </div>
          <div className="workspace-step">
            <span className="step-number">2</span>
            <div>
              <strong>Confira a fonte</strong>
              <small>Abra o edital e seus anexos.</small>
            </div>
          </div>
          <div className="workspace-step">
            <span className="step-number">3</span>
            <div>
              <strong>Registre o próximo passo</strong>
              <small>Não trate informação incompleta como decisão.</small>
            </div>
          </div>
        </article>
        <article className="workspace-card">
          <p className="eyebrow">Meu espaço</p>
          <h2>{me?.nome ?? 'Sua conta'}</h2>
          <p className="workspace-muted">
            {companies.length
              ? `${companies.length} empresa(s) vinculada(s)`
              : 'Nenhuma empresa vinculada ainda.'}
          </p>
          <div className="workspace-divider" />
          <p className="workspace-muted">
            {demoMode
              ? 'O modo demo pode exibir fluxos experimentais separados dos dados reais.'
              : 'Os dados exibidos vêm da sua conta e das fontes consultadas.'}
          </p>
          <Link className="button-primary" href="/empresas">
            Gerenciar empresas
          </Link>
        </article>
      </section>
    </main>
  );
}
