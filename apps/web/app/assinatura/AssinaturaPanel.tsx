'use client';

import { useState } from 'react';
import { errorText, send } from '../../lib/api';
import { brl, CICLO_LABEL, maskDocumento } from '../../lib/money';
import type { PublicPlan } from '../../lib/public-plans';
import { CouponField } from '../components/CouponField';
import { Alert, Badge, Empty, Panel, Resource, formatDate, useResource } from '../components/ui';

type Minha = {
  vendas_ativas: boolean;
  pode_testar: boolean;
  assinatura: {
    status: 'trial' | 'ativa' | 'past_due' | 'cancelada' | 'expirada';
    inicio_em: string;
    fim_em: string | null;
    limites: Record<string, number>;
    slug: string;
    nome: string;
    preco_centavos: number;
    ciclo: string;
  } | null;
  pagamento_pendente: { status: string; link_pagamento: string | null; plano: string } | null;
  planos: PublicPlan[];
};

const STATUS: Record<string, { label: string; tone: string }> = {
  trial: { label: 'Em teste grátis', tone: 'warn' },
  ativa: { label: 'Ativa', tone: 'ok' },
  past_due: { label: 'Pagamento em atraso', tone: 'bad' },
  cancelada: { label: 'Cancelada', tone: 'muted' },
  expirada: { label: 'Teste terminado', tone: 'muted' },
};

