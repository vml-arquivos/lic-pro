'use client';

import { useEffect, useRef, useState } from 'react';
import { EVENTO_ESTADO_ANA, type EstadoAna } from '../ana/estado';
import { type HumorHolo, type Rgb } from './holo-pixels';
import { criarCena, lerVolume, type Volume } from './holo-voxel';

/**
 * A Ana como inteligência artificial digital: uma figura feminina abstrata e pixelada (não é uma
 * pessoa nem uma foto), em 3D de blocos de luz, com anéis e chuva de dados. A arte fica em
 * public/ana/ (a imagem e o volume ana-voxels.bin, que dá a ela profundidade para girar).
 * Ela está viva:
 *  - vira o rosto para o ponteiro e para o atalho em foco (--look-x e --look-y do centro da rede),
 *    inclusive virando de lado quando o atalho está do outro lado;
 *  - a cor muda conforme o atalho em foco (--holo-a/--holo-b e --holo-hue, por data-tone);
 *  - pensando: balança a cabeça e acelera; falando: balança ao ritmo da fala; clique: aceno e clarão.
 * Se o volume não carregar, fica a imagem estática com os efeitos de CSS.
 */

type Imagem = 'voxel' | 'mosaico' | 'particulas';
const IMAGEM: Imagem = 'voxel';

export type HoloMood = EstadoAna | 'ativando';

const COR_A: Rgb = [91, 140, 255];
const COR_B: Rgb = [34, 211, 238];

let volumeEmCache: Promise<Volume | null> | null = null;
function carregarVolume(): Promise<Volume | null> {
  volumeEmCache ??= fetch('/ana/ana-voxels.bin')
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b ? lerVolume(b) : null))
    .catch(() => null);
  return volumeEmCache;
}

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
    let vivo = true;
    let limpar: (() => void) | undefined;

    void carregarVolume().then((volume) => {
      if (!vivo || !volume) return;
      const caixa = el.getBoundingClientRect();
      const cena = criarCena(cv, volume, { pequeno: tamanho === 'sm' || caixa.width < 150 });
      if (!cena) return;

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

      function pintar(agora: number, dt: number, assentar: boolean) {
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
          assentar,
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
        pintar(ms / 1000, dt, false);
        quadro = requestAnimationFrame(passo);
      }

      function iniciar() {
        if (reduzido || quadro || !visivel || document.hidden) return;
        anterior = 0;
        quadro = requestAnimationFrame(passo);
      }

      redesenhar.current = () => {
        if (reduzido) pintar(performance.now() / 1000, 1 / 60, true);
      };

      medir();
      pintar(performance.now() / 1000, 1 / 60, true);
      el.dataset.pronto = '1';
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

      limpar = () => {
        cancelAnimationFrame(quadro);
        observaTamanho.disconnect();
        observaVisivel.disconnect();
        document.removeEventListener('visibilitychange', aoMudarAba);
        redesenhar.current = null;
        delete el.dataset.pronto;
      };
    });

    return () => {
      vivo = false;
      limpar?.();
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
      <span className="holo-cena">
        <img
          className="holo-img"
          src={`/ana/ana-${IMAGEM}${tamanho === 'sm' ? '-rosto' : ''}.webp`}
          alt=""
          width={tamanho === 'sm' ? 384 : 900}
          height={tamanho === 'sm' ? 384 : 900}
          decoding="async"
          draggable={false}
        />
      </span>
      <canvas ref={tela} aria-hidden="true" />
      <span className="holo-varre" aria-hidden="true" />
    </span>
  );
}
