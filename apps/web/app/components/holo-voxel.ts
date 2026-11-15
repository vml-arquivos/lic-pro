/**
 * A Ana em 3D de pixels: a mesma figura da imagem (public/ana/ana-voxels.bin, gerada a partir da
 * arte) vira um volume de blocos de luz que gira de verdade. Ela vira o rosto para o ponteiro e
 * para o atalho em foco, vira de lado, balança quando está parada, balança a cabeça ao falar e
 * faz um aceno ao clicar. Tudo em canvas 2D, só com quadradinhos (sem WebGL e sem imagem real).
 */
import { criarPixels, type Entrada as EntradaPixels, type Rgb } from './holo-pixels';

export interface Entrada extends EntradaPixels {
  /** -1 (esquerda) a 1 (direita): onde está o ponteiro em relação à Ana. */
  olharX: number;
  /** -1 (acima) a 1 (abaixo). */
  olharY: number;
  /** Quando verdadeiro, vai direto para a pose final (movimento reduzido). */
  assentar?: boolean;
}

export interface Volume {
  n: number;
  gx: Uint8Array;
  gy: Uint8Array;
  gz: Float32Array;
  cor: Uint8Array;
  paleta: Uint8Array;
}

export interface Cena {
  redimensionar(largura: number, altura: number, dpr: number): void;
  desenhar(t: number, dt: number, entrada: Entrada): void;
}

const G = 150;
const TAU = Math.PI * 2;
const GRAU = Math.PI / 180;

/** Lê o arquivo binário: u16 total, u8 cores, paleta (3 bytes cada) e [x, y, z*8, cor] por bloco. */
export function lerVolume(buf: ArrayBuffer): Volume | null {
  const b = new Uint8Array(buf);
  if (b.length < 3) return null;
  const n = b[0]! | (b[1]! << 8);
  const pal = b[2]!;
  const ini = 3 + pal * 3;
  if (n <= 0 || b.length < ini + n * 4) return null;
  const v: Volume = {
    n,
    gx: new Uint8Array(n),
    gy: new Uint8Array(n),
    gz: new Float32Array(n),
    cor: new Uint8Array(n),
    paleta: b.slice(3, ini),
  };
  for (let i = 0; i < n; i += 1) {
    const o = ini + i * 4;
    v.gx[i] = b[o]!;
    v.gy[i] = b[o + 1]!;
    v.gz[i] = b[o + 2]! / 8;
    v.cor[i] = b[o + 3]!;
  }
  return v;
}

// Centro do corpo e do pescoço, em células da grade da imagem (150 x 150).
const EIXO_X = 78;
const PIVO_CABECA_Y = 95;
const NIVEIS = 9;

interface Pontos {
  total: number;
  frente: number;
  X: Float32Array;
  Y: Float32Array;
  Z: Float32Array;
  NX: Float32Array;
  NY: Float32Array;
  NZ: Float32Array;
  C: Uint8Array;
}

function preparar(v: Volume, paso: number): Pontos {
  const existe = new Uint8Array(G * G);
  const zg = new Float32Array(G * G);
  for (let i = 0; i < v.n; i += 1) {
    const k = v.gy[i]! * G + v.gx[i]!;
    existe[k] = 1;
    zg[k] = v.gz[i]!;
  }
  const z = (x: number, y: number) => (x < 0 || y < 0 || x >= G || y >= G ? 0 : zg[y * G + x]!);
  const tem = (x: number, y: number) =>
    x < 0 || y < 0 || x >= G || y >= G ? 0 : existe[y * G + x]!;

  const lista: number[] = [];
  for (let i = 0; i < v.n; i += 1) {
    if (v.gx[i]! % paso === 0 && v.gy[i]! % paso === 0) lista.push(i);
  }
  const camadas = paso > 1 ? [-0.5, 0, 0.5] : [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75];
  const paredes: { i: number; f: number; nx: number; ny: number }[] = [];
  for (const i of lista) {
    const x = v.gx[i]!;
    const y = v.gy[i]!;
    const nx = tem(x - 1, y) - tem(x + 1, y);
    const ny = tem(x, y - 1) - tem(x, y + 1);
    if (nx !== 0 || ny !== 0) {
      const m = Math.hypot(nx, ny);
      for (const f of camadas) paredes.push({ i, f, nx: nx / m, ny: ny / m });
    }
  }
  const nf = lista.length;
  const total = nf * 2 + paredes.length;
  const p: Pontos = {
    total,
    frente: nf,
    X: new Float32Array(total),
    Y: new Float32Array(total),
    Z: new Float32Array(total),
    NX: new Float32Array(total),
    NY: new Float32Array(total),
    NZ: new Float32Array(total),
    C: new Uint8Array(total),
  };
  lista.forEach((i, k) => {
    const x = v.gx[i]!;
    const y = v.gy[i]!;
    const fx = (z(x + 1, y) - z(x - 1, y)) / 2;
    const fy = (z(x, y + 1) - z(x, y - 1)) / 2;
    const m = Math.hypot(fx, fy, 1);
    const zz = v.gz[i]!;
    for (const [d, sinal] of [
      [k, 1],
      [nf + k, -1],
    ] as const) {
      p.X[d] = x - EIXO_X;
      p.Y[d] = y;
      p.Z[d] = zz * sinal;
      p.NX[d] = -fx / m;
      p.NY[d] = -fy / m;
      p.NZ[d] = sinal / m;
      p.C[d] = v.cor[i]!;
    }
  });
  paredes.forEach((w, k) => {
    const d = nf * 2 + k;
    p.X[d] = v.gx[w.i]! - EIXO_X;
    p.Y[d] = v.gy[w.i]!;
    p.Z[d] = v.gz[w.i]! * w.f;
    p.NX[d] = w.nx;
    p.NY[d] = w.ny;
    p.NZ[d] = 0;
    p.C[d] = v.cor[w.i]!;
  });
  return p;
}

