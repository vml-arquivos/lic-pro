'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Audience = 'empresario' | 'mentorado';
type Me = { nome?: string; publico?: string; papel?: string };
type Company = { id: string; razao_social: string; nome_fantasia?: string | null };

const modules = [
  ['🏢', 'Quero abrir minha empresa', 'Comece do zero e organize a abertura.', '/jornada'],
  ['✓', 'Minha empresa está pronta', 'Faça um diagnóstico para começar a licitar.', '/onboarding'],
  ['⌕', 'Quais oportunidades existem?', 'Veja o que o governo está comprando.', '/radar'],
  ['◈', 'Encontrei uma oportunidade', 'Descubra se vale a pena participar.', '/oportunidade'],
  ['▤', 'Encontrei um edital', 'Entenda exigências, prazos e documentos.', '/edital'],
  ['◷', 'Minha agenda de licitações', 'Não perca prazos e próximas ações.', '/agenda'],
  ['➤', 'Minhas participações', 'Acompanhe da proposta ao contrato.', '/agenda'],
  ['♧', 'Meus fornecedores', 'Organize preços, contatos e orçamentos.', '/fornecedores'],
] as const;

export function HomeWorkspace() {
  const [audience, setAudience] = useState<Audience>('empresario');
  const [me, setMe] = useState<Me | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem('lc-audience');
    if (saved === 'empresario' || saved === 'mentorado') setAudience(saved);
    const onAudienceChange = () => {
      const next = window.localStorage.getItem('lc-audience');
      if (next === 'empresario' || next === 'mentorado') setAudience(next);
    };
    window.addEventListener('lc-audience-change', onAudienceChange);
    void Promise.all([
      fetch('/api/core/me', { cache: 'no-store' }),
      fetch('/api/core/companies', { cache: 'no-store' }),
    ])
      .then(async ([meResponse, companiesResponse]) => {
        const nextMe = meResponse.ok ? ((await meResponse.json()) as Me) : null;
        setMe(nextMe);
        if (!saved && nextMe && (nextMe.publico === 'mentoria' || nextMe.papel === 'mentor')) {
          setAudience('mentorado');
          window.localStorage.setItem('lc-audience', 'mentorado');
        }
        if (companiesResponse.ok) {
          const payload = (await companiesResponse.json()) as { data?: Company[] };
          setCompanies(payload.data ?? []);
        }
      })
      .catch(() => undefined);
    return () => window.removeEventListener('lc-audience-change', onAudienceChange);
  }, []);

  const mentorado = audience === 'mentorado';
  const label = mentorado ? 'Mentorados' : 'Empresas';

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <p className="eyebrow">LiciteComigo · {label}</p>
        <h1>Olá! O que você precisa fazer hoje?</h1>
        <p>Escolha sua necessidade. A plataforma mostra o próximo passo, sem complicação.</p>
      </div>

      <section className="workspace-hero" aria-labelledby="hero-title">
        <div>
          <p className="hero-kicker">✦ ANA RECOMENDA</p>
          <h2 id="hero-title">
            {mentorado
              ? 'Sua jornada prática para conquistar oportunidades começa aqui.'
              : 'Vamos encontrar uma oportunidade para sua empresa?'}
          </h2>
          <p>
            {mentorado
              ? 'Uma trilha orientada de 30 dias com tarefas aplicadas ao seu negócio, sem promessa de vitória.'
              : 'Comece buscando um edital compatível com seu negócio.'}
          </p>
        </div>
        <Link className="button-light" href={mentorado ? '/plano-30-dias' : '/radar'}>
          Começar agora →
        </Link>
      </section>

      <div className="workspace-quick-actions">
        <Link className="button-primary" href="/automacoes">
          ⚡ ANA executora · Central de automações
        </Link>
        <Link className="button-secondary" href="/aprovacoes">
          ✓ Aprovações pendentes
        </Link>
      </div>

      <section className="workspace-module-grid" aria-label="Próximas ações">
        {modules.map(([icon, title, description, href]) => (
          <Link className="workspace-module-card" href={href} key={title}>
            <span className="module-icon" aria-hidden="true">
              {icon}
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
            <span className="module-link">Acessar →</span>
          </Link>
        ))}
      </section>

      <section className="workspace-summary-grid">
        <article className="workspace-card">
          <p className="eyebrow">Próximas ações recomendadas</p>
          <h2>Da empresa ao contrato</h2>
          {[
            ['1', 'Cadastrar ou conferir dados da empresa', 'Primeiro passo'],
            ['2', 'Escolher um mercado para vender', 'A fazer'],
            ['3', 'Identificar uma oportunidade compatível', 'A fazer'],
            ['4', 'Calcular preço e preparar a proposta', 'A fazer'],
          ].map(([number, title, status]) => (
            <div className="workspace-step" key={number}>
              <span className={`step-number ${number !== '1' ? 'pending' : ''}`}>{number}</span>
              <div>
                <strong>{title}</strong>
                <small>{status}</small>
              </div>
            </div>
          ))}
        </article>
        <article className="workspace-card">
          <p className="eyebrow">Meu espaço</p>
          <h2>{me?.nome ?? 'Sua conta'}</h2>
          <p className="workspace-muted">
            {mentorado ? 'Aluno da Mentoria' : `${companies.length} empresa(s) vinculada(s)`}
          </p>
          <div className="workspace-divider" />
          <p className="workspace-muted">📌 Participações acompanhadas: <strong>0</strong></p>
          <p className="workspace-muted">📂 Documentos conferidos: <strong>0</strong></p>
          <Link className="button-primary" href={mentorado ? '/mentoria' : '/empresas'}>
            {mentorado ? 'Ver minha mentoria' : 'Gerenciar empresas'}
          </Link>
        </article>
      </section>
    </main>
  );
}
