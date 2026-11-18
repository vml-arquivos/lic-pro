'use client';

import { useEffect, useRef, useState } from 'react';
import {
  formatarDocumento,
  type ComparacaoDePreco,
  type Concorrente,
  type PosicaoDoPreco,
} from '@licitecomigo/shared';
import { api, errorText } from '../../../lib/api';
import { reais } from '../../../lib/money';
import { Alert, Badge, Kpi, formatDate } from '../../components/ui';
import { SituacaoDoDado, type MetaDoDado } from './SituacaoDoDado';
import './mercado.css';

type Estatistica = {
  amostras: number;
  minimo: number;
  maximo: number;
  mediana: number;
  p25: number;
  p75: number;
};
type ItemDePreco = {
  numero: string;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario_estimado: number | null;
  catmat: string | null;
  comparacao: ComparacaoDePreco | null;
  estatistica: Estatistica | null;
  na_uf: Estatistica | null;
  precos_recentes: Array<{
    preco: number;
    quantidade: number | null;
    data: string | null;
    fornecedor: string | null;
    uasg: string | null;
    uf: string | null;
  }>;
  motivo: string | null;
};
type RespostaPrecos = {
  itens: ItemDePreco[];
  nao_comparados: Array<{ numero: string; descricao: string; motivo: string }>;
  resumo: {
    itens_total: number;
    comparados: number;
    acima_da_faixa: number;
    abaixo_da_faixa: number;
  };
  periodo_meses: number;
  uf: string | null;
  aviso: string;
  fonte: { nome: string; url: string; consultado_em: string };
  estado?: 'completo' | 'parcial' | 'sem_itens_comparaveis';
  cobertura?: {
    itens_total: number;
    itens_comparaveis: number;
    limite: number;
    codigos_consultados: number;
    codigos_com_falha: number;
  };
  dados?: MetaDoDado | null;
};
type Fonte = { id: string; nome: string; url: string; descricao: string };
type RespostaConcorrentes = {
  neste_edital: {
    disponivel: boolean;
    estado?: string;
    motivo: string;
    vencedores: Concorrente[];
    cobertura?: {
      itens_total: number;
      consultados: number;
      publicados: number;
      falhas: number;
    } | null;
  };
  blocos?: {
    contratos_do_orgao: { estado: string; paginas_lidas?: number; total_paginas?: number };
    fornecedores_dos_itens: { estado: string; consultados: number; falhas: number };
  };
  dados?: MetaDoDado | null;
  similares: Concorrente[];
  do_orgao: Concorrente[];
  dos_itens: Concorrente[];
  contratos_analisados: number;
  periodo_meses: number;
  itens_consultados: string[];
  avisos: string[];
  aviso: string;
  fontes: Fonte[];
  consultado_em: string;
};

const POSICAO: Record<PosicaoDoPreco, { rotulo: string; tom: string }> = {
  abaixo_do_minimo: { rotulo: 'Abaixo do menor preço pago', tom: 'danger' },
  abaixo_da_faixa: { rotulo: 'Abaixo da faixa usual', tom: 'warn' },
  na_faixa: { rotulo: 'Dentro da faixa usual', tom: 'ok' },
  acima_da_faixa: { rotulo: 'Acima da faixa usual', tom: 'ok' },
  acima_do_maximo: { rotulo: 'Acima do maior preço pago', tom: 'ok' },
};

/** Conferência automática enquanto a página está aberta. */
export const CONFERE_A_CADA_MS = 10 * 60_000;
/** Esperas entre novas tentativas depois de uma falha (ms). */
export const ESPERAS_APOS_ERRO_MS = [4_000, 10_000, 25_000];

/**
 * Hook comum: busca ao abrir e de novo quando `quando` muda. Mantém o último dado na tela
 * durante uma nova busca ou se ela falhar. Se a busca falhar, tenta sozinho mais algumas vezes.
 * Se o servidor avisar que está atualizando por baixo, confere de novo em poucos segundos.
 * Com a página aberta, confere a cada 10 minutos (e ao voltar para a aba, se já passou o tempo).
 */
