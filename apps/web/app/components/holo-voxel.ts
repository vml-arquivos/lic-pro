export type HoloMood = 'ocioso' | 'atencao' | 'pensando' | 'falando' | 'respondendo' | 'ativando';

export type HoloPalette = {
  primary: string;
  secondary: string;
  ice: string;
  shadow: string;
};

export type HoloFrame = {
  time: number;
  mood: HoloMood;
  moodAge?: number;
  lookX?: number;
  lookY?: number;
  yaw?: number;
  effects?: boolean;
  palette: HoloPalette;
};

export type HoloVoxel = {
  x: number;
  y: number;
  z: number;
  size: number;
  tone: 0 | 1 | 2 | 3;
  alpha: number;
  feature: 0 | 1 | 2;
  poseIndex?: 0 | 1 | 2 | 3 | 4;
};

export const MAX_VOXELS_PER_FRAME = 3000;
const POSE_ANGLES = [-1.42, -0.84, 0, 0.84, 1.42] as const;
export const MAX_POINTS_PER_POSE = 2200;
export const MAX_ACTIVE_POSE_POINTS = MAX_VOXELS_PER_FRAME - 112;
const VOLUME_HEADER_BYTES = 12;
const VOLUME_RECORD_BYTES = 20;
const HEAD_ROWS = 38;
const HEAD_SLICES = 48;
const NECK_ROWS = 10;
const BODY_SLICES = 30;
const SHOULDER_ROWS = 12;
const PARTICLE_COUNT = 110;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function gaussian(value: number, center: number, width: number): number {
  const delta = (value - center) / width;
  return Math.exp(-0.5 * delta * delta);
}

function noise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function createFaceVoxels(): HoloVoxel[] {
  const voxels: HoloVoxel[] = [];

  for (let row = 0; row < HEAD_ROWS; row += 1) {
    const y = 1.02 - (row / (HEAD_ROWS - 1)) * 1.98;
    const vertical = (y - 0.02) / 1.02;
    const crown = Math.sqrt(Math.max(0.04, 1 - vertical * vertical));
    let halfWidth = 0.72 * crown;
    if (y < -0.18) halfWidth *= 0.72 + 0.28 * clamp((y + 1.0) / 0.82, 0, 1);
    const halfDepth = 0.46 * crown;

    for (let slice = 0; slice < HEAD_SLICES; slice += 1) {
      const theta = (slice / HEAD_SLICES) * Math.PI * 2 - Math.PI;
      const front = Math.max(0, Math.cos(theta));
      const sideX = Math.sin(theta);
      const x = halfWidth * sideX;
      let z = halfDepth * Math.cos(theta);

      const eyeLeft = gaussian(x, -0.235, 0.095) * gaussian(y, 0.235, 0.052) * front;
      const eyeRight = gaussian(x, 0.235, 0.095) * gaussian(y, 0.235, 0.052) * front;
      const eyeSocket = clamp((eyeLeft + eyeRight) * 1.18, 0, 1);
      const brow =
        (gaussian(x, -0.235, 0.13) + gaussian(x, 0.235, 0.13)) * gaussian(y, 0.33, 0.045) * front;
      const cheek =
        (gaussian(x, -0.36, 0.17) + gaussian(x, 0.36, 0.17)) * gaussian(y, -0.075, 0.14) * front;
      const bridge = gaussian(x, 0, 0.075) * gaussian(y, 0.055, 0.24) * front;
      const noseTip = gaussian(x, 0, 0.09) * gaussian(y, -0.145, 0.09) * front;
      const nostrils =
        (gaussian(x, -0.072, 0.042) + gaussian(x, 0.072, 0.042)) *
        gaussian(y, -0.205, 0.035) *
        front;
      const lipLine = gaussian(x, 0, 0.18) * gaussian(y, -0.375, 0.026) * front;
      const lips = gaussian(x, 0, 0.19) * gaussian(y, -0.395, 0.064) * front;

      z += (brow * 0.045 + cheek * 0.06 + bridge * 0.24 + noseTip * 0.38 + lips * 0.045) * front;
      z -= eyeSocket * 0.1 + nostrils * 0.045 + lipLine * 0.045;

      const seed = row * HEAD_SLICES + slice + 3;
      const dissolvingEdge = clamp((Math.abs(sideX) - 0.72) * 2.2, 0, 0.72);
      const dropout = dissolvingEdge * 0.38;
      if (noise(seed) < 0.035 + dropout * 0.34) continue;

      let tone: HoloVoxel['tone'] = front > 0.62 ? 0 : 1;
      let feature: HoloVoxel['feature'] = 0;
      if (front > 0.45 && eyeSocket > 0.29) {
        tone = 3;
        feature = 1;
      } else if (front > 0.45 && nostrils > 0.34) {
        tone = 3;
      } else if (front > 0.45 && lipLine > 0.48) {
        tone = 3;
        feature = 2;
      } else if (front > 0.5 && lips > 0.33) {
        tone = 2;
        feature = 2;
      } else if (front > 0.55 && (bridge > 0.35 || brow > 0.42 || cheek > 0.42)) {
        tone = noise(seed + 71) > 0.42 ? 2 : 1;
      } else if (noise(seed + 149) > 0.9) {
        tone = 2;
      }

      voxels.push({
        x: x + (noise(seed + 19) - 0.5) * 0.035,
        y: y + (noise(seed + 23) - 0.5) * 0.035,
        z: z + (noise(seed + 29) - 0.5) * 0.016,
        size: 0.018 + noise(seed + 11) * 0.019,
        tone,
        alpha: clamp((0.82 - dissolvingEdge * 0.52) * (0.8 + front * 0.2), 0.22, 0.94),
        feature,
      });
    }
  }

  addFaceDetails(voxels);
  addEllipsoid(voxels, 0, -1.22, -0.035, 0.245, 0.39, 0.2, NECK_ROWS, BODY_SLICES, 37);
  addEllipsoid(voxels, 0, -1.76, -0.035, 0.78, 0.34, 0.31, SHOULDER_ROWS, BODY_SLICES, 811);
  return voxels;
}

