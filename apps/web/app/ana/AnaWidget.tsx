'use client';

import { useState } from 'react';

export function AnaWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  async function askAna() {
    const question = message.trim();
    if (!question || loading) return;
    setLoading(true);
    setAnswer('');
    const apiUrl = process.env.NEXT_PUBLIC_AI_API_URL;
    try {
      if (!apiUrl) {
        setAnswer(
          'Posso ajudar a organizar a leitura. Ainda não encontrei uma conexão configurada com o Reader; confira o edital e os anexos na fonte oficial.',
        );
        return;
      }
      const response = await fetch(`${apiUrl}/ana/chat/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenant_id: '00000000-0000-0000-0000-000000000001',
          user_id: '00000000-0000-0000-0000-000000000002',
          mensagem: question,
        }),
      });
      if (!response.ok) throw new Error('ana_unavailable');
      const raw = await response.text();
      const dataLine = raw
        .split('\n')
        .find((line) => line.startsWith('data: {'))
        ?.replace(/^data: /, '');
      setAnswer(dataLine ? ((JSON.parse(dataLine) as { texto?: string }).texto ?? raw) : raw);
    } catch {
      setAnswer('Não consegui conectar à Ana agora. Tente novamente e confirme a fonte oficial.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className={`ana-widget ${open ? 'open' : ''}`} aria-label="Assistente Ana">
      {open ? (
        <div className="ana-panel">
          <div className="ana-panel-heading">
            <div>
              <p className="eyebrow">Ana</p>
              <strong>Ajuda de leitura</strong>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar Ana">
              ×
            </button>
          </div>
          <p className="ana-disclaimer">
            Apoio de leitura, sem conclusão jurídica ou promessa de resultado.
          </p>
          <div className="ana-answer" aria-live="polite">
            {answer || 'Pergunte sobre um conceito, um edital ou os próximos pontos para conferir.'}
          </div>
          <div className="ana-input-row">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void askAna();
              }}
              placeholder="Ex.: o que é habilitação?"
              aria-label="Mensagem para Ana"
            />
            <button type="button" onClick={() => void askAna()} disabled={loading}>
              {loading ? '…' : 'Enviar'}
            </button>
          </div>
        </div>
      ) : null}
      <button className="ana-fab" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Fechar Ana' : 'Falar com Ana'}
      </button>
    </aside>
  );
}
