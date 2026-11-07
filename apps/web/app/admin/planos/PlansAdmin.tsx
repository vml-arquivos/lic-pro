'use client';

import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
import { brl } from '../../../lib/money';
import { Alert, Badge, Panel, Resource, Table, useResource } from '../../components/ui';

type Plan = {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  tipo: 'assinatura' | 'curso';
  preco_centavos: number | string;
  ciclo: 'mensal' | 'anual' | 'unico';
  beneficios: string[];
  limites: Record<string, number>;
  turma_nome: string | null;
  ordem: number;
  trial_dias: number;
  ativo: boolean;
};
type Payload = { vendas_ativas: boolean; planos: Plan[] };

export function PlansAdmin() {
  const [data, reload] = useResource<Payload>('/admin/planos');
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  return (
    <Resource value={data}>
      {(info) => (
        <>
          {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
          {!info.vendas_ativas ? (
            <Alert kind="info">
              A cobrança online está desligada (faltam as chaves do Asaas). Você já pode preparar os
              planos; eles só serão vendidos quando a cobrança estiver ligada.
            </Alert>
          ) : null}
          <Panel title="Planos">
            <Table label="Planos" head={['Plano', 'Tipo', 'Preço', 'Situação', '']}>
              {info.planos.map((plan) => (
                <tr key={plan.slug}>
                  <td>
                    <strong>{plan.nome}</strong>
                    <small>{plan.slug}</small>
                  </td>
                  <td>{plan.tipo === 'curso' ? 'Curso' : 'Assinatura'}</td>
                  <td>
                    {brl(plan.preco_centavos)}
                    <small>
                      {plan.ciclo === 'mensal'
                        ? 'por mês'
                        : plan.ciclo === 'anual'
                          ? 'por ano'
                          : 'único'}
                    </small>
                  </td>
                  <td>
                    <Badge tone={plan.ativo ? 'ok' : 'muted'}>
                      {plan.ativo ? 'À venda' : 'Desativado'}
                    </Badge>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-small"
                      onClick={() => setEditing(editing === plan.slug ? null : plan.slug)}
                    >
                      {editing === plan.slug ? 'Fechar' : 'Editar'}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          </Panel>
          {info.planos
            .filter((plan) => plan.slug === editing)
            .map((plan) => (
              <PlanForm
                key={plan.slug}
                plan={plan}
                onDone={(result) => {
                  setMessage(result);
                  if (result.kind === 'success') {
                    setEditing(null);
                    reload();
                  }
                }}
              />
            ))}
        </>
      )}
    </Resource>
  );
}

function PlanForm({
  plan,
  onDone,
}: Readonly<{
  plan: Plan;
  onDone: (result: { kind: 'success' | 'error'; text: string }) => void;
}>) {
  const [nome, setNome] = useState(plan.nome);
  const [descricao, setDescricao] = useState(plan.descricao);
  const [preco, setPreco] = useState(
    (Number(plan.preco_centavos) / 100).toFixed(2).replace('.', ','),
  );
  const [beneficios, setBeneficios] = useState(plan.beneficios.join('\n'));
  const [buscas, setBuscas] = useState(String(plan.limites.buscas_salvas ?? ''));
  const [trial, setTrial] = useState(String(plan.trial_dias ?? 0));
  const [ativo, setAtivo] = useState(plan.ativo);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const cents = Math.round(Number(preco.replace(/\./g, '').replace(',', '.')) * 100);
      if (!Number.isFinite(cents) || cents < 0)
        throw new Error('Informe um preço válido, como 197,00.');
      const limites: Record<string, number> = {};
      if (plan.tipo === 'assinatura' && buscas.trim()) limites.buscas_salvas = Number(buscas);
      await send('PUT', '/admin/planos', {
        slug: plan.slug,
        nome,
        descricao,
        tipo: plan.tipo,
        preco_centavos: cents,
        ciclo: plan.ciclo,
        beneficios: beneficios
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        limites,
        turma_nome: plan.turma_nome,
        ordem: plan.ordem,
        trial_dias: plan.tipo === 'assinatura' ? Number(trial || 0) : 0,
        ativo,
      });
      onDone({ kind: 'success', text: `Plano “${nome}” salvo.` });
    } catch (cause) {
      onDone({
        kind: 'error',
        text: cause instanceof Error ? errorText(cause) : 'Não foi possível salvar.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={`Editar: ${plan.nome}`}
      description="Mudanças valem para novas vendas; quem já assinou mantém o que contratou."
    >
      <form className="ui-form plan-edit" onSubmit={(event) => void save(event)}>
        <label>
          Nome
          <input
            required
            minLength={2}
            maxLength={120}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </label>
        <label>
          Descrição curta
          <input
            required
            minLength={2}
            maxLength={500}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>
        <label>
          Preço (R$)
          {plan.ciclo === 'mensal' ? ' por mês' : plan.ciclo === 'anual' ? ' por ano' : ''}
          <input
            required
            inputMode="decimal"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
          />
        </label>
        {plan.tipo === 'assinatura' ? (
          <label>
            Buscas salvas permitidas
            <input
              inputMode="numeric"
              value={buscas}
              onChange={(e) => setBuscas(e.target.value.replace(/\D/g, ''))}
              placeholder="Sem limite se vazio"
            />
          </label>
        ) : null}
        {plan.tipo === 'assinatura' ? (
          <label>
            Dias de teste grátis (0 = sem teste)
            <input
              inputMode="numeric"
              value={trial}
              onChange={(e) => setTrial(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
          </label>
        ) : null}
        <label>
          O que inclui (um item por linha)
          <textarea rows={5} value={beneficios} onChange={(e) => setBeneficios(e.target.value)} />
        </label>
        <label className="invite-check">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          <span>Plano à venda (aparece para os clientes)</span>
        </label>
        <div className="ui-form-actions">
          <button className="ui-btn" type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar plano'}
          </button>
        </div>
      </form>
    </Panel>
  );
}
