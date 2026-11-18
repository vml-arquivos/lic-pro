'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FOCOS_ANALISE,
  FOCO_ROTULOS,
  type Concorrente,
  type FatoDoEdital,
  type FocoAnalise,
} from '@licitecomigo/shared';
import { ApiError, api, errorText, send } from '../../../lib/api';
import { Alert, Badge, Empty, Kpi } from '../../components/ui';
import { UfPicker } from '../../components/UfPicker';
import {
  moeda,
  numero,
  prazoCurto,
  tomDaNota,
  type ItemRanking,
  type RankingResposta,
} from '../../analise/analise-lib';
import { deadlineInfo, portalDoEdital } from '../radar-lib';

type Leitura = {
  documentos: Array<{ estado: string }>;
  fatos: FatoDoEdital[];
  alertas: Array<{ id: string; texto: string }>;
};
type ResumoPrecos = {
  itens_total: number;
  comparados: number;
  acima_da_faixa: number;
  abaixo_da_faixa: number;
};
type Concorrentes = {
  neste_edital: { vencedores: Concorrente[] };
  similares: Concorrente[];
  do_orgao: Concorrente[];
  dos_itens: Concorrente[];
};
type Analise = {
  estado: 'fila' | 'analisando' | 'pronta';
  leitura?: Leitura | 'falhou';
  precos?: ResumoPrecos | 'falhou';
  concorrentes?: Concorrentes | 'falhou';
};

const PRAZOS = [
  ['abertas', 'Abertas'],
  ['vencendo_3', 'Encerram em até 3 dias'],
  ['vencendo_7', 'Encerram em até 7 dias'],
] as const;

const SEM_PRECOS: ResumoPrecos = {
  itens_total: 0,
  comparados: 0,
  acima_da_faixa: 0,
  abaixo_da_faixa: 0,
};
const SEM_CONCORRENTES: Concorrentes = {
  neste_edital: { vencedores: [] },
  similares: [],
  do_orgao: [],
  dos_itens: [],
};
/** Edital sem itens coletados: não há o que comparar, e isso não é falha. */
const semItens = (causa: unknown) => causa instanceof ApiError && causa.status === 409;

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tenta de novo uma vez se a consulta bater no limite por minuto. */
async function comRetentativa<T>(chamada: () => Promise<T>): Promise<T> {
  try {
    return await chamada();
  } catch (causa) {
    if (/limite|public_rate_limit|429|Muitas/i.test(String((causa as Error)?.message ?? causa))) {
      await espera(8000);
      return chamada();
    }
    throw causa;
  }
}

/** Lê os documentos do edital no servidor e espera ficar pronto. */
async function lerDocumentos(id: string): Promise<Leitura | 'falhou'> {
  for (let tentativa = 0; tentativa < 40; tentativa += 1) {
    const resposta = await comRetentativa(() =>
      api<{ estado: 'lendo' | 'erro' | 'pronta' } & Partial<Leitura>>(`/editais/${id}/leitura`),
    ).catch(() => null);
    if (!resposta || resposta.estado === 'erro') return 'falhou';
    if (resposta.estado === 'pronta') {
      return {
        documentos: resposta.documentos ?? [],
        fatos: resposta.fatos ?? [],
        alertas: resposta.alertas ?? [],
      };
    }
    await espera(3000);
  }
  return 'falhou';
}

const fato = (leitura: Leitura | 'falhou' | undefined, id: string): string | null =>
  leitura && leitura !== 'falhou'
    ? (leitura.fatos.find((item) => item.id === id)?.valor ?? null)
    : null;

function textoDePrecos(precos: ResumoPrecos | 'falhou' | undefined): string {
  if (!precos) return 'Buscando…';
  if (precos === 'falhou') return 'Não foi possível comparar agora.';
  if (!precos.comparados) return 'Sem itens com código CATMAT para comparar.';
  const partes = [`Comparados ${precos.comparados} de ${precos.itens_total} itens`];
  partes.push(
    precos.acima_da_faixa
      ? `estimado acima do usual em ${precos.acima_da_faixa}`
      : 'nenhum acima do usual',
  );
  if (precos.abaixo_da_faixa) partes.push(`abaixo do usual em ${precos.abaixo_da_faixa}`);
  return `${partes.join(' · ')}.`;
}

