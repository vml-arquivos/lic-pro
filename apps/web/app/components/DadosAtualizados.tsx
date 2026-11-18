'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { EVENTO_DADOS_ATUALIZADOS, EVENTO_SYNC_INICIADA } from './SincronizarAoAcessar';

type Atualizacao = {
  ligada: boolean;
  ultima_atualizacao_em: string | null;
  rodada_rapida_minutos: number;
};

export function textoDeIdade(iso: string, agora: number): string {
  const minutos = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000));
  if (minutos < 1) return 'agora há pouco';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} dia(s)`;
}

/** "Dados do PNCP atualizados há X min": mostra o frescor da coleta e se atualiza sozinho. */
export function DadosAtualizados() {
  const [dados, setDados] = useState<Atualizacao | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [atualizando, setAtualizando] = useState(false);
  const ultimaVista = useRef<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const carregar = () =>
      api<Atualizacao>('/editais/atualizacao')
        .then((resposta) => {
          if (!ativo) return;
          setDados(resposta);
          // Uma rodada agendada terminou com a tela aberta: avisa as listas para atualizar.
          const nova = resposta.ultima_atualizacao_em;
          if (nova && ultimaVista.current && nova !== ultimaVista.current) {
            window.dispatchEvent(new CustomEvent(EVENTO_DADOS_ATUALIZADOS));
          }
          if (nova) ultimaVista.current = nova;
        })
        .catch(() => undefined);
    void carregar();
    const consulta = setInterval(() => void carregar(), 60_000);
    const relogio = setInterval(() => setAgora(Date.now()), 30_000);
    const iniciou = () => setAtualizando(true);
    const terminou = () => {
      setAtualizando(false);
      setAgora(Date.now());
      void carregar();
    };
    window.addEventListener(EVENTO_SYNC_INICIADA, iniciou);
    window.addEventListener(EVENTO_DADOS_ATUALIZADOS, terminou);
    return () => {
      window.removeEventListener(EVENTO_SYNC_INICIADA, iniciou);
      window.removeEventListener(EVENTO_DADOS_ATUALIZADOS, terminou);
      ativo = false;
      clearInterval(consulta);
      clearInterval(relogio);
    };
  }, []);

  if (!dados?.ultima_atualizacao_em) return null;
  const atrasada =
    agora - new Date(dados.ultima_atualizacao_em).getTime() >
    Math.max(30, dados.rodada_rapida_minutos * 4) * 60_000;
  return (
    <p
      className={`dados-atualizados${atrasada ? ' dados-atualizados-atrasado' : ''}`}
      role="status"
    >
      <i aria-hidden="true" />
      Dados do PNCP atualizados {textoDeIdade(dados.ultima_atualizacao_em, agora)}
      {dados.ligada ? '' : ' (coleta automática desligada)'}
      {atualizando ? ' · buscando novidades agora…' : ''}
    </p>
  );
}
