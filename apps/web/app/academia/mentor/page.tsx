'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Mentee = {
  id: string;
  nome: string;
  email: string;
  perfil_jornada: string;
  onboarding_concluido: boolean;
  aulas_com_progresso: number;
  aulas_concluidas: number;
  ultimo_progresso?: string | null;
};
type Company = { id: string; razao_social: string; cnpj: string; escopo?: Record<string, unknown> };

export default function MentorDashboardPage() {
  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [message, setMessage] = useState('Carregando dados protegidos…');
  useEffect(() => {
    void Promise.all([
      fetch('/api/core/mentor/dashboard'),
      fetch('/api/core/mentor/companies'),
    ]).then(async ([menteeResponse, companyResponse]) => {
      if (menteeResponse.ok)
        setMentees(((await menteeResponse.json()) as { mentorados?: Mentee[] }).mentorados ?? []);
      if (companyResponse.ok)
        setCompanies(((await companyResponse.json()) as { data?: Company[] }).data ?? []);
      setMessage(
        menteeResponse.status === 401
          ? 'Entre com uma conta de mentor para acompanhar mentorados.'
          : '',
      );
    });
  }, []);

  return (
    <main className="academy-page">
      <Link className="back-link" href="/academia">
        ← Voltar para Academia
      </Link>
      <p className="eyebrow">Painel do mentor</p>
      <h1>Acompanhe o próximo passo, não só a nota.</h1>
      <p className="lead">
        O painel mostra progresso, perfil de jornada e indicação de próxima ação. Empresas aparecem
        apenas com concessão explícita.
      </p>
      {message ? <p className="notice">{message}</p> : null}
      <section className="dashboard-card mentor-companies">
        <p className="eyebrow">Escopo concedido</p>
        <h2>{companies.length} empresa(s)</h2>
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
          <p>Nenhuma concessão de empresa disponível.</p>
        )}
      </section>
      <section className="mentor-grid" aria-label="Mentorados">
        {mentees.length ? (
          mentees.map((mentee) => (
            <article className="mentor-card" key={mentee.id}>
              <div>
                <p className="eyebrow">{mentee.perfil_jornada}</p>
                <h2>{mentee.nome}</h2>
                <p>
                  {mentee.aulas_concluidas} aulas concluídas de {mentee.aulas_com_progresso || '—'}{' '}
                  com progresso
                </p>
              </div>
              <strong>
                Último progresso:{' '}
                {mentee.ultimo_progresso
                  ? new Date(mentee.ultimo_progresso).toLocaleDateString('pt-BR')
                  : 'ainda não iniciado'}
              </strong>
            </article>
          ))
        ) : (
          <section className="dashboard-empty">
            <h2>Sem mentorados vinculados</h2>
            <p>Um admin precisa criar a concessão de mentor antes de dados aparecerem aqui.</p>
          </section>
        )}
      </section>
    </main>
  );
}
