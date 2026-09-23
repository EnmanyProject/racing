// 용 몬스터 관절 리그 (왼쪽=기사 방향을 바라봄, 원점=발밑 중앙)
// 목 5마디 · 꼬리 8마디 · 날개(어깨/팔꿈치/손목 + 손가락뼈 3) · 다리 4개(IK로 발을 땅에 고정)

import { lerp, limb, sampleKeyframes, solveIK, step, type Keyframes, type Pt } from './anim';
import type { EnemyKind } from './battle';

interface Palette {
  body: string;
  dark: string;
  belly: string;
  wing: string;
  horn: string;
  eye: string;
}

const PALETTE: Record<EnemyKind, Palette> = {
  // 야생룡: 붉은 비늘
  beast: { body: '#b3472a', dark: '#5e1e10', belly: '#e9b26e', wing: '#8a2a1a', horn: '#efe2c4', eye: '#ffd23a' },
  // 철갑룡: 강철 비늘과 등판
  armored: { body: '#6f7b8e', dark: '#2f3645', belly: '#b4bfcf', wing: '#4a5568', horn: '#dfe4ec', eye: '#ff8a1a' },
  // 영룡: 반투명하게 빛나는 몸
  spirit: { body: '#7b4ad8', dark: '#2e1470', belly: '#c2adff', wing: '#5a2ab8', horn: '#d8f4ff', eye: '#6be3ff' },
};

/** 브레스 색 [중심, 가장자리] */
export const BREATH_COLOR: Record<EnemyKind, [string, string]> = {
  beast: ['#fff0a0', '#ff5a1a'],
  armored: ['#ffffff', '#7fb0e0'],
  spirit: ['#f0e0ff', '#8a3aff'],
};


type DPose = {
  bx: number; // 몸통 이동
  by: number;
  pitch: number; // 몸통 앞뒤 기울기
  neck: number; // -1 젖힘 · 0 기본 · 1 물기
  drop: number; // 0~1 쓰러짐(목/꼬리 늘어짐)
  fold: number; // 0~1 날개 접기
  jaw: number;
  fs: number; // 앞발 내딛기(x)
  fy: number; // 앞발 들기(y)
};

const ATTACK: Keyframes<DPose> = [
  [0, {}],
  [0.3, { bx: 10, by: 3, pitch: 0.06, neck: -0.8, jaw: 0.3, fs: -8, fy: -10 }],
  [0.55, { bx: -34, by: 8, pitch: -0.1, neck: 1, jaw: 1, fs: -26, fy: 0 }],
  [0.8, { bx: -30, by: 8, pitch: -0.08, neck: 1, jaw: 0.9, fs: -26, fy: 0 }],
  [1, {}],
];
const HURT: Keyframes<DPose> = [
  [0, {}],
  [0.25, { bx: 12, by: -2, pitch: 0.1, neck: -0.5, jaw: 0.45 }],
  [1, {}],
];
const DEATH: Keyframes<DPose> = [
  [0, {}],
  [0.4, { by: 10, pitch: -0.05, neck: -0.6, jaw: 0.8, fold: 0.4 }],
  [1, { by: 26, pitch: 0.12, drop: 1, fold: 1, jaw: 0.3 }],
];
export const DRAGON_ATTACK_MS = 480;
const HURT_MS = 260;
const DEATH_MS = 650;

// 목 각도 세트 (캔버스 각도, 5마디 + 머리)
const NECK_IDLE = [-2.0, -2.1, -2.4, -2.7, -2.9, -3.0];
const NECK_BITE = [-2.6, -2.8, -2.95, -3.1, -3.2, -3.35];
const NECK_REAR = [-1.7, -1.75, -1.9, -2.1, -2.4, -2.6];
const NECK_DROP = [-3.1, -3.3, -3.5, -3.7, -3.8, -3.9];
const NECK_SEG = 12;
const TAIL_SEG = 11;
const TAIL_N = 8;

