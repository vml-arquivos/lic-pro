'use client';

import Link from 'next/link';
import { useState } from 'react';
import { send } from '../../lib/api';
import { Badge } from '../components/ui';
import {
  FACET_TITLES,
  brl,
  deadlineInfo,
  formatDate,
  isFacetActive,
  toggleFacet,
  type Facets,
  type Tender,
} from './radar-lib';

type Interaction = Partial<Pick<Tender, 'favorito' | 'descartado' | 'visto'>>;

export function FacetPanel({
  facets,
  params,
  onChange,
}: Readonly<{
  facets: Facets;
  params: URLSearchParams;
  onChange: (next: URLSearchParams) => void;
}>) {
  const groups = Object.entries(facets).filter(([, items]) => items && items.length > 0);
  if (!groups.length) return null;
  return (
    <aside className="rd-facets" aria-label="Refinar resultados">
      <h2>Refinar</h2>
      {groups.map(([campo, items]) => (
        <section key={campo}>
          <h3>{FACET_TITLES[campo] ?? campo}</h3>
          <ul>
            {(items ?? []).slice(0, 8).map((item) => {
              const active = isFacetActive(params, campo, item.valor);
              return (
                <li key={item.valor}>
                  <button
                    type="button"
                    className={active ? 'rd-facet rd-facet-on' : 'rd-facet'}
                    aria-pressed={active}
                    onClick={() => onChange(toggleFacet(params, campo, item.valor))}
                  >
                    <span>{item.valor}</span>
                    <small>{item.total}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}

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

export function TenderCard({
  item,
  signedIn,
  state,
  onInteract,
}: Readonly<{
  item: Tender;
  signedIn: boolean;
  state: Interaction;
  onInteract: (id: string, change: Interaction & { nota?: string }) => void;
}>) {
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
  return (
    <article
      className={`rd-card${descartado ? ' rd-card-off' : ''}${visto ? ' rd-card-seen' : ''}`}
    >
      <div className="rd-badges">
        <Badge tone={deadline.tone}>{deadline.label}</Badge>
        {large ? <Badge tone="warn">Grande vulto</Badge> : null}
        {item.situacao && !/divulgada/i.test(item.situacao) ? (
          <Badge tone="bad">{item.situacao}</Badge>
        ) : null}
        <CompatBadge item={item} />
      </div>
      <h3>
        <Link href={`/radar/${item.id}`}>{item.titulo}</Link>
      </h3>
      <p className="rd-meta">
        {item.orgao ?? 'Órgão não informado'}
        {place ? ` · ${place}` : ''}
        {item.modalidade ? ` · ${item.modalidade}` : ''}
      </p>
      <p className="rd-meta">
        <strong>{brl(item.valor_estimado)}</strong>
        {item.data_publicacao ? ` · Publicado em ${formatDate(item.data_publicacao)}` : ''}
        {item.numero_compra ? ` · Compra ${item.numero_compra}` : ''}
        {distance !== null ? ` · a ${distance.toLocaleString('pt-BR')} km` : ''}
      </p>
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
      <div className="rd-actions">
        <Link className="ui-btn ui-btn-small" href={`/radar/${item.id}`}>
          Abrir edital
        </Link>
        {signedIn ? (
          <>
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-small"
              aria-pressed={favorito}
              onClick={() => onInteract(item.id, { favorito: !favorito })}
            >
              {favorito ? '★ Favorita' : '☆ Favoritar'}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-small"
              aria-pressed={descartado}
              onClick={() => onInteract(item.id, { descartado: !descartado })}
            >
              {descartado ? 'Restaurar' : 'Descartar'}
            </button>
            {!visto ? (
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-small"
                onClick={() => onInteract(item.id, { visto: true })}
              >
                Marcar como vista
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

export function ResultList({ items, signedIn }: Readonly<{ items: Tender[]; signedIn: boolean }>) {
  const [overrides, setOverrides] = useState<Record<string, Interaction>>({});
  const [error, setError] = useState('');

  async function interact(id: string, change: Interaction) {
    const previous = overrides[id];
    setError('');
    setOverrides((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...change,
        ...(change.favorito ? { descartado: false } : {}),
        ...(change.descartado ? { favorito: false } : {}),
      },
    }));
    try {
      await send('POST', `/editais/${id}/interacao`, change);
    } catch {
      setOverrides((current) => {
        const next = { ...current };
        if (previous) next[id] = previous;
        else delete next[id];
        return next;
      });
      setError('Não foi possível salvar agora. Tente novamente.');
    }
  }

  return (
    <>
      {error ? (
        <p className="ui-alert ui-alert-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rd-list">
        {items.map((item) => (
          <TenderCard
            key={item.id}
            item={item}
            signedIn={signedIn}
            state={overrides[item.id] ?? {}}
            onInteract={(id, change) => void interact(id, change)}
          />
        ))}
      </div>
    </>
  );
}
