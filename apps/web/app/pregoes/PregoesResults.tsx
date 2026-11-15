'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Empty } from '../components/ui';
import { Pager } from '../components/Pager';
import { PerfilBarra } from '../radar/PerfilBarra';
import { comPerfil, usePerfil } from '../radar/perfil-lib';
import { ResultList } from '../radar/RadarResults';
import type { ListResponse } from '../radar/radar-lib';

const POR_PAGINA = 10;

export function PregoesResults({
  signedIn,
  nichosTravados = false,
}: Readonly<{ signedIn: boolean; nichosTravados?: boolean }>) {
  const { dados: perfilDados } = usePerfil();
  const [usandoPerfil, setUsandoPerfil] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'anonymous' | 'niche_required' | 'error'
  >('loading');

  const consulta = useMemo(() => {
    const base = new URLSearchParams({
      codigo_modalidade: '6',
      prazo_proposta_aberto: 'true',
      facetas: 'false',
      page_size: String(POR_PAGINA),
      page: String(pagina),
    });
    return comPerfil(base, usandoPerfil && perfilDados ? perfilDados.perfil : null).toString();
  }, [pagina, usandoPerfil, perfilDados]);

  useEffect(() => {
    if (signedIn && !perfilDados) return;
    const controller = new AbortController();
    setState((atual) => (atual === 'ready' ? atual : 'loading'));
    void fetch(`/api/core/editais?${consulta}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return setState('anonymous');
        if (response.status === 409) return setState('niche_required');
        if (!response.ok) throw new Error('pregoes_failed');
        setResult((await response.json()) as ListResponse);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setState('error');
      });
    return () => controller.abort();
  }, [consulta, signedIn, perfilDados]);

  if (state === 'loading' && !result) return <p className="ui-loading">Consultando pregões…</p>;
  if (state === 'anonymous')
    return (
      <Empty>
        Entre para ver os pregões do seu escopo. <Link href="/login">Entrar</Link>
      </Empty>
    );
  if (state === 'niche_required')
    return (
      <Empty>
        {nichosTravados ? (
          'Seus nichos ainda não foram liberados pela equipe.'
        ) : (
          <>
            Escolha seus nichos para ver os pregões. <Link href="/radar">Montar meu perfil</Link>
          </>
        )}
      </Empty>
    );
  if (state === 'error' || !result)
    return <Empty>Não foi possível carregar os pregões agora. Tente novamente em instantes.</Empty>;
  return (
    <>
      {perfilDados ? (
        <PerfilBarra
          dados={perfilDados}
          usando={usandoPerfil}
          onUsar={(usar) => {
            setUsandoPerfil(usar);
            setPagina(1);
          }}
        />
      ) : null}
      {result.data.length === 0 ? (
        <Empty>
          Nenhum pregão aberto com esse perfil agora.
          {usandoPerfil ? ' Desmarque “Filtrar pelo meu perfil” para ver todos do seu nicho.' : ''}
        </Empty>
      ) : (
        <>
          <p>
            <strong>{result.total.toLocaleString('pt-BR')} pregão(ões)</strong> com propostas
            abertas.
          </p>
          <ResultList items={result.data} signedIn={signedIn} />
          <Pager
            page={result.page}
            totalPages={result.total_pages}
            onPage={(proxima) => {
              setPagina(proxima);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}
    </>
  );
}
