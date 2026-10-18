'use client';

import { useState } from 'react';

export function AnaWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  async function askAna(questionOverride?: string) {
    const question = (questionOverride ?? message).trim();
    if (!question || loading) return;
    setLoading(true);
    setAnswer('');
    try {
      const response = await fetch('/api/ana/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensagem: question }),
      });
      if (!response.ok) throw new Error('ana_unavailable');
      const raw = await response.text();
      const dataLine = raw
        .split('\n')
        .find((line) => line.startsWith('data: {'))
        ?.replace(/^data: /, '');
      setAnswer(dataLine ? ((JSON.parse(dataLine) as { texto?: string }).texto ?? raw) : raw);
    } catch {
      setAnswer('Não consegui conectar à Ana agora. Entre na conta e confirme a fonte oficial.');
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
              <strong>✦ ANA · sua assistente</strong>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Minimizar Ana">
              −
            </button>
          </div>
          <p className="ana-intro">Olá! Sou a ANA, sua assistente para vendas ao Governo. Em que etapa posso ajudar?</p>
          <div className="ana-quick-actions">
            <button type="button" onClick={() => void askAna('Qual é o próximo passo?')}>Próximo passo</button>
            <button type="button" onClick={() => void askAna('Quais documentos faltam?')}>Documentos</button>
            <button type="button" onClick={() => void askAna('Avaliar uma oportunidade')}>Avaliar oportunidade</button>
            <button type="button" onClick={() => void askAna('Quero automatizar tarefas')}>Automatizar tarefas ⚡</button>
          </div>
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
        {open ? 'Minimizar Ana' : '✦ ANA · sua assistente'}
      </button>
    </aside>
  );
}
