'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { pedirAbrirAna } from '../ana/estado';
import { AnaAvatar } from './AnaAvatar';
import { Icon } from './Icon';

import type { HubNodeData, HubTone } from '@licitecomigo/shared';

export type { HubTone } from '@licitecomigo/shared';

export type HubNode = HubNodeData & {
  /** Texto curto opcional (ex.: "3 novos"). */
  badge?: string | undefined;
};

export type HubProps = {
  nodes: readonly HubNode[];
  /** Papel mostrado sob o nome (ex.: Sua assistente). */
  coreName?: string;
  coreRole?: string;
  /** Imagem opcional do núcleo (ex.: foto da mentora). Se falhar, aparece o orbe. */
  photo?: string | undefined;
  head?: { eyebrow: string; lead: string; highlight: string; text: string } | undefined;
  cta?: { label: string; href: string; title: string; text: string } | undefined;
  /**
   * Sem sessão não há conversa: o centro vira um link (ex.: para o login). Com sessão (padrão),
   * clicar na Ana abre a conversa.
   */
  coreHref?: string | undefined;
};

const WIDTH = 1000;
const HEIGHT = 500;
const CORE_Y = 240;

/** Distribui os nós: primeira metade à esquerda, o resto à direita, em arco ao redor do núcleo. */
export function layoutHub(nodes: readonly HubNode[]) {
  const half = Math.ceil(nodes.length / 2);
  const sides = [
    { side: 'left' as const, items: nodes.slice(0, half) },
    { side: 'right' as const, items: nodes.slice(half) },
  ];
  return sides.flatMap(({ side, items }) =>
    items.map((node, index) => {
      const t = items.length === 1 ? 0.5 : index / (items.length - 1);
      const y = items.length === 1 ? 50 : 9 + t * 82;
      const inner = 36 - 10 * Math.sin(Math.PI * t);
      const startX = side === 'left' ? inner * 10 : WIDTH - inner * 10;
      const startY = (y / 100) * HEIGHT;
      const dx = WIDTH / 2 - startX;
      const path =
        `M ${startX.toFixed(1)} ${startY.toFixed(1)} ` +
        `C ${(startX + dx * 0.55).toFixed(1)} ${startY.toFixed(1)}, ` +
        `${(WIDTH / 2 - dx * 0.25).toFixed(1)} ${(CORE_Y + (startY - CORE_Y) * 0.2).toFixed(1)}, ` +
        `${WIDTH / 2} ${CORE_Y}`;
      return { node, side, y, inner, path };
    }),
  );
}

