'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { avisarEstadoAna } from './estado';

export type AnaLink = { texto: string; href: string };

export type ChatMessage = {
  role: 'usuario' | 'assistente';
  text: string;
  links?: AnaLink[];
};

type AnaResponse = {
  conversa_id?: string;
  texto?: string;
  links?: AnaLink[];
};

/** Resumo da conta para o tipo de usuário (empresa, aluno, mentoria, administração). */
export type AnaContexto = {
  area: string;
  nome: string | null;
  resumo: string[];
  destaques: Array<{ texto: string; href?: string; tom: 'info' | 'atencao' }>;
  sugestoes: string[];
};

/** Busca o resumo da Ana uma vez; sem ele a Ana continua funcionando com as sugestões padrão. */
export function useAnaContexto(ativo: boolean): AnaContexto | null {
  const [contexto, setContexto] = useState<AnaContexto | null>(null);
  useEffect(() => {
    if (!ativo || contexto) return;
    let vivo = true;
    void api<AnaContexto>('/ana/contexto')
      .then((dados) => {
        if (vivo) setContexto(dados);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [ativo, contexto]);
  return contexto;
}

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
    avisarEstadoAna('pensando');
    let respondeu = false;
    setMessages((current) => [...current, { role: 'usuario', text: question }]);
    try {
      const response = await fetch('/api/ana/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mensagem: question,
          conversa_id: conversationId,
          pagina: window.location.pathname,
        }),
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
      respondeu = true;
      setMessages((current) => [
        ...current,
        {
          ...assistantMessage(data.texto ?? 'A Ana não retornou uma resposta legível.'),
          ...(data.links?.length ? { links: data.links.slice(0, 5) } : {}),
        },
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
      // A figura "fala" um instante quando a resposta chega; depois volta ao repouso.
      avisarEstadoAna(respondeu ? 'falando' : 'ocioso');
      if (respondeu) window.setTimeout(() => avisarEstadoAna('ocioso'), 2800);
    }
  }

  return { message, setMessage, messages, loading, askAna };
}
