'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { NICHE_CATALOG, SEGMENT_CATALOG } from '@licitecomigo/shared';
import { api } from '../../lib/api';

type Contagem = Map<string, number | null>;
type SegmentosResposta = {
  data: Array<{
    nicho: string;
    segmentos: Array<{
      code: string;
      abertas: number | null;
      itens: Array<{ label: string; abertas: number | null }>;
    }>;
  }>;
  contado: boolean;
};

/** Quantas licitações abertas há em cada segmento e item (o catálogo em si já vem pronto, sem espera). */
function useContagens(nichos: readonly string[]): Contagem {
  const [contagem, setContagem] = useState<Contagem>(new Map());
  const chave = nichos.join(',');
  useEffect(() => {
    let ativo = true;
    const consulta = chave
      ? `?${chave
          .split(',')
          .map((n) => `nicho=${encodeURIComponent(n)}`)
          .join('&')}`
      : '';
    void api<SegmentosResposta>(`/catalog/segmentos${consulta}`)
      .then((resposta) => {
        if (!ativo || !resposta.contado) return;
        const mapa: Contagem = new Map();
        for (const nicho of resposta.data) {
          for (const segmento of nicho.segmentos) {
            mapa.set(`s:${segmento.code}`, segmento.abertas);
            for (const item of segmento.itens) mapa.set(`i:${item.label}`, item.abertas);
          }
        }
        setContagem(mapa);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [chave]);
  return contagem;
}

const numero = (valor: number | null | undefined): string =>
  valor === null || valor === undefined
    ? ''
    : ` · ${valor.toLocaleString('pt-BR')} ${valor === 1 ? 'aberta' : 'abertas'}`;

/**
 * Segmento e produto/serviço em listas já carregadas: o usuário escolhe, vê quantas licitações
 * abertas existem em cada opção e, se o que procura não está na lista, digita.
 *
 * `nichos` limita a lista aos nichos da conta (vazio = todos). Com `name`, gera campos escondidos
 * (`segmento` e `item`) para formulários que leem `FormData`.
 */
export function SegmentoPicker({
  nichos,
  segmentos,
  onSegmentos,
  itens,
  onItens,
  name = false,
}: Readonly<{
  nichos: readonly string[];
  segmentos: string[];
  onSegmentos: (next: string[]) => void;
  itens: string[];
  onItens: (next: string[]) => void;
  name?: boolean;
}>) {
  const id = useId();
  const [seletor, setSeletor] = useState('');
  const [texto, setTexto] = useState('');
  const contagem = useContagens(nichos);
  const permitidos = useMemo(
    () =>
      nichos.length ? SEGMENT_CATALOG.filter((s) => nichos.includes(s.niche)) : SEGMENT_CATALOG,
    [nichos],
  );
  // Segmentos já escolhidos continuam visíveis mesmo se o nicho mudou.
  const todos = useMemo(
    () => [
      ...new Set([...permitidos, ...SEGMENT_CATALOG.filter((s) => segmentos.includes(s.code))]),
    ],
    [permitidos, segmentos],
  );
  const grupos = useMemo(() => {
    const porNicho = new Map<string, typeof todos>();
    for (const segmento of todos) {
      if (segmentos.includes(segmento.code)) continue;
      porNicho.set(segmento.niche, [...(porNicho.get(segmento.niche) ?? []), segmento]);
    }
    return NICHE_CATALOG.filter((n) => porNicho.has(n.code)).map((n) => ({
      nicho: n,
      lista: [...(porNicho.get(n.code) ?? [])].sort(
        (a, b) => (contagem.get(`s:${b.code}`) ?? -1) - (contagem.get(`s:${a.code}`) ?? -1),
      ),
    }));
  }, [todos, segmentos, contagem]);

  const baseDosItens = segmentos.length
    ? todos.filter((s) => segmentos.includes(s.code))
    : permitidos;
  const opcoesDeItem = useMemo(() => {
    const vistos = new Set<string>();
    return baseDosItens
      .flatMap((segmento) => segmento.items)
      .filter((item) => (vistos.has(item.label) ? false : (vistos.add(item.label), true)))
      .filter((item) => !itens.includes(item.label))
      .sort((a, b) => (contagem.get(`i:${b.label}`) ?? -1) - (contagem.get(`i:${a.label}`) ?? -1));
  }, [baseDosItens, itens, contagem]);

  const nomeDoSegmento = (codigo: string) =>
    SEGMENT_CATALOG.find((s) => s.code === codigo)?.label ?? codigo;

  function adicionarItem(valor: string) {
    const limpo = valor.trim();
    setTexto('');
    if (limpo.length < 2 || itens.some((i) => i.toLowerCase() === limpo.toLowerCase())) return;
    onItens([...itens, limpo].slice(0, 30));
  }

  return (
    <>
      <div className="uf-picker">
        <label htmlFor={`${id}-seg`}>Segmento</label>
        <select
          id={`${id}-seg`}
          value={seletor}
          onChange={(event) => {
            const codigo = event.target.value;
            setSeletor('');
            if (codigo) onSegmentos([...segmentos, codigo].slice(0, 12));
          }}
        >
          <option value="">
            {segmentos.length ? 'Adicionar outro segmento…' : 'Todos os segmentos do meu nicho'}
          </option>
          {grupos.map(({ nicho, lista }) => (
            <optgroup key={nicho.code} label={nicho.label}>
              {lista.map((segmento) => (
                <option key={segmento.code} value={segmento.code}>
                  {segmento.label}
                  {numero(contagem.get(`s:${segmento.code}`))}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ul className="uf-picker-lista" aria-label="Segmentos escolhidos">
          {segmentos.map((codigo) => (
            <li key={codigo} className="uf-chip">
              <span>{nomeDoSegmento(codigo)}</span>
              <button
                type="button"
                aria-label={`Remover ${nomeDoSegmento(codigo)}`}
                onClick={() => onSegmentos(segmentos.filter((c) => c !== codigo))}
              >
                ×
              </button>
              {name ? <input type="hidden" name="segmento" value={codigo} /> : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="uf-picker">
        <label htmlFor={`${id}-item`}>Produto ou serviço</label>
        <input
          id={`${id}-item`}
          list={`${id}-itens`}
          value={texto}
          maxLength={80}
          placeholder="Escolha na lista ou digite o seu"
          autoComplete="off"
          onChange={(event) => {
            const valor = event.target.value;
            // Escolher na lista adiciona na hora; digitar livre adiciona com Enter.
            if (opcoesDeItem.some((item) => item.label === valor)) adicionarItem(valor);
            else setTexto(valor);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              adicionarItem(texto);
            }
          }}
          onBlur={() => {
            if (texto.trim().length >= 2) adicionarItem(texto);
          }}
        />
        <datalist id={`${id}-itens`}>
          {opcoesDeItem.map((item) => (
            <option key={item.label} value={item.label}>
              {numero(contagem.get(`i:${item.label}`)).replace(/^ · /, '')}
            </option>
          ))}
        </datalist>
        <ul className="uf-picker-lista" aria-label="Produtos e serviços escolhidos">
          {itens.map((item) => (
            <li key={item} className="uf-chip">
              <span>{item}</span>
              <button
                type="button"
                aria-label={`Remover ${item}`}
                onClick={() => onItens(itens.filter((i) => i !== item))}
              >
                ×
              </button>
              {name ? <input type="hidden" name="item" value={item} /> : null}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