function topConcorrentes(dados: Concorrentes | 'falhou' | undefined): {
  titulo: string;
  lista: Concorrente[];
} | null {
  if (!dados || dados === 'falhou') return null;
  if (dados.neste_edital.vencedores.length) {
    return { titulo: 'Venceram este edital', lista: dados.neste_edital.vencedores.slice(0, 3) };
  }
  const vistos = new Map<string, Concorrente>();
  for (const empresa of [...dados.similares, ...dados.dos_itens, ...dados.do_orgao]) {
    const atual = vistos.get(empresa.chave);
    if (!atual || empresa.vitorias > atual.vitorias) vistos.set(empresa.chave, empresa);
  }
  const lista = [...vistos.values()].sort((a, b) => b.vitorias - a.vitorias).slice(0, 3);
  return { titulo: 'Costumam vencer aqui', lista };
}

/** Valor curto para os quadros de resumo: R$ 250,6 mi. */
function valorCurto(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

function dataHora(iso: string | null): string {
  if (!iso) return '—';
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? '—'
    : data.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      });
}

function Cartao({
  item,
  analise,
  pedir,
}: Readonly<{ item: ItemRanking; analise: Analise | undefined; pedir: (id: string) => void }>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const alvo = ref.current;
    if (!alvo || typeof IntersectionObserver === 'undefined') {
      pedir(item.id);
      return;
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          pedir(item.id);
          observador.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [item.id, pedir]);

  const portal = portalDoEdital({
    sistema_origem: item.sistema_origem ?? null,
    url_origem: item.url_origem,
    titulo: item.titulo ?? '',
  });
  const prazo = deadlineInfo(item.data_encerramento_proposta);
  const valor = numero(item.valor_estimado);
  const leitura = analise?.leitura;
  const alertas = leitura && leitura !== 'falhou' ? leitura.alertas : [];
  const chaves: Array<[string, string | null]> = [
    ['Entrega', fato(leitura, 'prazo-entrega')],
    ['Pagamento', fato(leitura, 'pagamento')],
    ['Garantia', fato(leitura, 'garantia-contratual')],
    ['Amostra', fato(leitura, 'amostra')],
    ['Visita técnica', fato(leitura, 'visita-tecnica')],
    ['Atestado', fato(leitura, 'atestado')],
  ];
  const concorrentes = topConcorrentes(analise?.concorrentes);
  const carregando = !analise || analise.estado !== 'pronta';

  return (
    <article ref={ref} className="qd-card">
      <header className="qd-card-topo">
        <span className="qd-pos">{item.posicao}</span>
        <div className={`qd-nota qd-nota-${tomDaNota(item.analise.nota)}`} title="Nota de 0 a 100">
          <strong>{item.analise.nota}</strong>
          <span>nota</span>
        </div>
        <div className="qd-titulo">
          <h3>{item.titulo ?? 'Sem título'}</h3>
          <p>{item.orgao ?? 'Órgão não informado'}</p>
        </div>
        <Badge tone={prazo.tone}>{prazoCurto(item.data_encerramento_proposta)}</Badge>
      </header>
      <dl className="qd-fatos">
        <div>
          <dt>Edital</dt>
          <dd>{item.numero_compra ?? '—'}</dd>
        </div>
        <div>
          <dt>Portal</dt>
          <dd>{portal?.nome ?? item.sistema_origem ?? '—'}</dd>
        </div>
        <div>
          <dt>Situação</dt>
          <dd>{item.situacao ?? '—'}</dd>
        </div>
        <div>
          <dt>Fim das propostas</dt>
          <dd>{dataHora(item.data_encerramento_proposta)}</dd>
        </div>
        <div>
          <dt>Local</dt>
          <dd>{[item.municipio_nome, item.uf].filter(Boolean).join(' / ') || '—'}</dd>
        </div>
        <div>
          <dt>Modalidade</dt>
          <dd>{item.modalidade ?? '—'}</dd>
        </div>
        <div>
          <dt>Valor inicial</dt>
          <dd>{valor ? moeda(valor) : 'Não divulgado'}</dd>
        </div>
        <div>
          <dt>Itens</dt>
          <dd>{item.itens ?? '—'}</dd>
        </div>
      </dl>

      <div className="qd-analise">
        <section>
          <h4>O que o edital pede</h4>
          {!leitura ? (
            <p className="qd-espera">{carregando ? 'Lendo os documentos…' : '—'}</p>
          ) : leitura === 'falhou' ? (
            <p className="qd-espera">Não foi possível ler os documentos agora.</p>
          ) : leitura.fatos.length ? (
            <>
              {alertas.length ? (
                <ul className="qd-alertas">
                  {alertas.map((alerta) => (
                    <li key={alerta.id}>{alerta.texto}</li>
                  ))}
                </ul>
              ) : null}
              <dl className="qd-pede">
                {chaves
                  .filter(([, texto]) => texto)
                  .map(([rotulo, texto]) => (
                    <div key={rotulo}>
                      <dt>{rotulo}</dt>
                      <dd>{texto}</dd>
                    </div>
                  ))}
              </dl>
            </>
          ) : (
            <p className="qd-espera">
              {leitura.documentos.length === 0
                ? 'Sem documentos publicados.'
                : leitura.documentos.some((doc) => doc.estado === 'lido')
                  ? 'Nada encontrado no texto dos documentos.'
                  : 'Os documentos não puderam ser lidos.'}
            </p>
          )}
        </section>
        <section>
          <h4>Preços pagos</h4>
          <p className={analise?.precos ? '' : 'qd-espera'}>{textoDePrecos(analise?.precos)}</p>
        </section>
        <section>
          <h4>Concorrentes</h4>
          {!analise?.concorrentes ? (
            <p className="qd-espera">Buscando…</p>
          ) : analise.concorrentes === 'falhou' ? (
            <p className="qd-espera">Não foi possível buscar agora.</p>
          ) : concorrentes?.lista.length ? (
            <>
              <small>{concorrentes.titulo}</small>
              <ul className="qd-conc">
                {concorrentes.lista.map((empresa) => (
                  <li key={empresa.chave}>
                    <strong>{empresa.nome}</strong>
                    <span>
                      {empresa.vitorias} {empresa.vitorias === 1 ? 'compra' : 'compras'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="qd-espera">Sem histórico encontrado.</p>
          )}
        </section>
      </div>

      <footer className="qd-no-print qd-acoes">
        <Link className="ui-btn ui-btn-small" href={`/radar/${item.id}`}>
          Ver edital completo
        </Link>
      </footer>
    </article>
  );
}

export function Quadro() {
  const [foco, setFoco] = useState<FocoAnalise>('interessantes');
  const [prazo, setPrazo] = useState<string>('abertas');
  const [q, setQ] = useState('');
  const [ufs, setUfs] = useState<string[]>([]);
  const [usarPerfil, setUsarPerfil] = useState(true);
  const [estado, setEstado] = useState<
    { s: 'carregando' } | { s: 'erro'; mensagem: string } | { s: 'pronto'; dados: RankingResposta }
  >({ s: 'carregando' });
  const [analises, setAnalises] = useState<Record<string, Analise>>({});
  const [baixando, setBaixando] = useState(false);
  const [aviso, setAviso] = useState('');

  const consulta = useMemo(() => {
    const query = new URLSearchParams({ foco, situacao_prazo: prazo, limite: '20' });
    if (!usarPerfil) query.set('usar_perfil', 'false');
    if (q.trim()) query.set('q', q.trim());
    if (ufs.length) query.set('uf', ufs.join(','));
    return query.toString();
  }, [foco, prazo, q, ufs, usarPerfil]);

  useEffect(() => {
    let vivo = true;
    setEstado({ s: 'carregando' });
    const atraso = setTimeout(() => {
      api<RankingResposta>(`/analise/ranking?${consulta}`)
        .then((dados) => vivo && setEstado({ s: 'pronto', dados }))
        .catch((causa: unknown) => vivo && setEstado({ s: 'erro', mensagem: errorText(causa) }));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(atraso);
    };
  }, [consulta]);

  // Fila: um edital por vez, na ordem em que aparecem na tela.
  const fila = useRef<ItemRanking[]>([]);
  const rodando = useRef(false);
  const pedidos = useRef(new Set<string>());
  const itensPorId = useRef(new Map<string, ItemRanking>());
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const mudar = useCallback((id: string, parte: Partial<Analise>) => {
    if (!vivo.current) return;
    setAnalises((atual) => ({ ...atual, [id]: { estado: 'analisando', ...atual[id], ...parte } }));
  }, []);

  const analisar = useCallback(
    async (item: ItemRanking) => {
      mudar(item.id, { estado: 'analisando' });
      await send('POST', `/editais/${item.id}/detalhes/atualizar`, { force: false }).catch(
        () => undefined,
      );
      await Promise.all([
        lerDocumentos(item.id).then((leitura) => mudar(item.id, { leitura })),
        comRetentativa(() => api<{ resumo: ResumoPrecos }>(`/editais/${item.id}/historico-precos`))
          .then((resposta) => mudar(item.id, { precos: resposta.resumo }))
          .catch((causa: unknown) =>
            mudar(item.id, { precos: semItens(causa) ? SEM_PRECOS : 'falhou' }),
          ),
        comRetentativa(() => api<Concorrentes>(`/editais/${item.id}/concorrentes`))
          .then((resposta) => mudar(item.id, { concorrentes: resposta }))
          .catch((causa: unknown) =>
            mudar(item.id, { concorrentes: semItens(causa) ? SEM_CONCORRENTES : 'falhou' }),
          ),
      ]);
      mudar(item.id, { estado: 'pronta' });
    },
    [mudar],
  );

  const rodarFila = useCallback(async () => {
    if (rodando.current) return;
    rodando.current = true;
    try {
      for (let proximo = fila.current.shift(); proximo; proximo = fila.current.shift()) {
        if (!vivo.current) break;
        await analisar(proximo);
      }
    } finally {
      rodando.current = false;
    }
  }, [analisar]);

  const pedir = useCallback(
    (id: string) => {
      if (pedidos.current.has(id)) return;
      const item = itensPorId.current.get(id);
      if (!item) return;
      pedidos.current.add(id);
      mudar(id, { estado: 'fila' });
      fila.current.push(item);
      void rodarFila();
    },
    [mudar, rodarFila],
  );

  // Nova busca: zera a fila.
  useEffect(() => {
    if (estado.s !== 'pronto') return;
    fila.current = [];
    pedidos.current = new Set();
    itensPorId.current = new Map(estado.dados.itens.map((item) => [item.id, item]));
    setAnalises({});
  }, [estado]);

  const itens = estado.s === 'pronto' ? estado.dados.itens : [];
  const prontos = itens.filter((item) => analises[item.id]?.estado === 'pronta').length;

  function linhas(): (string | number | null)[][] {
    return itens.map((item) => {
      const a = analises[item.id];
      const l = a?.leitura;
      const portal = portalDoEdital({
        sistema_origem: item.sistema_origem ?? null,
        url_origem: item.url_origem,
        titulo: item.titulo ?? '',
      });
      const conc = topConcorrentes(a?.concorrentes);
      const dias = item.data_encerramento_proposta
        ? Math.ceil((new Date(item.data_encerramento_proposta).getTime() - Date.now()) / 86_400_000)
        : null;
      return [
        item.posicao,
        item.analise.nota,
        item.numero_compra,
        portal?.nome ?? item.sistema_origem ?? null,
        item.situacao,
        dataHora(item.data_encerramento_proposta),
        dias,
        item.orgao,
        [item.municipio_nome, item.uf].filter(Boolean).join('/') || null,
        numero(item.valor_estimado) ?? 'Não divulgado',
        item.titulo,
        item.url_origem,
        fato(l, 'prazo-entrega'),
        fato(l, 'pagamento'),
        fato(l, 'garantia-contratual'),
        fato(l, 'amostra'),
        fato(l, 'visita-tecnica'),
        fato(l, 'atestado'),
        l && l !== 'falhou' ? l.alertas.map((alerta) => alerta.texto).join(' ') || null : null,
        a?.precos ? textoDePrecos(a.precos) : null,
        conc?.lista.length
          ? `${conc.titulo}: ${conc.lista.map((empresa) => `${empresa.nome} (${empresa.vitorias})`).join('; ')}`
          : null,
      ];
    });
  }

  async function baixarExcel() {
    setBaixando(true);
    setAviso('');
    try {
      const resposta = await fetch('/api/core/analise/quadro/xlsx', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          titulo: 'Quadro de decisão',
          cabecalho: [
            'Posição',
            'Nota',
            'Edital',
            'Portal',
            'Situação',
            'Fim das propostas',
            'Dias restantes',
            'Órgão',
            'Local',
            'Valor inicial',
            'Objeto',
            'Link',
            'Prazo de entrega',
            'Pagamento',
            'Garantia',
            'Amostra',
            'Visita técnica',
            'Atestado',
            'Atenção',
            'Preços pagos',
            'Concorrentes',
          ],
          larguras: [
            9, 7, 14, 22, 14, 18, 10, 40, 20, 16, 60, 40, 22, 16, 24, 24, 16, 26, 50, 44, 50,
          ],
          linhas: linhas(),
        }),
      });
      if (!resposta.ok) throw new Error('falhou');
      const blob = await resposta.blob();
      const endereco = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = endereco;
      link.download = `quadro-de-decisao-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(endereco);
    } catch {
      setAviso('Não foi possível gerar o Excel agora.');
    } finally {
      setBaixando(false);
    }
  }

  const encerramEm3 = itens.filter((item) => {
    const fim = item.data_encerramento_proposta
      ? new Date(item.data_encerramento_proposta).getTime()
      : null;
    return fim !== null && fim - Date.now() <= 3 * 86_400_000 && fim > Date.now();
  }).length;
  const somaValores = itens.reduce((soma, item) => soma + (numero(item.valor_estimado) ?? 0), 0);

  return (
    <div className="qd">
      <form className="qd-filtros qd-no-print" onSubmit={(evento) => evento.preventDefault()}>
        <label>
          Ordenar por
          <select value={foco} onChange={(evento) => setFoco(evento.target.value as FocoAnalise)}>
            {FOCOS_ANALISE.map((chave) => (
              <option key={chave} value={chave}>
                {FOCO_ROTULOS[chave]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prazo
          <select value={prazo} onChange={(evento) => setPrazo(evento.target.value)}>
            {PRAZOS.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar
          <input
            type="search"
            value={q}
            onChange={(evento) => setQ(evento.target.value)}
            placeholder="Ex.: tecnologia, backup, notebook"
          />
        </label>
        <UfPicker value={ufs} onChange={setUfs} label="Estados" />
        <label className="qd-perfil">
          <input
            type="checkbox"
            checked={usarPerfil}
            onChange={(evento) => setUsarPerfil(evento.target.checked)}
          />
          Usar meu perfil
        </label>
      </form>

      {estado.s === 'carregando' ? <p className="ui-loading">Buscando as oportunidades…</p> : null}
      {estado.s === 'erro' ? <Alert kind="error">{estado.mensagem}</Alert> : null}

      {estado.s === 'pronto' ? (
        itens.length ? (
          <>
            <section className="ui-kpis" aria-label="Resumo">
              <Kpi label="Oportunidades" value={String(itens.length)} />
              <Kpi
                label="Encerram em até 3 dias"
                value={String(encerramEm3)}
                tone={encerramEm3 ? 'warn' : undefined}
              />
              <Kpi label="Valor somado" value={valorCurto(somaValores)} />
              <Kpi label="Análises prontas" value={`${prontos} de ${itens.length}`} />
            </section>
            <div className="qd-barra qd-no-print">
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-small"
                disabled={baixando}
                onClick={() => void baixarExcel()}
              >
                {baixando ? 'Gerando…' : 'Baixar Excel'}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-small"
                onClick={() => window.print()}
              >
                Salvar em PDF
              </button>
              {aviso ? <span role="alert">{aviso}</span> : null}
            </div>
            <div className="qd-lista qd-print">
              {itens.map((item) => (
                <Cartao key={item.id} item={item} analise={analises[item.id]} pedir={pedir} />
              ))}
            </div>
          </>
        ) : (
          <Empty>Nenhuma oportunidade encontrada. Mude o prazo ou a busca.</Empty>
        )
      ) : null}
    </div>
  );
}