export function useBusca<T extends { dados?: MetaDoDado | null }>(
  caminho: string,
  ativo: boolean,
  quando: string,
) {
  const [ocupado, setOcupado] = useState(ativo);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<T | null>(null);
  const [rodada, setRodada] = useState(0);
  const [falhas, setFalhas] = useState(0);
  const caminhoAtual = useRef(caminho);
  const ultimaBusca = useRef(0);

  useEffect(() => {
    if (!ativo) {
      setOcupado(false);
      return;
    }
    let vivo = true;
    // Outro edital: não mostra o dado do anterior.
    if (caminhoAtual.current !== caminho) {
      caminhoAtual.current = caminho;
      setDados(null);
      setFalhas(0);
    }
    setOcupado(true);
    setErro('');
    api<T>(caminho)
      .then((resposta) => {
        if (!vivo) return;
        ultimaBusca.current = Date.now();
        setDados(resposta);
        setFalhas(0);
      })
      .catch((causa: unknown) => {
        if (!vivo) return;
        setErro(errorText(causa));
        setFalhas((valor) => valor + 1);
      })
      .finally(() => vivo && setOcupado(false));
    return () => {
      vivo = false;
    };
  }, [caminho, ativo, quando, rodada]);

  // Falhou: tenta de novo sozinho algumas vezes, com espera crescente.
  useEffect(() => {
    if (!ativo || !erro || falhas === 0 || falhas > ESPERAS_APOS_ERRO_MS.length) return;
    const espera = setTimeout(
      () => setRodada((valor) => valor + 1),
      ESPERAS_APOS_ERRO_MS[falhas - 1] ?? 25_000,
    );
    return () => clearTimeout(espera);
  }, [ativo, erro, falhas]);

  // O servidor está atualizando por baixo: confere de novo algumas vezes.
  const [conferencias, setConferencias] = useState(0);
  const atualizandoPorBaixo = Boolean(dados?.dados?.atualizando);
  useEffect(() => {
    if (!atualizandoPorBaixo || conferencias >= 4) return;
    const espera = setTimeout(() => {
      setConferencias((valor) => valor + 1);
      setRodada((valor) => valor + 1);
    }, 5000);
    return () => clearTimeout(espera);
  }, [atualizandoPorBaixo, conferencias, dados]);
  useEffect(() => setConferencias(0), [caminho]);

  // Página aberta: confere no tempo definido e ao voltar para a aba.
  useEffect(() => {
    if (!ativo) return;
    const conferir = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimaBusca.current < CONFERE_A_CADA_MS) return;
      setRodada((valor) => valor + 1);
    };
    const relogio = setInterval(conferir, 60_000);
    document.addEventListener('visibilitychange', conferir);
    return () => {
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', conferir);
    };
  }, [ativo]);

  return {
    ocupado,
    erro,
    tentandoDeNovo: Boolean(erro) && falhas > 0 && falhas <= ESPERAS_APOS_ERRO_MS.length,
    dados,
    atualizar: () => {
      setFalhas(0);
      setRodada((valor) => valor + 1);
    },
  };
}

function Atualizar({ ocupado, aoClicar }: Readonly<{ ocupado: boolean; aoClicar: () => void }>) {
  return (
    <p className="mk-atualizar">
      <button
        type="button"
        className="ui-btn ui-btn-ghost ui-btn-small"
        disabled={ocupado}
        onClick={aoClicar}
      >
        Atualizar
      </button>
    </p>
  );
}

