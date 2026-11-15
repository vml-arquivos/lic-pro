'use client';

import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
import { brl } from '../../../lib/money';
import type { Modulo } from '../../../lib/modulo';
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

type Finance = {
  cobranca: { ligada: boolean; ambiente: string; webhook_url: string | null };
  receita: {
    mes_centavos: string;
    d30_centavos: string;
    total_centavos: string;
    pagamentos: number;
  };
  assinaturas: {
    ativas: number;
    em_atraso: number;
    aguardando_pagamento: number;
    mrr_centavos: string;
  };
  curso: { vendidos: number; vendidos_30d: number; aguardando: number; a_revisar: number };
  funil_30d: { criadas: number; pagas: number };
  receita_por_mes: Array<{ mes: string; centavos: string; pagamentos: number }>;
  recentes: Array<{
    id: string;
    tipo: 'curso' | 'assinatura';
    status: string;
    comprador_nome: string | null;
    comprador_email: string | null;
    valor_centavos: string | number;
    created_at: string;
    pago_em: string | null;
    resultado_liberacao: string | null;
    plano: string;
  }>;
};

const STATUS_TONE: Record<string, string> = {
  paga: 'ok',
  pendente: 'warn',
  vencida: 'bad',
  reembolsada: 'muted',
  cancelada: 'muted',
};

function monthLabel(value: string): string {
  const [year, month] = value.split('-');
  return `${month}/${(year ?? '').slice(2)}`;
}

export function FinanceAdmin({ modulo = 'profissional' }: Readonly<{ modulo?: Modulo }>) {
  const [data, reload] = useResource<Finance>(`/admin/financeiro?modulo=${modulo}`);
  const doCurso = modulo === 'curso';
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function release(id: string) {
    if (
      !window.confirm('Confirmar que o pagamento foi recebido fora do sistema e liberar o acesso?')
    ) {
      return;
    }
    setBusy(id);
    setMessage(null);
    try {
      await send('POST', `/admin/cobrancas/${id}/liberar-manual`);
      setMessage({ kind: 'success', text: 'Acesso liberado.' });
      reload();
    } catch (cause) {
      setMessage({ kind: 'error', text: errorText(cause) });
    } finally {
      setBusy('');
    }
  }

  return (
    <Resource value={data}>
      {(info) => {
        const max = Math.max(1, ...info.receita_por_mes.map((row) => Number(row.centavos)));
        const conversion = info.funil_30d.criadas
          ? Math.round((info.funil_30d.pagas / info.funil_30d.criadas) * 100)
          : 0;
        return (
          <>
            {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
            {!info.cobranca.ligada ? (
              <Alert kind="info">
                A cobrança online está desligada: faltam as chaves do Asaas no servidor. Os números
                abaixo só mostram o que já foi registrado.
              </Alert>
            ) : null}

            <section className="ui-kpis" aria-label="Resumo financeiro">
              <Kpi label="Receita do mês" value={brl(info.receita.mes_centavos)} tone="ok" />
              <Kpi label="Últimos 30 dias" value={brl(info.receita.d30_centavos)} />
              {doCurso ? (
                <>
                  <Kpi
                    label="Curso vendido"
                    value={formatNumber(info.curso.vendidos)}
                    hint={`${formatNumber(info.curso.vendidos_30d)} nos últimos 30 dias`}
                  />
                  <Kpi
                    label="Aguardando pagamento"
                    value={formatNumber(info.curso.aguardando)}
                    tone={info.curso.aguardando ? 'warn' : undefined}
                  />
                </>
              ) : (
                <>
                  <Kpi
                    label="Receita recorrente (MRR)"
                    value={brl(info.assinaturas.mrr_centavos)}
                    hint="assinaturas pagas, por mês"
                  />
                  <Kpi label="Assinantes ativos" value={formatNumber(info.assinaturas.ativas)} />
                  <Kpi
                    label="Em atraso"
                    value={formatNumber(info.assinaturas.em_atraso)}
                    tone={info.assinaturas.em_atraso ? 'warn' : undefined}
                  />
                </>
              )}
              <Kpi
                label="Conversão (30 dias)"
                value={`${conversion}%`}
                hint={`${info.funil_30d.pagas} pagas de ${info.funil_30d.criadas} cobranças`}
              />
            </section>

            {doCurso && info.curso.a_revisar ? (
              <Alert kind="error">
                {info.curso.a_revisar} compra(s) do curso pagas precisam de revisão: o e-mail já
                tinha conta de outro tipo. Confira em Alunos e turmas.
              </Alert>
            ) : null}

            <Panel
              title="Receita por mês"
              description="Pagamentos confirmados nos últimos 6 meses."
            >
              {info.receita_por_mes.length ? (
                <ol className="fin-bars" aria-label="Receita por mês">
                  {info.receita_por_mes.map((row) => (
                    <li key={row.mes}>
                      <span className="fin-bar-value">{brl(row.centavos)}</span>
                      <span
                        className="fin-bar"
                        style={{ height: `${Math.max(4, (Number(row.centavos) / max) * 100)}%` }}
                      />
                      <span className="fin-bar-label">{monthLabel(row.mes)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>Nenhum pagamento confirmado ainda.</Empty>
              )}
            </Panel>

            <Panel title="Cobranças recentes">
              {info.recentes.length ? (
                <Table
                  label="Cobranças recentes"
                  head={['Data', 'Quem', 'Produto', 'Valor', 'Situação', '']}
                >
                  {info.recentes.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.created_at, true)}</td>
                      <td>
                        <strong>{row.comprador_nome ?? '—'}</strong>
                        <small>{row.comprador_email ?? ''}</small>
                      </td>
                      <td>{row.plano}</td>
                      <td>{brl(row.valor_centavos)}</td>
                      <td>
                        <Badge tone={STATUS_TONE[row.status] ?? 'muted'}>{row.status}</Badge>
                        {row.resultado_liberacao === 'revisar' ? (
                          <small>Revisar acesso</small>
                        ) : null}
                      </td>
                      <td>
                        {row.status === 'pendente' || row.status === 'vencida' ? (
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost ui-btn-small"
                            disabled={busy === row.id}
                            onClick={() => void release(row.id)}
                          >
                            Liberar manualmente
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>Nenhuma cobrança criada ainda.</Empty>
              )}
            </Panel>

            <Panel title="Ligação com o Asaas">
              <p>
                Ambiente:{' '}
                <strong>
                  {info.cobranca.ambiente === 'production' ? 'produção' : 'testes (sandbox)'}
                </strong>
                {' · '}
                {info.cobranca.ligada ? 'chaves configuradas' : 'chaves ausentes'}
              </p>
              {info.cobranca.webhook_url ? (
                <p className="plan-note">
                  Endereço de avisos (webhook) a cadastrar no Asaas:{' '}
                  <code>{info.cobranca.webhook_url}</code>
                </p>
              ) : (
                <p className="plan-note">
                  Defina a variável API_URL no servidor para mostrar aqui o endereço do webhook.
                </p>
              )}
            </Panel>
          </>
        );
      }}
    </Resource>
  );
}
