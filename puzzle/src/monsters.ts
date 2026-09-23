// 용이 아닌 몬스터 관절 리그 (왼쪽=기사 방향을 바라봄, 원점=발밑 중앙)
// 다이어울프(네발, IK 다리) · 골렘(인간형 거구) · 망령(부유, 로브 체인 + 뼈 손가락)

import { lerp, limb, sampleKeyframes, solveIK, step, type Keyframes, type Pt } from './anim';

export type Species = 'dragon' | 'wolf' | 'golem' | 'wraith';

export interface MonsterAnim {
  now: number;
  variant: number;
  attackAge: number | null;
  hurtAge: number | null;
  deathAge: number | null;
  hurt: boolean;
}

/** 모든 몬스터 공격 모션 길이 (타격 프레임 ≈ 55%) */
export const MONSTER_ATTACK_MS = 480;
const HURT_MS = 260;
const DEATH_MS = 650;

function animate<P extends Record<string, number>>(
  a: MonsterAnim,
  base: P,
  attack: Keyframes<P>,
  hurt: Keyframes<P>,
  death: Keyframes<P>,
): P {
  let pose = base;
  if (a.attackAge !== null && a.attackAge <= MONSTER_ATTACK_MS) pose = sampleKeyframes(attack, a.attackAge / MONSTER_ATTACK_MS, pose);
  if (a.hurtAge !== null && a.hurtAge <= HURT_MS) pose = sampleKeyframes(hurt, a.hurtAge / HURT_MS, pose);
  if (a.deathAge !== null) pose = sampleKeyframes(death, Math.min(1, a.deathAge / DEATH_MS), pose);
  return pose;
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

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (v: number, s: number) => (v >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`;
}

function tint<T extends Record<string, string>>(p: T, hurt: boolean, keep: (keyof T)[] = []): T {
  if (!hurt) return p;
  const out = { ...p };
  for (const k of Object.keys(p) as (keyof T)[]) if (!keep.includes(k)) out[k] = mix(p[k], '#ffffff', 0.55) as T[keyof T];
  return out;
}

// ============================================================
// 다이어울프
// ============================================================

const WOLF_PAL = [
  { body: '#8a8f9c', dark: '#3a3e4a', belly: '#cfd2da', eye: '#ffd23a' },
  { body: '#8a5a3a', dark: '#3e2616', belly: '#d8b080', eye: '#ff4a2a' },
];

type WolfPose = {
  bx: number;
  by: number;
  pitch: number;
  neck: number; // -1 머리 낮춤 · 1 앞으로 물기
  drop: number;
  jaw: number;
  fs: number; // 앞발 이동
  fy: number;
  rs: number; // 뒷발 이동
  ry: number;
};

const WOLF_ATTACK: Keyframes<WolfPose> = [
  [0, {}],
  [0.3, { bx: 14, by: 12, pitch: 0.12, neck: -0.6, jaw: 0.3 }],
  [0.55, { bx: -120, by: -16, pitch: -0.12, neck: 1, jaw: 1, fs: -112, fy: -14, rs: -100, ry: -20 }],
  [0.8, { bx: -110, by: 2, pitch: -0.05, neck: 1, jaw: 0.8, fs: -106, fy: 0, rs: -96, ry: 0 }],
  [1, {}],
];
const WOLF_HURT: Keyframes<WolfPose> = [[0, {}], [0.25, { bx: 12, by: -2, pitch: 0.08, neck: -0.6, jaw: 0.6 }], [1, {}]];
const WOLF_DEATH: Keyframes<WolfPose> = [
  [0, {}],
  [0.4, { by: 12, neck: -0.4, jaw: 0.7 }],
  [1, { by: 30, pitch: 0.05, drop: 1, jaw: 0.3 }],
];

export function drawWolf(ctx: CanvasRenderingContext2D, a: MonsterAnim): Pt {
  const p = tint(WOLF_PAL[a.variant % WOLF_PAL.length], a.hurt, ['eye']);
  const now = a.now;
  const pose = animate<WolfPose>(
    a,
    {
      bx: 0,
      by: 1.2 * Math.sin(now / 400),
      pitch: 0.01 * Math.sin(now / 400),
      neck: 0.1 * Math.sin(now / 900),
      drop: 0,
      jaw: 0.25 + 0.12 * Math.sin(now / 120), // 헐떡임
      fs: 0,
      fy: 0,
      rs: 0,
      ry: 0,
    },
    WOLF_ATTACK,
    WOLF_HURT,
    WOLF_DEATH,
  );
  const C = { x: 0, y: -56 };
  const cos = Math.cos(pose.pitch);
  const sin = Math.sin(pose.pitch);
  const B = (x: number, y: number): Pt => ({
    x: C.x + (x - C.x) * cos - (y - C.y) * sin + pose.bx,
    y: C.y + (x - C.x) * sin + (y - C.y) * cos + pose.by,
  });

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 꼬리 (5마디, 흔들기)
  const tail: Pt[] = [B(50, -62)];
  const tailAng: number[] = [];
  for (let i = 0; i < 5; i++) {
    const wag = 0.3 * Math.sin(now / 180 - i * 0.5);
    const ang = lerp(-0.7 + i * 0.12 + wag, 0.9 + i * 0.1, pose.drop) + pose.pitch;
    tailAng.push(ang);
    tail.push(step(tail[i], ang, 9));
  }
  for (let i = 0; i < 5; i++) limb(ctx, tail[i], tail[i + 1], 12 - i, p.body);
  limb(ctx, tail[4], tail[5], 5, p.belly);

  // 먼 쪽 다리
  wolfLeg(ctx, p.dark, B(-18, -50), { x: -22 + pose.fs * 0.9, y: -8 + pose.fy }, { x: -32 + pose.fs * 0.9, y: -1 + pose.fy }, false);
  wolfLeg(ctx, p.dark, B(42, -52), { x: 50 + pose.rs * 0.9, y: -12 + pose.ry }, { x: 40 + pose.rs * 0.9, y: -1 + pose.ry }, true);

  // 몸통
  ctx.save();
  ctx.translate(pose.bx, pose.by);
  ctx.translate(C.x, C.y);
  ctx.rotate(pose.pitch);
  ctx.translate(-C.x, -C.y);
  const g = ctx.createLinearGradient(0, -78, 0, -36);
  g.addColorStop(0, p.body);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-44, -70);
  ctx.quadraticCurveTo(-8, -80 + Math.sin(now / 400) * 1.5, 30, -72);
  ctx.quadraticCurveTo(56, -70, 54, -54);
  ctx.quadraticCurveTo(48, -40, 30, -45);
  ctx.quadraticCurveTo(0, -40, -24, -36);
  ctx.quadraticCurveTo(-50, -38, -52, -58);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.moveTo(-50, -54);
  ctx.quadraticCurveTo(-46, -38, -24, -37);
  ctx.quadraticCurveTo(-30, -46, -38, -58);
  ctx.fill();
  // 등 갈기
  ctx.fillStyle = p.dark;
  for (let i = 0; i < 6; i++) spike(ctx, { x: -40 + i * 9, y: -72 - (i < 3 ? 3 : 0) + i * 0.6 }, -Math.PI / 2 + 0.7, 10 - i, 4);
  ctx.restore();

  // 목 2마디 + 머리
  const NECK_IDLE = [-2.5, -2.8, -2.95];
  const NECK_BITE = [-3.0, -3.1, -3.15];
  const NECK_LOW = [-2.9, -3.3, -3.4];
  const NECK_DROP = [-3.5, -3.7, -3.8];
  const ang = NECK_IDLE.map((d, i) => {
    const n = pose.neck;
    const v = n >= 0 ? lerp(d, NECK_BITE[i], n) : lerp(d, NECK_LOW[i], -n);
    return lerp(v, NECK_DROP[i], pose.drop) + pose.pitch;
  });
  const n0 = B(-40, -64);
  const n1 = step(n0, ang[0], 14);
  const n2 = step(n1, ang[1], 13);
  limb(ctx, n0, n1, 24, p.body);
  limb(ctx, n1, n2, 20, p.body);
  ctx.fillStyle = p.dark;
  spike(ctx, step(n1, ang[0] + Math.PI / 2, 9), ang[0] + Math.PI / 2 + 0.6, 10, 4);

  const headAng = ang[2];
  ctx.save();
  ctx.translate(n2.x, n2.y);
  ctx.rotate(headAng + Math.PI);
  ctx.translate(-6, 0);
  // 먼 귀
  ctx.fillStyle = p.dark;
  ctx.beginPath();
  ctx.moveTo(8, -8);
  ctx.lineTo(16, -24);
  ctx.lineTo(2, -12);
  ctx.fill();
  // 입 안 + 혀
  const open = pose.jaw * 0.6;
  ctx.fillStyle = '#4a0f12';
  ctx.beginPath();
  ctx.moveTo(2, 3);
  ctx.lineTo(-30, 0);
  ctx.lineTo(2 - 30 * Math.cos(open), 3 + 30 * Math.sin(open));
  ctx.fill();
  // 아래턱
  ctx.save();
  ctx.translate(2, 3);
  ctx.rotate(-open);
  ctx.fillStyle = p.dark;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-28, -1);
  ctx.quadraticCurveTo(-27, 4, -22, 5);
  ctx.lineTo(0, 7);
  ctx.fill();
  if (open > 0.1) {
    ctx.fillStyle = '#e8577a';
    ctx.beginPath();
    ctx.ellipse(-16, 0, 9, 2.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4efe0';
    spike(ctx, { x: -24, y: 0 }, -Math.PI / 2, 5, 1.6);
  }
  ctx.restore();
  // 두개골 + 주둥이
  const hg = ctx.createLinearGradient(0, -14, 0, 6);
  hg.addColorStop(0, p.body);
  hg.addColorStop(1, p.dark);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(2, -3, 14, 10, 0, 0, Math.PI * 2);
  ctx.moveTo(-6, -9);
  ctx.lineTo(-30, -4);
  ctx.quadraticCurveTo(-34, -1, -31, 2);
  ctx.lineTo(-6, 4);
  ctx.fill();
  ctx.fillStyle = p.belly;
  ctx.beginPath();
  ctx.moveTo(-8, 2);
  ctx.lineTo(-30, 1);
  ctx.lineTo(-8, 5);
  ctx.fill();
  if (open > 0.1) {
    ctx.fillStyle = '#f4efe0';
    spike(ctx, { x: -26, y: 1 }, Math.PI / 2, 6, 1.8);
    spike(ctx, { x: -14, y: 3 }, Math.PI / 2, 4, 1.5);
  }
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(-31, -2, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // 눈
  ctx.save();
  ctx.shadowColor = p.eye;
  ctx.shadowBlur = 8;
  ctx.fillStyle = p.eye;
  ctx.beginPath();
  ctx.ellipse(-8, -6, 3.2, 2.2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 가까운 귀 (살짝 까딱)
  ctx.fillStyle = p.body;
  ctx.beginPath();
  ctx.moveTo(10, -6);
  ctx.lineTo(14 + Math.sin(now / 700) * 2, -26);
  ctx.lineTo(0, -10);
  ctx.fill();
  ctx.restore();

  // 가까운 다리
  wolfLeg(ctx, p.body, B(-30, -48), { x: -34 + pose.fs, y: -8 + pose.fy }, { x: -44 + pose.fs, y: -1 + pose.fy }, false);
  wolfLeg(ctx, p.body, B(32, -52), { x: 40 + pose.rs, y: -12 + pose.ry }, { x: 30 + pose.rs, y: -1 + pose.ry }, true);

  ctx.restore();
  const r = headAng + Math.PI;
  return { x: n2.x - 34 * Math.cos(r), y: n2.y - 34 * Math.sin(r) };
}

function wolfLeg(ctx: CanvasRenderingContext2D, color: string, root: Pt, joint: Pt, toe: Pt, rear: boolean): void {
  const [knee, ank] = rear ? solveIK(root, joint, 22, 24, 1) : solveIK(root, joint, 22, 22, -1);
  if (rear) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse((root.x + knee.x) / 2, (root.y + knee.y) / 2, 14, 9, Math.atan2(knee.y - root.y, knee.x - root.x), 0, Math.PI * 2);
    ctx.fill();
  }
  limb(ctx, root, knee, rear ? 15 : 11, color);
  limb(ctx, knee, ank, rear ? 9 : 9, color);
  limb(ctx, ank, toe, 7, color);
  ctx.fillStyle = '#1a1a1a';
  for (let i = 0; i < 2; i++) spike(ctx, { x: toe.x - 2 + i * 4, y: toe.y }, Math.PI - 0.3, 5, 1.5);
}

// ============================================================
// 골렘
// ============================================================

const GOLEM_PAL = [
  { body: '#8d8577', dark: '#4a4238', rune: '#ff8a1a', moss: '#5a7a3a' },
  { body: '#7d8898', dark: '#353c48', rune: '#6be3ff', moss: '#4a5568' },
];

type GolemPose = {
  bx: number;
  by: number;
  lean: number;
  head: number;
  ua: number; // 가까운 팔 상박(절대각)
  ue: number; // 팔꿈치(상대각)
  fa: number;
  fe: number;
};

const GOLEM_ATTACK: Keyframes<GolemPose> = [
  [0, {}],
  [0.3, { ua: -1.7, ue: -0.6, fa: -1.4, fe: -0.6, lean: -0.22, by: -4, bx: 6, head: -0.15 }],
  [0.55, { ua: 2.2, ue: 0.15, fa: 2.1, fe: 0.2, lean: 0.4, by: 12, bx: -22, head: 0.15 }],
  [0.8, { ua: 2.2, ue: 0.15, fa: 2.1, fe: 0.2, lean: 0.38, by: 12, bx: -20, head: 0.15 }],
  [1, {}],
];
const GOLEM_HURT: Keyframes<GolemPose> = [[0, {}], [0.25, { lean: -0.15, bx: 8, head: 0.25, ua: 2.3, fa: 1.2 }], [1, {}]];
const GOLEM_DEATH: Keyframes<GolemPose> = [
  [0, {}],
  [0.4, { lean: -0.1, by: 8, head: -0.3, ua: 1.2, fa: 1.2 }],
  [1, { lean: 0.95, by: 42, head: 0.6, ua: 2.9, ue: 0.3, fa: 2.8, fe: 0.3, bx: -10 }],
];

export function drawGolem(ctx: CanvasRenderingContext2D, a: MonsterAnim): Pt {
  const p = tint(GOLEM_PAL[a.variant % GOLEM_PAL.length], a.hurt, ['rune']);
  const now = a.now;
  const sway = Math.sin(now / 900);
  const pose = animate<GolemPose>(
    a,
    { bx: 0, by: 1.5 * sway, lean: 0.03 * sway, head: 0.05 * Math.sin(now / 1300), ua: 1.95 + 0.05 * sway, ue: -0.25, fa: 1.55 - 0.05 * sway, fe: 0.05 },
    GOLEM_ATTACK,
    GOLEM_HURT,
    GOLEM_DEATH,
  );
  const hip = { x: pose.bx, y: -52 + pose.by };
  const cos = Math.cos(pose.lean);
  const sin = Math.sin(pose.lean);
  // 몸통 좌표계(골반 원점, 기울기 = 앞(왼쪽)으로 숙임 → 반시계)
  const T = (x: number, y: number): Pt => ({ x: hip.x + x * cos + y * sin, y: hip.y - x * sin + y * cos });

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const rock = (at: Pt, r: number, fill: string, seed: number): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + seed;
      const rr = r * (0.82 + 0.18 * Math.sin(seed * 3 + i * 2.1));
      const x = at.x + Math.cos(ang) * rr;
      const y = at.y + Math.sin(ang) * rr;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };

  const leg = (hx: number, foot: number, color: string): void => {
    const root = { x: hip.x + hx, y: hip.y };
    const [knee, ankle] = solveIK(root, { x: foot, y: -12 }, 26, 28, 1);
    limb(ctx, root, knee, 22, color);
    limb(ctx, knee, ankle, 20, color);
    rock(knee, 11, color, hx);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(foot - 16, -14, 30, 14, 5);
    ctx.fill();
  };

  const arm = (sh: Pt, ua: number, ue: number, color: string, seed: number): Pt => {
    const elbow = step(sh, ua, 30);
    const fist = step(elbow, ua + ue, 30);
    limb(ctx, sh, elbow, 18, color);
    limb(ctx, elbow, fist, 22, color);
    rock(elbow, 11, color, seed);
    rock(fist, 16, color, seed + 1);
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fist.x - 8, fist.y - 3);
    ctx.lineTo(fist.x + 6, fist.y + 2);
    ctx.stroke();
    return fist;
  };

  // 먼 팔/다리
  leg(10, 18, p.dark);
  arm(T(24, -60), pose.fa, pose.fe, p.dark, 2);

  // 몸통 바위
  const pts = [
    [-26, -2],
    [-36, -40],
    [-28, -66],
    [0, -76],
    [28, -66],
    [36, -30],
    [22, -2],
  ].map(([x, y]) => T(x, y));
  const g = ctx.createLinearGradient(0, hip.y - 80, 0, hip.y);
  g.addColorStop(0, p.body);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
  ctx.fill();
  // 균열
  ctx.strokeStyle = p.dark;
  ctx.lineWidth = 2;
  for (const [x1, y1, x2, y2] of [
    [-20, -56, -4, -48],
    [10, -60, 20, -40],
    [-24, -22, -6, -14],
  ]) {
    const q1 = T(x1, y1);
    const q2 = T(x2, y2);
    ctx.beginPath();
    ctx.moveTo(q1.x, q1.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.stroke();
  }
  // 이끼
  ctx.fillStyle = p.moss;
  const moss = T(8, -70);
  ctx.beginPath();
  ctx.ellipse(moss.x, moss.y, 14, 5, -pose.lean, 0, Math.PI * 2);
  ctx.fill();
  // 룬 코어
  const core = T(-8, -40);
  ctx.save();
  ctx.shadowColor = p.rune;
  ctx.shadowBlur = 14 + Math.sin(now / 250) * 6;
  ctx.strokeStyle = p.rune;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(core.x, core.y, 7, 0, Math.PI * 2);
  ctx.moveTo(core.x - 4, core.y - 4);
  ctx.lineTo(core.x + 4, core.y + 4);
  ctx.stroke();
  ctx.restore();

  // 머리
  const hd = T(-10, -84);
  ctx.save();
  ctx.translate(hd.x, hd.y);
  ctx.rotate(-pose.lean + pose.head);
  rock({ x: 0, y: 0 }, 14, p.body, 5);
  ctx.shadowColor = p.rune;
  ctx.shadowBlur = 10;
  ctx.fillStyle = p.rune;
  ctx.fillRect(-12, -3, 14, 3);
  ctx.restore();

  // 가까운 다리/팔
  leg(-10, -14, p.body);
  const fist = arm(T(-26, -58), pose.ua, pose.ue, p.body, 0);

  ctx.restore();
  return { x: fist.x, y: 0 };
}

// ============================================================
// 망령
// ============================================================

const WRAITH_PAL = [
  { robe: '#3a2a5a', dark: '#140a26', glow: '#b48cff', bone: '#e0dcf0' },
  { robe: '#1f3a3a', dark: '#061414', glow: '#6bffd8', bone: '#dff0ec' },
];

type WraithPose = {
  bx: number;
  by: number;
  lean: number;
  ua: number;
  ue: number;
  fa: number;
  fe: number;
  claw: number; // 0 오므림 · 1 활짝
  jaw: number; // 입(비명) 빛
  drop: number;
};

const WRAITH_ATTACK: Keyframes<WraithPose> = [
  [0, {}],
  [0.3, { bx: 16, by: -14, lean: -0.2, ua: -2.4, ue: -0.4, fa: -2.0, fe: -0.3, claw: 1, jaw: 1 }],
  [0.55, { bx: -55, by: 4, lean: 0.3, ua: 2.95, ue: 0.1, fa: 2.75, fe: 0.2, claw: 1, jaw: 1 }],
  [0.8, { bx: -50, by: 4, lean: 0.28, ua: 2.95, ue: 0.1, fa: 2.75, fe: 0.2, claw: 0.8, jaw: 0.6 }],
  [1, {}],
];
const WRAITH_HURT: Keyframes<WraithPose> = [[0, {}], [0.25, { bx: 14, by: -6, lean: -0.3, claw: 0, jaw: 0.8 }], [1, {}]];
const WRAITH_DEATH: Keyframes<WraithPose> = [
  [0, {}],
  [0.4, { by: -6, lean: -0.3, ua: -2.2, fa: -2.0, jaw: 1, claw: 1 }],
  [1, { by: -40, lean: -0.1, ua: 1.6, ue: 0, fa: 1.6, fe: 0, drop: 1, jaw: 0, claw: 0 }],
];

export function drawWraith(ctx: CanvasRenderingContext2D, a: MonsterAnim): Pt {
  const p = tint(WRAITH_PAL[a.variant % WRAITH_PAL.length], a.hurt, ['glow']);
  const now = a.now;
  const pose = animate<WraithPose>(
    a,
    {
      bx: 0,
      by: 3 * Math.sin(now / 500),
      lean: 0.05 * Math.sin(now / 700),
      ua: 2.35 + 0.08 * Math.sin(now / 400),
      ue: 0.6 + 0.1 * Math.sin(now / 330),
      fa: 2.2 + 0.08 * Math.sin(now / 450 + 1),
      fe: 0.55 + 0.1 * Math.sin(now / 370 + 1),
      claw: 0.4 + 0.3 * Math.sin(now / 260),
      jaw: 0.2 + 0.2 * Math.sin(now / 900),
      drop: 0,
    },
    WRAITH_ATTACK,
    WRAITH_HURT,
    WRAITH_DEATH,
  );
  const waist = { x: pose.bx, y: -96 + pose.by };
  const up = -Math.PI / 2 - pose.lean;
  const chest = step(waist, up, 26);
  const perp = up - Math.PI / 2; // 왼쪽(앞)
  const shN = step(chest, perp, 14);
  const shF = step(chest, perp, -12);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 14;

  // 로브 꼬리 (6마디, 나부낌)
  const robe: Pt[] = [waist];
  const robeAng: number[] = [];
  for (let i = 0; i < 6; i++) {
    const wave = 0.28 * Math.sin(now / 300 - i * 0.8);
    const ang = lerp(1.25 - i * 0.14 + wave, Math.PI / 2 + wave * 0.3, pose.drop);
    robeAng.push(ang);
    robe.push(step(robe[i], ang, 13));
  }
  for (let i = 0; i < 6; i++) limb(ctx, robe[i], robe[i + 1], 36 - i * 5.5, p.robe);
  // 누더기 자락
  ctx.fillStyle = p.robe;
  for (let i = 1; i < 6; i++) {
    const side = step(robe[i], robeAng[i] - Math.PI / 2, (36 - i * 5.5) / 2);
    spike(ctx, side, robeAng[i] + 0.9 + Math.sin(now / 200 + i) * 0.3, 14 - i, 4);
    const side2 = step(robe[i], robeAng[i] + Math.PI / 2, (36 - i * 5.5) / 2);
    spike(ctx, side2, robeAng[i] - 0.4 + Math.sin(now / 230 + i) * 0.3, 12 - i, 4);
  }

  // 손 (3손가락 × 2마디)
  const hand = (sh: Pt, ua: number, ue: number, sleeve: string, seed: number): Pt => {
    const elbow = step(sh, ua, 24);
    const fore = ua + ue;
    const wrist = step(elbow, fore, 24);
    limb(ctx, sh, elbow, 12, sleeve);
    limb(ctx, elbow, step(elbow, fore, 12), 11, sleeve);
    limb(ctx, step(elbow, fore, 10), wrist, 4, p.bone);
    const spread = 0.25 + 0.45 * pose.claw;
    const curl = 0.9 * (1 - pose.claw) + 0.15;
    for (const [k, off] of [[-1, 0], [0, 0.4], [1, 0.8]]) {
      const wig = 0.15 * Math.sin(now / 150 + seed + off * 3);
      const a1 = fore + k * spread + wig;
      const j1 = step(wrist, a1, 9);
      const j2 = step(j1, a1 + curl * 0.8, 8);
      limb(ctx, wrist, j1, 3, p.bone);
      limb(ctx, j1, j2, 2.4, p.bone);
    }
    return wrist;
  };

  hand(shF, pose.fa, pose.fe, p.dark, 1);

  // 몸통 + 후드
  ctx.fillStyle = p.robe;
  ctx.beginPath();
  const w1 = step(waist, perp, 12);
  const w2 = step(waist, perp, -14);
  const c1 = step(chest, perp, 16);
  const c2 = step(chest, perp, -14);
  ctx.moveTo(w1.x, w1.y);
  ctx.lineTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.lineTo(w2.x, w2.y);
  ctx.closePath();
  ctx.fill();

  const hood = step(chest, up, 16);
  ctx.save();
  ctx.translate(hood.x, hood.y);
  ctx.rotate(-pose.lean);
  ctx.fillStyle = p.robe;
  ctx.beginPath();
  ctx.moveTo(14, -16);
  ctx.quadraticCurveTo(-2, -30, -16, -8);
  ctx.lineTo(-14, 12);
  ctx.lineTo(12, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p.dark;
  ctx.beginPath();
  ctx.ellipse(-6, 0, 8, 10, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 12;
  ctx.fillStyle = p.glow;
  for (const ex of [-9, -3]) {
    ctx.beginPath();
    ctx.ellipse(ex, -3, 1.8, 1.3 + Math.max(0, Math.sin(now / 1700) * 8 - 7) * -1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (pose.jaw > 0.05) {
    ctx.globalAlpha *= Math.min(1, pose.jaw);
    ctx.beginPath();
    ctx.ellipse(-6, 5, 2.5, 1 + pose.jaw * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const tip = hand(shN, pose.ua, pose.ue, p.robe, 0);
  ctx.restore();
  return tip;
}
