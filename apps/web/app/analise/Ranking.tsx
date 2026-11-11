'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FOCOS_ANALISE, FOCO_ROTULOS, UFS, type FocoAnalise } from '@licitecomigo/shared';
import { api, errorText } from '../../lib/api';
import { Alert, Empty, Kpi } from '../components/ui';
import { MAX_COMPARAR, type Selecionado } from './AnaliseApp';
import {
  CRITERIOS_AJUDA,
  moeda,
  numero,
  prazoCurto,
  tomDaNota,
  type ItemRanking,
  type RankingResposta,
} from './analise-lib';
import type { SimulacaoInicial } from './Simulador';

const FOCO_AJUDA: Record<FocoAnalise, string> = {
  interessantes: 'Equilíbrio entre aderência, prazo, valor, facilidade e folga de preço.',
  lucrativas: 'Maior lucro estimado: valor provável de fechamento × a sua margem.',
  faceis: 'Sinais de menos concorrência e menos exigência.',
  preco: 'Onde o governo costuma pagar mais perto do estimado.',
};

const PRAZOS = [
  { value: 'abertas', label: 'Abertas' },
  { value: 'vencendo_3', label: 'Encerram em até 3 dias' },
  { value: 'vencendo_7', label: 'Encerram em até 7 dias' },
] as const;

function Nota({ valor }: Readonly<{ valor: number }>) {
  return (
    <div className={`an-nota an-nota-${tomDaNota(valor)}`} title="Nota geral de 0 a 100">
      <strong>{valor}</strong>
      <span>nota</span>
    </div>
  );
}

function Barras({ item }: Readonly<{ item: ItemRanking }>) {
  return (
    <ul className="an-barras" aria-label="Critérios da nota">
      {item.analise.componentes.map((componente) => (
        <li key={componente.chave} title={`${CRITERIOS_AJUDA[componente.chave] ?? ''} ${componente.detalhe}`}>
          <span>{componente.rotulo}</span>
          <div className="an-barra" role="img" aria-label={`${componente.rotulo}: ${componente.pontos} de 100`}>
            <i className={`an-barra-${tomDaNota(componente.pontos)}`} style={{ width: `${componente.pontos}%` }} />
          </div>
          <em>{componente.pontos}</em>
        </li>
      ))}
    </ul>
  );
}

