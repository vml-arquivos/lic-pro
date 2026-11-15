'use client';

import { useState } from 'react';
import { Empty, Panel, Resource, Table, formatDate, useResource } from '../../components/ui';

type Entry = {
  id: string;
  usuario_nome: string | null;
  usuario_email: string | null;
  acao: string;
  recurso: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function AuditAdmin() {
  const [audit] = useResource<{ data: Entry[] }>('/admin/users/audit');
  const [showReads, setShowReads] = useState(false);
  return (
    <Panel
      title="Últimas 200 ações"
      actions={
        <label>
          <input
            type="checkbox"
            checked={showReads}
            onChange={(event) => setShowReads(event.target.checked)}
          />{' '}
          Mostrar também as consultas
        </label>
      }
    >
      <Resource value={audit}>
        {({ data: all }) => {
          const data = showReads
            ? all
            : all.filter((entry) => !/\.(listed|read)$/.test(entry.acao));
          return data.length ? (
            <Table
              label="Auditoria"
              head={['Quando', 'Quem', 'Ação', 'Recurso', 'Visualizando como']}
            >
              {data.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.created_at, true)}</td>
                  <td>
                    {entry.usuario_nome ?? '—'}
                    <small>{entry.usuario_email ?? ''}</small>
                  </td>
                  <td>
                    <code>{entry.acao}</code>
                  </td>
                  <td>{entry.recurso ?? '—'}</td>
                  <td>
                    {typeof entry.metadata?.acting_as === 'string' ? entry.metadata.acting_as : '—'}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nenhuma ação registrada.</Empty>
          );
        }}
      </Resource>
    </Panel>
  );
}
