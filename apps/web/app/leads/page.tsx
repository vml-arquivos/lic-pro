'use client';

import { useEffect, useState } from 'react';

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
export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [message, setMessage] = useState('Carregando leads…');
  useEffect(() => {
    void fetch('/api/core/admin/leads').then(async (response) => {
      if (!response.ok) {
        setMessage(
          response.status === 403
            ? 'Apenas admins podem consultar leads.'
            : 'Não foi possível carregar leads.',
        );
        return;
      }
      const payload = (await response.json()) as { data?: Lead[] };
      setLeads(payload.data ?? []);
      setMessage('');
    });
  }, []);
  return (
    <main className="dashboard-page">
      <div className="page-heading">
        <p className="eyebrow">Administração</p>
        <h1>Leads do site</h1>
        <p>Consulta protegida; a captura pública não possui leitura.</p>
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
