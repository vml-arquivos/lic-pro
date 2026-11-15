/**
 * Cena da Ana holográfica, desenhada em canvas (nada aqui é imagem real nem foto).
 *
 * Uma cabeça feminina digital em malha de vidro (busto em fios de luz), cabelo feito de fluxos de
 * dados, anéis de órbita com rastro, fragmentos de luz e feixes de dados ao fundo. A cabeça gira
 * devagar, segue o ponteiro com o olhar, pisca, respira e reage ao que a Ana está fazendo
 * (pensando, falando, ativando). As cores vêm de duas cores de tema (A e B) que mudam conforme o
 * atalho em foco na rede.
 */

export type HumorHolo = 'ocioso' | 'pensando' | 'falando' | 'ativando';
export type Rgb = readonly [number, number, number];

export interface Entrada {
  /** Olhar do ponteiro: -1 (esquerda/cima) a 1 (direita/baixo). */
  olharX: number;
  olharY: number;
  humor: HumorHolo;
  /** Segundos desde que o humor atual começou. */
  desdeHumor: number;
  corA: Rgb;
  corB: Rgb;
}

export interface Cena {
  redimensionar(largura: number, altura: number, dpr: number): void;
  desenhar(t: number, dt: number, entrada: Entrada): void;
}

/* ------------------------------------------------------------------------------------------ */
/* Utilidades                                                                                  */
/* ------------------------------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const suave = (k: number) => {
  const q = Math.min(1, Math.max(0, k));
  return q * q * (3 - 2 * q);
};
const gauss = (x: number, s: number) => Math.exp(-((x / s) * (x / s)));

function mistura(a: Rgb, b: Rgb, k: number): Rgb {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

function clareia(c: Rgb, k: number): Rgb {
  return [lerp(c[0], 255, k), lerp(c[1], 255, k), lerp(c[2], 255, k)];
}

function rgba(c: Rgb, a: number): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a, 0, 1).toFixed(3)})`;
}

/** Gerador pseudo-aleatório determinístico: a figura é a mesma em toda renderização. */
function semente(valor: number) {
  let s = valor >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function interpola(xs: readonly number[], ys: readonly number[], x: number): number {
  if (x <= xs[0]!) return ys[0]!;
  const ultimo = xs.length - 1;
  if (x >= xs[ultimo]!) return ys[ultimo]!;
  let i = 0;
  while (x > xs[i + 1]!) i += 1;
  const k = suave((x - xs[i]!) / (xs[i + 1]! - xs[i]!));
  return lerp(ys[i]!, ys[i + 1]!, k);
}

/* ------------------------------------------------------------------------------------------ */
/* Geometria da cabeça                                                                         */
/* ------------------------------------------------------------------------------------------ */

/** Altura da cabeça: de -1 (queixo) a 1 (topo). x para a direita, y para cima, z para a frente. */
const YS = [-1, -0.9, -0.75, -0.5, -0.2, 0.1, 0.4];
const FRENTE = [0.42, 0.5, 0.58, 0.69, 0.75, 0.79, 0.81];
const TRAS = [0.3, 0.05, -0.25, -0.55, -0.8, -0.94, -0.96];
const LARG = [0.1, 0.22, 0.38, 0.52, 0.64, 0.7, 0.72];

interface Secao {
  a: number; // meia largura
  b: number; // meia profundidade
  zc: number; // centro em z
}

function secao(y: number): Secao {
  if (y <= 0.4) {
    const f = interpola(YS, FRENTE, y);
    const t = interpola(YS, TRAS, y);
    return { a: interpola(YS, LARG, y), b: (f - t) / 2, zc: (f + t) / 2 };
  }
  const k = Math.sqrt(Math.max(0, 1 - ((y - 0.4) / 0.6) ** 2));
  return { a: 0.72 * k, b: 0.88 * k, zc: -0.08 };
}

const potencia = (v: number, p: number) => Math.sign(v) * Math.abs(v) ** p;

function envolve(theta: number): number {
  let t = theta % TAU;
  if (t > Math.PI) t -= TAU;
  if (t < -Math.PI) t += TAU;
  return t;
}

/** Relevo do rosto: deslocamento para fora da superfície (nariz, sobrancelha, lábios, queixo). */
function relevo(theta: number, y: number): number {
  const t = envolve(theta);
  const at = Math.abs(t);
  if (at > 1.5 || y > 0.7) return 0;
  let d = 0;
  // nariz: ponte, ponta e asas
  const largNariz = y > -0.3 ? 0.09 : 0.15;
  const ponta =
    y > 0.25
      ? 0
      : y > -0.3
        ? lerp(0.02, 0.3, suave((0.25 - y) / 0.55))
        : lerp(0.3, 0.1, suave(clamp((-0.3 - y) / 0.1, 0, 1)));
  d += ponta * gauss(t, largNariz);
  d += 0.07 * gauss(at - 0.17, 0.07) * gauss(y + 0.33, 0.05);
  // sobrancelhas e órbitas
  d += 0.06 * gauss(t, 0.65) * gauss(y - 0.3, 0.07);
  d -= 0.08 * gauss(at - 0.33, 0.14) * gauss(y - 0.16, 0.07);
  // maçãs do rosto e bochechas
  d += 0.07 * gauss(at - 0.62, 0.22) * gauss(y + 0.12, 0.16);
  d -= 0.05 * gauss(at - 0.6, 0.2) * gauss(y + 0.45, 0.13);
  // lábios e queixo
  d += 0.11 * gauss(t, 0.2) * gauss(y + 0.58, 0.035);
  d += 0.11 * gauss(t, 0.19) * gauss(y + 0.68, 0.04);
  d -= 0.04 * gauss(t, 0.2) * gauss(y + 0.625, 0.02);
  d += 0.07 * gauss(t, 0.22) * gauss(y + 0.93, 0.07);
  return d;
}

type V3 = [number, number, number];

function superficie(theta: number, y: number, extra = 0): V3 {
  const s = secao(y);
  const sn = Math.sin(theta);
  const cs = Math.cos(theta);
  const d = relevo(theta, y) + extra;
  return [s.a * potencia(sn, 0.87) + d * sn, y, s.zc + s.b * potencia(cs, 0.87) + d * cs];
}

/** Pescoço e ombros: linhas que somem para baixo, como na projeção. */
function pescoco(theta: number, y: number): V3 {
  const aberto = suave(clamp((-1.5 - y) / 0.75, 0, 1));
  const a = lerp(0.3, 1.35, aberto);
  const b = lerp(0.3, 0.55, aberto);
  const zc = lerp(-0.12, -0.2, aberto);
  return [a * potencia(Math.sin(theta), 0.87), y, zc + b * potencia(Math.cos(theta), 0.87)];
}

/* ------------------------------------------------------------------------------------------ */
/* Construção da cena                                                                          */
/* ------------------------------------------------------------------------------------------ */

interface Fio {
  pts: V3[]; // pontos 3D da curva (já na pose de repouso)
  fase: number;
  vel: number;
  largura: number;
  cor: number; // 0..1 mistura entre A e B
}

interface Fragmento {
  r: number;
  ang: number;
  y: number;
  vel: number;
  comp: number;
  rot: number;
  cor: 0 | 1 | 2 | 3 | 4;
  fase: number;
}

interface Anel {
  raio: number;
  incX: number;
  incZ: number;
  vel: number;
  fase: number;
  cauda: number;
  espessura: number;
}

interface Bokeh {
  x: number;
  y: number;
  r: number;
  vx: number;
  fase: number;
}

interface Feixe {
  x: number;
  vel: number;
  fase: number;
  comp: number;
}

const COR_AMBAR: Rgb = [255, 176, 72];
const COR_ROSA: Rgb = [255, 90, 214];
const COR_BRANCO: Rgb = [235, 246, 255];

export function criarCena(canvas: HTMLCanvasElement, leve: boolean): Cena | null {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;
  const c = ctx;

  const NY = leve ? 40 : 66; // linhas horizontais da cabeça
  const NT = leve ? 36 : 56; // colunas
  const aleatorio = semente(20261115);

  /* malha da cabeça (posições de repouso) */
  const yCab: number[] = [];
  for (let i = 0; i < NY; i += 1) yCab.push(-1 + (2 * i) / (NY - 1) - 0.0001 * i);
  yCab[NY - 1] = 0.985;
  const malha: V3[][] = yCab.map((y) =>
    Array.from({ length: NT }, (_, j) => superficie((j / NT) * TAU, y)),
  );
  // diagonais "vidro quebrado": só em algumas células
  const diagonais: Array<[number, number]> = [];
  for (let i = 0; i < NY - 1; i += 1) {
    for (let j = 0; j < NT; j += 1) {
      if (aleatorio() < (leve ? 0.1 : 0.2)) diagonais.push([i, j]);
    }
  }

  /* pescoço e ombros */
  const yPesc: number[] = [];
  for (let y = -0.95; y > -2.5; y -= leve ? 0.14 : 0.075) yPesc.push(y);
  const NTp = leve ? 24 : 40;
  const malhaPesc: V3[][] = yPesc.map((y) =>
    Array.from({ length: NTp }, (_, j) => pescoco((j / NTp) * TAU, y)),
  );

  /* cabelo: fluxos de dados que descem pela cabeça e pelos ombros */
  const NF = leve ? 46 : 150;
  const cabelo: Fio[] = [];
  for (let n = 0; n < NF; n += 1) {
    let theta = (aleatorio() * 2 - 1) * Math.PI;
    let y0 = 0.5 + aleatorio() * 0.48;
    // testa livre: o cabelo começa acima da linha da testa
    if (Math.abs(theta) < 0.75) y0 = Math.max(y0, 0.72 + aleatorio() * 0.2);
    // risca ao centro, com a franja repartida
    if (Math.abs(theta) < 0.12) theta += theta < 0 ? -0.18 : 0.18;
    const raiz = superficie(theta, y0, 0.05);
    const lado = Math.sign(Math.sin(theta)) || 1;
    const frente = Math.cos(theta) > 0;
    const fim: V3 = frente
      ? [
          lado * (0.62 + aleatorio() * 0.55),
          -1.55 - aleatorio() * 0.9,
          0.0 + aleatorio() * 0.35 - Math.abs(Math.sin(theta)) * 0.1,
        ]
      : [
          Math.sin(theta) * (0.6 + aleatorio() * 0.5),
          -1.7 - aleatorio() * 0.9,
          -0.95 - aleatorio() * 0.25,
        ];
    const sai = 0.4 + aleatorio() * 0.55;
    const onda = (aleatorio() * 2 - 1) * 0.28;
    const c1: V3 = [
      raiz[0] * (1 + sai * 0.7) + Math.sin(theta) * 0.18 + onda,
      raiz[1] + 0.12,
      raiz[2] * (1 + sai * 0.5) + Math.cos(theta) * 0.14,
    ];
    const c2: V3 = [
      fim[0] * (1.05 + aleatorio() * 0.2) - onda * 1.4,
      fim[1] + 0.95 + aleatorio() * 0.4,
      fim[2] + (frente ? 0.1 : -0.1),
    ];
    const passos = leve ? 9 : 16;
    const pts: V3[] = [];
    for (let k = 0; k <= passos; k += 1) {
      const s = k / passos;
      const u = 1 - s;
      pts.push([
        u * u * u * raiz[0] + 3 * u * u * s * c1[0] + 3 * u * s * s * c2[0] + s * s * s * fim[0],
        u * u * u * raiz[1] + 3 * u * u * s * c1[1] + 3 * u * s * s * c2[1] + s * s * s * fim[1],
        u * u * u * raiz[2] + 3 * u * u * s * c1[2] + 3 * u * s * s * c2[2] + s * s * s * fim[2],
      ]);
    }
    cabelo.push({
      pts,
      fase: aleatorio() * TAU,
      vel: 0.12 + aleatorio() * 0.22,
      largura: 0.6 + aleatorio() * 0.7,
      cor: aleatorio(),
    });
  }

  /* anéis de órbita */
  const aneis: Anel[] = [
    { raio: 1.58, incX: 1.28, incZ: 0.28, vel: 0.55, fase: 0, cauda: 3.4, espessura: 1.9 },
    { raio: 1.78, incX: 1.02, incZ: -0.5, vel: -0.38, fase: 2, cauda: 3.0, espessura: 1.5 },
    { raio: 1.4, incX: 0.62, incZ: 0.95, vel: 0.72, fase: 4, cauda: 2.6, espessura: 1.3 },
  ];
  if (leve) aneis.length = 2;

  /* fragmentos de luz coloridos (estilhaços ao redor do rosto) */
  const fragmentos: Fragmento[] = Array.from({ length: leve ? 14 : 42 }, () => ({
    r: 1.15 + aleatorio() * 0.85,
    ang: aleatorio() * TAU,
    y: (aleatorio() * 2 - 1) * 1.35,
    vel: (aleatorio() * 2 - 1) * 0.22,
    comp: 0.07 + aleatorio() * 0.26,
    rot: aleatorio() * Math.PI,
    cor: Math.min(4, Math.floor(aleatorio() * 5)) as 0 | 1 | 2 | 3 | 4,
    fase: aleatorio() * TAU,
  }));

  const bokehs: Bokeh[] = Array.from({ length: leve ? 5 : 11 }, () => ({
    x: aleatorio(),
    y: aleatorio(),
    r: 0.04 + aleatorio() * 0.1,
    vx: (aleatorio() * 2 - 1) * 0.01,
    fase: aleatorio() * TAU,
  }));

  const feixes: Feixe[] = Array.from({ length: leve ? 6 : 16 }, () => ({
    x: aleatorio(),
    vel: 0.12 + aleatorio() * 0.3,
    fase: aleatorio(),
    comp: 0.12 + aleatorio() * 0.3,
  }));

  /* brilho pré-renderizado (bolinha de luz) */
  const brilho = document.createElement('canvas');
  brilho.width = 64;
  brilho.height = 64;
  const bctx = brilho.getContext('2d');
  if (bctx) {
    const g = bctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.65)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, 64, 64);
  }
  const sprites = new Map<string, HTMLCanvasElement>();
  function bolinha(cor: Rgb): HTMLCanvasElement {
    const chave = `${Math.round(cor[0] / 12)}-${Math.round(cor[1] / 12)}-${Math.round(cor[2] / 12)}`;
    let s = sprites.get(chave);
    if (!s) {
      s = document.createElement('canvas');
      s.width = 64;
      s.height = 64;
      const sc = s.getContext('2d');
      if (sc) {
        sc.drawImage(brilho, 0, 0);
        sc.globalCompositeOperation = 'source-in';
        sc.fillStyle = rgba(cor, 1);
        sc.fillRect(0, 0, 64, 64);
      }
      if (sprites.size > 40) sprites.clear();
      sprites.set(chave, s);
    }
    return s;
  }
  function luz(x: number, y: number, raio: number, cor: Rgb, alfa: number) {
    if (alfa <= 0.01 || raio < 0.4) return;
    c.globalAlpha = clamp(alfa, 0, 1);
    c.drawImage(bolinha(cor), x - raio, y - raio, raio * 2, raio * 2);
    c.globalAlpha = 1;
  }

  /* estado suavizado */
  let L = 0; // largura em px (CSS)
  let H = 0;
  let abreOlhos = 1;
  let boca = 0;
  let energia = 0; // 0..1: quão "ligada" está
  let velAneis = 1;
  let yaw = 0;
  let pitch = 0;
  let piscaEm = 2.4;
  let piscaFase = -1;
  let ondaAtiva = 0;

  /* buffers de projeção reutilizados */
  const pr = {
    cx: 0,
    cy: 0,
    U: 1,
    cy1: 0,
    sy1: 0,
    cx1: 0,
    sx1: 0,
    foco: 3.4,
  };

  function projeta(p: V3, saida: Float32Array, i: number) {
    // yaw (em y) e depois pitch (em x)
    const x1 = p[0] * pr.cy1 + p[2] * pr.sy1;
    const z1 = -p[0] * pr.sy1 + p[2] * pr.cy1;
    const y2 = p[1] * pr.cx1 - z1 * pr.sx1;
    const z2 = p[1] * pr.sx1 + z1 * pr.cx1;
    const k = pr.foco / (pr.foco - z2);
    saida[i] = pr.cx + x1 * pr.U * k;
    saida[i + 1] = pr.cy - y2 * pr.U * k;
    saida[i + 2] = z2;
  }

  const bufCab = new Float32Array(NY * NT * 3);
  const bufPesc = new Float32Array(yPesc.length * NTp * 3);
  const ponto = new Float32Array(3);
  const bufFio = new Float32Array(32 * 3);
  const bufVarre = new Float32Array(3);

  function redimensionar(largura: number, altura: number, dpr: number) {
    L = largura;
    H = altura;
    canvas.width = Math.max(1, Math.round(largura * dpr));
    canvas.height = Math.max(1, Math.round(altura * dpr));
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pontoNoRosto(theta: number, y: number, extra: number, saida: Float32Array) {
    projeta(superficie(theta, y, extra), saida, 0);
  }

  /* --------------------------------------------------------------------------------------- */
  function desenhar(t: number, dt: number, e: Entrada) {
    if (L < 4 || H < 4) return;
    const R = Math.min(L, H) / 2;
    const cor1 = e.corA;
    const cor2 = e.corB;
    const frio = mistura(cor2, COR_BRANCO, 0.35);
    const quente = mistura(cor1, COR_BRANCO, 0.25);
    const k = 1 - Math.exp(-dt * 5);

    /* --- estado por humor --- */
    const pensando = e.humor === 'pensando';
    const falando = e.humor === 'falando';
    const ativando = e.humor === 'ativando';
    energia = lerp(energia, pensando ? 1 : falando ? 0.8 : ativando ? 1 : 0, k);
    velAneis = lerp(velAneis, pensando ? 3.2 : falando ? 1.7 : ativando ? 4 : 1, k);

    if (t > piscaEm && piscaFase < 0) {
      piscaFase = 0;
      piscaEm = t + 2.6 + ((Math.sin(t * 12.9898) + 1) / 2) * 3.4;
    }
    let abrir = 1;
    if (piscaFase >= 0) {
      piscaFase += dt / 0.16;
      abrir = Math.abs(piscaFase - 1) < 1 ? Math.abs(piscaFase - 1) : 1;
      if (piscaFase >= 2) piscaFase = -1;
    }
    const alvoOlhos = pensando ? 0.5 : ativando ? 1.15 : 1;
    abreOlhos = lerp(abreOlhos, alvoOlhos, k);
    const olhosAbertos = abreOlhos * abrir;

    let alvoBoca = 0;
    if (falando) {
      alvoBoca =
        0.22 +
        0.5 *
          Math.max(0, Math.sin(t * 11.3) * 0.5 + 0.5) *
          (0.55 + 0.45 * Math.sin(t * 4.1 + 1.3) ** 2);
    } else if (ativando) alvoBoca = 0.1;
    boca = lerp(boca, alvoBoca, 1 - Math.exp(-dt * (falando ? 22 : 8)));

    /* --- pose da cabeça --- */
    const balanco = Math.sin(t * 0.42) * 0.34 + Math.sin(t * 0.17 + 1) * 0.12;
    const alvoYaw = balanco * (pensando ? 0.3 : 0.55) + e.olharX * 0.42 + (pensando ? -0.1 : 0);
    const alvoPitch = e.olharY * 0.2 + Math.sin(t * 0.55) * 0.03 + (pensando ? -0.1 : 0.02);
    yaw = lerp(yaw, alvoYaw, 1 - Math.exp(-dt * 4));
    pitch = lerp(pitch, alvoPitch, 1 - Math.exp(-dt * 4));
    const respira = 1 + Math.sin(t * 1.5) * 0.008 + (falando ? Math.sin(t * 11.3) * 0.004 : 0);
    pr.cx = L / 2;
    pr.cy = H / 2 - R * 0.04 + Math.sin(t * 0.8) * R * 0.012;
    pr.U = R * 0.56 * respira;
    pr.cy1 = Math.cos(yaw);
    pr.sy1 = Math.sin(yaw);
    pr.cx1 = Math.cos(pitch);
    pr.sx1 = Math.sin(pitch);

    c.save();
    c.clearRect(0, 0, L, H);

    /* --- 1. fundo --- */
    const fundo = c.createRadialGradient(pr.cx, pr.cy - R * 0.1, R * 0.05, pr.cx, pr.cy, R * 1.15);
    fundo.addColorStop(0, rgba(mistura(cor1, [20, 40, 140], 0.55), 0.95));
    fundo.addColorStop(0.45, rgba(mistura(cor1, [6, 12, 60], 0.82), 0.97));
    fundo.addColorStop(1, 'rgba(2,4,18,1)');
    c.fillStyle = fundo;
    c.fillRect(0, 0, L, H);

    c.globalCompositeOperation = 'lighter';

    // bokeh
    for (const b of bokehs) {
      const bx = (((b.x + t * b.vx) % 1) + 1) % 1;
      const by = b.y + Math.sin(t * 0.3 + b.fase) * 0.02;
      luz(
        bx * L,
        by * H,
        b.r * R * 2.2,
        mistura(cor1, cor2, bx),
        0.1 + 0.07 * Math.sin(t * 0.6 + b.fase),
      );
    }

    // feixes de dados caindo (fundo)
    c.lineWidth = 1;
    for (const f of feixes) {
      const x = f.x * L;
      const p = (t * f.vel + f.fase) % 1;
      const y1 = p * (H * 1.3) - H * 0.15;
      const y0 = y1 - f.comp * H;
      const g = c.createLinearGradient(x, y0, x, y1);
      g.addColorStop(0, rgba(cor2, 0));
      g.addColorStop(1, rgba(frio, 0.45));
      c.strokeStyle = g;
      c.beginPath();
      c.moveTo(x, y0);
      c.lineTo(x, y1);
      c.stroke();
      c.strokeStyle = rgba(cor1, 0.06);
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, H);
      c.stroke();
    }

    // halo atrás da cabeça
    luz(pr.cx, pr.cy - R * 0.05, R * (1.05 + energia * 0.15), cor1, 0.34 + energia * 0.2);

    /* --- 2. anéis de órbita (parte de trás) --- */
    function desenhaAneis(atras: boolean) {
      for (const a of aneis) {
        const ang = a.fase + t * a.vel * velAneis;
        const cI = Math.cos(a.incX);
        const sI = Math.sin(a.incX);
        const cZ = Math.cos(a.incZ);
        const sZ = Math.sin(a.incZ);
        const raio = a.raio * (1 + (falando ? Math.sin(t * 6 + a.fase) * 0.02 : 0));
        const segs = 56;
        let anterior: [number, number, number] | null = null;
        for (let s = 0; s <= segs; s += 1) {
          const fase = (s / segs) * TAU;
          let x = Math.cos(fase) * raio;
          let z = Math.sin(fase) * raio;
          let y = 0;
          const y2 = y * cI - z * sI;
          const z2 = y * sI + z * cI;
          y = y2;
          z = z2;
          const x2 = x * cZ - y * sZ;
          const y3 = x * sZ + y * cZ;
          x = x2;
          y = y3;
          projeta([x, y, z], ponto, 0);
          const atual: [number, number, number] = [ponto[0]!, ponto[1]!, ponto[2]!];
          if (anterior && atual[2] > 0 !== atras) {
            // rastro: mais forte logo atrás da "cabeça" do cometa
            let d = ang - fase;
            d = ((d % TAU) + TAU) % TAU;
            const cauda = d < a.cauda ? 1 - d / a.cauda : 0;
            const alfa = 0.2 + cauda * 0.8;
            const corAnel = mistura(cor2, frio, cauda);
            c.beginPath();
            c.moveTo(anterior[0], anterior[1]);
            c.lineTo(atual[0], atual[1]);
            if (cauda > 0.15) {
              c.strokeStyle = rgba(corAnel, cauda * 0.22 * (atras ? 0.55 : 1));
              c.lineWidth = a.espessura * (3 + cauda * 4);
              c.stroke();
            }
            c.strokeStyle = rgba(corAnel, alfa * (atras ? 0.55 : 1));
            c.lineWidth = a.espessura * (0.6 + cauda * 1.5);
            c.stroke();
          }
          anterior = atual;
        }
        // cabeça do cometa
        const fx = Math.cos(ang) * raio;
        const fz = Math.sin(ang) * raio;
        let yy = 0 * cI - fz * sI;
        const zz = 0 * sI + fz * cI;
        const xx = fx * cZ - yy * sZ;
        yy = fx * sZ + yy * cZ;
        projeta([xx, yy, zz], ponto, 0);
        if (ponto[2]! > 0 !== atras) {
          luz(ponto[0]!, ponto[1]!, R * 0.075, COR_BRANCO, 0.95);
          luz(ponto[0]!, ponto[1]!, R * 0.2, frio, 0.5);
        }
        // contas de dados no aro
        for (let q = 0; q < 6; q += 1) {
          const fase = a.fase * 2 + (q / 6) * TAU - t * a.vel * 0.35;
          const bx = Math.cos(fase) * raio;
          const bz = Math.sin(fase) * raio;
          let by = -bz * sI;
          const bz2 = bz * cI;
          const bx2 = bx * cZ - by * sZ;
          by = bx * sZ + by * cZ;
          projeta([bx2, by, bz2], ponto, 0);
          if (ponto[2]! > 0 !== atras) luz(ponto[0]!, ponto[1]!, R * 0.03, frio, 0.7);
        }
      }
    }
    desenhaAneis(true);

    /* --- 3. cabelo (parte de trás: fios atrás da cabeça) e brilho de ombros --- */
    const pCab = (n: number) => bufCab[n]!;

    // projeção da malha
    for (let i = 0; i < NY; i += 1) {
      for (let j = 0; j < NT; j += 1) projeta(malha[i]![j]!, bufCab, (i * NT + j) * 3);
    }
    for (let i = 0; i < yPesc.length; i += 1) {
      for (let j = 0; j < NTp; j += 1) projeta(malhaPesc[i]![j]!, bufPesc, (i * NTp + j) * 3);
    }

    // silhueta da cabeça (volume de luz)
    c.beginPath();
    for (let i = 0; i < NY; i += 1) {
      let mn = Infinity;
      let mx = -Infinity;
      let yy = 0;
      for (let j = 0; j < NT; j += 1) {
        const x = pCab((i * NT + j) * 3);
        if (x < mn) mn = x;
        if (x > mx) mx = x;
        yy = pCab((i * NT + j) * 3 + 1);
      }
      if (i === 0) c.moveTo(mn, yy);
      else c.lineTo(mn, yy);
    }
    for (let i = NY - 1; i >= 0; i -= 1) {
      let mx = -Infinity;
      let yy = 0;
      for (let j = 0; j < NT; j += 1) {
        const x = pCab((i * NT + j) * 3);
        if (x > mx) mx = x;
        yy = pCab((i * NT + j) * 3 + 1);
      }
      c.lineTo(mx, yy);
    }
    c.closePath();
    const pele = c.createRadialGradient(
      pr.cx + yaw * R * 0.18,
      pr.cy - R * 0.02,
      R * 0.04,
      pr.cx,
      pr.cy,
      R * 0.62,
    );
    pele.addColorStop(0, rgba(clareia(cor2, 0.1), 0.2 + energia * 0.12));
    pele.addColorStop(0.55, rgba(cor1, 0.15));
    pele.addColorStop(1, rgba(cor1, 0.06));
    c.fillStyle = pele;
    c.fill();
    c.strokeStyle = rgba(frio, 0.45);
    c.lineWidth = 1.1;
    c.stroke();

    /* --- 4. pescoço e ombros --- */
    c.lineWidth = 0.8;
    for (let i = 0; i < yPesc.length; i += 1) {
      const fade = clamp(1 - (-0.95 - yPesc[i]!) / 1.5, 0, 1);
      if (fade <= 0.02) continue;
      for (let lado = 0; lado < 2; lado += 1) {
        // frente (z>0) mais forte; costas bem fracas
        c.strokeStyle = rgba(mistura(cor1, cor2, 0.5), fade * (lado === 0 ? 0.55 : 0.12));
        c.beginPath();
        let aberto = false;
        for (let j = 0; j <= NTp; j += 1) {
          const jj = j % NTp;
          const b = (i * NTp + jj) * 3;
          const frente = Math.cos((jj / NTp) * TAU - yaw) > -0.05;
          if (frente === (lado === 0)) {
            if (!aberto) {
              c.moveTo(bufPesc[b]!, bufPesc[b + 1]!);
              aberto = true;
            } else c.lineTo(bufPesc[b]!, bufPesc[b + 1]!);
          } else aberto = false;
        }
        c.stroke();
      }
    }
    // meridianos do pescoço
    c.lineWidth = 0.7;
    for (let j = 0; j < NTp; j += leve ? 4 : 3) {
      c.beginPath();
      for (let i = 0; i < yPesc.length; i += 1) {
        const b = (i * NTp + j) * 3;
        if (i === 0) c.moveTo(bufPesc[b]!, bufPesc[b + 1]!);
        else c.lineTo(bufPesc[b]!, bufPesc[b + 1]!);
      }
      c.strokeStyle = rgba(mistura(cor1, cor2, 0.4), 0.2);
      c.stroke();
    }

    /* --- 5. malha da cabeça: contornos, meridianos e diagonais, em faixas de brilho --- */
    // faixa 0 = costas, faixas 1..4 = de lado até de frente
    const faixas = 5;
    const lerPz = (i: number, j: number) => bufCab[(i * NT + j) * 3 + 2]!;
    // normal aproximada: usa o ângulo da coluna girado pelo yaw
    const facing = (j: number) => {
      const th = (j / NT) * TAU;
      return Math.cos(th - yaw) * pr.cx1; // 1 = de frente para a câmera
    };
    const normalZ = (theta: number) => Math.cos(theta - yaw) * pr.cx1;
    const alfaFaixa = [0.05, 0.12, 0.2, 0.3, 0.42];
    const faixaDe = (f: number) => clamp(Math.floor((f * 0.5 + 0.5) * faixas), 0, faixas - 1);

    for (let faixa = 0; faixa < faixas; faixa += 1) {
      const corLinha = mistura(cor1, frio, faixa / (faixas - 1));
      c.strokeStyle = rgba(corLinha, alfaFaixa[faixa]! * (1 + energia * 0.35));
      c.lineWidth = faixa === faixas - 1 ? 1 : 0.8;
      c.beginPath();
      const passoY = leve ? 2 : 1;
      for (let i = 0; i < NY; i += passoY) {
        if (yCab[i]! > 0.15 && i % 3 !== 0) continue;
        for (let j = 0; j < NT; j += 1) {
          const j2 = (j + 1) % NT;
          const f = (facing(j) + facing(j2)) / 2;
          if (faixaDe(f) !== faixa) continue;
          const b1 = (i * NT + j) * 3;
          const b2 = (i * NT + j2) * 3;
          c.moveTo(bufCab[b1]!, bufCab[b1 + 1]!);
          c.lineTo(bufCab[b2]!, bufCab[b2 + 1]!);
        }
      }
      const passoT = leve ? 6 : 4;
      for (let j = 0; j < NT; j += passoT) {
        if (faixaDe(facing(j)) !== faixa) continue;
        for (let i = 0; i < NY - 1; i += 1) {
          const b1 = (i * NT + j) * 3;
          const b2 = ((i + 1) * NT + j) * 3;
          c.moveTo(bufCab[b1]!, bufCab[b1 + 1]!);
          c.lineTo(bufCab[b2]!, bufCab[b2 + 1]!);
        }
      }
      for (const [i, j] of diagonais) {
        if (faixaDe(facing(j)) !== faixa) continue;
        const j2 = (j + 1) % NT;
        const b1 = (i * NT + j) * 3;
        const b2 = ((i + 1) * NT + j2) * 3;
        c.moveTo(bufCab[b1]!, bufCab[b1 + 1]!);
        c.lineTo(bufCab[b2]!, bufCab[b2 + 1]!);
      }
      c.stroke();
    }
    void lerPz;

    // nós de luz na malha (rosto)
    c.fillStyle = rgba(COR_BRANCO, 0.85);
    const passoNo = leve ? 4 : 3;
    for (let i = 2; i < NY; i += passoNo) {
      if (yCab[i]! > 0.62) continue;
      for (let j = 0; j < NT; j += passoNo + 2) {
        if (facing(j) < 0.3) continue;
        const b = (i * NT + j) * 3;
        const tam = 0.8 + 0.4 * Math.sin(t * 2 + i * 0.7 + j);
        c.globalAlpha = 0.18 + 0.4 * facing(j);
        c.fillRect(bufCab[b]! - tam / 2, bufCab[b + 1]! - tam / 2, tam, tam);
      }
    }
    c.globalAlpha = 1;

    // linhas de destaque do rosto: mandíbula, nariz e maçãs, com um fluxo de luz correndo
    {
      const linhas: Array<Array<[number, number, number]>> = [];
      const mand: Array<[number, number, number]> = [];
      for (let q = 0; q <= 22; q += 1) {
        const u = (q / 22) * 2 - 1;
        mand.push([u * 1.38, -0.985 + 0.5 * Math.abs(u) ** 1.7, 0.012]);
      }
      linhas.push(mand);
      const nariz: Array<[number, number, number]> = [];
      for (let q = 0; q <= 8; q += 1) nariz.push([0, 0.22 - q * 0.065, 0.02]);
      linhas.push(nariz);
      for (const lado of [-1, 1]) {
        linhas.push([
          [lado * 0.02, -0.3, 0.025],
          [lado * 0.12, -0.34, 0.03],
          [lado * 0.19, -0.31, 0.03],
          [lado * 0.16, -0.25, 0.025],
        ]);
        const malar: Array<[number, number, number]> = [];
        for (let q = 0; q <= 10; q += 1) {
          const u = q / 10;
          malar.push([
            lado * (1.0 - u * 0.5),
            0.08 - u * 0.3 - 0.05 * Math.sin(u * Math.PI),
            0.015,
          ]);
        }
        linhas.push(malar);
        const testa: Array<[number, number, number]> = [];
        for (let q = 0; q <= 8; q += 1) {
          const u = q / 8;
          testa.push([
            lado * (0.15 + u * 0.75),
            0.5 + 0.05 * Math.sin(u * Math.PI) - u * 0.05,
            0.012,
          ]);
        }
        linhas.push(testa);
      }
      c.lineWidth = 1.15;
      let ordem = 0;
      for (const ln of linhas) {
        ordem += 1;
        c.beginPath();
        let alfa = 0;
        ln.forEach(([theta, y, ex], q) => {
          pontoNoRosto(theta, y, ex, ponto);
          if (q === 0) c.moveTo(ponto[0]!, ponto[1]!);
          else c.lineTo(ponto[0]!, ponto[1]!);
          alfa += normalZ(theta);
        });
        alfa = clamp(alfa / ln.length, 0, 1);
        if (alfa < 0.02) continue;
        c.strokeStyle = rgba(frio, 0.38 * alfa + 0.12 * alfa * energia);
        c.setLineDash([]);
        c.stroke();
        c.strokeStyle = rgba(COR_BRANCO, 0.75 * alfa);
        c.setLineDash([4, 26]);
        c.lineDashOffset = -(t * (24 + energia * 40) + ordem * 9);
        c.stroke();
        c.setLineDash([]);
      }
    }

    // varredura (pensando ou sempre devagar): faixa de luz que sobe e desce pela cabeça
    const velVarre = pensando ? 1.1 : 0.22;
    const ciclo = (t * velVarre) % 1;
    const yVarre = lerp(-2.0, 1.1, ciclo);
    {
      projeta([0, yVarre, 0.2], bufVarre, 0);
      const sy = bufVarre[1]!;
      const alfaV = (pensando ? 0.85 : 0.22) * Math.sin(ciclo * Math.PI);
      const larg = R * (pensando ? 0.95 : 0.62);
      const g = c.createLinearGradient(0, sy - R * 0.1, 0, sy + R * 0.1);
      g.addColorStop(0, rgba(frio, 0));
      g.addColorStop(0.5, rgba(COR_BRANCO, alfaV * 0.55));
      g.addColorStop(1, rgba(frio, 0));
      c.fillStyle = g;
      c.fillRect(pr.cx - larg, sy - R * 0.1, larg * 2, R * 0.2);
      // realça os contornos próximos à varredura
      c.strokeStyle = rgba(COR_BRANCO, alfaV * 0.8);
      c.lineWidth = 1.1;
      c.beginPath();
      for (let i = 0; i < NY; i += 1) {
        if (Math.abs(yCab[i]! - yVarre) > 0.045) continue;
        for (let j = 0; j < NT; j += 1) {
          const j2 = (j + 1) % NT;
          if (facing(j) < 0) continue;
          const b1 = (i * NT + j) * 3;
          const b2 = (i * NT + j2) * 3;
          c.moveTo(bufCab[b1]!, bufCab[b1 + 1]!);
          c.lineTo(bufCab[b2]!, bufCab[b2 + 1]!);
        }
      }
      c.stroke();
    }

    /* --- 6. traços do rosto: sobrancelhas, olhos, boca --- */
    // sobrancelhas
    for (const lado of [-1, 1]) {
      const th = normalZ(lado * 0.38);
      if (th < 0.05) continue;
      c.strokeStyle = rgba(clareia(frio, 0.5), 0.75 * th);
      c.lineWidth = 1.6;
      c.beginPath();
      for (let q = 0; q <= 10; q += 1) {
        const u = q / 10;
        const theta = lado * (0.14 + u * 0.5);
        const y = 0.3 + 0.045 * Math.sin(u * Math.PI) - u * 0.03 + (pensando ? 0.03 * u : 0);
        pontoNoRosto(theta, y, 0.02, ponto);
        if (q === 0) c.moveTo(ponto[0]!, ponto[1]!);
        else c.lineTo(ponto[0]!, ponto[1]!);
      }
      c.stroke();
    }
    // olhos
    const gx = clamp(e.olharX * 0.6 - yaw * 0.4, -1, 1);
    const gy = clamp(e.olharY * 0.5, -1, 1);
    for (const lado of [-1, 1]) {
      const thC = lado * 0.33;
      const vis = normalZ(thC);
      if (vis < 0.05) continue;
      const centro = superficie(thC, 0.16, 0.025);
      const tx = Math.cos(thC);
      const tz = -Math.sin(thC);
      const abre = clamp(olhosAbertos, 0, 1.2);
      const contorno = (sup: number, inf: number) => {
        const pts: V3[] = [];
        for (let q = 0; q <= 14; q += 1) {
          const u = (q / 14) * 2 - 1;
          const forma = 1 - u * u;
          const dy = (sup * forma + (q > 14 ? 0 : 0)) * abre;
          const dx = u * 0.15;
          pts.push([centro[0] + tx * dx, centro[1] + dy, centro[2] + tz * dx]);
        }
        for (let q = 14; q >= 0; q -= 1) {
          const u = (q / 14) * 2 - 1;
          const forma = 1 - u * u;
          const dy = -inf * forma * abre;
          const dx = u * 0.135;
          pts.push([centro[0] + tx * dx, centro[1] + dy, centro[2] + tz * dx]);
        }
        return pts;
      };
      const pts = contorno(0.062, 0.034);
      c.beginPath();
      pts.forEach((p, q) => {
        projeta(p, ponto, 0);
        if (q === 0) c.moveTo(ponto[0]!, ponto[1]!);
        else c.lineTo(ponto[0]!, ponto[1]!);
      });
      c.closePath();
      c.fillStyle = rgba([6, 14, 44], 0.55 * vis);
      c.globalCompositeOperation = 'source-over';
      c.fill();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = rgba(clareia(frio, 0.6), 0.95 * vis);
      c.lineWidth = 1.4;
      c.stroke();
      // íris: luz que acompanha o olhar
      projeta(
        [centro[0] + tx * gx * 0.045, centro[1] + gy * -0.012, centro[2] + tz * gx * 0.045 + 0.012],
        ponto,
        0,
      );
      const raioIris = R * 0.05 * Math.min(1, abre + 0.2);
      luz(ponto[0]!, ponto[1]!, raioIris * 3.2, frio, 0.6 * vis);
      luz(ponto[0]!, ponto[1]!, raioIris * 1.3, COR_BRANCO, 0.95 * vis);
      // cílios (três traços no canto externo)
      c.strokeStyle = rgba(frio, 0.6 * vis);
      c.lineWidth = 0.9;
      c.beginPath();
      for (let q = 0; q < 3; q += 1) {
        const u = 0.55 + q * 0.2;
        const dx = lado * u * 0.135 * 1;
        const base: V3 = [centro[0] + tx * dx, centro[1] + 0.05 * abre, centro[2] + tz * dx];
        const ponta: V3 = [
          base[0] + tx * lado * 0.03,
          base[1] + 0.045 * abre,
          base[2] + tz * lado * 0.03,
        ];
        projeta(base, ponto, 0);
        c.moveTo(ponto[0]!, ponto[1]!);
        projeta(ponta, ponto, 0);
        c.lineTo(ponto[0]!, ponto[1]!);
      }
      c.stroke();
    }
    // boca
    {
      const vis = normalZ(0);
      if (vis > 0.05) {
        const abertura = boca * 0.1;
        c.beginPath();
        for (let q = 0; q <= 12; q += 1) {
          const u = q / 12;
          const theta = (u * 2 - 1) * 0.2;
          const curva = 0.014 * Math.cos(u * Math.PI * 2) * -0.5 - 0.004;
          pontoNoRosto(theta, -0.6 + curva + abertura * 0.1 * Math.sin(u * Math.PI), 0.03, ponto);
          if (q === 0) c.moveTo(ponto[0]!, ponto[1]!);
          else c.lineTo(ponto[0]!, ponto[1]!);
        }
        for (let q = 12; q >= 0; q -= 1) {
          const u = q / 12;
          const theta = (u * 2 - 1) * 0.2;
          pontoNoRosto(
            theta,
            -0.625 - abertura * 0.95 * Math.sin(u * Math.PI) ** 0.8 + 0.006,
            0.03,
            ponto,
          );
          c.lineTo(ponto[0]!, ponto[1]!);
        }
        c.closePath();
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = rgba([10, 4, 30], 0.35 + boca * 0.9);
        c.fill();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = rgba(mistura(COR_ROSA, frio, 0.4), (0.8 + boca * 0.2) * vis);
        c.lineWidth = 1.7;
        c.stroke();
        pontoNoRosto(0, -0.62, 0.05, ponto);
        luz(
          ponto[0]!,
          ponto[1]!,
          R * 0.16,
          mistura(COR_ROSA, frio, 0.5),
          (0.22 + boca * 0.3) * vis,
        );
      }
    }

    /* --- 7. cabelo: fluxos de dados --- */
    const sway = Math.sin(t * 0.7) * 0.05;
    for (const fio of cabelo) {
      const n = fio.pts.length;
      const proj = bufFio;
      for (let q = 0; q < n; q += 1) {
        const s = q / (n - 1);
        const p = fio.pts[q]!;
        const bal =
          (Math.sin(t * 0.9 + fio.fase + s * 3.2) * 0.05 + sway * (0.4 + fio.largura)) * s * s;
        projeta(
          [p[0] + bal, p[1] + Math.sin(t * 0.6 + fio.fase) * 0.02 * s, p[2] + bal * 0.6],
          proj,
          q * 3,
        );
      }
      const corFio = mistura(cor2, cor1, fio.cor);
      c.strokeStyle = rgba(corFio, 0.3 + energia * 0.12);
      c.lineWidth = 0.75;
      c.beginPath();
      c.moveTo(proj[0]!, proj[1]!);
      for (let q = 1; q < n; q += 1) c.lineTo(proj[q * 3]!, proj[q * 3 + 1]!);
      c.stroke();
      // partículas que escorrem pelo fio
      const grupos = 1;
      for (let g = 0; g < grupos; g += 1) {
        const prog = (t * fio.vel * (1 + energia * 1.6) + fio.fase / TAU + g / grupos) % 1;
        const pos = prog * (n - 1);
        const q = Math.min(n - 2, Math.floor(pos));
        const f = pos - q;
        const x = lerp(proj[q * 3]!, proj[(q + 1) * 3]!, f);
        const y = lerp(proj[q * 3 + 1]!, proj[(q + 1) * 3 + 1]!, f);
        const alfa = Math.sin(prog * Math.PI);
        luz(x, y, R * (0.014 + fio.largura * 0.01), mistura(frio, COR_BRANCO, 0.3), alfa * 0.9);
      }
    }

    /* --- 8. anéis (parte da frente) --- */
    desenhaAneis(false);

    /* --- 9. fragmentos de luz coloridos e brilhos em cruz --- */
    const paleta: Rgb[] = [frio, COR_BRANCO, COR_AMBAR, COR_ROSA, quente];
    c.lineWidth = 1;
    for (const f of fragmentos) {
      const ang = f.ang + t * f.vel * (1 + energia * 2.2);
      const x = Math.sin(ang) * f.r;
      const z = Math.cos(ang) * f.r;
      const yv = f.y + Math.sin(t * 0.5 + f.fase) * 0.06;
      projeta([x, yv, z], ponto, 0);
      const px = ponto[0]!;
      const py = ponto[1]!;
      const prof = clamp(0.5 + ponto[2]! / (f.r * 2), 0.15, 1);
      const pisca = 0.55 + 0.45 * Math.sin(t * 3.1 + f.fase * 2);
      const cor = paleta[f.cor]!;
      const comp = f.comp * pr.U * (0.7 + prof * 0.8);
      const rot = f.rot + t * 0.25 * (f.vel > 0 ? 1 : -1);
      c.strokeStyle = rgba(cor, 1 * prof * pisca);
      c.beginPath();
      c.moveTo(px - Math.cos(rot) * comp, py - Math.sin(rot) * comp);
      c.lineTo(px + Math.cos(rot) * comp, py + Math.sin(rot) * comp);
      if (f.cor === 2 || f.cor === 3) {
        c.lineTo(px + Math.cos(rot + 1.9) * comp * 0.6, py + Math.sin(rot + 1.9) * comp * 0.6);
      }
      c.stroke();
      luz(px, py, R * 0.025, cor, 0.7 * prof * pisca);
    }
    // brilhos em cruz (como estrelas)
    for (let q = 0; q < (leve ? 2 : 5); q += 1) {
      const ang = q * 1.9 + t * 0.12;
      const raio = 0.5 + ((q * 0.37) % 0.55);
      const x = pr.cx + Math.sin(ang) * raio * R * 0.95;
      const y = pr.cy - R * 0.3 + Math.cos(ang * 1.3) * raio * R * 0.7;
      const a = 0.5 + 0.5 * Math.sin(t * 2.2 + q * 2.1);
      const tam = R * 0.055 * (0.4 + a);
      c.strokeStyle = rgba(COR_BRANCO, 0.8 * a);
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(x - tam, y);
      c.lineTo(x + tam, y);
      c.moveTo(x, y - tam * 1.4);
      c.lineTo(x, y + tam * 1.4);
      c.stroke();
      luz(x, y, tam * 1.2, COR_BRANCO, 0.5 * a);
    }

    /* --- 10. ondas (falando) e flash (ativando) --- */
    if (falando) ondaAtiva = Math.min(1, ondaAtiva + dt * 3);
    else ondaAtiva = Math.max(0, ondaAtiva - dt * 2);
    if (ondaAtiva > 0.01) {
      for (let q = 0; q < 3; q += 1) {
        const p = (t * 0.7 + q / 3) % 1;
        c.strokeStyle = rgba(frio, (1 - p) * 0.55 * ondaAtiva);
        c.lineWidth = 1.4;
        c.beginPath();
        c.ellipse(pr.cx, pr.cy + R * 0.12, R * (0.4 + p * 0.65), R * (0.14 + p * 0.22), 0, 0, TAU);
        c.stroke();
      }
    }
    if (ativando) {
      const p = clamp(e.desdeHumor / 0.75, 0, 1);
      c.strokeStyle = rgba(COR_BRANCO, (1 - p) * 0.9);
      c.lineWidth = 2.2 * (1 - p) + 0.6;
      c.beginPath();
      c.arc(pr.cx, pr.cy, R * (0.3 + p * 1.0), 0, TAU);
      c.stroke();
      luz(pr.cx, pr.cy, R * (0.9 + p * 0.6), frio, (1 - p) * 0.5);
    }

    /* --- 11. linhas de varredura e vinheta --- */
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(2,6,30,0.16)';
    for (let y = 0; y < H; y += 3) c.fillRect(0, y, L, 1);
    const vinheta = c.createRadialGradient(pr.cx, pr.cy, R * 0.62, pr.cx, pr.cy, R * 1.04);
    vinheta.addColorStop(0, 'rgba(2,4,18,0)');
    vinheta.addColorStop(1, 'rgba(2,4,18,0.78)');
    c.fillStyle = vinheta;
    c.fillRect(0, 0, L, H);
    c.restore();
  }

  return { redimensionar, desenhar };
}
