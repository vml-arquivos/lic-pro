'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorText, send } from '../../lib/api';
import { TenderCard, type Interaction, type PosicaoNoConjunto } from './TenderCard';
import {
  COMPARAR_MAX,
  FACET_TITLES,
  gravarEscolhidos,
  isFacetActive,
  lerEscolhidos,
  toggleFacet,
  type EscolhidoParaComparar,
  type Facets,
  type Tender,
} from './radar-lib';

export { TenderCard };

export function FacetPanel({
  facets,
  params,
  onChange,
}: Readonly<{
  facets: Facets;
  params: URLSearchParams;
  onChange: (next: URLSearchParams) => void;
}>) {
  const groups = Object.entries(facets).filter(([, items]) => items && items.length > 0);
  if (!groups.length) return null;
  return (
    <aside className="rd-facets" aria-label="Refinar resultados">
      <h2>Refinar</h2>
      {groups.map(([campo, items]) => (
        <section key={campo}>
          <h3>{FACET_TITLES[campo] ?? campo}</h3>
          <ul>
            {(items ?? []).slice(0, 8).map((item) => {
              const active = isFacetActive(params, campo, item.valor);
              return (
                <li key={item.valor}>
                  <button
                    type="button"
                    className={active ? 'rd-facet rd-facet-on' : 'rd-facet'}
                    aria-pressed={active}
                    onClick={() => onChange(toggleFacet(params, campo, item.valor))}
                  >
                    <span>{item.valor}</span>
                    <small>{item.total}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}

type RankingResposta = {
  total_candidatos: number;
  itens: Array<{ id: string; posicao: number; analise: { nota: number } }>;
};

export function ResultList({
  items,
  signedIn,
  rankingParams,
}: Readonly<{
  items: Tender[];
  signedIn: boolean;
  /** Filtros da busca atual: ligam o botão "Comparar com tudo" (posição entre todos os resultados). */
  rankingParams?: URLSearchParams;
}>) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, Interaction>>({});
  const [error, setError] = useState('');
  const [escolhidos, setEscolhidos] = useState<EscolhidoParaComparar[]>([]);
  const [ranking, setRanking] = useState<
    | { estado: 'parado' }
    | { estado: 'carregando' }
    | { estado: 'erro'; mensagem: string }
    | { estado: 'pronto'; dados: RankingResposta }
  >({ estado: 'parado' });

  useEffect(() => {
    setEscolhidos(lerEscolhidos());
  }, []);

  function alternarComparar(item: Tender) {
    setEscolhidos((atual) => {
      const existe = atual.some((e) => e.id === item.id);
      if (!existe && atual.length >= COMPARAR_MAX) return atual;
      const proximo = existe
        ? atual.filter((e) => e.id !== item.id)
        : [...atual, { id: item.id, titulo: item.titulo }];
      gravarEscolhidos(proximo);
      return proximo;
    });
  }

  function limparComparar() {
    setEscolhidos([]);
    gravarEscolhidos([]);
  }

  function pedirPosicao() {
    if (!rankingParams || ranking.estado === 'carregando' || ranking.estado === 'pronto') return;
    setRanking({ estado: 'carregando' });
    api<RankingResposta>(`/analise/ranking?${rankingParams.toString()}`)
      .then((dados) => setRanking({ estado: 'pronto', dados }))
      .catch((cause: unknown) => setRanking({ estado: 'erro', mensagem: errorText(cause) }));
  }

  function posicaoDe(id: string): PosicaoNoConjunto | undefined {
    if (ranking.estado === 'parado' || ranking.estado === 'carregando') {
      return { estado: 'carregando' };
    }
    if (ranking.estado === 'erro') return { estado: 'erro', mensagem: ranking.mensagem };
    const { itens, total_candidatos: total } = ranking.dados;
    const achado = itens.find((linha) => linha.id === id);
    const notas = itens.map((linha) => linha.analise.nota);
    return {
      estado: 'pronto',
      posicao: achado?.posicao ?? null,
      considerados: itens.length,
      total,
      nota: achado?.analise.nota ?? null,
      notaMedia: notas.length ? notas.reduce((soma, nota) => soma + nota, 0) / notas.length : null,
    };
  }

  async function interact(id: string, change: Interaction) {
    const previous = overrides[id];
    setError('');
    setOverrides((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...change,
        ...(change.favorito ? { descartado: false } : {}),
        ...(change.descartado ? { favorito: false } : {}),
      },
    }));
    try {
      await send('POST', `/editais/${id}/interacao`, change);
    } catch {
      setOverrides((current) => {
        const next = { ...current };
        if (previous) next[id] = previous;
        else delete next[id];
        return next;
      });
      setError('Não foi possível salvar agora. Tente novamente.');
    }
  }

  return (
    <>
      {error ? (
        <p className="ui-alert ui-alert-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rd-list">
        {items.map((item) => (
          <TenderCard
            key={item.id}
            item={item}
            signedIn={signedIn}
            state={overrides[item.id] ?? {}}
            onInteract={(id, change) => void interact(id, change)}
            marcadoParaComparar={escolhidos.some((e) => e.id === item.id)}
            compararCheio={escolhidos.length >= COMPARAR_MAX}
            onAlternarComparar={alternarComparar}
            posicao={posicaoDe(item.id)}
            {...(rankingParams ? { onPedirPosicao: pedirPosicao } : {})}
          />
        ))}
      </div>
      {signedIn && escolhidos.length > 0 ? (
        <div
          className="rd-barra-comparar"
          role="region"
          aria-label="Editais escolhidos para comparar"
        >
          <span>
            <strong>{escolhidos.length}</strong> de {COMPARAR_MAX} para comparar
            {escolhidos.length < 2 ? ' · escolha mais 1' : ''}
          </span>
          <button
            type="button"
            className="ui-btn ui-btn-small"
            disabled={escolhidos.length < 2}
            onClick={() => router.push('/analise?aba=comparar')}
          >
            Comparar agora
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-small"
            onClick={limparComparar}
          >
            Limpar
          </button>
        </div>
      ) : null}
    </>
  );
}
