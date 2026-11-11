'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Comparar } from './Comparar';
import { Ranking } from './Ranking';
import { Simulador, type SimulacaoInicial } from './Simulador';

const ABAS = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'comparar', label: 'Comparar' },
  { id: 'simulador', label: 'Simulador' },
] as const;
type AbaId = (typeof ABAS)[number]['id'];

export type Selecionado = { id: string; titulo: string };
export const MAX_COMPARAR = 4;

function abaValida(value: string | null): AbaId {
  return ABAS.some((aba) => aba.id === value) ? (value as AbaId) : 'ranking';
}

export function AnaliseApp() {
  const router = useRouter();
  const params = useSearchParams();
  const aba = abaValida(params.get('aba'));
  const [selecionados, setSelecionados] = useState<Selecionado[]>([]);
  const [margem, setMargem] = useState('15');
  const [simulacao, setSimulacao] = useState<SimulacaoInicial | null>(null);

  const irPara = useCallback(
    (destino: AbaId) => {
      const next = new URLSearchParams(params.toString());
      next.set('aba', destino);
      router.replace(`/analise?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const alternar = useCallback((item: Selecionado) => {
    setSelecionados((atual) => {
      if (atual.some((existente) => existente.id === item.id)) {
        return atual.filter((existente) => existente.id !== item.id);
      }
      return atual.length >= MAX_COMPARAR ? atual : [...atual, item];
    });
  }, []);

  const margemNumero = Math.min(90, Math.max(0, Number(margem.replace(',', '.')) || 0));

  return (
    <>
      <div className="an-tabs" role="tablist" aria-label="Ferramentas de análise">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={aba === item.id}
            className="an-tab"
            onClick={() => irPara(item.id)}
          >
            {item.label}
            {item.id === 'comparar' && selecionados.length ? (
              <span className="an-tab-count">{selecionados.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {aba === 'ranking' ? (
        <Ranking
          margem={margem}
          onMargem={setMargem}
          selecionados={selecionados}
          onAlternar={alternar}
          onComparar={() => irPara('comparar')}
          onSimular={(inicial) => {
            setSimulacao(inicial);
            irPara('simulador');
          }}
        />
      ) : null}
      {aba === 'comparar' ? (
        <Comparar
          selecionados={selecionados}
          margem={margemNumero}
          onRemover={(id) => setSelecionados((atual) => atual.filter((item) => item.id !== id))}
          onLimpar={() => setSelecionados([])}
          onVoltar={() => irPara('ranking')}
        />
      ) : null}
      {aba === 'simulador' ? <Simulador inicial={simulacao} /> : null}
    </>
  );
}
