'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FOCOS_ANALISE, FOCO_ROTULOS, type FocoAnalise } from '@licitecomigo/shared';
import { api, errorText } from '../../lib/api';
import { Alert, Empty, Kpi } from '../components/ui';
import { Pager, paginar, totalDePaginas } from '../components/Pager';
import { UfPicker } from '../components/UfPicker';
import { faixaDeValor, nomeDoNicho } from '../radar/perfil-lib';
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
        <li
          key={componente.chave}
          title={`${CRITERIOS_AJUDA[componente.chave] ?? ''} ${componente.detalhe}`}
        >
          <span>{componente.rotulo}</span>
          <div
            className="an-barra"
            role="img"
            aria-label={`${componente.rotulo}: ${componente.pontos} de 100`}
          >
            <i
              className={`an-barra-${tomDaNota(componente.pontos)}`}
              style={{ width: `${componente.pontos}%` }}
            />
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
  const [ufs, setUfs] = useState<string[]>([]);
  const [usarPerfil, setUsarPerfil] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [prazo, setPrazo] = useState('abertas');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const [estado, setEstado] = useState<
    | { state: 'loading' }
    | { state: 'error'; message: string }
    | { state: 'ready'; data: RankingResposta }
  >({ state: 'loading' });

  const consulta = useMemo(() => {
    const query = new URLSearchParams({ foco, situacao_prazo: prazo, limite: '50' });
    if (!usarPerfil) query.set('usar_perfil', 'false');
    const margemNumero = Number(margem.replace(',', '.'));
    if (Number.isFinite(margemNumero) && margem.trim() !== '') {
      query.set('margem_pct', String(Math.min(90, Math.max(0, margemNumero))));
    }
    if (q.trim()) query.set('q', q.trim());
    if (ufs.length) query.set('uf', ufs.join(','));
    if (valorMin.trim()) query.set('valor_min', valorMin.trim());
    if (valorMax.trim()) query.set('valor_max', valorMax.trim());
    return query.toString();
  }, [foco, prazo, margem, q, ufs, valorMin, valorMax, usarPerfil]);

  useEffect(() => {
    let ativo = true;
    setEstado({ state: 'loading' });
    setPagina(1);
    const timer = setTimeout(() => {
      api<RankingResposta>(`/analise/ranking?${consulta}`)
        .then((data) => ativo && setEstado({ state: 'ready', data }))
        .catch(
          (cause: unknown) => ativo && setEstado({ state: 'error', message: errorText(cause) }),
        );
    }, 350);
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [consulta]);

  const limpar = () => {
    setQ('');
    setUfs([]);
    setPrazo('abertas');
    setValorMin('');
    setValorMax('');
  };
  const filtrado = Boolean(q || ufs.length || valorMin || valorMax || prazo !== 'abertas');

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

      {estado.state === 'ready' && estado.data.perfil_definido ? (
        <section className="rd-perfil ui-panel" aria-label="Meu perfil">
          <div className="rd-perfil-linha">
            <div>
              <strong>Meu perfil</strong>
              <ul className="rd-perfil-itens">
                {estado.data.nichos.length ? (
                  <li>{estado.data.nichos.map(nomeDoNicho).join(' · ')}</li>
                ) : null}
                <li>
                  {estado.data.perfil_aplicado.ufs.length
                    ? estado.data.perfil_aplicado.ufs.join(', ')
                    : 'Todo o Brasil'}
                </li>
                <li>
                  {faixaDeValor({
                    ufs: [],
                    palavras_interesse: [],
                    modalidades: [],
                    valor_min: estado.data.perfil_aplicado.valor_min,
                    valor_max: estado.data.perfil_aplicado.valor_max,
                  })}
                </li>
                {estado.data.perfil_aplicado.palavras.length ? (
                  <li>{estado.data.perfil_aplicado.palavras.join(', ')}</li>
                ) : null}
              </ul>
            </div>
            <div className="rd-perfil-acoes">
              <label className="ui-check">
                <input
                  type="checkbox"
                  checked={usarPerfil}
                  onChange={(event) => setUsarPerfil(event.target.checked)}
                />
                Filtrar pelo meu perfil
              </label>
              <Link className="ui-btn ui-btn-ghost ui-btn-small" href="/radar">
                Editar perfil
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="an-filtros ui-form" aria-label="Filtros do ranking">
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
        <UfPicker
          value={ufs}
          onChange={setUfs}
          label="Estados"
          vazio={
            usarPerfil && estado.state === 'ready' && estado.data.perfil_aplicado.ufs.length
              ? 'Os do meu perfil'
              : 'Todo o Brasil'
          }
        />
        <label>
          Valor mínimo (R$)
          <input
            inputMode="numeric"
            value={valorMin}
            onChange={(event) => setValorMin(event.target.value.replace(/\D/g, ''))}
          />
        </label>
        <label>
          Valor máximo (R$)
          <input
            inputMode="numeric"
            value={valorMax}
            onChange={(event) => setValorMax(event.target.value.replace(/\D/g, ''))}
          />
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
        <label>
          Palavra-chave (opcional)
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Ex.: notebook, merenda"
          />
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
            <Kpi
              label="Editais analisados"
              value={estado.data.total_candidatos}
              hint={`até ${estado.data.limite_candidatos} por consulta`}
            />
            <Kpi
              label="No ranking"
              value={estado.data.itens.length}
              hint={`${FOCO_ROTULOS[foco]} · 10 por página`}
            />
            <Kpi
              label="Lucro estimado do topo"
              value={moeda(
                estado.data.itens
                  .slice(0, 5)
                  .reduce((soma, item) => soma + (item.analise.lucro_estimado ?? 0), 0),
              )}
              hint="soma dos 5 primeiros"
            />
          </div>
          {!estado.data.perfil_definido ? (
            <Alert kind="info">
              Monte seu perfil uma vez (nichos, estados e faixa de valor) e a análise já mostra só o
              que combina com você. <Link href="/radar">Montar meu perfil</Link>
            </Alert>
          ) : null}
          {estado.data.itens.length === 0 ? (
            <Empty>
              Nenhum edital encontrado com esses filtros. Desmarque “Filtrar pelo meu perfil”,
              amplie o prazo ou tire a palavra-chave.
            </Empty>
          ) : (
            <ol className="an-lista">
              {paginar(estado.data.itens, pagina).map((item) => {
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
                          {[
                            item.orgao,
                            [item.municipio_nome, item.uf].filter(Boolean).join('/'),
                            item.modalidade,
                          ]
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
                        <dd
                          title={
                            item.analise.desconto_base === 'historico_do_orgao'
                              ? 'Com o desconto que o órgão costuma dar'
                              : 'Com desconto assumido de 10% (sem histórico do órgão)'
                          }
                        >
                          {lucro === null ? '—' : moeda(lucro)}
                          {item.analise.desconto_base === 'premissa' ? (
                            <small> premissa</small>
                          ) : null}
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
                          onChange={() =>
                            onAlternar({ id: item.id, titulo: item.titulo ?? 'Edital' })
                          }
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
          <Pager
            page={pagina}
            totalPages={totalDePaginas(estado.data.itens.length)}
            onPage={(proxima) => {
              setPagina(proxima);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
          <p className="an-aviso">{estado.data.aviso}</p>
        </>
      ) : null}

      {selecionados.length > 0 ? (
        <div
          className="an-barra-comparar"
          role="region"
          aria-label="Editais escolhidos para comparar"
        >
          <span>
            {selecionados.length} de {MAX_COMPARAR} escolhidos
          </span>
          <button
            type="button"
            className="ui-btn"
            disabled={selecionados.length < 2}
            onClick={onComparar}
          >
            {selecionados.length < 2 ? 'Escolha ao menos 2' : 'Comparar agora'}
          </button>
        </div>
      ) : null}
    </>
  );
}