/** Preço estimado × preços pagos em outras compras do mesmo item. */
export function PrecosDoEdital({
  editalId,
  temItens,
  buscando,
}: Readonly<{ editalId: string; temItens: boolean; buscando: boolean }>) {
  const { ocupado, erro, tentandoDeNovo, dados, atualizar } = useBusca<RespostaPrecos>(
    `/editais/${editalId}/historico-precos`,
    temItens,
    editalId,
  );

  return (
    <div className="mk-bloco">
      {!temItens ? (
        buscando ? (
          <p className="mk-vazio">Buscando os itens do edital…</p>
        ) : (
          <Alert kind="info">Este edital não tem itens para comparar.</Alert>
        )
      ) : ocupado && !dados ? (
        <p className="mk-vazio" role="status">
          Comparando os preços…
        </p>
      ) : null}
      {erro && !tentandoDeNovo ? <Alert kind="error">{erro}</Alert> : null}
      {tentandoDeNovo && !dados ? (
        <p className="mk-vazio" role="status">
          Tentando de novo…
        </p>
      ) : null}
      {erro && !tentandoDeNovo && !dados ? (
        <Atualizar ocupado={ocupado} aoClicar={atualizar} />
      ) : null}
      {dados ? (
        <>
          <SituacaoDoDado
            fonte="Compras.gov.br"
            meta={dados.dados}
            cobertura={
              dados.cobertura
                ? `${dados.resumo.comparados} de ${dados.cobertura.itens_total} itens comparados` +
                  (dados.cobertura.codigos_com_falha
                    ? `, ${dados.cobertura.codigos_com_falha} sem resposta`
                    : '')
                : null
            }
          />
          <section className="ui-kpis" aria-label="Resumo da comparação de preços">
            <Kpi
              label="Itens comparados"
              value={`${dados.resumo.comparados} de ${dados.resumo.itens_total}`}
            />
            <Kpi label="Estimado acima do usual" value={String(dados.resumo.acima_da_faixa)} />
            <Kpi label="Estimado abaixo do usual" value={String(dados.resumo.abaixo_da_faixa)} />
          </section>
          <ul className="mk-lista">
            {dados.itens.map((item) => (
              <li key={item.numero} className="mk-item">
                <div className="mk-item-topo">
                  <strong>
                    {item.numero} · {item.descricao}
                  </strong>
                  {item.comparacao?.posicao ? (
                    <Badge tone={POSICAO[item.comparacao.posicao].tom}>
                      {POSICAO[item.comparacao.posicao].rotulo}
                    </Badge>
                  ) : null}
                </div>
                <small>
                  CATMAT {item.catmat}
                  {item.quantidade
                    ? ` · ${item.quantidade.toLocaleString('pt-BR')} ${item.unidade ?? 'un.'}`
                    : ''}
                </small>
                {item.estatistica ? (
                  <dl className="mk-numeros">
                    <div>
                      <dt>Estimado no edital</dt>
                      <dd>{reais(item.valor_unitario_estimado)}</dd>
                    </div>
                    <div>
                      <dt>Mediana paga</dt>
                      <dd>{reais(item.estatistica.mediana)}</dd>
                    </div>
                    <div>
                      <dt>Faixa usual</dt>
                      <dd>
                        {reais(item.estatistica.p25)} a {reais(item.estatistica.p75)}
                      </dd>
                    </div>
                    <div>
                      <dt>Menor / maior</dt>
                      <dd>
                        {reais(item.estatistica.minimo)} / {reais(item.estatistica.maximo)}
                      </dd>
                    </div>
                    <div>
                      <dt>Compras analisadas</dt>
                      <dd>{item.estatistica.amostras}</dd>
                    </div>
                    {item.na_uf ? (
                      <div>
                        <dt>Mediana em {dados.uf}</dt>
                        <dd>
                          {reais(item.na_uf.mediana)} ({item.na_uf.amostras} compras)
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                <p className="mk-leitura">{item.comparacao?.texto ?? item.motivo}</p>
                {item.precos_recentes.length ? (
                  <details>
                    <summary>Compras mais recentes deste item</summary>
                    <ul className="mk-compras">
                      {item.precos_recentes.map((preco, indice) => (
                        <li key={`${preco.data}-${indice}`}>
                          <strong>{reais(preco.preco)}</strong> · {formatDate(preco.data)} ·{' '}
                          {preco.fornecedor ?? 'fornecedor não informado'}
                          <small>
                            {[
                              preco.uasg,
                              preco.uf,
                              preco.quantidade ? `${preco.quantidade} un.` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
          {dados.nao_comparados.length ? (
            <details>
              <summary>{dados.nao_comparados.length} item(ns) sem comparação</summary>
              <ul className="mk-compras">
                {dados.nao_comparados.map((item) => (
                  <li key={item.numero}>
                    <strong>{item.numero}</strong> {item.descricao}
                    <small>{item.motivo}</small>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {erro || dados.dados?.desatualizado ? (
            <Atualizar ocupado={ocupado} aoClicar={atualizar} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ListaDeConcorrentes({
  titulo,
  ajuda,
  lista,
  vazio,
}: Readonly<{ titulo: string; ajuda?: string | undefined; lista: Concorrente[]; vazio: string }>) {
  return (
    <section className="mk-grupo">
      <h4>{titulo}</h4>
      {ajuda ? <p className="mk-ajuda">{ajuda}</p> : null}
      {lista.length ? (
        <ol className="mk-concorrentes">
          {lista.map((empresa) => (
            <li key={empresa.chave} className="mk-item">
              <div className="mk-item-topo">
                <strong>{empresa.nome}</strong>
                <Badge tone="ok">{`${empresa.vitorias} ${empresa.vitorias === 1 ? 'compra' : 'compras'}`}</Badge>
              </div>
              <small>
                {empresa.cnpj
                  ? `CNPJ ${formatarDocumento(empresa.cnpj)}`
                  : empresa.pessoa_fisica
                    ? 'Pessoa física'
                    : 'CNPJ não informado pela fonte'}
                {empresa.ufs.length ? ` · ${empresa.ufs.join(', ')}` : ''}
                {empresa.ultima_data ? ` · última em ${formatDate(empresa.ultima_data)}` : ''}
                {empresa.valor_contratos ? ` · ${reais(empresa.valor_contratos)} em contratos` : ''}
              </small>
              {empresa.orgaos.length ? <small>Órgãos: {empresa.orgaos.join('; ')}</small> : null}
              <details>
                <summary>Ver registros</summary>
                <ul className="mk-compras">
                  {empresa.exemplos.map((exemplo, indice) => (
                    <li key={`${exemplo.link ?? exemplo.data}-${indice}`}>
                      {exemplo.objeto ?? 'Objeto não informado'}
                      <small>
                        {[
                          exemplo.valor ? reais(exemplo.valor) : null,
                          formatDate(exemplo.data),
                          exemplo.orgao,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {exemplo.link ? (
                          <>
                            {' · '}
                            <a href={exemplo.link} target="_blank" rel="noreferrer">
                              ver no PNCP
                            </a>
                          </>
                        ) : null}
                      </small>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      ) : vazio ? (
        <p className="mk-vazio">{vazio}</p>
      ) : null}
    </section>
  );
}

/** Concorrentes: neste edital (se já fechou) e pelo histórico real do órgão e dos itens. */
export function ConcorrentesDoEdital({
  editalId,
  temItens,
  buscando,
}: Readonly<{ editalId: string; temItens: boolean; buscando: boolean }>) {
  // Espera os itens chegarem para já incluir os fornecedores dos mesmos itens.
  const { ocupado, erro, tentandoDeNovo, dados, atualizar } = useBusca<RespostaConcorrentes>(
    `/editais/${editalId}/concorrentes`,
    !buscando,
    String(temItens),
  );

  return (
    <div className="mk-bloco">
      {(ocupado && !dados) || buscando ? (
        <p className="mk-vazio" role="status">
          Buscando os concorrentes…
        </p>
      ) : null}
      {erro && !tentandoDeNovo ? <Alert kind="error">{erro}</Alert> : null}
      {tentandoDeNovo && !dados ? (
        <p className="mk-vazio" role="status">
          Tentando de novo…
        </p>
      ) : null}
      {erro && !tentandoDeNovo && !dados ? (
        <Atualizar ocupado={ocupado} aoClicar={atualizar} />
      ) : null}
      {dados ? (
        <>
          <SituacaoDoDado
            fonte="PNCP e Compras.gov.br"
            meta={dados.dados}
            cobertura={
              dados.contratos_analisados
                ? `${dados.contratos_analisados} contratos do órgão` +
                  (dados.blocos?.contratos_do_orgao.estado === 'parcial'
                    ? ` (${dados.blocos.contratos_do_orgao.paginas_lidas} de ${dados.blocos.contratos_do_orgao.total_paginas} páginas)`
                    : '')
                : null
            }
          />
          {dados.avisos.map((aviso) => (
            <Alert key={aviso} kind="error">
              {aviso}
            </Alert>
          ))}
          <ListaDeConcorrentes
            titulo="Neste edital"
            ajuda={
              dados.neste_edital.cobertura && dados.neste_edital.estado === 'parcial'
                ? `Resultado de ${dados.neste_edital.cobertura.publicados} de ${dados.neste_edital.cobertura.consultados} itens.`
                : undefined
            }
            lista={dados.neste_edital.vencedores}
            vazio={dados.neste_edital.motivo}
          />
          <ListaDeConcorrentes
            titulo="Venceram compras parecidas neste órgão"
            lista={dados.similares}
            vazio="Nenhum contrato parecido encontrado."
          />
          <ListaDeConcorrentes
            titulo="Mais contratados pelo órgão"
            lista={dados.do_orgao}
            vazio="Nenhum contrato encontrado."
          />
          <ListaDeConcorrentes
            titulo="Fornecedores dos mesmos itens"
            lista={dados.dos_itens}
            vazio="Nenhum fornecedor encontrado."
          />
          {erro || dados.dados?.desatualizado ? (
            <Atualizar ocupado={ocupado} aoClicar={atualizar} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