function semente(valor: number) {
  let s = valor >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function limitar(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

export function criarCena(
  canvas: HTMLCanvasElement,
  volume: Volume,
  opcoes: { pequeno: boolean },
): Cena | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const c = ctx;
  const pequeno = opcoes.pequeno;
  const pixels = criarPixels(pequeno);
  let paso = pequeno ? 2 : 1;
  let pts = preparar(volume, paso);

  // Enquadramento: o corpo inteiro no círculo grande, só o rosto no pequeno.
  const vista = pequeno ? { y: 44, vao: 92 } : { y: 76, vao: 152 };
  const nEstilos = Math.max(1, volume.paleta.length / 3) * NIVEIS;
  const estilos: string[] = [];
  for (let k = 0; k < volume.paleta.length / 3; k += 1) {
    for (let n = 0; n < NIVEIS; n += 1) {
      const f = 0.38 + n * 0.14;
      const r = Math.min(255, volume.paleta[k * 3]! * f + (f > 1 ? (f - 1) * 90 : 0));
      const g = Math.min(255, volume.paleta[k * 3 + 1]! * f + (f > 1 ? (f - 1) * 90 : 0));
      const b = Math.min(255, volume.paleta[k * 3 + 2]! * f + (f > 1 ? (f - 1) * 90 : 0));
      estilos.push(`rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`);
    }
  }

  let L = 0;
  let H = 0;
  let theta = 34 * GRAU;
  let omega = 0;
  let phi = 0;
  let phiV = 0;
  let lado: 1 | -1 = 1; // 1: olha para a esquerda (como na arte); -1: virou para a direita
  let flash = 0;
  let giro = 0;
  let lento = 0;
  let amostras = 0;

  let SX = new Float32Array(pts.total);
  let SY = new Float32Array(pts.total);
  let SS = new Float32Array(pts.total);
  let ST = new Uint16Array(pts.total);
  let ordem = new Uint32Array(pts.total);
  const contagem = new Uint32Array(nEstilos + 1);

  const aleatorio = semente(99173);
  const chuva = Array.from({ length: pequeno ? 5 : 12 }, () => ({
    x: aleatorio(),
    fase: aleatorio(),
    vel: 0.07 + aleatorio() * 0.12,
    compr: 0.05 + aleatorio() * 0.1,
  }));
  const aneis = [
    { y: 22, raio: 62, incl: -16 * GRAU, vel: 0.32 },
    { y: 88, raio: 54, incl: 12 * GRAU, vel: -0.26 },
  ];
  const PONTOS_ANEL = pequeno ? 0 : 56;

  function redimensionar(largura: number, altura: number, dpr: number) {
    L = largura;
    H = altura;
    canvas.width = Math.max(1, Math.round(largura * dpr));
    canvas.height = Math.max(1, Math.round(altura * dpr));
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function alvoGiro(t: number, e: Entrada): { th: number; ph: number } {
    const lx = e.olharX;
    if (lado === 1 && lx > 0.2) lado = -1;
    else if (lado === -1 && lx < 0.05) lado = 1;
    const efetivo = limitar(lado === 1 ? lx : -lx, -0.8, 0.2);
    let graus = 34 + 30 * efetivo + Math.sin(t * 0.55) * 9 + Math.sin(t * 0.23 + 1.3) * 5;
    let ph = -e.olharY * 0.16 + Math.sin(t * 0.9) * 0.012;
    if (e.humor === 'pensando') {
      graus += Math.sin(t * 1.7) * 18;
      ph += Math.sin(t * 1.1) * 0.05;
    } else if (e.humor === 'falando') {
      ph += Math.sin(t * 8.5) * 0.045;
      graus += Math.sin(t * 3.1) * 4;
    } else if (e.humor === 'ativando') {
      ph += Math.sin(Math.min(1, e.desdeHumor / 0.75) * Math.PI) * 0.22;
    }
    return { th: (lado === 1 ? graus : 180 - graus) * GRAU, ph };
  }

  function adaptar(dt: number) {
    if (paso > 1 || dt <= 0) return;
    lento += dt > 0.026 ? 1 : 0;
    amostras += 1;
    if (amostras >= 40) {
      if (lento > 24) {
        paso = 2;
        pts = preparar(volume, 2);
        SX = new Float32Array(pts.total);
        SY = new Float32Array(pts.total);
        SS = new Float32Array(pts.total);
        ST = new Uint16Array(pts.total);
        ordem = new Uint32Array(pts.total);
      }
      lento = 0;
      amostras = 0;
    }
  }

  function camada(
    ini: number,
    fim: number,
    ct: number,
    st: number,
    cp: number,
    sp: number,
    escala: number,
    cx: number,
    cy: number,
    brilho: number,
  ) {
    const { X, Y, Z, NX, NY, NZ, C } = pts;
    const D = 260;
    const tam = escala * paso * 1.16;
    const lux = -0.45;
    const luy = -0.55;
    const luz = 0.7;
    contagem.fill(0);
    let q = 0;
    for (let i = ini; i < fim; i += 1) {
      const yc = Y[i]! - PIVO_CABECA_Y;
      const y1 = yc * cp - Z[i]! * sp;
      const z1 = yc * sp + Z[i]! * cp;
      const x2 = X[i]! * ct + z1 * st;
      const z2 = -X[i]! * st + z1 * ct;
      const p = D / (D - z2);
      const ny1 = NY[i]! * cp - NZ[i]! * sp;
      const nz1 = NY[i]! * sp + NZ[i]! * cp;
      const nx2 = NX[i]! * ct + nz1 * st;
      const nz2 = -NX[i]! * st + nz1 * ct;
      const dot = Math.max(0, nx2 * lux + ny1 * luy + nz2 * luz);
      const rim = (1 - Math.max(0, nz2)) ** 2;
      const b = 0.62 + 0.62 * dot + 0.5 * rim + brilho + z2 * 0.004;
      const nivel = limitar(Math.round((b - 0.38) / 0.14), 0, NIVEIS - 1);
      SX[q] = cx + x2 * p * escala;
      SY[q] = cy + (y1 + PIVO_CABECA_Y - vista.y) * p * escala;
      SS[q] = tam * p;
      const estilo = C[i]! * NIVEIS + nivel;
      ST[q] = estilo;
      contagem[estilo + 1] = (contagem[estilo + 1] ?? 0) + 1;
      q += 1;
    }
    for (let k = 1; k <= nEstilos; k += 1)
      contagem[k] = (contagem[k] ?? 0) + (contagem[k - 1] ?? 0);
    for (let k = 0; k < q; k += 1) {
      const s = ST[k]!;
      const pos = contagem[s] ?? 0;
      ordem[pos] = k;
      contagem[s] = pos + 1;
    }
    let corrente = -1;
    for (let k = 0; k <= q; k += 1) {
      const s = k < q ? ST[ordem[k]!]! : -2;
      if (s !== corrente) {
        if (corrente >= 0) c.fill();
        if (s >= 0) {
          c.fillStyle = estilos[s]!;
          c.beginPath();
        }
        corrente = s;
      }
      if (s >= 0) {
        const j = ordem[k]!;
        const w = SS[j]!;
        c.rect(SX[j]! - w / 2, SY[j]! - w / 2, w, w);
      }
    }
  }

  function desenhar(t: number, dt: number, e: Entrada) {
    if (L < 4 || H < 4) return;
    const alvo = alvoGiro(t, e);
    if (e.assentar) {
      theta = alvo.th;
      omega = 0;
      phi = alvo.ph;
      phiV = 0;
    } else {
      const passos = 2;
      const h = Math.min(dt, 0.05) / passos;
      for (let i = 0; i < passos; i += 1) {
        const a = 40 * (alvo.th - theta) - 11 * omega;
        omega += a * h;
        theta += omega * h;
        const b = 90 * (alvo.ph - phi) - 15 * phiV;
        phiV += b * h;
        phi += phiV * h;
      }
    }
    const veloz = Math.min(1, Math.abs(omega) / 5);
    flash +=
      (Math.max(veloz * 0.35, e.humor === 'ativando' ? 0.6 : 0) - flash) * Math.min(1, dt * 6);
    giro += dt * (e.humor === 'pensando' ? 1.2 : 0.3) * TAU * 0.2;

    const respira =
      1 +
      0.012 * Math.sin(t * 1.6) +
      (e.humor === 'ativando' ? 0.05 * Math.max(0, 1 - e.desdeHumor / 0.75) : 0);
    const escala = (Math.min(L, H) / vista.vao) * respira;
    const cx = L / 2;
    const cy = H / 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);

    c.clearRect(0, 0, L, H);

    // fundo: chuva de dados em colunas finas
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(${e.corB[0]},${e.corB[1]},${e.corB[2]},0.28)`;
    for (const r of chuva) {
      const y0 = ((t * r.vel * (e.humor === 'pensando' ? 2.5 : 1) + r.fase) % 1) * 1.3 - 0.15;
      c.fillRect(r.x * L, y0 * H, Math.max(1, escala * 0.9), r.compr * H);
      c.fillRect(r.x * L, (y0 - 0.5) * H, Math.max(1, escala * 0.9), r.compr * 0.6 * H);
    }
    c.globalCompositeOperation = 'source-over';

    // anéis de pontos (a parte de trás vem antes da figura, a da frente depois)
    const aneisPts: { x: number; y: number; s: number; cor: Rgb; z: number }[] = [];
    if (PONTOS_ANEL > 0) {
      const cr = Math.cos(theta * 0.5);
      const sr = Math.sin(theta * 0.5);
      for (const a of aneis) {
        const ci = Math.cos(a.incl);
        const si = Math.sin(a.incl);
        for (let k = 0; k < PONTOS_ANEL; k += 1) {
          const u = (k / PONTOS_ANEL) * TAU + giro * a.vel * 6 + t * a.vel;
          const px = Math.cos(u) * a.raio;
          const pz = Math.sin(u) * a.raio * 0.62;
          const x1 = px * ci;
          const y1 = a.y + px * si;
          const xr = x1 * cr + pz * sr;
          const zr = -x1 * sr + pz * cr;
          const p = 260 / (260 - zr);
          const cor: Rgb = k % 9 === 0 ? [255, 190, 90] : k % 5 === 0 ? [255, 255, 255] : e.corB;
          aneisPts.push({
            x: cx + xr * p * escala,
            y: cy + (y1 - vista.y) * p * escala,
            s: Math.max(1, escala * 1.2 * p),
            cor,
            z: zr,
          });
        }
      }
    }
    const pintarAneis = (frente: boolean) => {
      for (const d of aneisPts) {
        if (d.z >= 0 !== frente) continue;
        const a = frente ? 0.95 : 0.5;
        c.fillStyle = `rgba(${d.cor[0]},${d.cor[1]},${d.cor[2]},${a})`;
        c.fillRect(d.x - d.s / 2, d.y - d.s / 2, d.s, d.s);
      }
    };
    pintarAneis(false);

    // figura: a camada mais distante primeiro
    const brilho = flash + (e.humor === 'pensando' ? 0.1 + 0.1 * Math.sin(t * 7) : 0);
    const { total, frente } = pts;
    if (ct >= 0) {
      camada(frente, frente * 2, ct, st, cp, sp, escala, cx, cy, brilho * 0.8 - 0.12);
      camada(frente * 2, total, ct, st, cp, sp, escala, cx, cy, brilho);
      camada(0, frente, ct, st, cp, sp, escala, cx, cy, brilho);
    } else {
      camada(0, frente, ct, st, cp, sp, escala, cx, cy, brilho * 0.8 - 0.12);
      camada(frente * 2, total, ct, st, cp, sp, escala, cx, cy, brilho);
      camada(frente, frente * 2, ct, st, cp, sp, escala, cx, cy, brilho);
    }

    pintarAneis(true);
    pixels.desenhar(c, L, H, t, dt, e);
    adaptar(dt);
  }

  return { redimensionar, desenhar };
}
