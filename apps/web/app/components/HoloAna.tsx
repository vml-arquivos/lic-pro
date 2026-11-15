'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { EVENTO_ESTADO_ANA, type EstadoAna } from '../ana/estado';
import {
  createHoloRenderer,
  parseHoloVoxelBuffer,
  type HoloMood,
  type HoloPalette,
  type HoloVoxel,
} from './holo-voxel';

let volumePromise: Promise<HoloVoxel[] | null> | null = null;

function loadHoloVolume(): Promise<HoloVoxel[] | null> {
  volumePromise ??= fetch('/ana/ana-voxels.bin', { cache: 'force-cache' })
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .then((buffer) => (buffer ? parseHoloVoxelBuffer(buffer) : null))
    .catch(() => null);
  return volumePromise;
}

function numberOrZero(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function paletteFor(element: Element): HoloPalette {
  const styles = getComputedStyle(element);
  return {
    primary: styles.getPropertyValue('--holo-a').trim() || '#5b8cff',
    secondary: styles.getPropertyValue('--holo-b').trim() || '#22d3ee',
    ice: styles.getPropertyValue('--lc-ana-holo-ice').trim() || '#e5f7ff',
    shadow: styles.getPropertyValue('--lc-ana-holo-shadow').trim() || '#17345a',
  };
}

function isEstadoAna(value: unknown): value is EstadoAna {
  return value === 'ocioso' || value === 'pensando' || value === 'falando';
}

export type HoloAnaProps = Readonly<{
  tamanho?: 'lg' | 'sm';
  mood?: HoloMood | undefined;
  titulo?: string;
}>;

export function HoloAna({ tamanho = 'lg', mood, titulo }: HoloAnaProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInsideRef = useRef(false);
  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const pointerCurrentRef = useRef({ x: 0, y: 0 });
  const [estado, setEstado] = useState<EstadoAna>('ocioso');
  const atual: HoloMood = mood ?? estado;
  const moodRef = useRef<HoloMood>(atual);
  const moodStartedAtRef = useRef(0);
  const redrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    function onEstado(event: Event) {
      const next = (event as CustomEvent<EstadoAna>).detail;
      if (isEstadoAna(next)) setEstado(next);
    }
    window.addEventListener(EVENTO_ESTADO_ANA, onEstado);
    return () => window.removeEventListener(EVENTO_ESTADO_ANA, onEstado);
  }, []);

  useEffect(() => {
    moodRef.current = atual;
    moodStartedAtRef.current = performance.now();
    redrawRef.current?.();
  }, [atual]);

  useEffect(() => {
    const containerRefValue = containerRef.current;
    const canvasRefValue = canvasRef.current;
    if (!containerRefValue || !canvasRefValue) return undefined;
    const container: HTMLSpanElement = containerRefValue;
    const canvas: HTMLCanvasElement = canvasRefValue;

    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext('2d', { alpha: true });
    } catch {
      return undefined;
    }
    if (!context) return undefined;

    let renderer: ReturnType<typeof createHoloRenderer> | null = null;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hub = container.closest<HTMLElement>('.hub-core-art');
    let width = 0;
    let height = 0;
    let elapsed = 0;
    let previousFrame = 0;
    let animationFrame = 0;
    let visible = true;
    let disposed = false;

    function drawFrame(now: number, reduced: boolean) {
      if (disposed || width <= 0 || height <= 0 || !renderer) return;
      if (!reduced && previousFrame > 0) elapsed += Math.min(0.05, (now - previousFrame) / 1000);
      previousFrame = reduced ? 0 : now;

      const pointer = pointerCurrentRef.current;
      const target = pointerTargetRef.current;
      pointer.x += (target.x - pointer.x) * 0.08;
      pointer.y += (target.y - pointer.y) * 0.08;
      const directPointer = !reduced && tamanho === 'lg' && pointerInsideRef.current;
      const lookX = reduced
        ? 0
        : directPointer
          ? pointer.x
          : numberOrZero(hub?.style.getPropertyValue('--look-x'));
      const lookY = reduced
        ? 0
        : directPointer
          ? pointer.y
          : numberOrZero(hub?.style.getPropertyValue('--look-y'));
      const currentMood = moodRef.current;
      const attention =
        !reduced &&
        currentMood === 'ocioso' &&
        (directPointer ||
          Boolean(hub?.dataset.tone) ||
          Math.abs(lookX) > 0.1 ||
          Math.abs(lookY) > 0.1);
      const activeMood: HoloMood = reduced ? 'ocioso' : attention ? 'atencao' : currentMood;
      const yaw = reduced
        ? 0
        : tamanho === 'sm'
          ? Math.sin(elapsed * 0.165) * 0.24
          : directPointer
            ? pointer.x * 1.2
            : undefined;

      try {
        renderer(width, height, {
          time: reduced ? 0 : elapsed,
          mood: activeMood,
          moodAge: reduced ? 0 : Math.max(0, (now - moodStartedAtRef.current) / 1000),
          lookX,
          lookY,
          ...(yaw === undefined ? {} : { yaw }),
          ...(reduced ? { effects: false } : {}),
          palette: paletteFor(container),
        });
        container.dataset.pronto = '1';
      } catch {
        renderer = null;
        delete container.dataset.pronto;
      }
    }

    function tick(now: number) {
      animationFrame = 0;
      if (disposed || !visible || document.hidden) return;
      drawFrame(now, false);
      if (renderer) animationFrame = window.requestAnimationFrame(tick);
    }

    function requestDraw() {
      if (disposed || !visible || document.hidden || !renderer) return;
      if (motionPreference.matches) {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        drawFrame(performance.now(), true);
      } else if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    }

    function resizeCanvas() {
      const bounds = container.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      if (width <= 0 || height <= 0) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
      const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context!.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      requestDraw();
    }

    function onVisibilityChange() {
      if (document.hidden) {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        previousFrame = 0;
      } else {
        requestDraw();
      }
    }

    function onMotionPreferenceChange() {
      previousFrame = 0;
      requestDraw();
    }

    redrawRef.current = requestDraw;
    let resizeObserver: ResizeObserver | undefined;
    let intersectionObserver: IntersectionObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      try {
        resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(container);
      } catch {
        window.addEventListener('resize', resizeCanvas);
      }
    } else {
      window.addEventListener('resize', resizeCanvas);
    }

    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (!visible) {
          if (animationFrame) window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
          previousFrame = 0;
        } else {
          requestDraw();
        }
      });
      intersectionObserver.observe(container);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    motionPreference.addEventListener('change', onMotionPreferenceChange);
    resizeCanvas();

    void loadHoloVolume()
      .then((voxels) => {
        if (disposed || !voxels) return;
        renderer = createHoloRenderer(context!, voxels);
        resizeCanvas();
        requestDraw();
      })
      .catch(() => {
        // O WebP permanece visível se o volume ou o Canvas não puder ser usado.
      });

    return () => {
      disposed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionPreference.removeEventListener('change', onMotionPreferenceChange);
      if (redrawRef.current === requestDraw) redrawRef.current = null;
      delete container.dataset.pronto;
    };
  }, [tamanho]);

  function handlePointerMove(event: PointerEvent<HTMLSpanElement>) {
    if (tamanho !== 'lg' || event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    pointerInsideRef.current = true;
    pointerTargetRef.current = {
      x: Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2)),
      y: Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2)),
    };
  }

  function handlePointerLeave() {
    pointerInsideRef.current = false;
    pointerTargetRef.current = { x: 0, y: 0 };
  }

  const fallbackSource = tamanho === 'lg' ? '/ana/ana-frente-lg.webp' : '/ana/ana-frente-sm.webp';

  return (
    <span
      ref={containerRef}
      className={`holo holo-${tamanho}`}
      data-mood={atual}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      {...(tamanho === 'lg'
        ? { onPointerMove: handlePointerMove, onPointerLeave: handlePointerLeave }
        : {})}
    >
      <span className="holo-cena">
        <img
          className="holo-img"
          src={fallbackSource}
          alt=""
          width={900}
          height={900}
          decoding="async"
          draggable={false}
        />
      </span>
      <canvas ref={canvasRef} aria-hidden="true" />
      <span className="holo-varre" aria-hidden="true" />
    </span>
  );
}
