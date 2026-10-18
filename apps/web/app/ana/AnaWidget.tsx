'use client';

import { useState } from 'react';

type ChatMessage = {
  role: 'usuario' | 'assistente';
  text: string;
};

type AnaResponse = {
  conversa_id?: string;
  texto?: string;
};

function assistantMessage(text: string): ChatMessage {
  return { role: 'assistente', text };
}

export function AnaWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([
    assistantMessage('Pergunte sobre licitações, um edital ou o próximo ponto para conferir.'),
  ]);
  const [loading, setLoading] = useState(false);

  async function askAna(questionOverride?: string) {
    const question = (questionOverride ?? message).trim();
    if (!question || loading) return;
    setLoading(true);
    setMessage('');
    setMessages((current) => [...current, { role: 'usuario', text: question }]);
    try {
      const response = await fetch('/api/ana/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensagem: question, conversa_id: conversationId }),
      });
      if (response.status === 401) {
        setMessages((current) => [
          ...current,
          assistantMessage('Entre na sua conta para conversar com a Ana.'),
        ]);
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        const text =
          payload.detail === 'llm_unavailable'
            ? 'A Ana está sem conexão com o provider de IA neste momento.'
            : 'Não consegui concluir esta resposta agora. Tente novamente em instantes.';
        setMessages((current) => [...current, assistantMessage(text)]);
        return;
      }
      const raw = await response.text();
      const dataLine = raw
        .split('\n')
        .find((line) => line.startsWith('data: {'))
        ?.replace(/^data: /, '');
      const data = dataLine ? (JSON.parse(dataLine) as AnaResponse) : {};
      if (data.conversa_id) setConversationId(data.conversa_id);
      setMessages((current) => [
        ...current,
        assistantMessage(data.texto ?? 'A Ana não retornou uma resposta legível.'),
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        assistantMessage(
          'Não consegui conectar à Ana agora. Confirme sua sessão e tente novamente.',
        ),
      ]);
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
          <p className="ana-intro">
            Respostas de apoio, com limites claros. A fonte final continua sendo o edital oficial e
            seus anexos.
          </p>
          <div className="ana-quick-actions">
            <button type="button" onClick={() => void askAna('Qual é o próximo passo?')}>
              Próximo passo
            </button>
            <button type="button" onClick={() => void askAna('Quais documentos devo conferir?')}>
              Documentos
            </button>
            <button type="button" onClick={() => void askAna('Como analisar uma oportunidade?')}>
              Analisar oportunidade
            </button>
          </div>
          <div className="ana-messages" aria-live="polite">
            {messages.map((item, index) => (
              <div className={`ana-message ${item.role}`} key={`${item.role}-${index}`}>
                <small>{item.role === 'usuario' ? 'Você' : 'Ana'}</small>
                <p>{item.text}</p>
              </div>
            ))}
            {loading ? (
              <div className="ana-message assistente">
                <small>Ana</small>
                <p>Consultando o contexto autorizado…</p>
              </div>
            ) : null}
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
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => void askAna()}
              disabled={loading || !message.trim()}
            >
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
