'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText, send } from '../../lib/api';
import { Alert, Empty, PageHeader } from '../components/ui';
import { RadarFilters } from './RadarFilters';
import { RadarPainel } from './RadarPainel';
import { RadarPerfil } from './RadarPerfil';
import { FacetPanel, ResultList } from './RadarResults';
import { ORDENS, activeFilterCount, type ListResponse } from './radar-lib';

type LoadState = 'loading' | 'ready' | 'anonymous' | 'niche_required' | 'error';

export function RadarApp({
  signedIn,
  canExport,
  canSave,
}: Readonly<{ signedIn: boolean; canExport: boolean; canSave: boolean }>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [hasProfile, setHasProfile] = useState(false);
  const [profileVersion, setProfileVersion] = useState(0);
  const [modalidades, setModalidades] = useState<string[]>([]);
  const [saveName, setSaveName] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = useCallback(
    (next: URLSearchParams) => {
      next.delete('page');
      const query = next.toString();
      router.replace(query ? `/radar?${query}` : '/radar', { scroll: false });
    },
    [router],
  );

  const pick = useCallback(
    (filters: Record<string, string>) => apply(new URLSearchParams(filters)),
    [apply],
  );

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    const query = params.toString();
    void fetch(`/api/core/editais${query ? `?${query}` : ''}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) return setState('anonymous');
        if (response.status === 409) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (body.error === 'niche_preferences_required') return setState('niche_required');
        }
        if (!response.ok) throw new Error('radar_failed');
        setResult((await response.json()) as ListResponse);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, [params, profileVersion]);

  useEffect(() => {
    void api<{ modalidade?: string[] }>('/catalog/filters')
      .then((catalog) => setModalidades(catalog.modalidade ?? []))
      .catch(() => undefined);
  }, []);

  function goToPage(page: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    router.replace(`/radar?${next.toString()}`, { scroll: true });
  }

  function exportHref(format: 'xlsx' | 'csv') {
    const next = new URLSearchParams(params);
    next.delete('page');
    next.delete('page_size');
    next.set('formato', format);
    return `/api/core/editais/export?${next.toString()}`;
  }

  async function saveSearch() {
    const name = saveName.trim();
    if (!name) return setNotice({ kind: 'error', text: 'Dê um nome para a busca.' });
    const filtros: Record<string, unknown> = {};
    params.forEach((value, key) => {
      if (['page', 'page_size', 'facetas'].includes(key)) return;
      if (key === 'nicho')
        filtros.nicho = [...((filtros.nicho as string[] | undefined) ?? []), value];
      else filtros[key] = value;
    });
    try {
      await send('POST', '/saved-searches', { nome: name, filtros });
      setSaveName('');
      setNotice({
        kind: 'success',
        text: 'Busca salva, com aviso diário no sino. Em Buscas salvas você muda horário, tipos e e-mail.',
      });
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error) });
    }
  }

  const filterCount = activeFilterCount(params);

  return (
    <div className="ui-page rd-page">
      <PageHeader
        eyebrow="Radar"
        title="Encontre licitações para analisar com calma"
        description="Os dados vêm de fontes públicas e sempre mostram a origem. Confira o edital e o portal oficial antes de decidir."
      />
      {signedIn ? (
        <RadarPainel onPick={pick} refreshKey={profileVersion} onProfile={setHasProfile} />
      ) : null}
      {signedIn ? (
        <RadarPerfil
          modalidades={modalidades}
          onSaved={() => setProfileVersion((value) => value + 1)}
        />
      ) : null}
      <RadarFilters params={params} onApply={apply} signedIn={signedIn} hasProfile={hasProfile} />

      {state === 'anonymous' ? (
        <section className="ui-panel">
          <h2>Entre para usar o Radar</h2>
          <p>A busca mostra os editais do seu escopo e guarda suas escolhas.</p>
          <Link className="ui-btn" href="/login">
            Entrar
          </Link>
        </section>
      ) : null}
      {state === 'niche_required' ? (
        <section className="ui-panel">
          <h2>Escolha seus nichos para usar o Radar</h2>
          <p>Selecione de um a três nichos. Eles definem o que aparece na sua busca.</p>
          <Link className="ui-btn" href="/onboarding">
            Escolher meus nichos
          </Link>
        </section>
      ) : null}
      {state === 'error' ? (
        <Alert kind="error">
          Não foi possível carregar o Radar agora. Tente novamente em instantes.
        </Alert>
      ) : null}
      {state === 'loading' && !result ? <p className="ui-loading">Consultando editais…</p> : null}

      {result && (state === 'ready' || state === 'loading') ? (
        <section className="rd-layout" aria-busy={state === 'loading'} aria-live="polite">
          <FacetPanel facets={result.facetas} params={params} onChange={apply} />
          <div className="rd-main">
            <div className="rd-toolbar">
              <strong>
                {result.total.toLocaleString('pt-BR')} edital(is)
                {filterCount ? ` com ${filterCount} filtro(s)` : ''}
              </strong>
              <div className="rd-toolbar-actions">
                <label className="rd-order">
                  Ordenar
                  <select
                    value={params.get('ordem') ?? 'recentes'}
                    onChange={(event) => {
                      const next = new URLSearchParams(params);
                      next.set('ordem', event.target.value);
                      apply(next);
                    }}
                  >
                    {ORDENS.filter(([code]) => code !== 'compat' || hasProfile).map(
                      ([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                {canExport ? (
                  <>
                    <a className="ui-btn ui-btn-ghost ui-btn-small" href={exportHref('xlsx')}>
                      Exportar Excel
                    </a>
                    <a className="ui-btn ui-btn-ghost ui-btn-small" href={exportHref('csv')}>
                      Exportar CSV
                    </a>
                  </>
                ) : null}
              </div>
            </div>
            {canSave ? (
              <div className="rd-save">
                <input
                  aria-label="Nome da busca"
                  placeholder="Nome para salvar esta busca"
                  value={saveName}
                  maxLength={160}
                  onChange={(event) => setSaveName(event.target.value)}
                />
                <button
                  type="button"
                  className="ui-btn ui-btn-small"
                  onClick={() => void saveSearch()}
                >
                  Salvar esta busca
                </button>
              </div>
            ) : null}
            {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
            {canExport && result.total > 5000 ? (
              <Alert kind="info">
                A exportação leva no máximo 5.000 editais. Refine os filtros para exportar o resto.
              </Alert>
            ) : null}
            {result.data.length === 0 ? (
              <Empty>
                Nenhum edital encontrado com esses filtros. Tire algum filtro ou amplie o prazo. O
                Radar não inventa resultados sem fonte oficial.
              </Empty>
            ) : (
              <ResultList key={params.toString()} items={result.data} signedIn={signedIn} />
            )}
            {result.total_pages > 1 ? (
              <nav className="rd-pager" aria-label="Páginas de resultados">
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-small"
                  disabled={result.page <= 1}
                  onClick={() => goToPage(result.page - 1)}
                >
                  ← Anterior
                </button>
                <span>
                  Página {result.page} de {result.total_pages}
                </span>
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-small"
                  disabled={result.page >= result.total_pages}
                  onClick={() => goToPage(result.page + 1)}
                >
                  Próxima →
                </button>
              </nav>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