function addFaceDetails(voxels: HoloVoxel[]): void {
  for (const side of [-1, 1] as const) {
    for (let point = 0; point < 9; point += 1) {
      const position = point / 8;
      const seed = 3901 + (side + 1) * 31 + point;
      voxels.push({
        x: side * (0.15 + position * 0.19),
        y: 0.235 + Math.sin(position * Math.PI) * 0.012,
        z: 0.405 - position * 0.035,
        size: 0.025 + noise(seed) * 0.012,
        tone: 3,
        alpha: 0.98,
        feature: 1,
      });
    }
    for (let point = 0; point < 8; point += 1) {
      const position = point / 7;
      const seed = 4103 + (side + 1) * 31 + point;
      voxels.push({
        x: side * (0.13 + position * 0.23),
        y: 0.325 + Math.sin(position * Math.PI) * 0.024,
        z: 0.425 - position * 0.04,
        size: 0.018 + noise(seed) * 0.012,
        tone: 1,
        alpha: 0.78,
        feature: 0,
      });
    }
  }

  for (let point = 0; point < 8; point += 1) {
    const seed = 4301 + point;
    const y = 0.16 - point * 0.045;
    voxels.push({
      x: (noise(seed) - 0.5) * 0.025,
      y,
      z: 0.47 + point * 0.038,
      size: 0.022 + noise(seed + 17) * 0.013,
      tone: point > 5 ? 2 : 1,
      alpha: 0.94,
      feature: 0,
    });
  }

  for (const side of [-1, 1] as const) {
    voxels.push({
      x: side * 0.035,
      y: -0.15,
      z: 0.79,
      size: 0.034,
      tone: 2,
      alpha: 0.98,
      feature: 0,
    });
    voxels.push({
      x: side * 0.068,
      y: -0.19,
      z: 0.69,
      size: 0.022,
      tone: 3,
      alpha: 0.88,
      feature: 0,
    });
  }

  for (let point = 0; point < 11; point += 1) {
    const x = -0.15 + (point / 10) * 0.3;
    const smile = Math.abs(x) / 0.15;
    const seed = 4703 + point;
    voxels.push({
      x,
      y: -0.365 + smile * 0.022,
      z: 0.445,
      size: 0.023 + noise(seed) * 0.012,
      tone: 3,
      alpha: 0.94,
      feature: 2,
    });
  }

  for (let point = 0; point < 7; point += 1) {
    const x = -0.095 + (point / 6) * 0.19;
    voxels.push({
      x,
      y: -0.42,
      z: 0.425,
      size: 0.02,
      tone: 2,
      alpha: 0.82,
      feature: 2,
    });
  }
}

