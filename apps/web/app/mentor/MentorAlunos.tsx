'use client';

import Link from 'next/link';
import { type Aluno, parado } from '../painel/MentorDashboard';
import { Badge, Empty, Panel, Resource, Table, formatDate, useResource } from '../components/ui';

export function MentorAlunos() {
  const [list] = useResource<{ data: Aluno[] }>('/mentor/alunos');
  return (
    <Panel title="Alunos">
      <Resource value={list}>
        {({ data }) =>
          data.length === 0 ? (
            <Empty>
              Você ainda não tem alunos vinculados. A equipe faz a matrícula e define o vínculo.
            </Empty>
          ) : (
            <Table
              label="Alunos do mentor"
              head={[
                'Aluno',
                'Aulas',
                'Plano de 30 dias',
                'Pendências',
                'Último estudo',
                'Próxima sessão',
              ]}
            >
              {data.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>
                      <Link href={`/mentor/alunos/${a.id}`}>{a.nome}</Link>
                    </strong>
                    <small>{a.email}</small>
                  </td>
                  <td>
                    {a.aulas_concluidas}/{a.aulas_total}
                  </td>
                  <td>{a.plano_total ? `${a.plano_feitos}/${a.plano_total} dias` : 'Sem plano'}</td>
                  <td>
                    {a.praticas_a_devolver ? (
                      <Badge tone="warn">{`${a.praticas_a_devolver} prática(s)`}</Badge>
                    ) : null}{' '}
                    {a.plano_a_revisar ? (
                      <Badge tone="warn">{`${a.plano_a_revisar} dia(s)`}</Badge>
                    ) : null}
                    {!a.praticas_a_devolver && !a.plano_a_revisar ? '—' : null}
                  </td>
                  <td>
                    {formatDate(a.ultimo_progresso)}{' '}
                    {parado(a) ? <Badge tone="bad">Parado</Badge> : null}
                  </td>
                  <td>{formatDate(a.proxima_sessao, true)}</td>
                </tr>
              ))}
            </Table>
          )
        }
      </Resource>
    </Panel>
  );
}
