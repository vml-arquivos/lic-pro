'use client';

import { useEffect, useId, useState } from 'react';
import { EVENTO_ESTADO_ANA, type EstadoAna } from '../ana/estado';

/**
 * A Ana como figura digital holográfica: uma projeção feminina em malha (não é uma imagem real),
 * dentro de um portal escuro. Ela reage ao que acontece:
 *  - olhos e cabeça seguem o ponteiro (variáveis --look-x e --look-y);
 *  - a cor muda conforme o atalho em foco (data-tone no elemento pai);
 *  - pensando: olhos estreitos e varredura rápida; falando: a boca se move.
 */

type Ponto = readonly [number, number];

const P = {
  top: [120, 58],
  tl: [100, 62],
  tr: [140, 62],
  l1: [89, 82],
  r1: [151, 82],
  l2: [87, 106],
  r2: [153, 106],
  l3: [93, 128],
  r3: [147, 128],
  l4: [104, 144],
  r4: [136, 144],
  chin: [120, 154],
  fh: [120, 72],
  fhl: [106, 74],
  fhr: [134, 74],
  bl1: [97, 89],
  bl2: [113, 85],
  br1: [127, 85],
  br2: [143, 89],
  el: [106, 97],
  er: [134, 97],
  bridge: [120, 94],
  nl: [113, 122],
  nr: [127, 122],
  nt: [120, 118],
  cl: [98, 113],
  cr: [142, 113],
  ml: [108, 134],
  mr: [132, 134],
  mc: [120, 133],
  mb: [120, 142],
  jl: [100, 137],
  jr: [140, 137],
} as const satisfies Record<string, Ponto>;

type Nome = keyof typeof P;

const ARESTAS: ReadonlyArray<readonly [Nome, Nome]> = [
  ['top', 'tl'],
  ['tl', 'l1'],
  ['l1', 'l2'],
  ['l2', 'l3'],
  ['l3', 'l4'],
  ['l4', 'chin'],
  ['chin', 'r4'],
  ['r4', 'r3'],
  ['r3', 'r2'],
  ['r2', 'r1'],
  ['r1', 'tr'],
  ['tr', 'top'],
  ['top', 'fh'],
  ['tl', 'fhl'],
  ['tr', 'fhr'],
  ['fhl', 'fh'],
  ['fh', 'fhr'],
  ['fhl', 'bl2'],
  ['fhr', 'br1'],
  ['fh', 'bridge'],
  ['l1', 'bl1'],
  ['r1', 'br2'],
  ['bl1', 'bl2'],
  ['br1', 'br2'],
  ['bl2', 'bridge'],
  ['br1', 'bridge'],
  ['bl1', 'el'],
  ['bl2', 'el'],
  ['br1', 'er'],
  ['br2', 'er'],
  ['el', 'bridge'],
  ['er', 'bridge'],
  ['bridge', 'nt'],
  ['el', 'cl'],
  ['er', 'cr'],
  ['l2', 'cl'],
  ['r2', 'cr'],
  ['cl', 'nl'],
  ['cr', 'nr'],
  ['nl', 'nt'],
  ['nr', 'nt'],
  ['nl', 'nr'],
  ['cl', 'ml'],
  ['cr', 'mr'],
  ['nl', 'ml'],
  ['nr', 'mr'],
  ['nt', 'mc'],
  ['ml', 'mc'],
  ['mc', 'mr'],
  ['ml', 'mb'],
  ['mr', 'mb'],
  ['mb', 'chin'],
  ['l3', 'cl'],
  ['r3', 'cr'],
  ['l3', 'jl'],
  ['r3', 'jr'],
  ['jl', 'ml'],
  ['jr', 'mr'],
  ['jl', 'l4'],
  ['jr', 'r4'],
  ['jl', 'mb'],
  ['jr', 'mb'],
];

const LINHAS = ARESTAS.map(([a, b]) => `M${P[a][0]} ${P[a][1]}L${P[b][0]} ${P[b][1]}`).join('');
const NOS: readonly Nome[] = [
  'top',
  'l1',
  'r1',
  'l2',
  'r2',
  'l3',
  'r3',
  'chin',
  'bridge',
  'nt',
  'cl',
  'cr',
  'ml',
  'mr',
  'fh',
];