function addEllipsoid(
  voxels: HoloVoxel[],
  centerX: number,
  centerY: number,
  centerZ: number,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  rows: number,
  slices: number,
  seedOffset: number,
): void {
  for (let row = 0; row < rows; row += 1) {
    const latitude = -Math.PI / 2 + (row / (rows - 1)) * Math.PI;
    const ring = Math.cos(latitude);
    const y = centerY + radiusY * Math.sin(latitude);
    for (let slice = 0; slice < slices; slice += 1) {
      const theta = (slice / slices) * Math.PI * 2 - Math.PI;
      const index = seedOffset + row * slices + slice;
      const dissolve = clamp((Math.abs(Math.sin(theta)) - 0.68) * 1.8, 0, 0.5);
      if (noise(index) < dissolve * 0.18) continue;
      voxels.push({
        x: centerX + radiusX * ring * Math.sin(theta) + (noise(index + 19) - 0.5) * 0.03,
        y: y + (noise(index + 23) - 0.5) * 0.03,
        z: centerZ + radiusZ * ring * Math.cos(theta) + (noise(index + 29) - 0.5) * 0.014,
        size: 0.019 + noise(index + 17) * 0.019,
        tone: noise(index + 41) > 0.64 ? 2 : noise(index + 13) > 0.45 ? 1 : 0,
        alpha: 0.68 - dissolve * 0.45,
        feature: 0,
      });
    }
  }
}

const VOXELS = createFaceVoxels();
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
  const seed = index + 2701;
  const angle = noise(seed) * Math.PI * 2;
  const radius = 0.78 + noise(seed + 4) * 0.62;
  return {
    x: Math.cos(angle) * radius,
    y: -0.35 + noise(seed + 2) * 2.15,
    z: (noise(seed + 3) - 0.5) * 0.9,
    size: 0.018 + noise(seed + 5) * 0.026,
    phase: noise(seed + 7),
    tone: (noise(seed + 8) > 0.55 ? 2 : noise(seed + 9) > 0.45 ? 1 : 0) as 0 | 1 | 2,
  };
});

export function getHoloVoxels(): readonly HoloVoxel[] {
  return VOXELS;
}

export function parseHoloVoxelBuffer(buffer: ArrayBuffer): HoloVoxel[] | null {
  if (buffer.byteLength < VOLUME_HEADER_BYTES) return null;
  const view = new DataView(buffer);
  if (
    view.getUint8(0) !== 65 ||
    view.getUint8(1) !== 78 ||
    view.getUint8(2) !== 65 ||
    view.getUint8(3) !== 86 ||
    view.getUint16(4, true) !== 1 ||
    view.getUint16(6, true) !== VOLUME_RECORD_BYTES
  ) {
    return null;
  }

  const count = view.getUint32(8, true);
  if (
    count < POSE_ANGLES.length ||
    count > POSE_ANGLES.length * MAX_POINTS_PER_POSE ||
    buffer.byteLength !== VOLUME_HEADER_BYTES + count * VOLUME_RECORD_BYTES
  ) {
    return null;
  }

  const groupCounts = [0, 0, 0, 0, 0];
  const voxels: HoloVoxel[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = VOLUME_HEADER_BYTES + index * VOLUME_RECORD_BYTES;
    const x = view.getFloat32(offset, true);
    const y = view.getFloat32(offset + 4, true);
    const z = view.getFloat32(offset + 8, true);
    const size = view.getFloat32(offset + 12, true);
    const tone = view.getUint8(offset + 16);
    const alpha = view.getUint8(offset + 17) / 255;
    const feature = view.getUint8(offset + 18);
    const poseIndex = view.getUint8(offset + 19);

    if (
      ![x, y, z, size, alpha].every(Number.isFinite) ||
      Math.abs(x) > 2 ||
      Math.abs(y) > 2.2 ||
      Math.abs(z) > 2 ||
      size <= 0 ||
      size > 0.2 ||
      tone > 3 ||
      feature > 2 ||
      poseIndex > 4
    ) {
      return null;
    }
    groupCounts[poseIndex] = groupCounts[poseIndex]! + 1;
    if (groupCounts[poseIndex]! > MAX_POINTS_PER_POSE) return null;
    voxels.push({
      x,
      y,
      z,
      size,
      tone: tone as HoloVoxel['tone'],
      alpha,
      feature: feature as HoloVoxel['feature'],
      poseIndex: poseIndex as NonNullable<HoloVoxel['poseIndex']>,
    });
  }
  return groupCounts.every((groupCount) => groupCount > 0) ? voxels : null;
}

