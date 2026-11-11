'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../../lib/api';
import { Alert, Empty } from '../components/ui';
import type { Selecionado } from './AnaliseApp';
import {
  CRITERIOS_AJUDA,
  moeda,
  moeda2,
  numero,
  prazoCurto,
  tomDaNota,
  type EditalComparado,
} from './analise-lib';

type Resposta = { margem_pct: number; editais: EditalComparado[] };

/** Índice do melhor valor da linha (maior ou menor), ignorando vazios. Empate não destaca. */
function melhor(valores: (number | null)[], modo: 'max' | 'min' = 'max'): number {
  const presentes = valores
    .map((valor, indice) => ({ valor, indice }))
    .filter((item): item is { valor: number; indice: number } => item.valor !== null);
  if (presentes.length < 2) return -1;
  const alvo =
    modo === 'max'
      ? Math.max(...presentes.map((item) => item.valor))
      : Math.min(...presentes.map((item) => item.valor));
  const vencedores = presentes.filter((item) => item.valor === alvo);
  return vencedores.length === 1 ? vencedores[0]!.indice : -1;
}

export function Comparar({
  selecionados,
  margem,
  onRemover,
  onLimpar,
  onVoltar,
}: Readonly<{
  selecionados: Selecionado[];
  margem: number;
  onRemover: (id: string) => void;
  onLimpar: () => void;
  onVoltar: () => void;
}>) {
  const ids = useMemo(() => selecionados.map((item) => item.id).join(','), [selecionados]);
  const [estado, setEstado] = useState<
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'error'; message: string }
    | { state: 'ready'; data: Resposta }
  >({ state: 'idle' });

  useEffect(() => {
    if (selecionados.length < 2) {
      setEstado({ state: 'idle' });
      return;
    }
    let ativo = true;
    setEstado({ state: 'loading' });
    api<Resposta>(`/analise/comparar?ids=${ids}&margem_pct=${margem}`)
      .then((data) => ativo && setEstado({ state: 'ready', data }))
      .catch((cause: unknown) => ativo && setEstado({ state: 'error', message: errorText(cause) }));
    return () => {
      ativo = false;
    };
  }, [ids, margem, selecionados.length]);

  if (selecionados.length < 2) {
    return (
      <div className="an-vazio">
        <Empty>
          Escolha de 2 a 4 editais no Ranking (marque “Comparar” em cada um) para ver os dois lados
          juntos.
        </Empty>
        <button type="button" className="ui-btn" onClick={onVoltar}>
          Ir para o Ranking
        </button>
      </div>
    );
  }
  if (estado.state === 'loading' || estado.state === 'idle')
    return <p className="ui-loading">Comparando…</p>;
  if (estado.state === 'error') return <Alert kind="error">{estado.message}</Alert>;

  const editais = estado.data.editais;
  if (editais.length === 0)
    return <Empty>Não encontramos esses editais. Volte ao Ranking e escolha de novo.</Empty>;
  const col = `repeat(${editais.length}, minmax(13rem, 1fr))`;

  const nota = editais.map((edital) => edital.analise.nota);
  const lucro = editais.map((edital) => edital.analise.lucro_estimado);
  const valor = editais.map((edital) => numero(edital.valor_estimado));
  const facil = editais.map(
    (edital) => edital.analise.componentes.find((c) => c.chave === 'facilidade')?.pontos ?? null,
  );
  const iNota = melhor(nota);
  const iLucro = melhor(lucro);
  const iFacil = melhor(facil);
  const nome = (indice: number) => editais[indice]?.titulo ?? 'Edital';

  type Linha = { titulo: string; ajuda?: string; celulas: React.ReactNode[]; destaque?: number };
  const linhas: Linha[] = [
    {
      titulo: 'Prazo',
      celulas: editais.map((edital) => prazoCurto(edital.data_encerramento_proposta)),
    },
    { titulo: 'Modalidade', celulas: editais.map((edital) => edital.modalidade ?? '—') },
    {
      titulo: 'Local',
      celulas: editais.map(
        (edital) => [edital.municipio_nome, edital.uf].filter(Boolean).join('/') || '—',
      ),
    },
    {
      titulo: 'Valor estimado',
      destaque: melhor(valor),
      celulas: editais.map((edital) => moeda(edital.valor_estimado)),
    },
    {
      titulo: 'Valor provável de fechamento',
      ajuda:
        'Valor estimado menos o desconto que o órgão costuma dar (ou 10%, quando não há histórico).',
      celulas: editais.map((edital) => moeda(edital.analise.valor_provavel)),
    },
    {
      titulo: `Lucro estimado (margem de ${margem}%)`,
      destaque: iLucro,
      celulas: editais.map((edital) => moeda(edital.analise.lucro_estimado)),
    },
    {
      titulo: 'Desconto típico do órgão',
      ajuda:
        'Quanto este órgão costuma fechar abaixo do estimado, nos pregões com valor final conhecido.',
      celulas: editais.map((edital) => {
        const historico = edital.historico_orgao;
        if (!historico || historico.economia === null) return 'Sem histórico';
        const texto = `${(historico.economia * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% (${historico.amostras} pregões)`;
        return historico.amostras < 3 ? `${texto} · poucos dados` : texto;
      }),
    },
    {
      titulo: 'Estimado frente à mediana do catálogo',
      ajuda:
        'Compara o preço que o edital estima com a mediana dos mesmos itens em outros editais. Acima de 100% é bom para quem vende.',
      celulas: editais.map((edital) => {
        const preco = edital.preco_vs_mediana;
        if (!preco || preco.razao === null) return 'Sem itens comparáveis';
        return `${Math.round(preco.razao * 100)}% (${preco.comparados} de ${preco.itens} itens)`;
      }),
    },
    {
      titulo: 'Itens no edital',
      celulas: editais.map((edital) =>
        edital.itens_total === null ? '—' : String(edital.itens_total),
      ),
    },
  ];

  return (
    <>
      <div className="an-resumo">
        <p>
          <strong>Resumo:</strong>{' '}
          {iNota >= 0
            ? `maior nota geral: “${nome(iNota)}” (${nota[iNota]}). `
            : 'notas empatadas. '}
          {iLucro >= 0 ? `Maior lucro estimado: “${nome(iLucro)}”. ` : ''}
          {iFacil >= 0 ? `Mais fácil de ganhar: “${nome(iFacil)}”.` : ''}
        </p>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-small" onClick={onLimpar}>
          Limpar comparação
        </button>
      </div>

      <div className="an-comparar-wrap">
        <div className="an-comparar" style={{ gridTemplateColumns: `11rem ${col}` }}>
          <div className="an-comp-rotulo" />
          {editais.map((edital) => (
            <div key={edital.id} className="an-comp-cab">
              <h3>{edital.titulo ?? 'Edital'}</h3>
              <p>{edital.orgao ?? '—'}</p>
              <div className="an-comp-acoes">
                <Link href={`/radar/${edital.id}`}>Abrir</Link>
                <button type="button" onClick={() => onRemover(edital.id)}>
                  Tirar
                </button>
              </div>
            </div>
          ))}

          <div className="an-comp-rotulo an-comp-forte">Nota geral</div>
          {editais.map((edital, indice) => (
            <div key={edital.id} className={`an-comp-cel ${indice === iNota ? 'an-melhor' : ''}`}>
              <span className={`an-nota-mini an-nota-${tomDaNota(edital.analise.nota)}`}>
                {edital.analise.nota}
              </span>
              <small>confiança {edital.analise.confianca}</small>
            </div>
          ))}

          {linhas.map((linha) => (
            <FragmentoLinha key={linha.titulo} linha={linha} />
          ))}

          {(['aderencia', 'prazo', 'valor', 'facilidade', 'margem'] as const).map((chave) => {
            const pontos = editais.map(
              (edital) => edital.analise.componentes.find((c) => c.chave === chave)?.pontos ?? null,
            );
            const destaque = melhor(pontos);
            const rotulo =
              editais[0]?.analise.componentes.find((c) => c.chave === chave)?.rotulo ?? chave;
            return (
              <FragmentoLinha
                key={chave}
                linha={{
                  titulo: rotulo,
                  ajuda: CRITERIOS_AJUDA[chave],
                  destaque,
                  celulas: editais.map((edital) => {
                    const componente = edital.analise.componentes.find((c) => c.chave === chave);
                    if (!componente) return '—';
                    return (
                      <div className="an-comp-criterio">
                        <div
                          className="an-barra"
                          role="img"
                          aria-label={`${componente.pontos} de 100`}
                        >
                          <i
                            className={`an-barra-${tomDaNota(componente.pontos)}`}
                            style={{ width: `${componente.pontos}%` }}
                          />
                        </div>
                        <b>{componente.pontos}</b>
                        <small>{componente.detalhe}</small>
                      </div>
                    );
                  }),
                }}
              />
            );
          })}

          <div className="an-comp-rotulo">Sinais</div>
          {editais.map((edital) => (
            <div key={edital.id} className="an-comp-cel">
              {edital.analise.sinais.length === 0 ? (
                '—'
              ) : (
                <ul className="an-sinais">
                  {edital.analise.sinais.map((sinal) => (
                    <li key={sinal.texto} className={`an-sinal an-sinal-${sinal.tipo}`}>
                      {sinal.texto}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <div className="an-comp-rotulo">Primeiros itens</div>
          {editais.map((edital) => (
            <div key={edital.id} className="an-comp-cel">
              {edital.itens_amostra.length === 0 ? (
                'Itens ainda não coletados'
              ) : (
                <ul className="an-itens">
                  {edital.itens_amostra.slice(0, 5).map((item) => (
                    <li key={item.numero}>
                      <span>{item.descricao}</span>
                      <small>
                        {item.quantidade ?? '—'} {item.unidade ?? ''} ·{' '}
                        {moeda2(item.valor_unitario_estimado)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="an-aviso">
        Comparação de apoio: as notas usam dados públicos e o seu perfil, não preveem vitória.
        Confirme sempre no edital.
      </p>
    </>
  );
}

function FragmentoLinha({
  linha,
}: Readonly<{
  linha: {
    titulo: string;
    ajuda?: string | undefined;
    celulas: React.ReactNode[];
    destaque?: number | undefined;
  };
}>) {
  return (
    <>
      <div className="an-comp-rotulo" title={linha.ajuda}>
        {linha.titulo}
      </div>
      {linha.celulas.map((celula, indice) => (
        <div key={indice} className={`an-comp-cel ${linha.destaque === indice ? 'an-melhor' : ''}`}>
          {celula}
        </div>
      ))}
    </>
  );
}
