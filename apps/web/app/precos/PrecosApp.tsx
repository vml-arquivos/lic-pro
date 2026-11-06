'use client';

import { useEffect, useState } from 'react';
import { UFS } from '@licitecomigo/shared';
import { api, errorText } from '../../lib/api';
import { reais } from '../../lib/money';
import { Alert, Empty, Kpi, Panel, Table, formatDate, formatNumber } from '../components/ui';

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

export function PrecosApp() {
  const [catmat, setCatmat] = useState('');
  const [uf, setUf] = useState('');
  const [meses, setMeses] = useState('12');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function search(code = catmat) {
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

  // Vindo do detalhe do edital: /precos?catmat=460789
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('catmat');
    if (code && /^\d{4,9}$/.test(code)) {
      setCatmat(code);
      void search(code);
    }
  }, []);

  const stats = result?.sem_extremos ?? result?.todas ?? null;

  return (
    <>
      <Panel
        title="Consultar item"
        description="Digite o código CATMAT do material. Ele aparece nos itens do edital."
      >
        <form
          className="ui-form"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <label>
            Código CATMAT
            <input
              required
              inputMode="numeric"
              pattern="\d{4,9}"
              title="4 a 9 números"
              value={catmat}
              onChange={(event) => setCatmat(event.target.value.replace(/\D/g, ''))}
              placeholder="Ex.: 460789"
            />
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
          <div className="ui-form-actions">
            <button className="ui-btn" type="submit" disabled={busy}>
              {busy ? 'Consultando…' : 'Consultar'}
            </button>
          </div>
        </form>
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
              title={result.descricao ?? `CATMAT ${result.catmat}`}
              description={`${result.extremos_removidos ? `${result.extremos_removidos} valor(es) muito fora da curva foram desconsiderados no resumo. ` : ''}Faixa comum (25% a 75%): ${reais(stats.p25)} a ${reais(stats.p75)}.`}
            >
              <Table
                label="Preços praticados"
                head={['Data', 'Preço unitário', 'Qtd.', 'Órgão (UASG)', 'UF', 'Fornecedor']}
              >
                {result.itens.map((item, index) => (
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
    </>
  );
}