const PARTICULAS = [
  [46, 150, 0],
  [188, 120, 1.4],
  [64, 70, 2.6],
  [176, 176, 0.8],
  [30, 108, 3.4],
  [208, 88, 2],
  [92, 204, 1.8],
  [150, 40, 3],
] as const;

export type HoloMood = EstadoAna | 'ativando';

export function HoloAna({
  tamanho = 'lg',
  mood,
  titulo,
}: Readonly<{ tamanho?: 'lg' | 'sm'; mood?: HoloMood | undefined; titulo?: string }>) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [estado, setEstado] = useState<EstadoAna>('ocioso');

  useEffect(() => {
    function ouvir(evento: Event) {
      const detalhe = (evento as CustomEvent<EstadoAna>).detail;
      if (detalhe === 'ocioso' || detalhe === 'pensando' || detalhe === 'falando') {
        setEstado(detalhe);
      }
    }
    window.addEventListener(EVENTO_ESTADO_ANA, ouvir);
    return () => window.removeEventListener(EVENTO_ESTADO_ANA, ouvir);
  }, []);

  const atual = mood ?? estado;

  return (
    <svg
      className={`holo holo-${tamanho}`}
      data-mood={atual}
      viewBox="0 0 240 240"
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      <defs>
        <radialGradient id={`${uid}p`} cx="50%" cy="38%" r="75%">
          <stop offset="0" stopColor="#2a2670" />
          <stop offset="0.6" stopColor="#14163f" />
          <stop offset="1" stopColor="#090b25" />
        </radialGradient>
        <linearGradient id={`${uid}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="holo-stop-a" />
          <stop offset="1" className="holo-stop-b" />
        </linearGradient>
        <linearGradient id={`${uid}h`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="holo-stop-b" stopOpacity="0.75" />
          <stop offset="1" className="holo-stop-a" stopOpacity="0.2" />
        </linearGradient>
        <radialGradient id={`${uid}f`} cx="50%" cy="42%" r="60%">
          <stop offset="0" className="holo-stop-a" stopOpacity="0.38" />
          <stop offset="1" className="holo-stop-a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${uid}k`}>
          <rect x="0" y="0" width="240" height="240" fill={`url(#${uid}m)`} />
        </mask>
        <clipPath id={`${uid}r`}>
          <circle cx="120" cy="120" r="104" />
        </clipPath>
        <pattern id={`${uid}l`} width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill="#fff" opacity="0.07" />
        </pattern>
      </defs>

      <circle className="holo-anel holo-anel-a" cx="120" cy="120" r="115" />
      <circle className="holo-anel holo-anel-b" cx="120" cy="120" r="110" />
      <circle className="holo-onda" cx="120" cy="120" r="104" />

      <g clipPath={`url(#${uid}r)`}>
        <circle cx="120" cy="120" r="104" fill={`url(#${uid}p)`} />
        <circle cx="120" cy="120" r="104" fill={`url(#${uid}f)`} className="holo-brilho" />

        {/* chão de grade, em perspectiva */}
        <g className="holo-chao">
          <path d="M120 176 L-20 240 M120 176 L20 240 M120 176 L70 240 M120 176 L120 240 M120 176 L170 240 M120 176 L220 240 M120 176 L260 240" />
          <path d="M40 196 H200 M26 210 H214 M8 228 H232" />
        </g>

        {PARTICULAS.map(([x, y, atraso]) => (
          <circle
            key={`${x}-${y}`}
            className="holo-particula"
            cx={x}
            cy={y}
            r="1.6"
            style={{ animationDelay: `${atraso}s` }}
          />
        ))}

        <g mask={`url(#${uid}k)`}>
          <g className="holo-figura">
            <g
              className="holo-busto"
              transform="translate(120 132) scale(0.86) translate(-120 -150)"
            >
              {/* ombros e pescoço */}
              <path
                className="holo-corpo"
                d="M104 178 C88 190 56 194 34 216 L26 300 L214 300 L206 216 C184 194 152 190 136 178 Z"
                fill={`url(#${uid}h)`}
              />
              <path
                className="holo-fio holo-fio-fino"
                d="M104 180 L120 214 L136 180 M104 140 L104 180 M136 140 L136 180 M34 216 C70 204 96 204 120 214 C144 204 170 204 206 216 M60 232 L120 214 L180 232 M42 262 L120 214 L198 262"
              />

              <g className="holo-cabeca">
                {/* cabelo atrás */}
                <path
                  className="holo-cabelo"
                  d="M120 36 C84 34 62 62 64 104 C65 140 52 170 40 214 C62 212 80 202 90 184 C94 168 90 140 88 118 L86 84 C90 62 104 48 120 48 C136 48 150 62 154 84 L152 118 C150 140 146 168 150 184 C160 202 178 212 200 214 C188 170 175 140 176 104 C178 62 156 34 120 36 Z"
                  fill={`url(#${uid}h)`}
                />
                <path
                  className="holo-fio holo-fio-fino holo-fios"
                  d="M70 100 C68 140 58 176 48 208 M78 92 C76 136 70 168 62 200 M86 120 C84 150 80 172 74 192 M170 100 C172 140 182 176 192 208 M162 92 C164 136 170 168 178 200 M154 120 C156 150 160 172 166 192"
                />

                {/* rosto */}
                <path
                  className="holo-rosto"
                  d="M120 56 C146 56 156 82 153 106 C151 130 138 148 120 154 C102 148 89 130 87 106 C84 82 94 56 120 56 Z"
                  fill={`url(#${uid}c)`}
                />
                <path className="holo-fio holo-malha" d={LINHAS} />
                {NOS.map((nome) => (
                  <circle
                    key={nome}
                    className="holo-no"
                    cx={P[nome][0]}
                    cy={P[nome][1]}
                    r={nome === 'bridge' || nome === 'nt' ? 1.6 : 1.9}
                  />
                ))}

                {/* franja */}
                <path
                  className="holo-franja"
                  d="M88 86 C92 62 108 50 128 52 C146 54 154 72 153 88 C142 72 124 68 104 76 C96 80 90 84 88 86 Z"
                />
                <path className="holo-fio" d="M88 86 C92 62 108 50 128 52 C146 54 154 72 153 88" />

                {/* sobrancelhas */}
                <g className="holo-sobrancelhas">
                  <path className="holo-fio holo-fio-forte" d="M96 90 Q106 84 116 87" />
                  <path className="holo-fio holo-fio-forte" d="M124 87 Q134 84 144 90" />
                </g>

                {/* olhos */}
                <g className="holo-olhos">
                  <g className="holo-olho">
                    <path
                      className="holo-pupila-borda"
                      d="M95 97 Q106 88 117 97 Q106 103 95 97 Z"
                    />
                    <circle className="holo-iris" cx="106" cy="96.6" r="3.6" />
                    <circle className="holo-brilho-olho" cx="107.2" cy="95.4" r="1" />
                  </g>
                  <g className="holo-olho">
                    <path
                      className="holo-pupila-borda"
                      d="M123 97 Q134 88 145 97 Q134 103 123 97 Z"
                    />
                    <circle className="holo-iris" cx="134" cy="96.6" r="3.6" />
                    <circle className="holo-brilho-olho" cx="135.2" cy="95.4" r="1" />
                  </g>
                </g>

                {/* boca */}
                <g className="holo-boca">
                  <path
                    className="holo-labio"
                    d="M108 134 Q114 131 120 133 Q126 131 132 134 Q120 141 108 134 Z"
                  />
                  <ellipse className="holo-boca-aberta" cx="120" cy="136" rx="6.5" ry="3.2" />
                </g>
              </g>
            </g>
          </g>
        </g>

        <rect
          className="holo-varredura"
          x="0"
          y="-40"
          width="240"
          height="40"
          fill={`url(#${uid}s)`}
        />
        <rect x="0" y="0" width="240" height="240" fill={`url(#${uid}l)`} className="holo-linhas" />
        <circle className="holo-borda" cx="120" cy="120" r="104" />
      </g>
    </svg>
  );
}
