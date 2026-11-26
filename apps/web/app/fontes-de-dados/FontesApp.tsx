'use client';

import {
  Empty,
  Kpi,
  Panel,
  Resource,
  Table,
  formatDate,
  formatNumber,
  useResource,
} from '../components/ui';

type Fontes = {
  catalogo: { total: number; abertos: number; ultima_publicacao: string | null };
  portais: Array<{ portal: string; total: number }>;
  ultima_coleta: string | null;
  coleta_ligada: boolean;
  intervalo_minutos: number;
  fontes: Array<{ nome: string; detalhe: string; atualizacao: string; link: string }>;
};

export function FontesApp() {
  const [dados] = useResource<Fontes>('/fontes-de-dados');
  return (
    <Resource value={dados}>
      {(fontes) => (
        <>
          <div className="ui-kpis">
            <Kpi label="Editais no sistema" value={formatNumber(fontes.catalogo.total)} />
            <Kpi label="Com proposta aberta" value={formatNumber(fontes.catalogo.abertos)} />
            <Kpi
              label="Última coleta"
              value={fontes.ultima_coleta ? formatDate(fontes.ultima_coleta, true) : '—'}
              hint={
                fontes.coleta_ligada ? `A cada ${fontes.intervalo_minutos} min` : 'Coleta desligada'
              }
              tone={fontes.coleta_ligada ? 'ok' : 'warn'}
            />
            <Kpi
              label="Última publicação"
              value={
                fontes.catalogo.ultima_publicacao
                  ? formatDate(fontes.catalogo.ultima_publicacao)
                  : '—'
              }
            />
          </div>
          <Panel title="Fontes">
            <Table head={['Fonte', 'O que traz', 'Atualização', '']} label="Fontes de dados">
              {fontes.fontes.map((fonte) => (
                <tr key={fonte.nome}>
                  <td>{fonte.nome}</td>
                  <td>{fonte.detalhe}</td>
                  <td>{fonte.atualizacao}</td>
                  <td>
                    <a href={fonte.link} target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                  </td>
                </tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Editais por portal de origem">
            {fontes.portais.length ? (
              <Table head={['Portal', 'Editais']} label="Editais por portal">
                {fontes.portais.map((portal) => (
                  <tr key={portal.portal}>
                    <td>{portal.portal}</td>
                    <td>{formatNumber(portal.total)}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nenhum edital coletado ainda.</Empty>
            )}
          </Panel>
        </>
      )}
    </Resource>
  );
}