function daysLeft(value: string | null): number | null {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export function AssinaturaPanel() {
  const [data, reload] = useResource<Minha>('/billing/minha-assinatura');
  const [selected, setSelected] = useState<string | null>(null);
  const [documento, setDocumento] = useState('');
  const [cupom, setCupom] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{
    kind: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function startTrial(slug: string) {
    setBusy(`trial:${slug}`);
    setMessage(null);
    try {
      await send('POST', '/billing/teste-gratis', { plano: slug });
      setMessage({
        kind: 'success',
        text: 'Teste grátis liberado. Aproveite o Radar, as buscas salvas e a agenda.',
      });
      reload();
    } catch (cause) {
      setMessage({ kind: 'error', text: errorText(cause) });
    } finally {
      setBusy('');
    }
  }

  async function subscribe(slug: string) {
    setBusy(slug);
    setMessage(null);
    try {
      const result = await send<{ link_pagamento: string | null }>('POST', '/billing/assinar', {
        plano: slug,
        documento,
        ...(cupom ? { cupom } : {}),
      });
      setMessage({
        kind: 'success',
        text: result.link_pagamento
          ? 'Assinatura criada. Abra o pagamento para concluir (Pix, boleto ou cartão).'
          : 'Assinatura criada. O link de pagamento aparecerá aqui em instantes.',
      });
      setSelected(null);
      if (result.link_pagamento) window.open(result.link_pagamento, '_blank', 'noopener');
      reload();
    } catch (cause) {
      setMessage({ kind: 'error', text: errorText(cause) });
    } finally {
      setBusy('');
    }
  }

  async function cancel() {
    setBusy('cancelar');
    setMessage(null);
    try {
      await send('POST', '/billing/cancelar');
      setConfirmCancel(false);
      setMessage({ kind: 'info', text: 'Assinatura cancelada. Nenhuma nova cobrança será feita.' });
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
        const status = info.assinatura ? STATUS[info.assinatura.status] : null;
        const active =
          info.assinatura?.status === 'ativa' || info.assinatura?.status === 'past_due';
        const left = info.assinatura?.status === 'trial' ? daysLeft(info.assinatura.fim_em) : null;
        return (
          <>
            {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
            {info.assinatura && status ? (
              <Panel title="Sua assinatura">
                <p>
                  <strong>{info.assinatura.nome}</strong>{' '}
                  <Badge tone={status.tone}>{status.label}</Badge>
                </p>
                <p className="plan-note">
                  Desde {formatDate(info.assinatura.inicio_em)}
                  {info.assinatura.fim_em ? ` · até ${formatDate(info.assinatura.fim_em)}` : ''}
                  {info.assinatura.limites.buscas_salvas
                    ? ` · até ${info.assinatura.limites.buscas_salvas} buscas salvas`
                    : ''}
                </p>
                {left !== null ? (
                  <Alert kind="info">
                    {left === 0
                      ? 'Seu teste grátis termina hoje.'
                      : `Faltam ${left} dia(s) do seu teste grátis.`}{' '}
                    Para continuar, escolha um plano abaixo.
                  </Alert>
                ) : null}
                {info.assinatura.status === 'expirada' ? (
                  <Alert kind="info">
                    Seu teste terminou. Suas buscas e dados continuam guardados; para criar novas
                    buscas, escolha um plano abaixo.
                  </Alert>
                ) : null}
                {info.assinatura.status === 'past_due' ? (
                  <Alert kind="error">
                    A última mensalidade não foi paga. Regularize pelo link enviado pelo meio de
                    pagamento para não perder o acesso.
                  </Alert>
                ) : null}
                {active ? (
                  confirmCancel ? (
                    <div className="ui-form-actions">
                      <button
                        className="ui-btn ui-btn-danger ui-btn-small"
                        type="button"
                        disabled={busy === 'cancelar'}
                        onClick={() => void cancel()}
                      >
                        Confirmar cancelamento
                      </button>
                      <button
                        className="ui-btn ui-btn-ghost ui-btn-small"
                        type="button"
                        onClick={() => setConfirmCancel(false)}
                      >
                        Voltar
                      </button>
                    </div>
                  ) : (
                    <button
                      className="ui-btn ui-btn-ghost ui-btn-small"
                      type="button"
                      onClick={() => setConfirmCancel(true)}
                    >
                      Cancelar assinatura
                    </button>
                  )
                ) : null}
              </Panel>
            ) : null}

            {info.pagamento_pendente ? (
              <Panel title="Pagamento pendente">
                <p>
                  Plano <strong>{info.pagamento_pendente.plano}</strong> aguardando pagamento.
                </p>
                {info.pagamento_pendente.link_pagamento ? (
                  <a
                    className="ui-btn"
                    href={info.pagamento_pendente.link_pagamento}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir pagamento
                  </a>
                ) : null}
              </Panel>
            ) : null}

            <Panel
              title="Planos"
              description="Cobrança recorrente por Pix, boleto ou cartão. Sem fidelidade: cancele quando quiser."
            >
              {!info.vendas_ativas ? (
                <Alert kind="info">
                  A contratação online ainda não está habilitada. Fale com a equipe para ativar o
                  seu plano.
                </Alert>
              ) : null}
              {info.planos.length ? (
                <div className="plan-grid">
                  {info.planos.map((plan) => {
                    const current = info.assinatura?.slug === plan.slug && active;
                    const canTrial = info.pode_testar && plan.trial_dias > 0;
                    const open = selected === plan.slug;
                    return (
                      <article className={`plan ${current ? 'plan-current' : ''}`} key={plan.slug}>
                        <h3>{plan.nome}</h3>
                        <p className="plan-desc">{plan.descricao}</p>
                        <p className="plan-price">
                          <strong>{brl(plan.preco_centavos)}</strong>
                          <small>{CICLO_LABEL[plan.ciclo]}</small>
                        </p>
                        <ul className="plan-list">
                          {plan.beneficios.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                        {current ? (
                          <Badge tone="ok">Seu plano</Badge>
                        ) : open ? (
                          <div className="ui-form">
                            <label>
                              CPF ou CNPJ de quem paga
                              <input
                                inputMode="numeric"
                                value={documento}
                                onChange={(event) =>
                                  setDocumento(maskDocumento(event.target.value))
                                }
                                placeholder="Só para emitir a cobrança"
                              />
                            </label>
                            <CouponField plano={plan.slug} onApplied={setCupom} />
                            <div className="ui-form-actions">
                              <button
                                type="button"
                                className="ui-btn"
                                disabled={documento.replace(/\D/g, '').length < 11 || busy !== ''}
                                onClick={() => void subscribe(plan.slug)}
                              >
                                {busy === plan.slug ? 'Criando…' : 'Ir para o pagamento'}
                              </button>
                              <button
                                type="button"
                                className="ui-btn ui-btn-ghost"
                                onClick={() => setSelected(null)}
                              >
                                Voltar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="ui-form-actions">
                            {canTrial ? (
                              <button
                                type="button"
                                className="ui-btn"
                                disabled={busy !== ''}
                                onClick={() => void startTrial(plan.slug)}
                              >
                                {busy === `trial:${plan.slug}`
                                  ? 'Liberando…'
                                  : `Testar grátis por ${plan.trial_dias} dias`}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={canTrial ? 'ui-btn ui-btn-ghost' : 'ui-btn'}
                              disabled={
                                !info.vendas_ativas ||
                                active ||
                                Boolean(info.pagamento_pendente) ||
                                busy !== ''
                              }
                              onClick={() => {
                                setCupom('');
                                setSelected(plan.slug);
                              }}
                            >
                              Assinar
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty>Nenhum plano está à venda agora.</Empty>
              )}
            </Panel>
          </>
        );
      }}
    </Resource>
  );
}
