'use client';

import { useState } from 'react';
import {
  formatarDocumento,
  type ComparacaoDePreco,
  type Concorrente,
  type PosicaoDoPreco,
} from '@licitecomigo/shared';
import { api, errorText } from '../../../lib/api';
import { reais } from '../../../lib/money';
import { Alert, Badge, Kpi, formatDate } from '../../components/ui';
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
};
type Fonte = { id: string; nome: string; url: string; descricao: string };
type RespostaConcorrentes = {
  neste_edital: { disponivel: boolean; motivo: string; vencedores: Concorrente[] };
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

/** Preço estimado × preços pagos em outras compras do mesmo item. */
function PrecosPagos({ editalId, temItens }: Readonly<{ editalId: string; temItens: boolean }>) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<RespostaPrecos | null>(null);

  async function carregar() {
    setOcupado(true);
    setErro('');
    try {
      setDados(await api<RespostaPrecos>(`/editais/${editalId}/historico-precos`));
    } catch (causa) {
      setErro(errorText(causa));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mk-bloco">
      <h3>Preços pagos em outras compras</h3>
      {temItens ? (
        <p>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-small"
            disabled={ocupado}
            onClick={() => void carregar()}
          >
            {ocupado
              ? 'Consultando o Compras.gov.br…'
              : dados
                ? 'Atualizar comparação'
                : 'Comparar preços'}
          </button>
        </p>
      ) : (
        <Alert kind="info">Busque os itens do edital primeiro.</Alert>
      )}
      {erro ? <Alert kind="error">{erro}</Alert> : null}
      {dados ? (
        <>
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
}: Readonly<{ titulo: string; ajuda?: string; lista: Concorrente[]; vazio: string }>) {
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
function Concorrentes({ editalId }: Readonly<{ editalId: string }>) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<RespostaConcorrentes | null>(null);

  async function carregar() {
    setOcupado(true);
    setErro('');
    try {
      setDados(await api<RespostaConcorrentes>(`/editais/${editalId}/concorrentes`));
    } catch (causa) {
      setErro(errorText(causa));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mk-bloco">
      <h3>Concorrentes</h3>
      <p>
        <button
          type="button"
          className="ui-btn ui-btn-ghost ui-btn-small"
          disabled={ocupado}
          onClick={() => void carregar()}
        >
          {ocupado
            ? 'Consultando o PNCP e o Compras.gov.br…'
            : dados
              ? 'Atualizar concorrentes'
              : 'Ver concorrentes'}
        </button>
      </p>
      {erro ? <Alert kind="error">{erro}</Alert> : null}
      {dados ? (
        <>
          {dados.avisos.map((aviso) => (
            <Alert key={aviso} kind="error">
              {aviso}
            </Alert>
          ))}
          <ListaDeConcorrentes
            titulo="Neste edital"
            lista={dados.neste_edital.vencedores}
            vazio="Ainda sem resultado publicado."
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
        </>
      ) : null}
    </div>
  );
}

export function MercadoDoEdital({
  editalId,
  temItens,
}: Readonly<{ editalId: string; temItens: boolean }>) {
  return (
    <div className="mk">
      <PrecosPagos editalId={editalId} temItens={temItens} />
      <Concorrentes editalId={editalId} />
    </div>
  );
}
