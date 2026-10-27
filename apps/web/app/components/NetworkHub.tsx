'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Icon } from './Icon';

import type { HubNodeData } from '@licitecomigo/shared';

export type { HubTone } from '@licitecomigo/shared';

export type HubNode = HubNodeData & {
  /** Texto curto opcional (ex.: "3 novos"). */
  badge?: string | undefined;
};

export type HubProps = {
  nodes: readonly HubNode[];
  /** Nome do núcleo coordenador. */
  coreName?: string;
  coreRole?: string;
  /** Imagem opcional do núcleo (ex.: foto da mentora). Se falhar, aparece o orbe. */
  photo?: string | undefined;
  head?: { eyebrow: string; lead: string; highlight: string; text: string } | undefined;
  cta?: { label: string; href: string; title: string; text: string } | undefined;
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

function Orb() {
  return (
    <svg className="hub-orb" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="orb-fill" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#c7d2fe" />
          <stop offset="0.75" stopColor="#6366f1" />
          <stop offset="1" stopColor="#14b8a6" />
        </radialGradient>
        <clipPath id="orb-clip">
          <circle cx="100" cy="100" r="62" />
        </clipPath>
      </defs>
      <circle className="hub-ring hub-ring-a" cx="100" cy="100" r="92" />
      <circle className="hub-ring hub-ring-b" cx="100" cy="100" r="78" />
      <circle cx="100" cy="100" r="62" fill="url(#orb-fill)" />
      <g clipPath="url(#orb-clip)" className="hub-mesh">
        <path d="M52 78 L88 52 L128 70 L148 108 L118 140 L76 134 L54 108 Z" />
        <path d="M88 52 L100 100 L128 70 M100 100 L148 108 M100 100 L118 140 M100 100 L76 134 M100 100 L54 108 M100 100 L52 78" />
        <circle cx="88" cy="52" r="2.4" />
        <circle cx="128" cy="70" r="2.4" />
        <circle cx="148" cy="108" r="2.4" />
        <circle cx="118" cy="140" r="2.4" />
        <circle cx="76" cy="134" r="2.4" />
        <circle cx="54" cy="108" r="2.4" />
        <circle cx="52" cy="78" r="2.4" />
        <circle cx="100" cy="100" r="3.6" />
      </g>
      <ellipse
        cx="82"
        cy="72"
        rx="20"
        ry="11"
        fill="#ffffff"
        opacity="0.35"
        transform="rotate(-28 82 72)"
      />
    </svg>
  );
}

export function NetworkHub({
  nodes,
  coreName = 'Ana',
  coreRole = 'Núcleo coordenador',
  photo,
  head,
  cta,
}: Readonly<HubProps>) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [photoOk, setPhotoOk] = useState(Boolean(photo));
  const placed = layoutHub(nodes);

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

      <div className="hub-stage">
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
          <div className="hub-core-art">
            {photo && photoOk ? (
              <img
                className="hub-photo"
                src={photo}
                alt={`${coreName}, ${coreRole}`}
                onError={() => setPhotoOk(false)}
              />
            ) : (
              <Orb />
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
              <Link className="hub-node" data-tone={node.tone} href={node.href}>
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
