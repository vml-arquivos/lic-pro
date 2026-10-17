'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Company = {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string | null;
  segmento?: string | null;
  usuarios?: number;
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [cnpj, setCnpj] = useState('');
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const response = await fetch('/api/core/companies');
    if (response.ok) setCompanies(((await response.json()) as { data?: Company[] }).data ?? []);
    else
      setMessage(
        response.status === 401
          ? 'Entre para gerenciar empresas.'
          : 'Não foi possível carregar as empresas.',
      );
  }
  useEffect(() => {
    void load();
  }, []);

  async function createCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const response = await fetch('/api/core/companies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cnpj, razao_social: name, segmento: segment || undefined }),
    });
    if (!response.ok) {
      setMessage(
        response.status === 403
          ? 'Somente admin ou operador pode criar empresas.'
          : 'Revise o CNPJ e os dados informados.',
      );
      return;
    }
    setCnpj('');
    setName('');
    setSegment('');
    setMessage('Empresa criada.');
    await load();
  }

  return (
    <main className="dashboard-page">
      <Link className="back-link" href="/">
        ← Dashboard
      </Link>
      <div className="page-heading">
        <p className="eyebrow">Conta e empresas</p>
        <h1>Organize os CNPJs atendidos.</h1>
        <p>
          Empresas ficam isoladas por tenant. Mentores só enxergam empresas com concessão explícita.
        </p>
      </div>
      <section className="dashboard-columns">
        <form className="dashboard-card auth-form" onSubmit={createCompany}>
          <h2>Nova empresa</h2>
          <label>
            CNPJ
            <input
              value={cnpj}
              onChange={(event) => setCnpj(event.target.value.replace(/\D/g, ''))}
              maxLength={14}
              placeholder="somente 14 dígitos"
              required
            />
          </label>
          <label>
            Razão social
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Segmento
            <input
              value={segment}
              onChange={(event) => setSegment(event.target.value)}
              placeholder="ex.: serviços"
            />
          </label>
          <button type="submit">Salvar empresa</button>
          {message ? <p className="success-message">{message}</p> : null}
        </form>
        <section className="dashboard-card">
          <p className="eyebrow">Acessíveis</p>
          <h2>{companies.length} empresa(s)</h2>
          {companies.length ? (
            <ul className="simple-list">
              {companies.map((company) => (
                <li key={company.id}>
                  <strong>{company.nome_fantasia || company.razao_social}</strong>
                  <span>
                    {company.cnpj} · {company.segmento || 'segmento não informado'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Faça login e adicione a primeira empresa.</p>
          )}
        </section>
      </section>
    </main>
  );
}
