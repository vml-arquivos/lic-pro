'use client';

import { useEffect } from 'react';
import { api } from '../../lib/api';

/** Eventos que a tela escuta para mostrar "atualizando…" e recarregar listas. */
export const EVENTO_SYNC_INICIADA = 'licite:sync-iniciada';
export const EVENTO_DADOS_ATUALIZADOS = 'licite:dados-atualizados';

const CHAVE = 'licite:sync-acesso';
const INTERVALO_MS = 5 * 60_000;
const ESPERA_MS = 8_000;
const TENTATIVAS = 15;

type Atualizacao = { ultima_atualizacao_em: string | null };

function lerUltimo(): number {
  try {
    return Number(window.sessionStorage.getItem(CHAVE) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function gravarUltimo(valor: number): void {
  try {
    window.sessionStorage.setItem(CHAVE, String(valor));
  } catch {
    // sem armazenamento: o servidor ainda limita sozinho
  }
}

/**
 * Sempre que alguém abre o sistema (ou volta a ele depois de alguns minutos), pede ao servidor
 * para conferir se os dados do PNCP estão velhos. Se estiverem, o servidor começa uma rodada
 * rápida e esta tela acompanha até acabar, avisando as listas para recarregar. O servidor é
 * quem decide: não começa se já houver uma rodada, nem se os dados forem recentes.
 */
export function SincronizarAoAcessar() {
  useEffect(() => {
    let ativo = true;
    let acompanhando = false;

    async function acompanhar(antes: string | null) {
      if (acompanhando) return;
      acompanhando = true;
      window.dispatchEvent(new CustomEvent(EVENTO_SYNC_INICIADA));
      for (let i = 0; i < TENTATIVAS && ativo; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
        if (!ativo) break;
        try {
          const agora = await api<Atualizacao>('/editais/atualizacao');
          if (agora.ultima_atualizacao_em && agora.ultima_atualizacao_em !== antes) {
            window.dispatchEvent(new CustomEvent(EVENTO_DADOS_ATUALIZADOS));
            acompanhando = false;
            return;
          }
        } catch {
          // tenta de novo na próxima volta
        }
      }
      acompanhando = false;
      // Mesmo sem mudança visível, libera o aviso "atualizando…".
      window.dispatchEvent(new CustomEvent(EVENTO_DADOS_ATUALIZADOS));
    }

    async function conferir() {
      if (Date.now() - lerUltimo() < INTERVALO_MS) return;
      gravarUltimo(Date.now());
      try {
        const antes = await api<Atualizacao>('/editais/atualizacao').catch(() => null);
        const resposta = await api<{ iniciada: boolean }>('/editais/sincronizar', {
          method: 'POST',
        });
        if (resposta.iniciada && ativo) void acompanhar(antes?.ultima_atualizacao_em ?? null);
      } catch {
        // sem sessão ou sem rede: a coleta agendada continua cuidando disso
      }
    }

    void conferir();
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void conferir();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      ativo = false;
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  return null;
}
