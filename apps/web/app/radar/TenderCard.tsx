'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorText } from '../../lib/api';
import { Badge } from '../components/ui';
import type { EditalComparado } from '../analise/analise-lib';
import { moeda, numero, tomDaNota } from '../analise/analise-lib';
import { brl, deadlineInfo, formatDate, formatDateTime, type Tender } from './radar-lib';

export type Interaction = Partial<Pick<Tender, 'favorito' | 'descartado' | 'visto'>>;

/** Posição do edital entre todos os que combinam com a busca atual (vem do Ranking da Análise). */
export type PosicaoNoConjunto =
  | { estado: 'carregando' }
  | { estado: 'erro'; mensagem: string }
  | {
      estado: 'pronto';
      posicao: number | null;
      considerados: number;
      total: number;
      nota: number | null;
      notaMedia: number | null;
    };

function CompatBadge({ item }: Readonly<{ item: Tender }>) {
  if (item.compat === null || item.compat === undefined) return null;
  const tone = item.compat >= 70 ? 'ok' : item.compat >= 40 ? 'warn' : 'muted';
  return (
    <details className="rd-compat">
      <summary>
        <Badge tone={tone}>{`Compatibilidade ${item.compat}%`}</Badge>
      </summary>
      <ul>
        {(item.compat_detalhe ?? []).map((part) => (
          <li key={part.criterio} className={part.pontos > 0 ? 'rd-compat-yes' : 'rd-compat-no'}>
            <span aria-hidden="true">{part.pontos > 0 ? '✓' : '–'}</span> {part.descricao}
            <small>{` (${part.pontos}/${part.maximo})`}</small>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Info({
  rotulo,
  destaque,
  children,
}: Readonly<{ rotulo: string; destaque?: boolean; children: React.ReactNode }>) {
  return (
    <div className={destaque ? 'rd-info rd-info-destaque' : 'rd-info'}>
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** "Análise" dentro do card: nota, confiança, sinais e lucro estimado, só deste edital. */
function PainelAnalise({ item }: Readonly<{ item: Tender }>) {
  const [estado, setEstado] = useState<
    { s: 'carregando' } | { s: 'erro'; mensagem: string } | { s: 'pronto'; edital: EditalComparado }
  >({ s: 'carregando' });

  useEffect(() => {
    let ativo = true;
    api<{ edital: EditalComparado }>(`/analise/edital/${item.id}`)
      .then((resposta) => ativo && setEstado({ s: 'pronto', edital: resposta.edital }))
      .catch((cause: unknown) => ativo && setEstado({ s: 'erro', mensagem: errorText(cause) }));
    return () => {
      ativo = false;
    };
  }, [item.id]);

  if (estado.s === 'carregando') return <p className="rd-painel-msg">Analisando este edital…</p>;
  if (estado.s === 'erro') {
    return (
      <p className="rd-painel-msg rd-painel-erro" role="alert">
        {estado.mensagem}
      </p>
    );
  }
  const { analise } = estado.edital;
  const tom = tomDaNota(analise.nota);
  return (
    <div className="rd-painel" aria-live="polite">
      <div className="rd-painel-nota">
        <span className={`rd-nota rd-nota-${tom}`}>{Math.round(analise.nota)}</span>
        <div>
          <strong>Nota de oportunidade</strong>
          <small>Confiança {analise.confianca} · apoio para priorizar, não prevê vitória</small>
        </div>
      </div>
      <dl className="rd-painel-dados">
        <div>
          <dt>Lucro estimado</dt>
          <dd>
            {analise.lucro_estimado === null ? '—' : moeda(analise.lucro_estimado)}
            {analise.desconto_base === 'premissa' ? <small> premissa</small> : null}
          </dd>
        </div>
        <div>
          <dt>Desconto típico</dt>
          <dd>
            {analise.desconto_tipico_pct === null ? '—' : `${analise.desconto_tipico_pct}%`}
            {estado.edital.historico_orgao ? (
              <small>{` do órgão (${estado.edital.historico_orgao.amostras} pregões)`}</small>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Preço vs. mercado</dt>
          <dd>
            {estado.edital.preco_vs_mediana?.razao
              ? `${Math.round(estado.edital.preco_vs_mediana.razao * 100)}% da mediana`
              : '—'}
          </dd>
        </div>
      </dl>
      {analise.sinais.length ? (
        <ul className="an-sinais">
          {analise.sinais.slice(0, 4).map((sinal) => (
            <li key={sinal.texto} className={`an-sinal an-sinal-${sinal.tipo}`}>
              {sinal.texto}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="rd-painel-links">
        <Link
          className="ui-btn ui-btn-ghost ui-btn-small"
          href={`/analise?aba=simulador&titulo=${encodeURIComponent(item.titulo)}${
            numero(item.valor_estimado) ? `&referencia=${numero(item.valor_estimado)}` : ''
          }`}
        >
          Simular proposta
        </Link>
        <Link className="ui-btn ui-btn-ghost ui-btn-small" href={`/radar/${item.id}`}>
          Ver itens e documentos
        </Link>
      </div>
    </div>
  );
}

/** "Comparar com tudo": onde este edital fica entre todos os que combinam com a busca. */
function PainelTudo({ posicao }: Readonly<{ posicao: PosicaoNoConjunto }>) {
  if (posicao.estado === 'carregando') {
    return <p className="rd-painel-msg">Comparando com todos os editais desta busca…</p>;
  }
  if (posicao.estado === 'erro') {
    return (
      <p className="rd-painel-msg rd-painel-erro" role="alert">
        {posicao.mensagem}
      </p>
    );
  }
  const { posicao: lugar, considerados, total, nota, notaMedia } = posicao;
  return (
    <div className="rd-painel" aria-live="polite">
      {lugar ? (
        <p className="rd-painel-destaque">
          <strong>{lugar}º lugar</strong> de {considerados.toLocaleString('pt-BR')} editais abertos
          que combinam com esta busca.
        </p>
      ) : (
        <p className="rd-painel-destaque">
          Fora dos {considerados.toLocaleString('pt-BR')} melhores desta busca
          {total > considerados ? ` (de ${total.toLocaleString('pt-BR')} candidatos)` : ''}.
        </p>
      )}
      {nota !== null && notaMedia !== null ? (
        <p className="rd-painel-msg">
          Nota deste edital: <strong>{Math.round(nota)}</strong> · média dos melhores:{' '}
          <strong>{Math.round(notaMedia)}</strong>
        </p>
      ) : null}
      <div className="rd-painel-links">
        <Link className="ui-btn ui-btn-ghost ui-btn-small" href="/analise?aba=ranking">
          Abrir o Ranking completo
        </Link>
      </div>
    </div>
  );
}

export function TenderCard({
  item,
  signedIn,
  state,
  onInteract,
  marcadoParaComparar = false,
  compararCheio = false,
  onAlternarComparar,
  posicao,
  onPedirPosicao,
}: Readonly<{
  item: Tender;
  signedIn: boolean;
  state: Interaction;
  onInteract: (id: string, change: Interaction & { nota?: string }) => void;
  marcadoParaComparar?: boolean;
  compararCheio?: boolean;
  /** Sem esta função o botão "Comparar com outras" não aparece (ex.: telas sem a barra de comparação). */
  onAlternarComparar?: (item: Tender) => void;
  posicao?: PosicaoNoConjunto | undefined;
  /** Sem esta função o botão "Comparar com tudo" não aparece. */
  onPedirPosicao?: () => void;
}>) {
  const [painel, setPainel] = useState<'analise' | 'tudo' | null>(null);
  const deadline = deadlineInfo(item.data_encerramento_proposta);
  const favorito = state.favorito ?? item.favorito ?? false;
  const descartado = state.descartado ?? item.descartado ?? false;
  const visto = state.visto ?? item.visto ?? false;
  const place = [item.municipio_nome, item.uf].filter(Boolean).join(' / ');
  const distance =
    item.distancia_km !== null && item.distancia_km !== undefined
      ? Number(item.distancia_km)
      : null;
  const large = Number(item.valor_estimado ?? 0) >= 200_000_000;
  const encerra = formatDateTime(item.data_encerramento_proposta);
  const abre = formatDate(item.data_abertura_proposta);

  function alternar(qual: 'analise' | 'tudo') {
    if (painel === qual) return setPainel(null);
    setPainel(qual);
    if (qual === 'tudo') onPedirPosicao?.();
  }

  return (
    <article
      className={`rd-card${descartado ? ' rd-card-off' : ''}${visto ? ' rd-card-seen' : ''}${
        marcadoParaComparar ? ' rd-card-marcado' : ''
      }`}
    >
      <header className="rd-card-topo">
        <div className="rd-badges">
          <Badge tone={deadline.tone}>{deadline.label}</Badge>
          {large ? <Badge tone="warn">Grande vulto</Badge> : null}
          {item.srp ? <Badge tone="muted">Registro de preços</Badge> : null}
          {item.situacao && !/divulgada/i.test(item.situacao) ? (
            <Badge tone="bad">{item.situacao}</Badge>
          ) : null}
        </div>
        <CompatBadge item={item} />
      </header>

      <h3>
        <Link href={`/radar/${item.id}`}>{item.titulo}</Link>
      </h3>
      <p className="rd-orgao">{item.orgao ?? 'Órgão não informado'}</p>

      <dl className="rd-infos">
        <Info rotulo="Valor estimado" destaque>
          {brl(item.valor_estimado)}
        </Info>
        <Info rotulo="Propostas até">{encerra || 'Não informado'}</Info>
        <Info rotulo="Local">{place || 'Não informado'}</Info>
        <Info rotulo="Modalidade">{item.modalidade ?? 'Não informada'}</Info>
        {item.data_publicacao ? (
          <Info rotulo="Publicado em">{formatDate(item.data_publicacao)}</Info>
        ) : null}
        {abre ? <Info rotulo="Abertura">{abre}</Info> : null}
        {item.numero_compra ? <Info rotulo="Compra nº">{item.numero_compra}</Info> : null}
        {item.itens_coletados ? <Info rotulo="Itens">{item.itens_coletados}</Info> : null}
        {distance !== null ? (
          <Info rotulo="Distância">{`${distance.toLocaleString('pt-BR')} km`}</Info>
        ) : null}
      </dl>

      <p className="rd-source">
        Fonte: {item.sistema_origem ?? item.fonte ?? 'não informada'}
        {item.url_origem ? (
          <>
            {' · '}
            <a href={item.url_origem} target="_blank" rel="noreferrer noopener">
              ver no portal de origem
            </a>
          </>
        ) : null}
      </p>

      <footer className="rd-card-acoes">
        <div className="rd-acoes-principais">
          <Link className="ui-btn ui-btn-small" href={`/radar/${item.id}`}>
            Abrir edital
          </Link>
          {signedIn ? (
            <>
              <button
                type="button"
                className={`ui-btn ui-btn-small ${painel === 'analise' ? '' : 'ui-btn-ghost'}`}
                aria-expanded={painel === 'analise'}
                onClick={() => alternar('analise')}
              >
                Análise
              </button>
              {onAlternarComparar ? (
                <button
                  type="button"
                  className={`ui-btn ui-btn-small ${marcadoParaComparar ? '' : 'ui-btn-ghost'}`}
                  aria-pressed={marcadoParaComparar}
                  disabled={!marcadoParaComparar && compararCheio}
                  title={
                    !marcadoParaComparar && compararCheio
                      ? 'Máximo de 4 editais para comparar'
                      : 'Marque 2 a 4 editais e compare lado a lado'
                  }
                  onClick={() => onAlternarComparar(item)}
                >
                  {marcadoParaComparar ? '✓ Na comparação' : 'Comparar com outras'}
                </button>
              ) : null}
              {onPedirPosicao ? (
                <button
                  type="button"
                  className={`ui-btn ui-btn-small ${painel === 'tudo' ? '' : 'ui-btn-ghost'}`}
                  aria-expanded={painel === 'tudo'}
                  onClick={() => alternar('tudo')}
                >
                  Comparar com tudo
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        {signedIn ? (
          <div className="rd-acoes-extra">
            <button
              type="button"
              className="rd-link-btn"
              aria-pressed={favorito}
              onClick={() => onInteract(item.id, { favorito: !favorito })}
            >
              {favorito ? '★ Favorita' : '☆ Favoritar'}
            </button>
            <button
              type="button"
              className="rd-link-btn"
              aria-pressed={descartado}
              onClick={() => onInteract(item.id, { descartado: !descartado })}
            >
              {descartado ? 'Restaurar' : 'Descartar'}
            </button>
            {!visto ? (
              <button
                type="button"
                className="rd-link-btn"
                onClick={() => onInteract(item.id, { visto: true })}
              >
                Marcar como vista
              </button>
            ) : null}
          </div>
        ) : null}
      </footer>

      {painel === 'analise' ? <PainelAnalise item={item} /> : null}
      {painel === 'tudo' && posicao ? <PainelTudo posicao={posicao} /> : null}
    </article>
  );
}
