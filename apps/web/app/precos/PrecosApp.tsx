'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { UFS } from '@licitecomigo/shared';
import { api, errorText } from '../../lib/api';
import { reais } from '../../lib/money';
import { Alert, Empty, Kpi, Panel, Table, formatDate, formatNumber } from '../components/ui';
import { Paginado } from '../components/Pager';

type Stats = {
  amostras: number;
  minimo: number;
  maximo: number;
  media: number;
  mediana: number;
  p25: number;
  p75: number;
};
type Result = {
  catmat: string;
  descricao: string | null;
  periodo_meses: number;
  uf: string | null;
  todas: Stats | null;
  sem_extremos: Stats | null;
  extremos_removidos: number;
  itens: Array<{
    preco: number;
    quantidade: number | null;
    data: string | null;
    fornecedor: string | null;
    unidade: string | null;
    uasg: string | null;
    uf: string | null;
    municipio: string | null;
  }>;
  fonte: { nome: string; consultado_em: string; paginas: number };
};
type ItemDoNicho = {
  catmat: string;
  descricao: string;
  unidade: string | null;
  editais: number;
  mediana_estimada: number | null;
};
type Fechados = {
  resumo: {
    pregoes: number;
    total_estimado: number | null;
    total_homologado: number | null;
    economia_pct: number | null;
  };
  itens: Array<{
    id: string;
    titulo: string | null;
    orgao: string | null;
    uf: string | null;
    valor_estimado: number | null;
    valor_homologado: number;
    economia_pct: number | null;
    data_publicacao: string | null;
  }>;
};
export type NichoOption = { code: string; label: string };

const pct = (value: number | null | undefined) =>
  typeof value === 'number' ? `${value.toLocaleString('pt-BR')}%` : '—';

/**
 * Preços pagos: o que o governo pagou por um item e como fecharam os pregões do nicho.
 * Tudo parte de listas (nicho, item, estado, período); digitar o código CATMAT é só plano B.
 */
