'use client';

import { useState } from 'react';
import { errorText, send } from '../../../lib/api';

/** Ativa ou desativa uma conta. Desativar pede uma segunda confirmação na própria tela. */
export function ActiveToggle({
  userId,
  ativo,
  onDone,
  onError,
}: Readonly<{
  userId: string;
  ativo: boolean;
  onDone: () => void;
  onError: (message: string) => void;
}>) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    try {
      await send('PATCH', `/platform/users/${userId}/active`, { ativo: !ativo });
      setConfirming(false);
      onDone();
    } catch (cause) {
      onError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  if (ativo && !confirming) {
    return (
      <button
        type="button"
        className="ui-btn ui-btn-small ui-btn-danger"
        onClick={() => setConfirming(true)}
      >
        Desativar
      </button>
    );
  }
  if (ativo && confirming) {
    return (
      <span className="ui-table-actions">
        <button
          type="button"
          className="ui-btn ui-btn-small ui-btn-danger"
          disabled={busy}
          onClick={() => void apply()}
        >
          Confirmar
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-small ui-btn-ghost"
          onClick={() => setConfirming(false)}
        >
          Cancelar
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="ui-btn ui-btn-small ui-btn-ghost"
      disabled={busy}
      onClick={() => void apply()}
    >
      Reativar
    </button>
  );
}