function getPoseBlend(yaw: number): readonly [number, number, number] {
  const angle = clamp(yaw, POSE_ANGLES[0]!, POSE_ANGLES[POSE_ANGLES.length - 1]!);
  let upper = 0;
  while (upper < POSE_ANGLES.length - 1 && angle > POSE_ANGLES[upper]!) upper += 1;
  const lower = Math.max(0, upper - 1);
  const span = POSE_ANGLES[upper]! - POSE_ANGLES[lower]!;
  const mix = lower === upper ? 0 : clamp((angle - POSE_ANGLES[lower]!) / span, 0, 1);
  return [lower, upper, mix];
}

export function createHoloRenderer(
  context: CanvasRenderingContext2D,
  voxels: readonly HoloVoxel[] = VOXELS,
) {
  const poseGroups = Array.from({ length: POSE_ANGLES.length }, () => [] as number[]);
  for (let index = 0; index < voxels.length; index += 1) {
    const poseIndex = voxels[index]!.poseIndex;
    if (poseIndex !== undefined) poseGroups[poseIndex]!.push(index);
  }
  const hasPoseGroups = poseGroups.every((group) => group.length > 0);
  const order = new Uint16Array(voxels.length);
  const poseWeight = new Float32Array(voxels.length);
  const depth = new Float32Array(voxels.length);
  const screenX = new Float32Array(voxels.length);
  const screenY = new Float32Array(voxels.length);
  const screenSize = new Float32Array(voxels.length);
  const alpha = new Float32Array(voxels.length);

  return function draw(width: number, height: number, frame: HoloFrame): void {
    if (width <= 0 || height <= 0) return;
    const { time, mood, palette } = frame;
    const moodAge = frame.moodAge ?? time;
    const lookX = clamp(frame.lookX ?? 0, -1, 1);
    const lookY = clamp(frame.lookY ?? 0, -1, 1);
    const idleYaw = Math.sin(time * 0.165) * 1.34;
    const yaw = clamp((frame.yaw ?? idleYaw) + lookX * 0.2, -1.48, 1.48);
    const pitch =
      Math.sin(time * 0.42) * 0.018 +
      lookY * 0.055 +
      (mood === 'pensando' ? Math.sin(time * 2.8) * 0.018 : 0) +
      (mood === 'falando' || mood === 'respondendo' ? Math.sin(time * 7.2) * 0.027 : 0);
    const yawCos = Math.cos(yaw);
    const yawSin = Math.sin(yaw);
    const pitchCos = Math.cos(pitch);
    const pitchSin = Math.sin(pitch);
    const scale = Math.min((width * 0.46) / 1.8, (height * 0.74) / 3.15);
    const poseScale = hasPoseGroups ? 1.28 : 1;
    const centerX = width * 0.5 - Math.sin(yaw) * scale * 0.1;
    const centerY = height * 0.45;
    const pulse = 0.92 + Math.sin(time * 0.72) * 0.06;
    const activation = mood === 'ativando' ? 1 - clamp(moodAge / 0.82, 0, 1) : 0;
    const scanPosition = 0.5 + Math.sin(time * (mood === 'pensando' ? 3.9 : 0.32)) * 0.44;
    const blinkPhase = (time + 2.1) % 7.4;
    const blink =
      blinkPhase < 0.18
        ? Math.sin((blinkPhase / 0.18) * Math.PI)
        : blinkPhase > 0.3 && blinkPhase < 0.45
          ? Math.sin(((blinkPhase - 0.3) / 0.15) * Math.PI) * 0.55
          : 0;
    const mouthPulse =
      mood === 'falando' || mood === 'respondendo' ? 0.5 + 0.5 * Math.sin(time * 10) : 0;

    context.save();
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';

    if (frame.effects !== false) {
      drawOrbit(context, centerX, centerY - scale * 0.2, scale, time, palette, 0.22, 0.7);
      drawOrbit(context, centerX, centerY - scale * 0.15, scale, -time * 0.72, palette, 0.34, 0.52);
    }

    let activeCount = 0;
    if (hasPoseGroups) {
      const [lower, upper, mix] = getPoseBlend(yaw);
      const lowerWeight = lower === upper ? 1 : 1 - mix;
      const upperWeight = lower === upper ? 0 : mix;
      const lowerBudget =
        lower === upper ? MAX_ACTIVE_POSE_POINTS : Math.floor(MAX_ACTIVE_POSE_POINTS * lowerWeight);
      const upperBudget = MAX_ACTIVE_POSE_POINTS - lowerBudget;
      const addGroup = (poseIndex: number, weight: number, budget: number) => {
        if (weight <= 0.001 || budget <= 0) return;
        const group = poseGroups[poseIndex]!;
        const count = Math.min(group.length, budget);
        for (let point = 0; point < count; point += 1) {
          const sampleIndex = Math.min(
            group.length - 1,
            Math.floor(((point + 0.5) * group.length) / count),
          );
          const index = group[sampleIndex]!;
          order[activeCount] = index;
          poseWeight[index] = weight;
          activeCount += 1;
        }
      };
      addGroup(lower, lowerWeight, lowerBudget);
      if (upper !== lower) addGroup(upper, upperWeight, upperBudget);
    } else {
      for (let index = 0; index < voxels.length; index += 1) {
        order[activeCount] = index;
        poseWeight[index] = 1;
        activeCount += 1;
      }
    }

    for (let position = 0; position < activeCount; position += 1) {
      const index = order[position]!;
      const voxel = voxels[index]!;
      const scaledX = voxel.x * poseScale;
      const scaledY = voxel.y * poseScale;
      const scaledZ = voxel.z * poseScale;
      const rotatedX = scaledX * yawCos + scaledZ * yawSin;
      const rotatedZ = -scaledX * yawSin + scaledZ * yawCos;
      const rotatedY = scaledY * pitchCos - rotatedZ * pitchSin;
      const cameraZ = scaledY * pitchSin + rotatedZ * pitchCos;
      const perspective = 2.9 / (2.9 - cameraZ * 0.25);
      screenX[index] = centerX + (rotatedX + lookX * 0.035) * scale * perspective;
      screenY[index] = centerY - (rotatedY + lookY * 0.025) * scale * perspective;
      screenSize[index] = Math.max(
        0.9,
        voxel.size * poseScale * scale * perspective * (0.88 + pulse * 0.12),
      );
      depth[index] = cameraZ;
      let pointAlpha = voxel.alpha * (0.84 + pulse * 0.16) * poseWeight[index]!;
      if (voxel.feature === 1) pointAlpha *= 1 - blink * 0.78;
      if (voxel.feature === 2) pointAlpha *= 0.7 + mouthPulse * 0.75;
      if (mood === 'pensando') pointAlpha *= 0.88 + Math.sin(time * 4.2 + voxel.y * 6) * 0.12;
      if (activation > 0) pointAlpha *= 0.72 + activation * 0.28;
      alpha[index] = clamp(pointAlpha, 0, 1);
    }

    order.subarray(0, activeCount).sort((left, right) => depth[left]! - depth[right]!);
    let previousTone = -1;
    for (let position = 0; position < activeCount; position += 1) {
      const index = order[position]!;
      const voxel = voxels[index]!;
      if (voxel.tone !== previousTone) {
        context.fillStyle = colorForTone(voxel.tone, palette);
        previousTone = voxel.tone;
      }
      context.globalAlpha = alpha[index]!;
      const square = screenSize[index]!;
      context.fillRect(screenX[index]! - square / 2, screenY[index]! - square / 2, square, square);
    }

    if (frame.effects !== false) {
      drawLooseParticles(
        context,
        width,
        height,
        centerX,
        centerY,
        scale,
        time,
        mood,
        moodAge,
        yaw,
        palette,
        activation,
      );
    }
    if (frame.effects !== false && mood === 'pensando') {
      context.globalAlpha = 0.18;
      context.fillStyle = palette.secondary;
      context.fillRect(
        width * 0.22,
        height * scanPosition,
        width * 0.56,
        Math.max(1, height * 0.006),
      );
    }
    if (frame.effects !== false && mouthPulse > 0)
      drawResponseWave(context, centerX, centerY, scale, time, palette, mouthPulse);
    if (frame.effects !== false && activation > 0.02)
      drawActivationFlash(context, centerX, centerY, scale, activation, palette);

    context.globalAlpha = 1;
    context.restore();
  };
}

