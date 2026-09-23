// 관절 애니메이션 공용 유틸: 키프레임 보간, 2본 IK

export type Pt = { x: number; y: number };

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** [시점(0~1), 포즈 일부] 키프레임. 빠진 값은 base 포즈를 사용 */
export type Keyframes<P> = [number, Partial<P>][];

export function sampleKeyframes<P extends Record<string, number>>(frames: Keyframes<P>, t: number, base: P): P {
  const out = { ...base };
  if (t <= frames[0][0]) return fill(out, frames[0][1], base);
  const last = frames[frames.length - 1];
  if (t >= last[0]) return fill(out, last[1], base);
  let i = 0;
  while (frames[i + 1][0] < t) i++;
  const [t0, a] = frames[i];
  const [t1, b] = frames[i + 1];
  const k = easeInOut((t - t0) / (t1 - t0));
  for (const key of Object.keys(base) as (keyof P)[]) {
    const va = (a[key] ?? base[key]) as number;
    const vb = (b[key] ?? base[key]) as number;
    (out as Record<keyof P, number>)[key] = lerp(va, vb, k);
  }
  return out;
}

function fill<P extends Record<string, number>>(out: P, part: Partial<P>, base: P): P {
  for (const key of Object.keys(base) as (keyof P)[]) (out as Record<keyof P, number>)[key] = (part[key] ?? base[key]) as number;
  return out;
}

/**
 * 2본 IK: 뿌리 a에서 목표 t로 길이 l1, l2 관절을 뻗는다.
 * bend=+1/-1로 관절이 꺾이는 방향 선택. 반환: [중간 관절, 끝 관절]
 */
export function solveIK(a: Pt, t: Pt, l1: number, l2: number, bend: 1 | -1): [Pt, Pt] {
  const dx = t.x - a.x;
  const dy = t.y - a.y;
  const raw = Math.hypot(dx, dy) || 0.001;
  const d = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, raw));
  const base = Math.atan2(dy, dx);
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, cos)));
  const mid = { x: a.x + Math.cos(ang) * l1, y: a.y + Math.sin(ang) * l1 };
  const end = { x: a.x + Math.cos(base) * d, y: a.y + Math.sin(base) * d };
  return [mid, end];
}

/** 방향 각도(캔버스 기준)로 길이만큼 전진 */
export function step(p: Pt, angle: number, len: number): Pt {
  return { x: p.x + Math.cos(angle) * len, y: p.y + Math.sin(angle) * len };
}

/** 둥근 끝 두꺼운 선 (뼈/사지) */
export function limb(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, width: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
