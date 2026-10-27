'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Empty } from '../components/ui';
import { ResultList } from '../radar/RadarResults';
import type { ListResponse } from '../radar/radar-lib';

export function PregoesResults({ signedIn }: Readonly<{ signedIn: boolean }>) {
  const [result, setResult] = useState<ListResponse | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'anonymous' | 'niche_required' | 'error'
  >('loading');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/core/editais?codigo_modalidade=6&prazo_proposta_aberto=true&facetas=false', {
      cache: 'no-store',
      signal: controller.signal,
    })
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
  }, []);

  if (state === 'loading') return <p className="ui-loading">Consultando pregões…</p>;
  if (state === 'anonymous')
    return (
      <Empty>
        Entre para ver os pregões do seu escopo. <Link href="/login">Entrar</Link>
      </Empty>
    );
  if (state === 'niche_required')
    return (
      <Empty>
        Escolha seus nichos para ver os pregões. <Link href="/onboarding">Escolher nichos</Link>
      </Empty>
    );
  if (state === 'error' || !result)
    return <Empty>Não foi possível carregar os pregões agora. Tente novamente em instantes.</Empty>;
  if (!result.data.length) return <Empty>Nenhum pregão aberto no seu escopo agora.</Empty>;
  return (
    <>
      <p>
        <strong>{result.total.toLocaleString('pt-BR')} pregão(ões)</strong> com propostas abertas.
      </p>
      <ResultList items={result.data} signedIn={signedIn} />
    </>
  );
}
