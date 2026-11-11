'use client';

import { useEffect, useState } from 'react';
import type { Modulo } from '../../lib/modulo';

type Lead = {
  id: string;
  nome: string;
  email: string;
  whatsapp?: string | null;
  perfil: string;
  status: string;
  origem?: string | null;
  created_at: string;
};
const COPY: Record<Modulo, { eyebrow: string; title: string; text: string }> = {
  profissional: {
    eyebrow: 'Painel admin',
    title: 'Leads de empresas',
    text: 'Empresas interessadas no sistema profissional, captadas pelo site. Somente a equipe vê esta lista.',
  },
  curso: {
    eyebrow: 'Painel da mentoria',
    title: 'Leads de alunos',
    text: 'Interessados no curso e na mentoria, captados pelo site. Somente a equipe vê esta lista.',
  },
};

export function LeadsTable({ modulo = 'profissional' }: Readonly<{ modulo?: Modulo }>) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [message, setMessage] = useState('Carregando leads…');
  useEffect(() => {
    void fetch(`/api/core/admin/leads?modulo=${modulo}`).then(async (response) => {
      if (!response.ok) {
        setMessage(
          response.status === 403
            ? 'Somente a equipe do Licite Comigo pode ver os leads.'
            : 'Não foi possível carregar leads.',
        );
        return;
      }
      const payload = (await response.json()) as { data?: Lead[] };
      setLeads(payload.data ?? []);
      setMessage('');
    });
  }, [modulo]);
  return (
    <main className="ui-page">
      <div className="page-heading">
        <p className="eyebrow">{COPY[modulo].eyebrow}</p>
        <h1>{COPY[modulo].title}</h1>
        <p>{COPY[modulo].text}</p>
      </div>
      {message ? (
        <p className="notice">{message}</p>
      ) : (
        <div className="lead-table-wrap">
          <table className="lead-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Origem</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.nome}</td>
                  <td>{lead.email}</td>
                  <td>{lead.perfil}</td>
                  <td>{lead.origem ?? '—'}</td>
                  <td>{new Date(lead.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!leads.length ? <p>Nenhum lead capturado.</p> : null}
        </div>
      )}
    </main>
  );
}
