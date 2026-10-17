'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Tender = {
  id: string;
  titulo: string;
  orgao?: string | null;
  uf?: string | null;
  modalidade?: string | null;
  valor_estimado?: number | string | null;
  data_publicacao?: string | null;
  fonte?: string;
};

export function RadarResults() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Tender[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    void fetch(`/api/core/editais${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setState('unauthorized');
          return;
        }
        if (!response.ok) throw new Error('radar_failed');
        const payload = (await response.json()) as { data?: Tender[]; total?: number };
        setItems(payload.data ?? []);
        setTotal(payload.total ?? 0);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, [query]);

  if (state === 'unauthorized')
    return (
      <section className="radar-empty">
        <h2>Entre para usar o Radar</h2>
        <p>O escopo de busca é sempre o tenant da sessão.</p>
        <Link className="button-secondary" href="/login">
          Entrar
        </Link>
      </section>
    );
  if (state === 'error')
    return (
      <section className="radar-empty">
        <h2>Não foi possível carregar o Radar</h2>
        <p>Confira o core API e tente novamente.</p>
      </section>
    );
  if (state === 'loading')
    return (
      <section className="radar-empty">
        <p>Consultando fontes já ingeridas…</p>
      </section>
    );
  if (!items.length)
    return (
      <section className="radar-empty">
        <h2>Nenhuma oportunidade encontrada</h2>
        <p>
          Amplie a janela de ingestão ou revise os filtros. O Radar não inventa resultados sem fonte
          oficial.
        </p>
      </section>
    );

  return (
    <section className="radar-results" aria-live="polite">
      <div className="results-toolbar">
        <strong>{total ?? items.length} resultado(s)</strong>
        <span>Dados ingeridos de fontes públicas documentadas.</span>
      </div>
      <div className="result-grid">
        {items.map((item) => (
          <article className="result-card" key={item.id}>
            <p className="eyebrow">
              {item.fonte ?? 'fonte oficial'} · {item.uf ?? 'UF não informada'}
            </p>
            <h2>
              <Link href={`/radar/${item.id}`}>{item.titulo}</Link>
            </h2>
            <p>
              {item.orgao ?? 'Órgão não informado'} ·{' '}
              {item.modalidade ?? 'Modalidade não informada'}
            </p>
            <small>
              {item.valor_estimado
                ? `Valor estimado: R$ ${Number(item.valor_estimado).toLocaleString('pt-BR')}`
                : 'Valor não informado'}
              {item.data_publicacao
                ? ` · Publicado em ${new Date(item.data_publicacao).toLocaleDateString('pt-BR')}`
                : ''}
            </small>
            <Link className="button-quiet" href={`/radar/${item.id}`}>
              Abrir edital
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
