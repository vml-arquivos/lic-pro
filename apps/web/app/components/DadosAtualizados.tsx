'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

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

  useEffect(() => {
    let ativo = true;
    const carregar = () =>
      api<Atualizacao>('/editais/atualizacao')
        .then((resposta) => ativo && setDados(resposta))
        .catch(() => undefined);
    void carregar();
    const consulta = setInterval(() => void carregar(), 60_000);
    const relogio = setInterval(() => setAgora(Date.now()), 30_000);
    return () => {
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
    </p>
  );
}
