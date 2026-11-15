'use client';

import { useState } from 'react';
import { errorText, send } from '../../lib/api';
import { brl } from '../../lib/money';

type Preview =
  | { valido: false; mensagem: string }
  | {
      valido: true;
      codigo: string;
      desconto_centavos: number;
      valor_original_centavos: number;
      valor_final_centavos: number;
    };

/**
 * Campo de cupom: confere o código no servidor e mostra o valor final antes do pagamento.
 * Só entrega ao formulário o código que foi aceito (`onApplied`); o servidor confere de novo.
 */
export function CouponField({
  plano,
  suffix,
  onApplied,
}: Readonly<{ plano: string; suffix?: string; onApplied: (codigo: string) => void }>) {
  const [codigo, setCodigo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState('');

  async function apply() {
    if (!codigo.trim()) return;
    setBusy(true);
    setError('');
    try {
      const preview = await send<Preview>('POST', '/public/cupom/validar', { codigo, plano });
      setResult(preview);
      onApplied(preview.valido ? preview.codigo : '');
    } catch (cause) {
      setResult(null);
      onApplied('');
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="coupon-line">
      <label>
        Cupom de desconto (opcional)
        <span className="coupon-row">
          <input
            value={codigo}
            autoComplete="off"
            onChange={(event) => {
              setCodigo(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''));
              setResult(null);
              onApplied('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void apply();
              }
            }}
          />
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-small"
            disabled={busy || !codigo.trim()}
            onClick={() => void apply()}
          >
            {busy ? 'Conferindo…' : 'Aplicar'}
          </button>
        </span>
      </label>
      {result?.valido ? (
        <p className="coupon-ok" role="status">
          Cupom aplicado: − {brl(result.desconto_centavos)}. Você paga{' '}
          {brl(result.valor_final_centavos)}
          {suffix ?? ''}.
        </p>
      ) : null}
      {result && !result.valido ? (
        <p className="plan-note" role="status">
          {result.mensagem}
        </p>
      ) : null}
      {error ? <p className="plan-note">{error}</p> : null}
    </div>
  );
}
