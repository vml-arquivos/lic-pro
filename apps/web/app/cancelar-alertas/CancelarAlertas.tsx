'use client';

import { useState } from 'react';
import { errorText, send } from '../../lib/api';
import { Alert, Panel } from '../components/ui';

export function CancelarAlertas({ token }: Readonly<{ token: string }>) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function confirm() {
    setState('busy');
    try {
      await send('POST', '/public/alerts/unsubscribe', { token });
      setState('done');
    } catch (error) {
      setMessage(errorText(error));
      setState('error');
    }
  }

  if (!token)
    return <Alert kind="error">Link incompleto. Use o link do e-mail que você recebeu.</Alert>;
  return (
    <Panel
      title="Parar de receber e-mails de alerta?"
      description="Você continua vendo os avisos no sino e na página Alertas. Para voltar a receber e-mails, ligue a opção em Alertas."
    >
      {state === 'done' ? (
        <Alert kind="success">Pronto. Você não vai mais receber e-mails de alerta.</Alert>
      ) : null}
      {state === 'error' ? (
        <Alert kind="error">{message || 'Link inválido ou expirado.'}</Alert>
      ) : null}
      {state === 'done' ? null : (
        <button className="ui-btn" disabled={state === 'busy'} onClick={() => void confirm()}>
          {state === 'busy' ? 'Cancelando…' : 'Sim, cancelar e-mails'}
        </button>
      )}
    </Panel>
  );
}
