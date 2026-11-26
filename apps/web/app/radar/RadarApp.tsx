'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Area } from '@licitecomigo/shared';
import { api, errorText, send } from '../../lib/api';
import { DadosAtualizados } from '../components/DadosAtualizados';
import { EVENTO_DADOS_ATUALIZADOS } from '../components/SincronizarAoAcessar';
import { LicitacoesNav } from '../components/LicitacoesNav';
import { Alert, Empty, PageHeader } from '../components/ui';
import { RadarFilters } from './RadarFilters';
import { RadarPainel } from './RadarPainel';
import { PerfilRadar } from './PerfilRadar';
import { FacetPanel, ResultList } from './RadarResults';
import {
  FRESCO_MS,
  chaveDaLista,
  esquecerListas,
  guardarLista,
  guardarScroll,
  lembrarBusca,
  lerLista,
} from './radar-cache';
import { SEM_PERFIL, comPerfil, usePerfil } from './perfil-lib';
import {
  ATALHOS,
  ORDENS,
  activeFilterCount,
  aplicarAtalho,
  atalhoAtivo,
  paramsParaRanking,
  type ListResponse,
} from './radar-lib';

type LoadState = 'loading' | 'ready' | 'anonymous' | 'niche_required' | 'error';

export function RadarApp({
  signedIn,
  canExport,
  canSave,
  nichosTravados = false,
  area,
  usuario = 'anonimo',
}: Readonly<{
  signedIn: boolean;
  canExport: boolean;
  canSave: boolean;
  /** Colaborador: os nichos são definidos pelo Painel admin. */
  nichosTravados?: boolean;
  area?: Area | null;
  /** Identifica a conta nas listas guardadas neste navegador. */
  usuario?: string;
}>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const { dados: perfilDados, recarregar: recarregarPerfil } = usePerfil(usuario);
  const usandoPerfil = params.get(SEM_PERFIL) !== '1';
  const efetivos = useMemo(() => {
    const final = comPerfil(params, usandoPerfil && perfilDados ? perfilDados.perfil : null);
    if (!final.get('page_size')) final.set('page_size', '10');
    return final;
  }, [params, usandoPerfil, perfilDados]);
  const chave = useMemo(() => chaveDaLista(usuario, efetivos), [usuario, efetivos]);
  const chaveAtual = useRef(chave);
  chaveAtual.current = chave;
  const forcar = useRef(false);
  const primeiraVez = useRef(true);
  const [versaoDados, setVersaoDados] = useState(0);
  const [atualizando, setAtualizando] = useState(false);
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
    (filters: Record<string, string>) =>
      apply(new URLSearchParams({ ...filters, [SEM_PERFIL]: '1' })),
    [apply],
  );

  useEffect(() => {
    if (signedIn && !perfilDados) return;
    const controller = new AbortController();
    const guardada = signedIn ? lerLista(chave) : null;
    const forcada = forcar.current;
    forcar.current = false;
    if (guardada) {
      // Mostra na hora o que já temos; só busca de novo se estiver velho ou se pediram.
      setResult(guardada.dados);
      setState('ready');
      if (primeiraVez.current && guardada.scroll > 0) {
        const alvo = guardada.scroll;
        requestAnimationFrame(() => window.scrollTo(0, alvo));
      }
      primeiraVez.current = false;
      if (!forcada && guardada.idade < FRESCO_MS) return;
      setAtualizando(true);
    } else {
      primeiraVez.current = false;
      setState('loading');
    }
    const query = efetivos.toString();
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
        const dados = (await response.json()) as ListResponse;
        guardarLista(chave, dados);
        setResult(dados);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Com uma lista já na tela, uma falha ao atualizar não apaga o que a pessoa está vendo.
        if (!guardada) setState('error');
      })
      .finally(() => {
        if (!controller.signal.aborted) setAtualizando(false);
      });
    return () => {
      controller.abort();
      setAtualizando(false);
    };
  }, [chave, efetivos, profileVersion, signedIn, perfilDados, versaoDados]);

  // Lembra a busca (para o "Voltar à busca") e a posição da lista ao sair da tela.
  const buscaDaUrl = params.toString();
  useEffect(() => {
    if (signedIn) lembrarBusca(usuario, buscaDaUrl);
  }, [signedIn, usuario, buscaDaUrl]);
  useEffect(() => {
    const salvar = () => guardarScroll(chaveAtual.current, window.scrollY);
    window.addEventListener('pagehide', salvar);
    return () => {
      window.removeEventListener('pagehide', salvar);
      salvar();
    };
  }, []);

  // Uma rodada de coleta terminou, ou a aba voltou depois de um tempo: atualiza por baixo.
  useEffect(() => {
    if (!signedIn) return;
    const revalidar = () => {
      forcar.current = true;
      setVersaoDados((valor) => valor + 1);
    };
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      const guardada = lerLista(chaveAtual.current);
      if (!guardada || guardada.idade >= FRESCO_MS) revalidar();
    };
    window.addEventListener(EVENTO_DADOS_ATUALIZADOS, revalidar);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      window.removeEventListener(EVENTO_DADOS_ATUALIZADOS, revalidar);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [signedIn]);

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
    const next = new URLSearchParams(efetivos);
    next.delete('page');
    next.delete('page_size');
    next.set('formato', format);
    return `/api/core/editais/export?${next.toString()}`;
  }

  async function saveSearch() {
    const name = saveName.trim();
    if (!name) return setNotice({ kind: 'error', text: 'Dê um nome para a busca.' });
    const filtros: Record<string, unknown> = {};
    efetivos.forEach((value, key) => {
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

  const filterCount = activeFilterCount(
    new URLSearchParams([...params].filter(([key]) => key !== SEM_PERFIL)),
  );

  return (
    <div className="ui-page rd-page">
      <PageHeader eyebrow="Alerta de Licitações" title="Alerta de Licitações" />
      <LicitacoesNav atual="/radar" area={area} />
      {signedIn ? <DadosAtualizados /> : null}
      {signedIn ? (
        <RadarPainel onPick={pick} refreshKey={profileVersion} onProfile={setHasProfile} />
      ) : null}
      {signedIn && perfilDados ? (
        <PerfilRadar
          key={JSON.stringify(perfilDados)}
          dados={perfilDados}
          modalidades={modalidades}
          nichosTravados={nichosTravados}
          usando={usandoPerfil}
          onUsar={(usar) => {
            const next = new URLSearchParams(params);
            if (usar) next.delete(SEM_PERFIL);
            else next.set(SEM_PERFIL, '1');
            apply(next);
          }}
          onSaved={() => {
            esquecerListas();
            recarregarPerfil();
            setProfileVersion((value) => value + 1);
          }}
        />
      ) : null}
      <RadarFilters
        params={params}
        onApply={apply}
        signedIn={signedIn}
        hasProfile={hasProfile}
        meusNichos={perfilDados?.nichos ?? []}
      />

      {signedIn ? (
        <nav className="rd-atalhos" aria-label="Busca rápida">
          <span className="rd-atalhos-rotulo">Busca rápida</span>
          {ATALHOS.map((atalho) => {
            const ativo = atalhoAtivo(params) === atalho.id;
            const bloqueado = atalho.exige === 'perfil' && !hasProfile;
            return (
              <button
                key={atalho.id}
                type="button"
                className={ativo ? 'rd-atalho rd-atalho-on' : 'rd-atalho'}
                aria-pressed={ativo}
                disabled={bloqueado}
                title={
                  bloqueado
                    ? 'Preencha o perfil do Alerta de Licitações para usar este atalho.'
                    : atalho.dica
                }
                onClick={() => {
                  if (ativo) {
                    const next = new URLSearchParams(params);
                    for (const chave of Object.keys(atalho.params)) next.delete(chave);
                    apply(next);
                  } else apply(aplicarAtalho(params, atalho));
                }}
              >
                {atalho.rotulo}
              </button>
            );
          })}
        </nav>
      ) : null}

      {state === 'anonymous' ? (
        <section className="ui-panel">
          <h2>Entre para usar o Alerta de Licitações</h2>
          <Link className="ui-btn" href="/login">
            Entrar
          </Link>
        </section>
      ) : null}
      {state === 'niche_required' ? (
        <section className="ui-panel">
          {nichosTravados ? (
            <>
              <h2>Seus nichos ainda não foram liberados</h2>
              <p>Peça a liberação à equipe.</p>
            </>
          ) : (
            <>
              <h2>Escolha seus nichos para usar o Alerta de Licitações</h2>
              <p>Escolha de um a três nichos no perfil acima.</p>
            </>
          )}
        </section>
      ) : null}
      {state === 'error' ? (
        <Alert kind="error">
          Não foi possível carregar o Alerta de Licitações agora. Tente novamente em instantes.
        </Alert>
      ) : null}
      {state === 'loading' && !result ? <p className="ui-loading">Consultando editais…</p> : null}

      {result && (state === 'ready' || state === 'loading') ? (
        <section
          className="rd-layout"
          aria-busy={state === 'loading' || atualizando}
          aria-live="polite"
        >
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
              <Alert kind="info">A exportação leva até 5.000 editais.</Alert>
            ) : null}
            {result.data.length === 0 ? (
              <Empty>Nenhum edital com esses filtros. Tire algum filtro ou amplie o prazo.</Empty>
            ) : (
              <ResultList
                key={params.toString()}
                items={result.data}
                signedIn={signedIn}
                rankingParams={paramsParaRanking(efetivos, !usandoPerfil)}
              />
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