export function PrecosApp({ nichos }: Readonly<{ nichos: readonly NichoOption[] }>) {
  const [nicho, setNicho] = useState('');
  const [filtro, setFiltro] = useState('');
  const [filtroAplicado, setFiltroAplicado] = useState('');
  const [lista, setLista] = useState<{
    state: 'loading' | 'ready' | 'error';
    itens: ItemDoNicho[];
    message?: string;
  }>({
    state: 'loading',
    itens: [],
  });
  const [catmat, setCatmat] = useState('');
  const [codigo, setCodigo] = useState('');
  const [uf, setUf] = useState('');
  const [meses, setMeses] = useState('12');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [fechados, setFechados] = useState<
    { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: Fechados }
  >({ state: 'loading' });

  // O filtro de texto só vale depois de uma pausa na digitação.
  useEffect(() => {
    const timer = setTimeout(() => setFiltroAplicado(filtro.trim()), 350);
    return () => clearTimeout(timer);
  }, [filtro]);

  // Lista de itens do nicho escolhido (ou de todos os nichos da conta).
  useEffect(() => {
    let active = true;
    setLista((current) => ({ ...current, state: 'loading' }));
    const query = new URLSearchParams();
    if (nicho) query.set('nicho', nicho);
    if (filtroAplicado.length >= 2) query.set('q', filtroAplicado);
    api<{ itens: ItemDoNicho[] }>(`/precos/itens?${query.toString()}`)
      .then((data) => active && setLista({ state: 'ready', itens: data.itens }))
      .catch(
        (cause: unknown) =>
          active && setLista({ state: 'error', itens: [], message: errorText(cause) }),
      );
    return () => {
      active = false;
    };
  }, [nicho, filtroAplicado]);

  // Pregões já fechados no nicho.
  useEffect(() => {
    let active = true;
    setFechados({ state: 'loading' });
    const query = new URLSearchParams({ meses });
    if (nicho) query.set('nicho', nicho);
    if (uf) query.set('uf', uf);
    api<Fechados>(`/precos/fechados?${query.toString()}`)
      .then((data) => active && setFechados({ state: 'ready', data }))
      .catch(
        (cause: unknown) => active && setFechados({ state: 'error', message: errorText(cause) }),
      );
    return () => {
      active = false;
    };
  }, [nicho, uf, meses]);

  async function search(code: string) {
    if (!code) {
      setResult(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ catmat: code.trim(), meses });
      if (uf) query.set('uf', uf);
      setResult(await api<Result>(`/precos/referencia?${query.toString()}`));
    } catch (cause) {
      setResult(null);
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  // Escolher o item, o estado ou o período já consulta, sem botão extra.
  useEffect(() => {
    if (catmat) void search(catmat);
  }, [catmat, uf, meses]);

  // Vindo do detalhe do edital: /precos?catmat=460789
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('catmat');
    if (code && /^\d{4,9}$/.test(code)) setCatmat(code);
  }, []);

  const stats = result?.sem_extremos ?? result?.todas ?? null;
  const chosen = lista.itens.find((item) => item.catmat === catmat);
  const outsideList = catmat && !chosen;

  return (
    <>
      <Panel
        title="Quanto o governo pagou"
        description="Escolha o nicho e o item. O resultado aparece na hora, com a fonte oficial."
      >
        <div className="ui-form precos-form">
          <label>
            Nicho
            <select
              value={nicho}
              onChange={(event) => {
                setNicho(event.target.value);
                setCatmat('');
                setResult(null);
              }}
            >
              <option value="">{nichos.length === 1 ? nichos[0]!.label : 'Todos os nichos'}</option>
              {nichos.length > 1
                ? nichos.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))
                : null}
            </select>
          </label>
          <label>
            Filtrar a lista de itens
            <input
              value={filtro}
              onChange={(event) => setFiltro(event.target.value)}
              placeholder="Ex.: cadeira, papel, detergente"
              maxLength={80}
            />
          </label>
          <label className="precos-item">
            Item
            <select
              value={catmat}
              onChange={(event) => {
                setCatmat(event.target.value);
                setCodigo('');
              }}
              disabled={lista.state === 'loading' && !lista.itens.length}
            >
              <option value="">
                {lista.state === 'loading'
                  ? 'Carregando itens…'
                  : lista.itens.length
                    ? 'Selecione o item'
                    : 'Nenhum item encontrado'}
              </option>
              {outsideList ? <option value={catmat}>CATMAT {catmat}</option> : null}
              {lista.itens.map((item) => (
                <option key={item.catmat} value={item.catmat}>
                  {item.descricao.length > 70 ? `${item.descricao.slice(0, 67)}…` : item.descricao}{' '}
                  · {item.catmat}
                  {item.mediana_estimada ? ` · típico ${reais(item.mediana_estimada)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select value={uf} onChange={(event) => setUf(event.target.value)}>
              <option value="">Todos</option>
              {UFS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Período
            <select value={meses} onChange={(event) => setMeses(event.target.value)}>
              <option value="6">Últimos 6 meses</option>
              <option value="12">Últimos 12 meses</option>
              <option value="24">Últimos 24 meses</option>
              <option value="36">Últimos 36 meses</option>
            </select>
          </label>
        </div>
        {lista.state === 'error' ? <Alert kind="error">{lista.message}</Alert> : null}
        {lista.state === 'ready' && !lista.itens.length ? (
          <Alert kind="info">
            Ainda não há itens deste nicho nos editais coletados. Abra um edital no Radar e use
            “Buscar itens e documentos no PNCP”, ou consulte pelo código abaixo.
          </Alert>
        ) : null}
        <details className="ui-details">
          <summary>Já sabe o código CATMAT? Consulte direto</summary>
          <form
            className="ui-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (/^\d{4,9}$/.test(codigo)) setCatmat(codigo);
            }}
          >
            <label>
              Código CATMAT
              <input
                inputMode="numeric"
                pattern="\d{4,9}"
                title="4 a 9 números"
                value={codigo}
                onChange={(event) => setCodigo(event.target.value.replace(/\D/g, ''))}
                placeholder="Ex.: 460789"
              />
            </label>
            <div className="ui-form-actions">
              <button className="ui-btn" type="submit" disabled={busy || codigo.length < 4}>
                Consultar
              </button>
            </div>
          </form>
        </details>
        {busy ? <p className="ui-loading">Consultando o Compras.gov.br…</p> : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </Panel>

      {result ? (
        stats ? (
          <>
            <section className="ui-kpis" aria-label="Resumo dos preços">
              <Kpi label="Mediana" value={reais(stats.mediana)} hint="valor central" tone="ok" />
              <Kpi label="Média" value={reais(stats.media)} />
              <Kpi label="Menor" value={reais(stats.minimo)} />
              <Kpi label="Maior" value={reais(stats.maximo)} />
              <Kpi
                label="Amostras"
                value={formatNumber(stats.amostras)}
                hint={`${result.periodo_meses} meses`}
              />
            </section>
            <Panel
              title={result.descricao ?? chosen?.descricao ?? `CATMAT ${result.catmat}`}
              description={`${result.extremos_removidos ? `${result.extremos_removidos} valor(es) muito fora da curva foram desconsiderados no resumo. ` : ''}Faixa comum (25% a 75%): ${reais(stats.p25)} a ${reais(stats.p75)}.`}
            >
              <Paginado itens={result.itens}>
                {(visiveis) => (
                  <Table
                    label="Preços praticados"
                    head={['Data', 'Preço unitário', 'Qtd.', 'Órgão (UASG)', 'UF', 'Fornecedor']}
                  >
                    {visiveis.map((item, index) => (
                      <tr key={`${item.data}-${index}`}>
                        <td>{formatDate(item.data)}</td>
                        <td>
                          <strong>{reais(item.preco)}</strong>
                          {item.unidade ? <small>{item.unidade}</small> : null}
                        </td>
                        <td>{formatNumber(item.quantidade)}</td>
                        <td>{item.uasg ?? '—'}</td>
                        <td>{item.uf ?? '—'}</td>
                        <td>{item.fornecedor ?? '—'}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Paginado>
              <p className="plan-note">
                Fonte: {result.fonte.nome}, consultada em{' '}
                {formatDate(result.fonte.consultado_em, true)}. São dados de apoio: o preço de
                referência da sua proposta ou pesquisa segue a metodologia que o edital e a norma
                exigirem, e a decisão é sua.
              </p>
            </Panel>
          </>
        ) : (
          <Panel title="Sem resultados">
            <Empty>
              Nenhuma compra encontrada para o CATMAT {result.catmat} neste período. Tente ampliar o
              período ou tirar o filtro de estado.
            </Empty>
          </Panel>
        )
      ) : null}

      <Panel
        title="Pregões já fechados no nicho"
        description="Quanto foi estimado e quanto o pregão realmente fechou (valor homologado)."
      >
        {fechados.state === 'loading' ? <p className="ui-loading">Carregando…</p> : null}
        {fechados.state === 'error' ? <Alert kind="error">{fechados.message}</Alert> : null}
        {fechados.state === 'ready' ? (
          fechados.data.itens.length ? (
            <>
              <section className="ui-kpis" aria-label="Resumo dos pregões fechados">
                <Kpi label="Pregões fechados" value={formatNumber(fechados.data.resumo.pregoes)} />
                <Kpi label="Estimado" value={reais(fechados.data.resumo.total_estimado)} />
                <Kpi label="Fechado" value={reais(fechados.data.resumo.total_homologado)} />
                <Kpi
                  label="Economia média"
                  value={pct(fechados.data.resumo.economia_pct)}
                  hint="sobre o estimado"
                  tone="ok"
                />
              </section>
              <Paginado itens={fechados.data.itens}>
                {(visiveis) => (
                  <Table
                    label="Pregões fechados"
                    head={['Licitação', 'Órgão', 'UF', 'Estimado', 'Fechou em', 'Economia']}
                  >
                    {visiveis.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link href={`/radar/${item.id}`}>{item.titulo ?? 'Sem título'}</Link>
                          <small>{formatDate(item.data_publicacao)}</small>
                        </td>
                        <td>{item.orgao ?? '—'}</td>
                        <td>{item.uf ?? '—'}</td>
                        <td>{reais(item.valor_estimado)}</td>
                        <td>
                          <strong>{reais(item.valor_homologado)}</strong>
                        </td>
                        <td>{pct(item.economia_pct)}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Paginado>
            </>
          ) : (
            <Empty>
              Nenhum pregão fechado encontrado neste nicho e período. Amplie o período ou tire o
              filtro de estado.
            </Empty>
          )
        ) : null}
      </Panel>
    </>
  );
}