export interface DragonAnim {
  kind: EnemyKind;
  boss: boolean;
  now: number;
  /** 공격 시작 후 경과 ms (없으면 null) */
  attackAge: number | null;
  hurtAge: number | null;
  deathAge: number | null;
}

function dragonPose(a: DragonAnim): DPose {
  const b = Math.sin(a.now / 700);
  let pose: DPose = {
    bx: 0,
    by: 1.5 * b,
    pitch: 0.012 * b,
    neck: 0.08 * Math.sin(a.now / 900),
    drop: 0,
    fold: 0,
    jaw: 0.06 + 0.06 * Math.sin(a.now / 1300),
    fs: 0,
    fy: 0,
  };
  if (a.attackAge !== null && a.attackAge <= DRAGON_ATTACK_MS) pose = sampleKeyframes(ATTACK, a.attackAge / DRAGON_ATTACK_MS, pose);
  if (a.hurtAge !== null && a.hurtAge <= HURT_MS) pose = sampleKeyframes(HURT, a.hurtAge / HURT_MS, pose);
  if (a.deathAge !== null) pose = sampleKeyframes(DEATH, Math.min(1, a.deathAge / DEATH_MS), pose);
  return pose;
}

/** 용을 그리고 입 위치(발밑 원점 기준)를 반환 */
export function drawDragon(ctx: CanvasRenderingContext2D, a: DragonAnim, hurt: boolean): Pt {
  let p = PALETTE[a.kind];
  if (a.boss) p = { ...p, horn: '#ffd24a' };
  if (hurt) p = mapPalette(p, (c) => mix(c, '#ffffff', 0.55));
  const pose = dragonPose(a);
  const now = a.now;

  // 몸통 좌표계 → 발밑 좌표계
  const C = { x: 16, y: -54 };
  const cos = Math.cos(pose.pitch);
  const sin = Math.sin(pose.pitch);
  const B = (x: number, y: number): Pt => ({
    x: C.x + (x - C.x) * cos - (y - C.y) * sin + pose.bx,
    y: C.y + (x - C.x) * sin + (y - C.y) * cos + pose.by,
  });

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (a.kind === 'spirit') {
    ctx.shadowColor = p.eye;
    ctx.shadowBlur = 16;
    ctx.globalAlpha *= 0.9;
  }

  const flap = now / 260;
  drawWing(ctx, p.dark, p.dark, p.horn, B(14, -74), B(50, -66), flap + 0.3, pose, 0.85);
  drawTail(ctx, p, B(54, -48), pose, now, a.kind);
  drawLeg(ctx, p.dark, p.horn, B(54, -44), { x: 64, y: -9 }, { x: 50, y: -1 }, true);
  drawLeg(ctx, p.dark, p.horn, B(-4, -46), { x: -6 + pose.fs * 0.8, y: -7 + pose.fy }, { x: -16 + pose.fs * 0.8, y: -1 + pose.fy }, false);

  ctx.save();
  ctx.translate(pose.bx, pose.by);
  ctx.translate(C.x, C.y);
  ctx.rotate(pose.pitch);
  ctx.translate(-C.x, -C.y);
  drawBody(ctx, p, Math.sin(now / 700), a.kind);
  ctx.restore();

  const mouth = drawNeckAndHead(ctx, p, B(-16, -60), pose, now, a.boss);

  drawLeg(ctx, p.body, p.horn, B(42, -42), { x: 52, y: -9 }, { x: 38, y: -1 }, true);
  drawLeg(ctx, p.body, p.horn, B(-14, -44), { x: -18 + pose.fs, y: -7 + pose.fy }, { x: -28 + pose.fs, y: -1 + pose.fy }, false);
  drawWing(ctx, p.wing, p.dark, p.horn, B(2, -72), B(40, -66), flap, pose, 1);

  ctx.restore();
  return mouth;
}

function neckAngles(pose: DPose, now: number): number[] {
  const n = pose.neck;
  return NECK_IDLE.map((d, i) => {
    let v = n >= 0 ? lerp(d, NECK_BITE[i], n) : lerp(d, NECK_REAR[i], -n);
    v = lerp(v, NECK_DROP[i], pose.drop);
    return v + pose.pitch + 0.04 * Math.sin(now / 500 - i * 0.7) * (1 - pose.drop);
  });
}

