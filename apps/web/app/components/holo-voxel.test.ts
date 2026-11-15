import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createHoloRenderer,
  getHoloVoxels,
  MAX_POINTS_PER_POSE,
  MAX_ACTIVE_POSE_POINTS,
  MAX_VOXELS_PER_FRAME,
  parseHoloVoxelBuffer,
  type HoloMood,
  type HoloVoxel,
} from './holo-voxel';

const palette = {
  primary: '#4f83ff',
  secondary: '#25d9e6',
  ice: '#e5f7ff',
  shadow: '#07122e',
};

function createContextRecorder() {
  const rectangles: Array<[number, number, number, number]> = [];
  const context = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'round',
    save() {},
    restore() {},
    clearRect() {},
    fillRect(x: number, y: number, width: number, height: number) {
      rectangles.push([x, y, width, height]);
    },
    setLineDash() {},
    beginPath() {},
    ellipse() {},
    stroke() {},
  } as unknown as CanvasRenderingContext2D;
  return { context, rectangles };
}

function createPoseVoxels(pointsPerPose: number): HoloVoxel[] {
  return Array.from({ length: pointsPerPose * 5 }, (_, index) => {
    const poseIndex = Math.floor(index / pointsPerPose);
    const localIndex = index % pointsPerPose;
    return {
      x: ((localIndex % 8) - 3.5) * 0.08,
      y: (Math.floor(localIndex / 8) - 2) * 0.12,
      z: 0.12 + (localIndex % 3) * 0.04,
      size: 0.025,
      tone: 1,
      alpha: 0.9,
      feature: 0,
      poseIndex: poseIndex as NonNullable<HoloVoxel['poseIndex']>,
    };
  });
}

function createVolumeBuffer(): ArrayBuffer {
  const count = 5;
  const recordSize = 20;
  const buffer = new ArrayBuffer(12 + count * recordSize);
  const bytes = new Uint8Array(buffer);
  bytes.set([65, 78, 65, 86], 0);
  const view = new DataView(buffer);
  view.setUint16(4, 1, true);
  view.setUint16(6, recordSize, true);
  view.setUint32(8, count, true);
  for (let pose = 0; pose < 5; pose += 1) {
    const offset = 12 + pose * recordSize;
    view.setFloat32(offset, 0.1, true);
    view.setFloat32(offset + 4, 0.2, true);
    view.setFloat32(offset + 8, 0.3, true);
    view.setFloat32(offset + 12, 0.025, true);
    view.setUint8(offset + 16, 1);
    view.setUint8(offset + 17, 230);
    view.setUint8(offset + 18, pose === 2 ? 1 : 0);
    view.setUint8(offset + 19, pose);
  }
  return buffer;
}

function drawAtYaw(yaw: number) {
  const { context, rectangles } = createContextRecorder();
  const renderer = createHoloRenderer(context);
  renderer(256, 256, { time: 0, mood: 'ocioso', yaw, palette });
  const voxelCount = getHoloVoxels().length;
  const faceVoxels = rectangles.slice(0, voxelCount);
  const xs = faceVoxels.map(([x, , width]) => [x, x + width] as const);
  return {
    rectangleCount: rectangles.length,
    silhouetteWidth:
      Math.max(...xs.map((pair) => pair[1])) - Math.min(...xs.map((pair) => pair[0])),
  };
}

