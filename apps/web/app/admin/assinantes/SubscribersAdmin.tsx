'use client';

import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
import { brl } from '../../../lib/money';
import {
  Alert,
  Badge,
  Empty,
  Kpi,
  Panel,
  Resource,
  Table,
  formatDate,
  formatNumber,
  useResource,
} from '../../components/ui';

type Row = {
  id: string;
  cliente: string;
  empresa: string | null;
  contato: string | null;
  plano: string;
  status: 'trial' | 'ativa' | 'past_due' | 'cancelada' | 'expirada';
  inicio_em: string;
  fim_em: string | null;
  pago_centavos: string | number;
  cupom: string | null;
};
type Payload = {
  resumo: {
    total: number;
    ativas: number;
    em_teste: number;
    teste_vencendo_3d: number;
    em_atraso: number;
    encerradas: number;
  };
  assinantes: Row[];
};

const STATUS: Record<Row['status'], { label: string; tone: string }> = {
  trial: { label: 'Em teste', tone: 'warn' },
  ativa: { label: 'Ativa', tone: 'ok' },
  past_due: { label: 'Em atraso', tone: 'bad' },
  cancelada: { label: 'Cancelada', tone: 'muted' },
  expirada: { label: 'Expirada', tone: 'muted' },
};

export function SubscribersAdmin() {
  const [data, reload] = useResource<Payload>('/admin/assinantes');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function adjust(row: Row, acao: 'estender' | 'cancelar' | 'reativar') {
    const text = {
      estender: 'Estender o teste por 7 dias?',
      cancelar: `Cancelar a assinatura de ${row.empresa ?? row.cliente}? Se houver cobrança recorrente, ela é cancelada no Asaas.`,
      reativar: `Reativar ${row.empresa ?? row.cliente} sem cobrança (cortesia)?`,
    }[acao];
    if (!window.confirm(text)) return;
    setBusy(row.id);
    setMessage(null);
    try {
      await send('POST', `/admin/assinaturas/${row.id}/ajustar`, {
        acao,
        ...(acao === 'estender' ? { dias: 7 } : {}),
      });
      setMessage({ kind: 'success', text: 'Pronto, assinatura atualizada.' });
      reload();
    } catch (cause) {
      setMessage({ kind: 'error', text: errorText(cause) });
    } finally {
      setBusy('');
    }
  }

  return (
    <Resource value={data}>
      {(info) => (
        <>
          {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
          <section className="ui-kpis" aria-label="Resumo dos assinantes">
            <Kpi label="Ativas" value={formatNumber(info.resumo.ativas)} tone="ok" />
            <Kpi label="Em teste grátis" value={formatNumber(info.resumo.em_teste)} />
            <Kpi
              label="Teste acaba em até 3 dias"
              value={formatNumber(info.resumo.teste_vencendo_3d)}
              tone={info.resumo.teste_vencendo_3d ? 'warn' : undefined}
              hint="boa hora para falar com eles"
            />
            <Kpi
              label="Em atraso"
              value={formatNumber(info.resumo.em_atraso)}
              tone={info.resumo.em_atraso ? 'warn' : undefined}
            />
            <Kpi label="Encerradas" value={formatNumber(info.resumo.encerradas)} />
          </section>
          <Panel title="Empresas" description="As 300 assinaturas mais recentes.">
            {info.assinantes.length ? (
              <Table label="Assinantes" head={['Empresa', 'Plano', 'Situação', 'Até', 'Pago', '']}>
                {info.assinantes.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.empresa ?? row.cliente}</strong>
                      <small>{row.contato ?? ''}</small>
                    </td>
                    <td>
                      {row.plano}
                      {row.cupom ? <small>Cupom {row.cupom}</small> : null}
                    </td>
                    <td>
                      <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                    </td>
                    <td>{row.fim_em ? formatDate(row.fim_em) : '—'}</td>
                    <td>{brl(row.pago_centavos)}</td>
                    <td>
                      <span className="ui-header-actions">
                        {row.status === 'trial' || row.status === 'expirada' ? (
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost ui-btn-small"
                            disabled={busy === row.id}
                            onClick={() => void adjust(row, 'estender')}
                          >
                            +7 dias
                          </button>
                        ) : null}
                        {row.status !== 'ativa' ? (
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost ui-btn-small"
                            disabled={busy === row.id}
                            onClick={() => void adjust(row, 'reativar')}
                          >
                            Reativar
                          </button>
                        ) : null}
                        {row.status !== 'cancelada' ? (
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost ui-btn-small"
                            disabled={busy === row.id}
                            onClick={() => void adjust(row, 'cancelar')}
                          >
                            Cancelar
                          </button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nenhuma empresa começou teste ou assinatura ainda.</Empty>
            )}
          </Panel>
        </>
      )}
    </Resource>
  );
}
