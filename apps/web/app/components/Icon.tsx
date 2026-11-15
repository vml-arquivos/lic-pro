import type { ReactNode } from 'react';

/**
 * Ícones do app (traço 1.8, grade 24×24). Fonte única: o menu (`MenuItem.icon`) e a rede de
 * especialistas usam estes nomes. Nome desconhecido não quebra: mostra o texto recebido.
 */
const P = (d: string, key: string) => <path key={key} d={d} />;
const C = (cx: number, cy: number, r: number, key: string) => (
  <circle key={key} cx={cx} cy={cy} r={r} />
);
const R = (x: number, y: number, w: number, h: number, rx: number, key: string) => (
  <rect key={key} x={x} y={y} width={w} height={h} rx={rx} />
);

const ICONS: Record<string, ReactNode[]> = {
  home: [P('M3 11l9-8 9 8', 'a'), P('M5 10v10h14V10', 'b'), P('M10 20v-6h4v6', 'c')],
  search: [C(11, 11, 7, 'a'), P('M20 20l-4-4', 'b')],
  bell: [P('M6 16v-5a6 6 0 0112 0v5l1.5 2h-15z', 'a'), P('M10 21h4', 'b')],
  columns: [R(3, 4, 5, 16, 1, 'a'), R(10, 4, 5, 10, 1, 'b'), R(17, 4, 4, 13, 1, 'c')],
  calendar: [R(3, 5, 18, 16, 2, 'a'), P('M3 10h18M8 3v4M16 3v4', 'b')],
  file: [P('M6 3h8l5 5v13H6z', 'a'), P('M14 3v5h5M9 13h6M9 17h6', 'b')],
  building: [R(5, 3, 14, 18, 1, 'a'), P('M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4', 'b')],
  scale: [
    P('M12 3v18M6 21h12M5 7h14', 'a'),
    P('M5 7l-3 7a3 3 0 006 0z', 'b'),
    P('M19 7l-3 7a3 3 0 006 0z', 'c'),
  ],
  cap: [P('M2 9l10-5 10 5-10 5z', 'a'), P('M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5', 'b')],
  users: [
    C(9, 8, 3.5, 'a'),
    P('M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6', 'b'),
    C(17, 9, 2.5, 'c'),
    P('M17 14c2.8 0 4.5 2 4.5 5', 'd'),
  ],
  user: [C(12, 8, 4, 'a'), P('M4 21c0-4 3.5-7 8-7s8 3 8 7', 'b')],
  chat: [P('M4 5h16v11H9l-5 4z', 'a')],
  chart: [P('M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-3', 'a')],
  shield: [P('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'a'), P('M9 12l2 2 4-4', 'b')],
  gear: [
    C(12, 12, 3, 'a'),
    P('M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2', 'b'),
  ],
  mail: [R(3, 5, 18, 14, 2, 'a'), P('M3 7l9 6 9-6', 'b')],
  inbox: [P('M3 13l3-8h12l3 8v6H3z', 'a'), P('M3 13h5l1 3h6l1-3h5', 'b')],
  check: [C(12, 12, 9, 'a'), P('M8 12l3 3 5-6', 'b')],
  award: [C(12, 9, 6, 'a'), P('M8.5 14L7 22l5-3 5 3-1.5-8', 'b')],
  spark: [
    P('M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'a'),
    P('M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z', 'b'),
  ],
  sync: [P('M20 7a8 8 0 00-14-2L4 7M4 3v4h4', 'a'), P('M4 17a8 8 0 0014 2l2-2M20 21v-4h-4', 'b')],
  list: [P('M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01', 'a')],
  book: [
    P('M3 5h7a2 2 0 012 2v13a2 2 0 00-2-2H3z', 'a'),
    P('M21 5h-7a2 2 0 00-2 2v13a2 2 0 012-2h7z', 'b'),
  ],
  target: [C(12, 12, 9, 'a'), C(12, 12, 5, 'b'), C(12, 12, 1, 'c')],
  pen: [P('M4 20l4-1 11-11-3-3L5 16z', 'a'), P('M14 7l3 3', 'b')],
  globe: [C(12, 12, 9, 'a'), P('M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18', 'b')],
  video: [R(3, 6, 13, 12, 2, 'a'), P('M16 10l5-3v10l-5-3', 'b')],
  clipboard: [R(6, 4, 12, 17, 2, 'a'), P('M9 4h6v3H9zM9 12h6M9 16h4', 'b')],
  arrow: [P('M7 17L17 7M8 7h9v9', 'a')],
  lock: [R(5, 11, 14, 10, 2, 'a'), P('M8 11V8a4 4 0 018 0v3', 'b')],
  clock: [C(12, 12, 9, 'a'), P('M12 7v5l3 2', 'b')],
  menu: [P('M4 6h16M4 12h16M4 18h16', 'a')],
};

export function Icon({
  name,
  size = 20,
  className,
}: Readonly<{ name: string; size?: number; className?: string }>) {
  const shapes = ICONS[name];
  if (!shapes) {
    return (
      <span aria-hidden="true" className={className}>
        {name}
      </span>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(ICONS);