describe('renderer voxel 3D da Ana', () => {
  it('mantém uma geometria única, finita e abaixo do orçamento de quadriláteros', () => {
    const voxels = getHoloVoxels();
    expect(voxels.length).toBeGreaterThan(2000);
    expect(voxels.length + 110).toBeLessThan(MAX_VOXELS_PER_FRAME);
    expect(MAX_ACTIVE_POSE_POINTS + 111).toBeLessThan(MAX_VOXELS_PER_FRAME);
    expect(
      voxels.every((voxel) =>
        [voxel.x, voxel.y, voxel.z, voxel.size, voxel.alpha].every(Number.isFinite),
      ),
    ).toBe(true);
    expect(voxels.filter((voxel) => voxel.feature === 1).length).toBeGreaterThan(12);
    expect(voxels.filter((voxel) => voxel.feature === 2).length).toBeGreaterThan(12);
    expect(Math.max(...voxels.map((voxel) => voxel.z))).toBeGreaterThan(0.75);
  });

  it('mantém a mesma contagem de pontos e reduz a largura aparente no perfil', () => {
    const frontal = drawAtYaw(0);
    const tresQuartos = drawAtYaw(0.84);
    const perfil = drawAtYaw(1.42);
    expect(frontal.rectangleCount).toBeLessThan(MAX_VOXELS_PER_FRAME);
    expect(tresQuartos.rectangleCount).toBeLessThan(MAX_VOXELS_PER_FRAME);
    expect(perfil.rectangleCount).toBeLessThan(MAX_VOXELS_PER_FRAME);
    expect(perfil.silhouetteWidth).toBeLessThan(frontal.silhouetteWidth);
  });

  it('renderiza os estados sem falha e mantém o limite de desenho', () => {
    const moods: HoloMood[] = [
      'ocioso',
      'atencao',
      'pensando',
      'falando',
      'respondendo',
      'ativando',
    ];
    const angles = [-1.42, -0.84, 0, 0.84, 1.42] as const;
    for (const [index, mood] of moods.entries()) {
      const { context, rectangles } = createContextRecorder();
      const renderer = createHoloRenderer(context);
      renderer(192, 192, {
        time: index * 0.3,
        mood,
        moodAge: 0.1,
        yaw: angles[index % angles.length] ?? 0,
        lookX: 0.25,
        lookY: -0.18,
        palette,
      });
      expect(rectangles.length).toBeLessThan(MAX_VOXELS_PER_FRAME);
      expect(rectangles.every((rect) => rect.every(Number.isFinite))).toBe(true);
    }
  });

  it('interpola os grupos 3D adjacentes pelos cinco ângulos dentro do orçamento', () => {
    const pointsPerPose = MAX_POINTS_PER_POSE;
    const voxels = createPoseVoxels(pointsPerPose);
    const angles = [-1.42, -1.13, -0.84, -0.42, 0, 0.42, 0.84, 1.13, 1.42];

    for (const yaw of angles) {
      const { context, rectangles } = createContextRecorder();
      const renderer = createHoloRenderer(context, voxels);
      renderer(256, 256, { time: 0, mood: 'ocioso', yaw, palette });
      expect(rectangles.length).toBeLessThanOrEqual(MAX_ACTIVE_POSE_POINTS + 110);
      expect(rectangles.length).toBeLessThan(MAX_VOXELS_PER_FRAME);
    }

    const { context, rectangles } = createContextRecorder();
    createHoloRenderer(context, voxels)(256, 256, {
      time: 1,
      mood: 'pensando',
      yaw: -1.13,
      palette,
    });
    expect(rectangles.length).toBeLessThan(MAX_VOXELS_PER_FRAME);
  });

  it('valida cabeçalho, tamanho e cinco grupos do volume binário local', () => {
    const buffer = createVolumeBuffer();
    const voxels = parseHoloVoxelBuffer(buffer);
    expect(voxels).toHaveLength(5);
    expect(voxels?.map((voxel) => voxel.poseIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(voxels?.[2]?.feature).toBe(1);

    const invalid = buffer.slice(0);
    new Uint8Array(invalid)[0] = 0;
    expect(parseHoloVoxelBuffer(invalid)).toBeNull();
  });

  it('carrega o volume multiângulo real usado pela interface', () => {
    const asset = readFileSync(resolve(process.cwd(), 'public/ana/ana-voxels.bin'));
    const bytes = new Uint8Array(asset.byteLength);
    bytes.set(asset);
    const voxels = parseHoloVoxelBuffer(bytes.buffer as ArrayBuffer);

    expect(voxels).toHaveLength(MAX_POINTS_PER_POSE * 5);
    for (let pose = 0; pose < 5; pose += 1) {
      expect(voxels?.filter((voxel) => voxel.poseIndex === pose)).toHaveLength(MAX_POINTS_PER_POSE);
    }
  });
});
