import { describe, expect, it, vi } from 'vitest';
import { criarCena, lerVolume } from './holo-voxel';

const PONTOS = [
  [72, 16, 8, 0],
  [78, 16, 12, 1],
  [72, 28, 16, 0],
  [78, 28, 20, 1],
  [74, 44, 12, 0],
  [80, 44, 8, 1],
] as const;

function volumeDeTeste(): ArrayBuffer {
  const paleta = [72, 136, 255, 34, 211, 238];
  const bytes = new Uint8Array(3 + paleta.length + PONTOS.length * 4);
  bytes[0] = PONTOS.length & 255;
  bytes[1] = PONTOS.length >>> 8;
  bytes[2] = paleta.length / 3;
  bytes.set(paleta, 3);
  PONTOS.forEach((ponto, indice) => bytes.set(ponto, 3 + paleta.length + indice * 4));
  return bytes.buffer;
}

function canvasDeTeste() {
  const fillRect = vi.fn();
  const ctx = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect,
    rect: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
  return { canvas, ctx, fillRect };
}

const ENTRADA = {
  olharX: 0,
  olharY: 0,
  assentar: true,
  humor: 'ocioso' as const,
  desdeHumor: 0,
  corA: [91, 140, 255] as const,
  corB: [34, 211, 238] as const,
};

describe('volume holográfico da Ana', () => {
  it('recusa cabeçalho curto, volume vazio e dados truncados', () => {
    expect(lerVolume(new ArrayBuffer(2))).toBeNull();
    expect(lerVolume(Uint8Array.from([0, 0, 0]).buffer)).toBeNull();
    expect(lerVolume(Uint8Array.from([1, 0, 1, 72, 136, 255, 7, 16]).buffer)).toBeNull();
  });

  it('lê grade, profundidade e paleta em um volume válido', () => {
    const volume = lerVolume(volumeDeTeste());
    expect(volume).not.toBeNull();
    expect(volume?.n).toBe(PONTOS.length);
    expect(Array.from(volume?.paleta ?? [])).toEqual([72, 136, 255, 34, 211, 238]);
    expect([volume?.gx[0], volume?.gy[0], volume?.gz[0], volume?.cor[0]]).toEqual([72, 16, 1, 0]);
    expect([volume?.gx[5], volume?.gy[5], volume?.gz[5], volume?.cor[5]]).toEqual([80, 44, 1, 1]);
  });

  it('não cria uma cena se o Canvas não oferece contexto 2D', () => {
    const canvas = { getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement;
    const volume = lerVolume(volumeDeTeste());
    expect(volume).not.toBeNull();
    expect(criarCena(canvas, volume!, { pequeno: true })).toBeNull();
  });

  it('redimensiona pelo DPR e desenha a figura pequena com fallback de contexto', () => {
    const { canvas, ctx, fillRect } = canvasDeTeste();
    const volume = lerVolume(volumeDeTeste());
    expect(volume).not.toBeNull();
    const cena = criarCena(canvas, volume!, { pequeno: true });
    expect(cena).not.toBeNull();

    cena!.redimensionar(120, 80, 2);
    cena!.desenhar(1, 1 / 60, ENTRADA);

    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(160);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(fillRect).toHaveBeenCalled();
  });

  it('desenha ondas de fala no estado falando', () => {
    const { canvas, ctx } = canvasDeTeste();
    const volume = lerVolume(volumeDeTeste());
    const cena = criarCena(canvas, volume!, { pequeno: true });
    cena!.redimensionar(120, 120, 1);
    cena!.desenhar(1, 1 / 60, { ...ENTRADA, humor: 'falando' });

    expect(ctx.ellipse).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('desenha o modo grande com anéis e preserva o desenho em estado reduzido', () => {
    const { canvas, ctx, fillRect } = canvasDeTeste();
    const volume = lerVolume(volumeDeTeste());
    const cena = criarCena(canvas, volume!, { pequeno: false });
    cena!.redimensionar(240, 240, 1);
    cena!.desenhar(1, 0, ENTRADA);

    expect(fillRect).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
  });
});
