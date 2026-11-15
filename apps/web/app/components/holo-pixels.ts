/**
 * Camada de movimento por cima da imagem da Ana: quadradinhos de luz subindo (como dados),
 * ondas quando ela fala e uma explosão rápida de pixels ao clicar. Só desenha formas simples.
 */

export type HumorHolo = 'ocioso' | 'pensando' | 'falando' | 'ativando';
export type Rgb = readonly [number, number, number];

export interface Entrada {
  humor: HumorHolo;
  /** Segundos desde que o humor atual começou. */
  desdeHumor: number;
  corA: Rgb;
  corB: Rgb;
}

export interface Pixels {
  desenhar(
    c: CanvasRenderingContext2D,
    largura: number,
    altura: number,
    t: number,
    dt: number,
    entrada: Entrada,
  ): void;
}

const TAU = Math.PI * 2;
const BRANCO: Rgb = [235, 246, 255];
const AMBAR: Rgb = [255, 176, 72];
const ROSA: Rgb = [255, 90, 214];

function rgba(c: Rgb, a: number): string {
  const alfa = Math.min(1, Math.max(0, a));
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alfa.toFixed(3)})`;
}

function semente(valor: number) {
  let s = valor >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Particula {
  x: number;
  y: number;
  tam: number;
  vel: number;
  fase: number;
  cor: 0 | 1 | 2 | 3;
  deriva: number;
}

export function criarPixels(leve: boolean): Pixels {
  const aleatorio = semente(20261115);
  const total = leve ? 14 : 44;
  const particulas: Particula[] = Array.from({ length: total }, () => ({
    x: 0.08 + aleatorio() * 0.84,
    y: aleatorio(),
    tam: 0.012 + aleatorio() * 0.026,
    vel: 0.018 + aleatorio() * 0.05,
    fase: aleatorio() * TAU,
    cor: aleatorio() < 0.06 ? 2 : aleatorio() < 0.1 ? 3 : aleatorio() < 0.4 ? 1 : 0,
    deriva: (aleatorio() - 0.5) * 0.02,
  }));

  let energia = 0;
  let onda = 0;

  function desenhar(
    c: CanvasRenderingContext2D,
    L: number,
    H: number,
    t: number,
    dt: number,
    e: Entrada,
  ) {
    if (L < 4 || H < 4) return;
    const lado = Math.min(L, H);
    const pensando = e.humor === 'pensando';
    const falando = e.humor === 'falando';
    const ativando = e.humor === 'ativando';
    const k = 1 - Math.exp(-dt * 5);
    energia += ((pensando ? 1 : falando ? 0.7 : ativando ? 1 : 0) - energia) * k;
    onda = falando ? Math.min(1, onda + dt * 3) : Math.max(0, onda - dt * 2);

    c.globalCompositeOperation = 'lighter';
    const paleta: Rgb[] = [e.corB, BRANCO, AMBAR, ROSA];

    // quadradinhos de luz subindo
    for (const p of particulas) {
      p.y -= p.vel * dt * (1 + energia * 3);
      p.x += p.deriva * dt;
      if (p.y < -0.05) {
        p.y = 1.05;
        p.x = 0.08 + aleatorio() * 0.84;
      }
      const pisca = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + p.fase));
      const tam = p.tam * lado * (0.8 + energia * 0.5);
      const x = p.x * L;
      const y = p.y * H;
      const cor = paleta[p.cor]!;
      c.fillStyle = rgba(cor, 0.16 * pisca);
      c.fillRect(x - tam * 1.1, y - tam * 1.1, tam * 2.2, tam * 2.2);
      c.fillStyle = rgba(cor, 0.85 * pisca);
      c.fillRect(x - tam / 2, y - tam / 2, tam, tam);
    }

    // ondas saindo do peito enquanto ela fala
    if (onda > 0.01) {
      for (let q = 0; q < 3; q += 1) {
        const p = (t * 0.7 + q / 3) % 1;
        c.strokeStyle = rgba(e.corB, (1 - p) * 0.6 * onda);
        c.lineWidth = Math.max(1, lado * 0.006);
        c.beginPath();
        c.ellipse(L * 0.5, H * 0.72, lado * (0.16 + p * 0.34), lado * (0.05 + p * 0.1), 0, 0, TAU);
        c.stroke();
      }
    }

    // explosão rápida de pixels ao clicar
    if (ativando) {
      const p = Math.min(1, e.desdeHumor / 0.75);
      for (let q = 0; q < (leve ? 16 : 40); q += 1) {
        const ang = (q / 40) * TAU + q * 0.7;
        const dist = lado * (0.08 + p * (0.3 + (q % 5) * 0.06));
        const tam = lado * 0.022 * (1 - p * 0.7);
        c.fillStyle = rgba(q % 7 === 0 ? ROSA : q % 3 === 0 ? BRANCO : e.corB, (1 - p) * 0.9);
        c.fillRect(
          L / 2 + Math.cos(ang) * dist - tam / 2,
          H / 2 + Math.sin(ang) * dist - tam / 2,
          tam,
          tam,
        );
      }
    }
    c.globalCompositeOperation = 'source-over';
  }

  return { desenhar };
}