export function Ranking({
  margem,
  onMargem,
  selecionados,
  onAlternar,
  onComparar,
  onSimular,
}: Readonly<{
  margem: string;
  onMargem: (value: string) => void;
  selecionados: Selecionado[];
  onAlternar: (item: Selecionado) => void;
  onComparar: () => void;
  onSimular: (inicial: SimulacaoInicial) => void;
}>) {
  const [foco, setFoco] = useState<FocoAnalise>('interessantes');
  const [q, setQ] = useState('');
  const [uf, setUf] = useState('');
  const [prazo, setPrazo] = useState('abertas');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const [estado, setEstado] = useState<
    { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: RankingResposta }
  >({ state: 'loading' });

  const consulta = useMemo(() => {
    const query = new URLSearchParams({ foco, situacao_prazo: prazo, limite: '30' });
    const margemNumero = Number(margem.replace(',', '.'));
    if (Number.isFinite(margemNumero) && margem.trim() !== '') {
      query.set('margem_pct', String(Math.min(90, Math.max(0, margemNumero))));
    }
    if (q.trim()) query.set('q', q.trim());
    if (uf) query.set('uf', uf);
    if (valorMin.trim()) query.set('valor_min', valorMin.trim());
    if (valorMax.trim()) query.set('valor_max', valorMax.trim());
    return query.toString();
  }, [foco, prazo, margem, q, uf, valorMin, valorMax]);

  useEffect(() => {
    let ativo = true;
    setEstado({ state: 'loading' });
    const timer = setTimeout(() => {
      api<RankingResposta>(`/analise/ranking?${consulta}`)
        .then((data) => ativo && setEstado({ state: 'ready', data }))
        .catch((cause: unknown) => ativo && setEstado({ state: 'error', message: errorText(cause) }));
    }, 350);
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [consulta]);

  const limpar = () => {
    setQ('');
    setUf('');
    setPrazo('abertas');
    setValorMin('');
    setValorMax('');
  };
  const filtrado = Boolean(q || uf || valorMin || valorMax || prazo !== 'abertas');

  return (
    <>
      <div className="an-focos" role="radiogroup" aria-label="O que você quer ver primeiro">
        {FOCOS_ANALISE.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={foco === item}
            className="an-foco"
            onClick={() => setFoco(item)}
          >
            <strong>{FOCO_ROTULOS[item]}</strong>
            <span>{FOCO_AJUDA[item]}</span>
          </button>
        ))}
      </div>

      <section className="an-filtros ui-form" aria-label="Filtros do ranking">
        <label className="an-wide">
          Palavra-chave
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Ex.: uniforme, merenda, notebook"
          />
        </label>
        <label>
          Estado
          <select value={uf} onChange={(event) => setUf(event.target.value)}>
            <option value="">Todos</option>
            {UFS.map((sigla) => (
              <option key={sigla} value={sigla}>
                {sigla}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prazo
          <select value={prazo} onChange={(event) => setPrazo(event.target.value)}>
            {PRAZOS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor mínimo (R$)
          <input inputMode="numeric" value={valorMin} onChange={(event) => setValorMin(event.target.value.replace(/\D/g, ''))} />
        </label>
        <label>
          Valor máximo (R$)
          <input inputMode="numeric" value={valorMax} onChange={(event) => setValorMax(event.target.value.replace(/\D/g, ''))} />
        </label>
        <label>
          Sua margem de lucro (%)
          <input
            inputMode="decimal"
            value={margem}
            onChange={(event) => onMargem(event.target.value.replace(/[^\d.,]/g, ''))}
            aria-describedby="an-margem-ajuda"
          />
          <small id="an-margem-ajuda">Usada só para estimar o lucro.</small>
        </label>
        {filtrado ? (
          <button type="button" className="ui-btn ui-btn-ghost an-limpar" onClick={limpar}>
            Limpar filtros
          </button>
        ) : null}
      </section>

      {estado.state === 'loading' ? <p className="ui-loading">Analisando os editais…</p> : null}
      {estado.state === 'error' ? <Alert kind="error">{estado.message}</Alert> : null}
      {estado.state === 'ready' ? (
        <>
          <div className="ui-kpis an-kpis">
            <Kpi label="Editais analisados" value={estado.data.total_candidatos} hint={`até ${estado.data.limite_candidatos} por consulta`} />
            <Kpi label="Mostrando" value={estado.data.itens.length} hint={FOCO_ROTULOS[foco]} />
            <Kpi
              label="Lucro estimado do topo"
              value={moeda(
                estado.data.itens.slice(0, 5).reduce((soma, item) => soma + (item.analise.lucro_estimado ?? 0), 0),
              )}
              hint="soma dos 5 primeiros"
            />
          </div>
          {!estado.data.perfil_definido ? (
            <Alert kind="info">
              Você ainda não definiu o perfil do Radar (estados, palavras e faixa de valor). Com ele, a nota de aderência fica
              mais precisa. <Link href="/radar">Definir perfil no Radar</Link>
            </Alert>
          ) : null}
          {estado.data.itens.length === 0 ? (
            <Empty>Nenhum edital encontrado com esses filtros. Tente ampliar o prazo ou tirar a palavra-chave.</Empty>
          ) : (
            <ol className="an-lista">
              {estado.data.itens.map((item) => {
                const marcado = selecionados.some((existente) => existente.id === item.id);
                const cheio = !marcado && selecionados.length >= MAX_COMPARAR;
                const lucro = item.analise.lucro_estimado;
                return (
                  <li key={item.id} className="an-card">
                    <div className="an-card-topo">
                      <span className="an-pos">{item.posicao}</span>
                      <div className="an-card-titulo">
                        <h3>{item.titulo ?? 'Edital sem título'}</h3>
                        <p>
                          {[item.orgao, [item.municipio_nome, item.uf].filter(Boolean).join('/'), item.modalidade]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <Nota valor={item.analise.nota} />
                    </div>

                    <dl className="an-fatos">
                      <div>
                        <dt>Prazo</dt>
                        <dd>{prazoCurto(item.data_encerramento_proposta)}</dd>
                      </div>
                      <div>
                        <dt>Valor estimado</dt>
                        <dd>{moeda(item.valor_estimado)}</dd>
                      </div>
                      <div>
                        <dt>Lucro estimado</dt>
                        <dd title={item.analise.desconto_base === 'historico_do_orgao' ? 'Com o desconto que o órgão costuma dar' : 'Com desconto assumido de 10% (sem histórico do órgão)'}>
                          {lucro === null ? '—' : moeda(lucro)}
                          {item.analise.desconto_base === 'premissa' ? <small> premissa</small> : null}
                        </dd>
                      </div>
                      <div>
                        <dt>Confiança</dt>
                        <dd>{item.analise.confianca}</dd>
                      </div>
                    </dl>

                    <Barras item={item} />

                    {item.analise.sinais.length ? (
                      <ul className="an-sinais">
                        {item.analise.sinais.slice(0, 4).map((sinal) => (
                          <li key={sinal.texto} className={`an-sinal an-sinal-${sinal.tipo}`}>
                            {sinal.texto}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="an-acoes">
                      <label className="an-check">
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={cheio}
                          onChange={() => onAlternar({ id: item.id, titulo: item.titulo ?? 'Edital' })}
                        />
                        {cheio ? `Máximo de ${MAX_COMPARAR}` : 'Comparar'}
                      </label>
                      <Link className="ui-btn ui-btn-ghost ui-btn-small" href={`/radar/${item.id}`}>
                        Abrir edital
                      </Link>
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost ui-btn-small"
                        onClick={() =>
                          onSimular({
                            titulo: item.titulo ?? 'Edital',
                            preco_referencia: numero(item.valor_estimado),
                          })
                        }
                      >
                        Simular proposta
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="an-aviso">{estado.data.aviso}</p>
        </>
      ) : null}

      {selecionados.length > 0 ? (
        <div className="an-barra-comparar" role="region" aria-label="Editais escolhidos para comparar">
          <span>
            {selecionados.length} de {MAX_COMPARAR} escolhidos
          </span>
          <button type="button" className="ui-btn" disabled={selecionados.length < 2} onClick={onComparar}>
            {selecionados.length < 2 ? 'Escolha ao menos 2' : 'Comparar agora'}
          </button>
        </div>
      ) : null}
    </>
  );
}
