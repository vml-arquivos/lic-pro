'use client';

import { useState } from 'react';
import { errorText, send } from '../../../lib/api';
import { brl } from '../../../lib/money';
import {
  Alert,
  Badge,
  Empty,
  Panel,
  Resource,
  Table,
  formatDate,
  useResource,
} from '../../components/ui';

type Cupom = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: 'percentual' | 'fixo';
  valor: number;
  plano_slugs: string[] | null;
  max_usos: number | null;
  valido_ate: string | null;
  ativo: boolean;
  usos: number;
  pagos: number;
};
type Payload = { cupons: Cupom[]; planos: Array<{ slug: string; nome: string }> };

function valueLabel(cupom: Cupom): string {
  return cupom.tipo === 'percentual' ? `${cupom.valor}%` : brl(cupom.valor);
}

export function CouponsAdmin() {
  const [data, reload] = useResource<Payload>('/admin/cupons');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<'percentual' | 'fixo'>('percentual');
  const [valor, setValor] = useState('');
  const [maxUsos, setMaxUsos] = useState('');
  const [validoAte, setValidoAte] = useState('');
  const [planos, setPlanos] = useState<string[]>([]);

  async function save(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await send('PUT', '/admin/cupons', body);
      setMessage({ kind: 'success', text: ok });
      reload();
      return true;
    } catch (cause) {
      setMessage({ kind: 'error', text: errorText(cause) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const amount =
      tipo === 'percentual'
        ? Number(valor.replace(',', '.'))
        : Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage({ kind: 'error', text: 'Informe um valor de desconto válido.' });
      return;
    }
    const done = await save(
      {
        codigo,
        descricao,
        tipo,
        valor: Math.round(amount),
        plano_slugs: planos.length ? planos : null,
        max_usos: maxUsos ? Number(maxUsos) : null,
        valido_ate: validoAte ? new Date(`${validoAte}T23:59:59-03:00`).toISOString() : null,
        ativo: true,
      },
      `Cupom ${codigo.toUpperCase()} salvo.`,
    );
    if (done) {
      setCodigo('');
      setDescricao('');
      setValor('');
      setMaxUsos('');
      setValidoAte('');
      setPlanos([]);
    }
  }

  return (
    <Resource value={data}>
      {(info) => (
        <>
          {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
          <Panel
            title="Novo cupom"
            description="O cupom reduz o valor de cada cobrança do plano escolhido (na assinatura, vale para todas as mensalidades). O valor final nunca fica abaixo de R$ 5,00."
          >
            <form className="ui-form" onSubmit={(event) => void create(event)}>
              <label>
                Código
                <input
                  required
                  minLength={3}
                  maxLength={32}
                  value={codigo}
                  onChange={(event) =>
                    setCodigo(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))
                  }
                  placeholder="Ex.: LANCAMENTO20"
                />
              </label>
              <label>
                Tipo de desconto
                <select
                  value={tipo}
                  onChange={(event) => setTipo(event.target.value as 'percentual' | 'fixo')}
                >
                  <option value="percentual">Porcentagem (1% a 95%)</option>
                  <option value="fixo">Valor fixo em reais</option>
                </select>
              </label>
              <label>
                {tipo === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'}
                <input
                  required
                  inputMode="decimal"
                  value={valor}
                  onChange={(event) => setValor(event.target.value)}
                  placeholder={tipo === 'percentual' ? '20' : '50,00'}
                />
              </label>
              <label>
                Limite de usos (opcional)
                <input
                  inputMode="numeric"
                  value={maxUsos}
                  onChange={(event) => setMaxUsos(event.target.value.replace(/\D/g, ''))}
                  placeholder="Sem limite"
                />
              </label>
              <label>
                Vale até (opcional)
                <input
                  type="date"
                  value={validoAte}
                  onChange={(event) => setValidoAte(event.target.value)}
                />
              </label>
              <label>
                Anotação interna (opcional)
                <input
                  maxLength={200}
                  value={descricao}
                  onChange={(event) => setDescricao(event.target.value)}
                />
              </label>
              <fieldset className="coupon-plans">
                <legend>Vale para (nenhum marcado = todos os planos)</legend>
                {info.planos.map((plan) => (
                  <label className="invite-check" key={plan.slug}>
                    <input
                      type="checkbox"
                      checked={planos.includes(plan.slug)}
                      onChange={(event) =>
                        setPlanos((current) =>
                          event.target.checked
                            ? [...current, plan.slug]
                            : current.filter((slug) => slug !== plan.slug),
                        )
                      }
                    />
                    <span>{plan.nome}</span>
                  </label>
                ))}
              </fieldset>
              <div className="ui-form-actions">
                <button className="ui-btn" type="submit" disabled={busy}>
                  {busy ? 'Salvando…' : 'Criar cupom'}
                </button>
              </div>
            </form>
          </Panel>

          <Panel title="Cupons criados">
            {info.cupons.length ? (
              <Table
                label="Cupons"
                head={['Código', 'Desconto', 'Usos', 'Validade', 'Situação', '']}
              >
                {info.cupons.map((cupom) => (
                  <tr key={cupom.id}>
                    <td>
                      <strong>{cupom.codigo}</strong>
                      <small>
                        {cupom.plano_slugs?.length
                          ? cupom.plano_slugs.join(', ')
                          : 'Todos os planos'}
                        {cupom.descricao ? ` · ${cupom.descricao}` : ''}
                      </small>
                    </td>
                    <td>{valueLabel(cupom)}</td>
                    <td>
                      {cupom.usos}
                      {cupom.max_usos ? ` de ${cupom.max_usos}` : ''}
                      <small>{cupom.pagos} paga(s)</small>
                    </td>
                    <td>{cupom.valido_ate ? formatDate(cupom.valido_ate) : 'Sem prazo'}</td>
                    <td>
                      <Badge tone={cupom.ativo ? 'ok' : 'muted'}>
                        {cupom.ativo ? 'Ativo' : 'Desativado'}
                      </Badge>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost ui-btn-small"
                        disabled={busy}
                        onClick={() =>
                          void save(
                            {
                              codigo: cupom.codigo,
                              descricao: cupom.descricao,
                              tipo: cupom.tipo,
                              valor: cupom.valor,
                              plano_slugs: cupom.plano_slugs,
                              max_usos: cupom.max_usos,
                              valido_ate: cupom.valido_ate,
                              ativo: !cupom.ativo,
                            },
                            cupom.ativo ? 'Cupom desativado.' : 'Cupom reativado.',
                          )
                        }
                      >
                        {cupom.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nenhum cupom criado ainda.</Empty>
            )}
          </Panel>
        </>
      )}
    </Resource>
  );
}
