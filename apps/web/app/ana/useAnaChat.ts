'use client';

import { useState } from 'react';

export type ChatMessage = {
  role: 'usuario' | 'assistente';
  text: string;
};

type AnaResponse = {
  conversa_id?: string;
  texto?: string;
};

export function assistantMessage(text: string): ChatMessage {
  return { role: 'assistente', text };
}

/** Conversa com a Ana pelo servidor web (o endereço do serviço de IA não vai para o navegador). */
export function useAnaChat(greeting: string) {
  const [message, setMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([assistantMessage(greeting)]);
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

  return { message, setMessage, messages, loading, askAna };
}