function colorForTone(tone: HoloVoxel['tone'], palette: HoloPalette): string {
  switch (tone) {
    case 1:
      return palette.secondary;
    case 2:
      return palette.ice;
    case 3:
      return palette.shadow;
    default:
      return palette.primary;
  }
}

function drawOrbit(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale: number,
  time: number,
  palette: HoloPalette,
  yRadiusFactor: number,
  alpha: number,
): void {
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = time < 0 ? palette.primary : palette.secondary;
  context.lineWidth = Math.max(0.65, scale * 0.012);
  context.setLineDash([scale * 0.075, scale * 0.09]);
  context.beginPath();
  context.ellipse(
    centerX,
    centerY,
    scale * 0.91,
    scale * yRadiusFactor,
    Math.sin(time * 0.16) * 0.09,
    0,
    Math.PI * 2,
  );
  context.stroke();
  context.restore();
}

function drawLooseParticles(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  scale: number,
  time: number,
  mood: HoloMood,
  moodAge: number,
  yaw: number,
  palette: HoloPalette,
  activation: number,
): void {
  const colors = [palette.primary, palette.secondary, palette.ice];
  for (const particle of PARTICLES) {
    const phase = (time / 10 + particle.phase) % 1;
    const rise = phase * 0.34;
    const burst = mood === 'ativando' ? Math.max(0, 1 - moodAge / 0.82) * 0.36 : 0;
    const x = particle.x + Math.cos(particle.phase * Math.PI * 2) * burst;
    const y = particle.y + rise + Math.sin(particle.phase * Math.PI * 2) * burst;
    const z = particle.z + burst * 0.2;
    const projectedX = x * Math.cos(yaw) + z * Math.sin(yaw);
    const projectedZ = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const perspective = 2.9 / (2.9 - projectedZ * 0.25);
    const px = centerX + projectedX * scale * perspective;
    const py = centerY - y * scale * perspective;
    if (px < -4 || px > width + 4 || py < -4 || py > height + 4) continue;
    context.fillStyle = colors[particle.tone] ?? palette.primary;
    context.globalAlpha = clamp(
      (0.2 + Math.sin(phase * Math.PI) * 0.62) * (1 + activation),
      0.04,
      0.92,
    );
    const size = Math.max(0.8, particle.size * scale * (0.8 + perspective * 0.2));
    context.fillRect(px - size / 2, py - size / 2, size, size);
  }
}

function drawResponseWave(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale: number,
  time: number,
  palette: HoloPalette,
  pulse: number,
): void {
  context.save();
  context.strokeStyle = palette.secondary;
  context.lineWidth = Math.max(0.8, scale * 0.012);
  for (let wave = 0; wave < 2; wave += 1) {
    const phase = (time * 1.3 + wave * 0.5) % 1;
    context.globalAlpha = pulse * (1 - phase) * 0.55;
    context.beginPath();
    context.ellipse(
      centerX,
      centerY + scale * 0.48,
      scale * (0.2 + phase * 0.6),
      scale * (0.04 + phase * 0.12),
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }
  context.restore();
}

function drawActivationFlash(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale: number,
  activation: number,
  palette: HoloPalette,
): void {
  context.save();
  context.strokeStyle = palette.ice;
  context.lineWidth = Math.max(0.7, scale * 0.009);
  context.globalAlpha = activation * 0.65;
  context.beginPath();
  context.ellipse(
    centerX,
    centerY - scale * 0.16,
    scale * (0.92 + activation * 0.18),
    scale * 0.4,
    0,
    0,
    Math.PI * 2,
  );
  context.stroke();
  context.restore();
}