export function NetworkHub({
  nodes,
  coreName = 'Ana',
  coreRole = 'Sua assistente',
  photo,
  head,
  cta,
  coreHref,
}: Readonly<HubProps>) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [photoOk, setPhotoOk] = useState(Boolean(photo));
  const [tone, setTone] = useState<HubTone | null>(null);
  const [ativando, setAtivando] = useState(false);
  const art = useRef<HTMLDivElement>(null);
  const quadro = useRef(0);
  const pausaAceno = useRef(0);
  const placed = layoutHub(nodes);

  // Onde o centro da rede já é o botão da Ana, o botão flutuante some (ver holo.css).
  useEffect(() => {
    if (coreHref) return undefined;
    document.documentElement.dataset.anaHub = '1';
    return () => {
      delete document.documentElement.dataset.anaHub;
    };
  }, [coreHref]);

  useEffect(
    () => () => {
      cancelAnimationFrame(quadro.current);
      window.clearTimeout(pausaAceno.current);
    },
    [],
  );

  /** Desloca levemente o retrato conforme o ponteiro passa pela rede. */
  function seguir(clientX: number, clientY: number) {
    const el = art.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    cancelAnimationFrame(quadro.current);
    quadro.current = requestAnimationFrame(() => {
      const caixa = el.getBoundingClientRect();
      const dx = (clientX - (caixa.left + caixa.width / 2)) / (caixa.width * 2.4);
      const dy = (clientY - (caixa.top + caixa.height / 2)) / (caixa.height * 2.4);
      el.style.setProperty('--look-x', Math.max(-1, Math.min(1, dx)).toFixed(3));
      el.style.setProperty('--look-y', Math.max(-1, Math.min(1, dy)).toFixed(3));
    });
  }

  function aoClicarNaAna() {
    setAtivando(true);
    window.clearTimeout(pausaAceno.current);
    pausaAceno.current = window.setTimeout(() => setAtivando(false), 750);
    pedirAbrirAna();
  }

  return (
    <section className="hub" aria-label="Rede de especialistas do Licite Comigo">
      {head ? (
        <header className="hub-head">
          <p className="hub-eyebrow">{head.eyebrow}</p>
          <h2>
            {head.lead} <span className="hub-grad">{head.highlight}</span>
          </h2>
          <p>{head.text}</p>
        </header>
      ) : null}

      <div
        className="hub-stage"
        onPointerMove={(event) => {
          if (event.pointerType === 'mouse') seguir(event.clientX, event.clientY);
        }}
        onPointerLeave={() => {
          cancelAnimationFrame(quadro.current);
          art.current?.style.removeProperty('--look-x');
          art.current?.style.removeProperty('--look-y');
        }}
      >
        <svg
          className="hub-lines"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={`${uid}L`}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="500"
              y2="0"
            >
              <stop offset="0" stopColor="#6366f1" />
              <stop offset="1" stopColor="#14b8a6" />
            </linearGradient>
            <linearGradient
              id={`${uid}R`}
              gradientUnits="userSpaceOnUse"
              x1="1000"
              y1="0"
              x2="500"
              y2="0"
            >
              <stop offset="0" stopColor="#6366f1" />
              <stop offset="1" stopColor="#14b8a6" />
            </linearGradient>
          </defs>
          {placed.map(({ node, side, path }, index) => (
            <g key={node.href}>
              <path
                id={`${uid}p${index}`}
                className="hub-line"
                d={path}
                stroke={`url(#${uid}${side === 'left' ? 'L' : 'R'})`}
              />
              <circle className="hub-pulse" r="4.5" fill="#14b8a6" opacity="0">
                <animateMotion
                  dur={`${4 + (index % 3)}s`}
                  begin={`${(index * 0.7).toFixed(1)}s`}
                  repeatCount="indefinite"
                >
                  <mpath href={`#${uid}p${index}`} />
                </animateMotion>
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.12;0.88;1"
                  dur={`${4 + (index % 3)}s`}
                  begin={`${(index * 0.7).toFixed(1)}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ))}
        </svg>

        <div className="hub-core">
          <div
            className={`hub-core-art${photo && photoOk ? '' : ' hub-core-art--ana'}`}
            ref={art}
            {...(tone ? { 'data-tone': tone } : {})}
          >
            {photo && photoOk ? (
              <img
                className="hub-photo"
                src={photo}
                alt={`${coreName}, ${coreRole}`}
                onError={() => setPhotoOk(false)}
              />
            ) : coreHref ? (
              <Link
                className="holo-btn"
                href={coreHref}
                aria-label={`${coreName}: entrar para conversar`}
              >
                <AnaAvatar ativando={ativando} />
              </Link>
            ) : (
              <button
                className="holo-btn"
                type="button"
                onClick={aoClicarNaAna}
                aria-label={`Conversar com a ${coreName}`}
              >
                <AnaAvatar ativando={ativando} />
              </button>
            )}
          </div>
          <span className="hub-core-label">
            <strong>{coreName}</strong>
            <small>{coreRole}</small>
          </span>
        </div>

        <ul className="hub-nodes">
          {placed.map(({ node, side, y, inner }) => (
            <li
              key={node.href}
              className="hub-node-slot"
              data-side={side}
              style={{ ['--y' as string]: `${y}%`, ['--xi' as string]: `${inner}%` }}
            >
              <Link
                className="hub-node"
                data-tone={node.tone}
                href={node.href}
                onPointerEnter={() => setTone(node.tone)}
                onPointerLeave={() => setTone(null)}
                onFocus={() => setTone(node.tone)}
                onBlur={() => setTone(null)}
              >
                <span className="hub-node-icon">
                  <Icon name={node.icon} size={18} />
                </span>
                <span className="hub-node-text">
                  <strong>{node.label}</strong>
                  <small>{node.caption}</small>
                </span>
                {node.badge ? <span className="hub-node-badge">{node.badge}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {cta ? (
        <div className="hub-cta">
          <div>
            <p className="hub-eyebrow">{coreRole}</p>
            <h3>{cta.title}</h3>
            <p>{cta.text}</p>
          </div>
          <Link className="hub-cta-btn" href={cta.href}>
            {cta.label}
            <Icon name="arrow" size={16} />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
