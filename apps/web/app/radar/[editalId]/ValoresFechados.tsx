'use client';

import { useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { reais } from '../../../lib/money';
import { Alert, Kpi, Table, formatDate } from '../../components/ui';
import { SituacaoDoDado, type MetaDoDado } from './SituacaoDoDado';

type Resultado = {
  numero: string;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario_estimado: number | null;
  resultado: {
    valor_unitario_homologado: number;
    desconto_pct: number | null;
    fornecedor: string | null;
    data: string | null;
  } | null;
};
type Resposta = {
  itens: Resultado[];
  resumo: {
    itens: number;
    com_resultado: number;
    total_estimado: number | null;
    total_homologado: number | null;
    economia_pct: number | null;
  };
  fonte: { nome: string; consultado_em: string };
  estado?: 'publicado' | 'parcial' | 'aguardando_publicacao' | 'sem_registro';
  cobertura?: {
    itens_total: number;
    consultados: number;
    limite: number;
    publicados: number;
    sem_registro: number;
    falhas: number;
  };
  dados?: MetaDoDado | null;
};

const SEM_RESULTADO: Record<string, string> = {
  aguardando_publicacao: 'Aguardando a publicação do resultado.',
  sem_registro: 'O PNCP não tem resultado registrado para este edital.',
};

const pct = (value: number | null | undefined) =>
  typeof value === 'number' ? `${value.toLocaleString('pt-BR')}%` : '—';

/** Valor estimado × valor fechado de cada item, com o vencedor, direto do PNCP. */
export function ValoresFechados({
  editalId,
  automatico = false,
}: Readonly<{ editalId: string; automatico?: boolean }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<Resposta | null>(null);

  async function load() {
    setBusy(true);
    setError('');
    try {
      setData(await api<Resposta>(`/editais/${editalId}/resultados`));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (automatico) void load();
  }, [editalId, automatico]);

  return (
    <div className="rd-fechados">
      <h3>Valores fechados no pregão</h3>
      {automatico && busy && !data ? <p role="status">Buscando os valores…</p> : null}
      {automatico && !busy ? null : (
        <p>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-small"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? 'Buscando…' : data ? 'Atualizar valores' : 'Ver valores fechados'}
          </button>
        </p>
      )}
      {error ? <Alert kind="error">{error}</Alert> : null}
      {data ? (
        <SituacaoDoDado
          fonte="PNCP"
          meta={data.dados}
          cobertura={
            data.cobertura
              ? `${data.cobertura.publicados} de ${data.cobertura.consultados} itens com resultado` +
                (data.cobertura.consultados < data.cobertura.itens_total
                  ? ` (consultados ${data.cobertura.consultados} de ${data.cobertura.itens_total})`
                  : '') +
                (data.cobertura.falhas ? `, ${data.cobertura.falhas} sem resposta` : '')
              : null
          }
        />
      ) : null}
      {data ? (
        data.resumo.com_resultado ? (
          <>
            <section className="ui-kpis" aria-label="Resumo dos valores fechados">
              <Kpi
                label="Itens com resultado"
                value={`${data.resumo.com_resultado} de ${data.resumo.itens}`}
              />
              <Kpi label="Estimado" value={reais(data.resumo.total_estimado)} />
              <Kpi label="Fechou em" value={reais(data.resumo.total_homologado)} tone="ok" />
              <Kpi label="Economia" value={pct(data.resumo.economia_pct)} />
            </section>
            <Table
              label="Valores fechados por item"
              head={['Item', 'Estimado (unid.)', 'Fechou (unid.)', 'Desconto', 'Vencedor']}
            >
              {data.itens.map((item) => (
                <tr key={item.numero}>
                  <td>
                    <strong>{item.numero}</strong> {item.descricao}
                  </td>
                  <td>{reais(item.valor_unitario_estimado)}</td>
                  <td>
                    {item.resultado ? (
                      <strong>{reais(item.resultado.valor_unitario_homologado)}</strong>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{item.resultado ? pct(item.resultado.desconto_pct) : '—'}</td>
                  <td>
                    {item.resultado
                      ? (item.resultado.fornecedor ?? '—')
                      : 'Sem resultado publicado'}
                    {item.resultado?.data ? <small>{formatDate(item.resultado.data)}</small> : null}
                  </td>
                </tr>
              ))}
            </Table>
          </>
        ) : (
          <p>{(data.estado && SEM_RESULTADO[data.estado]) || 'Ainda sem resultado publicado.'}</p>
        )
      ) : null}
    </div>
  );
}