function drawNeckAndHead(ctx: CanvasRenderingContext2D, p: Palette, base: Pt, pose: DPose, now: number, boss: boolean): Pt {
  const ang = neckAngles(pose, now);
  const joints: Pt[] = [base];
  for (let i = 0; i < 5; i++) joints.push(step(joints[i], ang[i], NECK_SEG));

  for (let i = 0; i < 5; i++) limb(ctx, joints[i], joints[i + 1], 27 - i * 2, p.body);
  for (let i = 0; i < 5; i++) {
    const o = ang[i] - Math.PI / 2;
    limb(ctx, step(joints[i], o, 7), step(joints[i + 1], o, 6), 9 - i * 0.6, p.belly);
  }
  ctx.fillStyle = p.dark;
  for (let i = 1; i < 5; i++) spike(ctx, step(joints[i], ang[i] + Math.PI / 2, 11 - i), ang[i] + Math.PI / 2 + 0.5, 11 - i, 4);

  const headAng = ang[5];
  const end = joints[5];
  ctx.save();
  ctx.translate(end.x, end.y);
  ctx.rotate(headAng + Math.PI);
  ctx.translate(-10, -2);
  drawHead(ctx, p, pose.jaw, boss, now);
  ctx.restore();

  // 입 끝(머리 좌표 (-47, 2))을 발밑 좌표로
  const r = headAng + Math.PI;
  const lx = -57;
  const ly = 0;
  return { x: end.x + lx * Math.cos(r) - ly * Math.sin(r), y: end.y + lx * Math.sin(r) + ly * Math.cos(r) };
}

