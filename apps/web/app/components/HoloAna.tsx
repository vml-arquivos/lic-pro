'use client';

import { useEffect, useRef, useState } from 'react';
import { EVENTO_ESTADO_ANA, type EstadoAna } from '../ana/estado';
import { criarCena, type HumorHolo, type Rgb } from './holo-cena';

/**
 * A Ana como inteligência artificial holográfica: um rosto digital em malha de luz, com cabelo
 * de fluxos de dados, anéis de órbita e estilhaços (não é uma pessoa nem uma imagem real; é
 * desenhado por código em canvas, ver holo-cena.ts). Ela reage ao que acontece:
 *  - cabeça e olhos seguem o ponteiro (variáveis --look-x e --look-y do centro da rede);
 *  - a cor muda conforme o atalho em foco (--holo-a e --holo-b, definidas por data-tone);
 *  - pensando: varredura rápida e anéis acelerados; falando: a boca e as ondas se movem.
 */

export type HoloMood = EstadoAna | 'ativando';

const COR_A: Rgb = [91, 140, 255];
const COR_B: Rgb = [34, 211, 238];

function lerCor(el: Element, nome: string, padrao: Rgb): Rgb {
  const valor = getComputedStyle(el).getPropertyValue(nome).trim();
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(valor);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = /^#([0-9a-f]{6})$/i.exec(valor);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return padrao;
}

function numero(valor: string): number {
  const n = Number.parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}

export function HoloAna({
  tamanho = 'lg',
  mood,
  titulo,
}: Readonly<{ tamanho?: 'lg' | 'sm'; mood?: HoloMood | undefined; titulo?: string }>) {
  const raiz = useRef<HTMLSpanElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState<EstadoAna>('ocioso');
  const atual: HoloMood = mood ?? estado;
  const humor = useRef<{ valor: HumorHolo; desde: number }>({ valor: 'ocioso', desde: 0 });
  const redesenhar = useRef<(() => void) | null>(null);

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

  useEffect(() => {
    humor.current = { valor: atual, desde: performance.now() / 1000 };
    redesenhar.current?.();
  }, [atual]);

  useEffect(() => {
    const el = raiz.current;
    const cv = tela.current;
    if (!el || !cv) return undefined;
    const caixa = el.getBoundingClientRect();
    const cena = criarCena(cv, tamanho === 'sm' || caixa.width < 150);
    if (!cena) return undefined;

    const centro = el.closest<HTMLElement>('.hub-core-art');
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visivel = true;
    let quadro = 0;
    let anterior = 0;
    let relogio = 3;
    let cores: { a: Rgb; b: Rgb } = { a: COR_A, b: COR_B };
    let contador = 0;

    function medir() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = el!.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) cena!.redimensionar(r.width, r.height, dpr);
    }

    function pintar(agora: number, dt: number) {
      if (contador % 6 === 0) {
        cores = { a: lerCor(el!, '--holo-a', COR_A), b: lerCor(el!, '--holo-b', COR_B) };
      }
      contador += 1;
      cena!.desenhar(relogio, dt, {
        olharX: centro ? numero(centro.style.getPropertyValue('--look-x')) : 0,
        olharY: centro ? numero(centro.style.getPropertyValue('--look-y')) : 0,
        humor: humor.current.valor,
        desdeHumor: agora - humor.current.desde,
        corA: cores.a,
        corB: cores.b,
      });
    }

    function passo(ms: number) {
      quadro = 0;
      if (!visivel || document.hidden) {
        anterior = 0;
        return;
      }
      const dt = anterior ? Math.min(0.05, (ms - anterior) / 1000) : 1 / 60;
      anterior = ms;
      relogio += dt;
      pintar(ms / 1000, dt);
      quadro = requestAnimationFrame(passo);
    }

    function iniciar() {
      if (reduzido || quadro || !visivel || document.hidden) return;
      anterior = 0;
      quadro = requestAnimationFrame(passo);
    }

    redesenhar.current = () => {
      if (reduzido) {
        cores = { a: lerCor(el, '--holo-a', COR_A), b: lerCor(el, '--holo-b', COR_B) };
        pintar(performance.now() / 1000, 1 / 60);
      }
    };

    medir();
    pintar(performance.now() / 1000, 1 / 60);
    iniciar();

    const observaTamanho = new ResizeObserver(() => {
      medir();
      if (reduzido) redesenhar.current?.();
    });
    observaTamanho.observe(el);
    const observaVisivel = new IntersectionObserver(([entrada]) => {
      visivel = entrada?.isIntersecting ?? true;
      if (visivel) iniciar();
    });
    observaVisivel.observe(el);
    const aoMudarAba = () => iniciar();
    document.addEventListener('visibilitychange', aoMudarAba);

    return () => {
      cancelAnimationFrame(quadro);
      observaTamanho.disconnect();
      observaVisivel.disconnect();
      document.removeEventListener('visibilitychange', aoMudarAba);
      redesenhar.current = null;
    };
  }, [tamanho]);

  return (
    <span
      ref={raiz}
      className={`holo holo-${tamanho}`}
      data-mood={atual}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      <canvas ref={tela} />
    </span>
  );
}
