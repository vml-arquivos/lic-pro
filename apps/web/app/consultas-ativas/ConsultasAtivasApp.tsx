'use client';

import Link from 'next/link';
import {
  Badge,
  Empty,
  Panel,
  Resource,
  Table,
  formatDate,
  formatNumber,
  useResource,
} from '../components/ui';

type Consulta = {
  id: string;
  nome: string;
  filtros: Record<string, unknown>;
  abertas: number | null;
  novas_24h: number | null;
  atualizada_em: string;
};

function hrefDoFarol(filtros: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (Array.isArray(valor)) valor.forEach((item) => params.append(chave, String(item)));
    else if (valor !== null && valor !== undefined && valor !== '')
      params.set(chave, String(valor));
  }
  params.set('status', 'recebendo');
  return `/radar?${params.toString()}`;
}

export function ConsultasAtivasApp() {
  const [lista] = useResource<{ data: Consulta[] }>('/consultas-ativas');
  return (
    <Resource value={lista}>
      {({ data }) => (
        <Panel title="Buscas ligadas" meta={`${data.length}`}>
          {data.length ? (
            <Table
              head={['Busca', 'Abertas agora', 'Novas em 24 h', 'Alterada em', '']}
              label="Consultas ativas"
            >
              {data.map((consulta) => (
                <tr key={consulta.id}>
                  <td>{consulta.nome}</td>
                  <td>{consulta.abertas === null ? '—' : formatNumber(consulta.abertas)}</td>
                  <td>
                    {consulta.novas_24h ? (
                      <Badge tone="warn">{String(consulta.novas_24h)}</Badge>
                    ) : consulta.novas_24h === 0 ? (
                      '0'
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{formatDate(consulta.atualizada_em)}</td>
                  <td>
                    <Link className="ui-btn ui-btn-ghost" href={hrefDoFarol(consulta.filtros)}>
                      Abrir no Farol
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>
              Nenhuma busca ligada. <Link href="/radar">Faça uma busca no Farol e salve.</Link>
            </Empty>
          )}
        </Panel>
      )}
    </Resource>
  );
}