function drawTail(ctx: CanvasRenderingContext2D, p: Palette, base: Pt, pose: DPose, now: number, kind: EnemyKind): void {
  const joints: Pt[] = [base];
  const ang: number[] = [];
  for (let i = 0; i < TAIL_N; i++) {
    const idle = 0.3 - i * 0.13 + 0.18 * (0.3 + i / TAIL_N) * Math.sin(now / 450 - i * 0.6);
    const a = lerp(idle, 0.12 - i * 0.02, pose.drop) + pose.pitch;
    ang.push(a);
    joints.push(step(joints[i], a, TAIL_SEG));
  }
  for (let i = 0; i < TAIL_N; i++) limb(ctx, joints[i], joints[i + 1], 21 - i * 2.1, p.body);
  ctx.fillStyle = p.dark;
  for (let i = 1; i < TAIL_N - 1; i += 2) spike(ctx, step(joints[i], ang[i] - Math.PI / 2, 9 - i * 0.7), ang[i] - Math.PI / 2 + 0.5, 11 - i, 4);
  const tip = joints[TAIL_N];
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(ang[TAIL_N - 1]);
  ctx.fillStyle = kind === 'spirit' ? p.eye : p.dark;
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.lineTo(8, -10);
  ctx.lineTo(20, 0);
  ctx.lineTo(8, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 다리: 뿌리→발목은 IK, 발목→발가락은 땅에 고정 */
function drawLeg(ctx: CanvasRenderingContext2D, color: string, claw: string, root: Pt, ankle: Pt, toe: Pt, rear: boolean): void {
  const [knee, ank] = rear ? solveIK(root, ankle, 26, 26, 1) : solveIK(root, ankle, 22, 22, -1);
  const w = rear ? [22, 13, 9] : [16, 11, 8];
  if (rear) {
    // 허벅지 근육
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse((root.x + knee.x) / 2, (root.y + knee.y) / 2, 17, 11, Math.atan2(knee.y - root.y, knee.x - root.x), 0, Math.PI * 2);
    ctx.fill();
  }
  limb(ctx, root, knee, w[0], color);
  limb(ctx, knee, ank, w[1], color);
  limb(ctx, ank, toe, w[2], color);
  ctx.fillStyle = claw;
  for (let i = 0; i < 3; i++) spike(ctx, { x: toe.x - 2 + i * 5, y: toe.y - 1 }, Math.PI - 0.2, 9, 2.5);
}

function drawWing(
  ctx: CanvasRenderingContext2D,
  membrane: string,
  bone: string,
  claw: string,
  shoulder: Pt,
  attach: Pt,
  phase: number,
  pose: DPose,
  scale: number,
): void {
  const s = Math.sin(phase);
  const f = pose.fold;
  const θs = lerp(-1.02 - 0.4 * s, -0.4, f) + pose.pitch;
  const elbowRel = lerp(0.24 + 0.25 * Math.cos(phase), 2.6, f);
  const spread = 1 - 0.12 * s;
  const fingerRel = [0.57, 1.19, 1.84].map((r, i) => lerp(r * spread, [0.3, 0.45, 0.6][i], f));
  const fingerLen = [64, 71, 80].map((l) => l * scale * (1 - 0.4 * f));

  const elbow = step(shoulder, θs, 65 * scale);
  const θf = θs + elbowRel;
  const wrist = step(elbow, θf, 37 * scale);
  const tips = fingerRel.map((r, i) => step(wrist, θf + r, fingerLen[i]));

  const toward = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  ctx.fillStyle = membrane;
  ctx.globalAlpha *= 0.93;
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(wrist.x, wrist.y);
  ctx.lineTo(tips[0].x, tips[0].y);
  for (let i = 1; i < 3; i++) {
    const c = toward(mid(tips[i - 1], tips[i]), wrist, 0.3);
    ctx.quadraticCurveTo(c.x, c.y, tips[i].x, tips[i].y);
  }
  const c = toward(mid(tips[2], attach), wrist, 0.3);
  ctx.quadraticCurveTo(c.x, c.y, attach.x, attach.y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha /= 0.93;

  limb(ctx, shoulder, elbow, 6, bone);
  limb(ctx, elbow, wrist, 5, bone);
  for (const t of tips) limb(ctx, wrist, t, 3, bone);
  ctx.fillStyle = claw;
  spike(ctx, wrist, θf - 0.9, 12, 3);
}

function spike(ctx: CanvasRenderingContext2D, at: Pt, dir: number, len: number, w: number): void {
  const nx = Math.cos(dir);
  const ny = Math.sin(dir);
  ctx.beginPath();
  ctx.moveTo(at.x - ny * w, at.y + nx * w);
  ctx.lineTo(at.x + nx * len, at.y + ny * len);
  ctx.lineTo(at.x + ny * w, at.y - nx * w);
  ctx.fill();
}

function drawBody(ctx: CanvasRenderingContext2D, p: Palette, breath: number, kind: EnemyKind): void {
  const ry = 27 * (1 + 0.035 * breath);
  const g = ctx.createLinearGradient(0, -80, 0, -22);
  g.addColorStop(0, p.body);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(18, -52, 48, ry, -0.12, 0, Math.PI * 2);
  ctx.fill();

  // 배 비늘
  ctx.save();
  ctx.clip();
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.ellipse(8, -32, 44, 14, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.dark + '66';
  ctx.lineWidth = 1.5;
  for (let x = -26; x <= 44; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, -44);
    ctx.lineTo(x - 3, -18);
    ctx.stroke();
  }
  // 비늘 하이라이트
  ctx.strokeStyle = '#ffffff22';
  for (let i = 0; i < 12; i++) {
    const sx = -20 + (i % 6) * 13;
    const sy = -70 + Math.floor(i / 6) * 11;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.restore();

  // 등 가시 / 철갑 등판
  if (kind === 'armored') {
    ctx.fillStyle = p.belly;
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x = -18 + i * 16;
      const y = -76 + Math.abs(i - 1.5) * 2.5;
      ctx.beginPath();
      ctx.roundRect(x, y, 14, 10, 3);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.fillStyle = p.dark;
  for (let i = 0; i < 5; i++) {
    const x = -14 + i * 16;
    spike(ctx, { x, y: -76 + Math.abs(i - 1.5) * 2.5 }, -Math.PI / 2 + 0.35, kind === 'armored' ? 16 : 12, 5);
  }
}

function drawHead(ctx: CanvasRenderingContext2D, p: Palette, jaw: number, boss: boolean, now: number): void {
  ctx.save();

  // 뿔
  ctx.fillStyle = p.horn;
  ctx.beginPath();
  ctx.moveTo(6, -12);
  ctx.quadraticCurveTo(26, -22, 46, -42);
  ctx.quadraticCurveTo(30, -16, 14, -3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, -3);
  ctx.quadraticCurveTo(28, -6, 42, -18);
  ctx.quadraticCurveTo(26, 0, 12, 5);
  ctx.fill();

  // 입 안
  const open = jaw * 0.55;
  if (open > 0.02) {
    ctx.fillStyle = '#3a0808';
    ctx.beginPath();
    ctx.moveTo(10, 6);
    ctx.lineTo(-44, 2);
    ctx.lineTo(10 - 50 * Math.cos(open), 6 + 50 * Math.sin(open));
    ctx.fill();
  }

  // 아래턱 (경첩 기준으로 아래로 회전)
  ctx.save();
  ctx.translate(10, 6);
  ctx.rotate(-open);
  ctx.fillStyle = p.dark;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-50, -2);
  ctx.quadraticCurveTo(-48, 5, -40, 7);
  ctx.lineTo(0, 10);
  ctx.closePath();
  ctx.fill();
  if (open > 0.05) {
    ctx.fillStyle = '#f4efe0';
    for (let x = -44; x < -12; x += 7) spike(ctx, { x, y: -1 }, -Math.PI / 2, 5, 2);
  }
  ctx.restore();

  // 위턱 + 두개골
  const g = ctx.createLinearGradient(0, -18, 0, 8);
  g.addColorStop(0, p.body);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(16, -8);
  ctx.quadraticCurveTo(2, -20, -18, -13);
  ctx.lineTo(-42, -6);
  ctx.quadraticCurveTo(-50, -3, -47, 3);
  ctx.lineTo(-12, 7);
  ctx.lineTo(14, 9);
  ctx.closePath();
  ctx.fill();
  if (open > 0.05) {
    ctx.fillStyle = '#f4efe0';
    for (let x = -42; x < -12; x += 7) spike(ctx, { x, y: 3 + (x + 42) * 0.1 }, Math.PI / 2, 5, 2);
  }

  // 눈썹뼈, 콧구멍
  ctx.strokeStyle = p.dark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-2, -14);
  ctx.lineTo(-22, -9);
  ctx.stroke();
  ctx.fillStyle = p.dark;
  ctx.beginPath();
  ctx.ellipse(-40, -3, 3, 1.6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // 눈 (빛남)
  ctx.save();
  ctx.shadowColor = p.eye;
  ctx.shadowBlur = 10 + Math.sin(now / 200) * 4;
  ctx.fillStyle = p.eye;
  ctx.beginPath();
  ctx.ellipse(-12, -8, boss ? 6.5 : 5.5, boss ? 4.5 : 3.8, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#140808';
  ctx.beginPath();
  ctx.ellipse(-13, -8, 1.3, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // 뒷머리 프릴
  ctx.fillStyle = p.dark;
  spike(ctx, { x: 14, y: 2 }, 0.4, 14, 4);
  spike(ctx, { x: 12, y: 8 }, 0.9, 10, 3);

  // 보스 왕관 가시
  if (boss) {
    ctx.fillStyle = '#ffd24a';
    for (let i = 0; i < 4; i++) spike(ctx, { x: -16 + i * 7, y: -14 + i * 0.5 }, -Math.PI / 2 + 0.3 * i - 0.3, 9, 2.5);
  }
  ctx.restore();
}

function mapPalette(p: Palette, f: (c: string) => string): Palette {
  return {
    body: f(p.body),
    dark: f(p.dark),
    belly: f(p.belly),
    wing: f(p.wing),
    horn: f(p.horn),
    eye: p.eye,
  };
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (v: number, s: number) => (v >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`;
}
