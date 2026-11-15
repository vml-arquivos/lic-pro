'use client';

import { formatarCnpj } from '@licitecomigo/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmpresaForm, type EmpresaDados } from '../components/EmpresaForm';

type Company = EmpresaDados & { id: string; usuarios?: number };

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
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

  async function saveCompany(body: Record<string, string>) {
    setMessage('');
    setSaving(true);
    const response = await fetch(
      editing ? `/api/core/companies/${editing.id}` : '/api/core/companies',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    setSaving(false);
    if (!response.ok) {
      setMessage(
        response.status === 403
          ? 'Somente admin ou operador pode salvar empresas.'
          : response.status === 409
            ? 'Esse CNPJ já está cadastrado nesta conta.'
            : 'Revise o CNPJ e os dados informados.',
      );
      return;
    }
    setMessage(editing ? 'Empresa atualizada.' : 'Empresa criada.');
    setEditing(null);
    setFormVersion((value) => value + 1);
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
        <EmpresaForm
          key={`${editing?.id ?? 'nova'}-${formVersion}`}
          empresa={editing}
          salvando={saving}
          mensagem={message}
          onSalvar={(body) => void saveCompany(body)}
          {...(editing ? { onCancelar: () => setEditing(null) } : {})}
        />
        <section className="dashboard-card">
          <p className="eyebrow">Acessíveis</p>
          <h2>{companies.length} empresa(s)</h2>
          {companies.length ? (
            <ul className="simple-list">
              {companies.map((company) => (
                <li key={company.id}>
                  <strong>{company.nome_fantasia || company.razao_social}</strong>
                  <span>
                    {formatarCnpj(company.cnpj)} · {company.segmento || 'segmento não informado'}
                    {company.cidade ? ` · ${company.cidade}/${company.uf ?? ''}` : ''}
                  </span>
                  <button
                    type="button"
                    className="empresa-editar"
                    onClick={() => setEditing(company)}
                  >
                    Editar
                  </button>
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
