// 기사 관절 리그 (오른쪽을 바라봄, 원점=발밑)
// 각도는 캔버스 기준(0=오른쪽, π/2=아래). 상박/허벅지는 절대각, 하위 관절은 부모 기준 상대각.

import { limb, sampleKeyframes, step, type Keyframes, type Pt } from './anim';

type Pose = {
  x: number; // 루트 이동
  y: number; // 점프 높이(음수=위)
  rot: number; // 전신 회전(쓰러짐)
  lean: number; // 상체 기울기(+ = 앞으로)
  head: number;
  sa: number; // 검 팔 상박
  se: number; // 검 팔 팔꿈치
  sw: number; // 손목(검)
  fa: number; // 방패 팔 상박
  fe: number; // 방패 팔 팔꿈치
  nt: number; // 앞다리 허벅지
  nk: number; // 앞다리 무릎
  ft: number; // 뒷다리 허벅지
  fk: number; // 뒷다리 무릎
};

export type KnightMove = 'slash' | 'cast' | 'guard' | 'buff' | 'hurt' | 'finisher';

const MOVES: Record<KnightMove, { dur: number; frames: Keyframes<Pose> }> = {
  slash: {
    dur: 330,
    frames: [
      [0, {}],
      [0.3, { sa: -1.9, se: -0.4, sw: -0.6, lean: -0.15, x: -4 }],
      [0.55, { sa: 0.5, se: -0.1, sw: -0.2, lean: 0.3, x: 55, nt: 0.9, nk: 0.35, ft: 2.1, fk: 0.4 }],
      [0.78, { sa: 0.6, se: -0.1, sw: -0.2, lean: 0.25, x: 50, nt: 0.9, nk: 0.35, ft: 2.1, fk: 0.4 }],
      [1, {}],
    ],
  },
  cast: {
    dur: 330,
    frames: [
      [0, {}],
      [0.3, { sa: 0, se: 0, sw: 0, lean: 0.12, x: 6, fa: 1.8 }],
      [0.75, { sa: 0, se: 0, sw: 0, lean: 0.12, x: 6, fa: 1.8 }],
      [1, {}],
    ],
  },
  guard: {
    dur: 420,
    frames: [
      [0, {}],
      [0.3, { fa: 0.1, fe: -0.3, lean: -0.05, nk: 0.45, fk: 0.45, sa: 1.5 }],
      [0.7, { fa: 0.1, fe: -0.3, lean: -0.05, nk: 0.45, fk: 0.45, sa: 1.5 }],
      [1, {}],
    ],
  },
  buff: {
    dur: 420,
    frames: [
      [0, {}],
      [0.35, { sa: -1.3, se: -0.3, sw: -0.3, fa: -1.0, fe: -0.3, head: -0.15, lean: -0.05 }],
      [0.7, { sa: -1.3, se: -0.3, sw: -0.3, fa: -1.0, fe: -0.3, head: -0.15, lean: -0.05 }],
      [1, {}],
    ],
  },
  hurt: {
    dur: 380,
    frames: [
      [0, {}],
      [0.2, { x: -14, lean: -0.35, head: -0.25, sa: 1.9, se: -0.5, fa: 2.0, nk: 0.3 }],
      [1, {}],
    ],
  },
  finisher: {
    dur: 680,
    frames: [
      [0, {}],
      [0.3, { y: -55, x: 60, sa: -2.0, se: -0.3, sw: -0.4, nt: 0.9, nk: 1.4, ft: 1.5, fk: 1.4, lean: -0.1 }],
      [0.55, { y: 0, x: 145, sa: 0.6, se: 0, sw: -0.1, lean: 0.4, nt: 0.8, nk: 0.5, ft: 2.1, fk: 0.5 }],
      [0.8, { y: 0, x: 140, sa: 0.6, se: 0, sw: -0.1, lean: 0.35, nt: 0.8, nk: 0.5, ft: 2.1, fk: 0.5 }],
      [1, {}],
    ],
  },
};

const DEATH: Keyframes<Pose> = [
  [0, {}],
  [0.35, { lean: -0.3, nk: 1.0, fk: 1.0, sa: 1.8, fa: 2.2, head: -0.2 }],
  [1, { rot: -1.45, x: -6, lean: -0.2, sa: 2.3, se: 0.3, fa: 2.6, fe: 0.3, nt: 1.4, nk: 0.2, ft: 1.7, fk: 0.2, head: -0.3 }],
];
const DEATH_MS = 750;

export interface KnightAnim {
  now: number;
  walking: boolean;
  move: KnightMove | null;
  moveT: number;
  deadT: number | null;
  /** 검에 마력 광채 */
  glow: string | null;
}

export function moveDuration(m: KnightMove): number {
  return MOVES[m].dur;
}

const THIGH = 14;
const SHIN = 14;
const UPPER = 13;
const FORE = 12;
const BLADE = 46;

function basePose(now: number, walking: boolean): Pose {
  const H = Math.PI / 2;
  if (walking) {
    const ph = now / 130;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    return {
      x: 0, y: 0, rot: 0, lean: 0.1, head: 0.03 * s,
      sa: 1.22 + 0.12 * s, se: -1.25, sw: -0.9,
      fa: 1.3 - 0.4 * s, fe: -0.5,
      nt: H - 0.5 * s, nk: 0.1 + 1.0 * Math.max(0, c),
      ft: H + 0.5 * s, fk: 0.1 + 1.0 * Math.max(0, -c),
    };
  }
  const b = Math.sin(now / 600);
  return {
    x: 0, y: 0, rot: 0, lean: 0.03 * b, head: 0.04 * b,
    sa: 1.22 + 0.04 * b, se: -1.25, sw: -0.9,
    fa: 1.1, fe: -0.9,
    nt: H - 0.14, nk: 0.18 + 0.05 * b, ft: H + 0.14, fk: 0.18 + 0.05 * b,
  };
}

function currentPose(a: KnightAnim): Pose {
  let pose = basePose(a.now, a.walking);
  if (a.move) {
    const t = (a.now - a.moveT) / MOVES[a.move].dur;
    if (t >= 0 && t <= 1) pose = sampleKeyframes(MOVES[a.move].frames, t, pose);
  }
  if (a.deadT !== null) pose = sampleKeyframes(DEATH, Math.min(1, (a.now - a.deadT) / DEATH_MS), pose);
  return pose;
}

export interface KnightDrawResult {
  /** 화면상 기사 중심(보호막/이펙트 기준) */
  center: Pt;
  swordTip: Pt;
}

/** 기사 그리기. ox=기준 x, groundY=땅 높이 */
export function drawKnight(ctx: CanvasRenderingContext2D, ox: number, groundY: number, a: KnightAnim, alpha = 1): KnightDrawResult {
  const p = currentPose(a);
  const legY = (t: number, k: number) => THIGH * Math.sin(t) + SHIN * Math.sin(t + k);
  const hipY = -Math.max(legY(p.nt, p.nk), legY(p.ft, p.fk)) - 4 + p.y;
  const hip = { x: 0, y: hipY };
  const up = -Math.PI / 2 + p.lean;
  const perp = up + Math.PI / 2;
  const shoulderN = step(step(hip, up, 27), perp, 3);
  const shoulderF = step(step(hip, up, 27), perp, -4);

  const armor = '#dfe6f0';
  const armorDark = '#9aa4b8';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ox + p.x, groundY);
  ctx.rotate(p.rot);
  ctx.lineJoin = 'round';

  // 뒷다리
  drawLeg(ctx, { x: hip.x - 2, y: hip.y }, p.ft, p.fk, '#2c323d', '#5c667a');

  // 방패 팔
  const fElbow = step(shoulderF, p.fa, UPPER);
  const fHand = step(fElbow, p.fa + p.fe, FORE);
  limb(ctx, shoulderF, fElbow, 8, armorDark);
  limb(ctx, fElbow, fHand, 7, armorDark);
  ctx.save();
  ctx.translate(fHand.x + 2, fHand.y);
  ctx.rotate((p.fa + p.fe) * 0.25 - 0.15);
  ctx.fillStyle = '#2b5cd6';
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-9, -14);
  ctx.lineTo(9, -14);
  ctx.lineTo(9, 2);
  ctx.quadraticCurveTo(0, 14, -9, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(-1.5, -11, 3, 16);
  ctx.fillRect(-6, -5, 12, 3);
  ctx.restore();

  // 몸통
  ctx.save();
  ctx.translate(hip.x, hip.y);
  ctx.rotate(p.lean);
  const g = ctx.createLinearGradient(-13, -34, 13, 0);
  g.addColorStop(0, '#f4f7fb');
  g.addColorStop(1, '#8a94a8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-12, -34, 24, 36, 7);
  ctx.fill();
  ctx.fillStyle = '#2b5cd6';
  ctx.beginPath();
  ctx.moveTo(-7, -26);
  ctx.lineTo(7, -26);
  ctx.lineTo(8, 6);
  ctx.lineTo(-8, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(-9, -6, 18, 3);

  // 머리
  ctx.translate(0, -42);
  ctx.rotate(p.head);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(2, -3, 10, 3);
  const flutter = Math.sin(a.now / (a.walking ? 70 : 250)) * 3;
  ctx.strokeStyle = '#e8391c';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2, -12);
  ctx.quadraticCurveTo(-12, -20 + flutter, -22, -6 + flutter);
  ctx.stroke();
  ctx.restore();

  // 앞다리
  drawLeg(ctx, { x: hip.x + 2, y: hip.y }, p.nt, p.nk, '#39414f', '#8a94a8');

  // 검 팔
  const sElbow = step(shoulderN, p.sa, UPPER);
  const foreAng = p.sa + p.se;
  const sHand = step(sElbow, foreAng, FORE);
  const swordAng = foreAng + p.sw;
  // 검
  ctx.save();
  ctx.translate(sHand.x, sHand.y);
  ctx.rotate(swordAng);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(-7, -2.5, 11, 5);
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.arc(-8, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(4, -8, 4, 16);
  ctx.fillStyle = a.glow ?? '#e8eef6';
  if (a.glow) {
    ctx.shadowColor = a.glow;
    ctx.shadowBlur = 16;
  }
  ctx.beginPath();
  ctx.moveTo(8, -3);
  ctx.lineTo(8 + BLADE - 6, -2.5);
  ctx.lineTo(8 + BLADE, 0);
  ctx.lineTo(8 + BLADE - 6, 2.5);
  ctx.lineTo(8, 3);
  ctx.fill();
  ctx.restore();

  limb(ctx, shoulderN, sElbow, 8, armor);
  limb(ctx, sElbow, sHand, 7, armor);
  ctx.fillStyle = armorDark;
  ctx.beginPath();
  ctx.arc(sElbow.x, sElbow.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8d0dc';
  ctx.beginPath();
  ctx.arc(sHand.x, sHand.y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  // 견갑
  ctx.fillStyle = '#f4f7fb';
  ctx.beginPath();
  ctx.ellipse(shoulderN.x, shoulderN.y, 8, 6, p.lean, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(shoulderN.x - 6, shoulderN.y + 3, 12, 2);

  ctx.restore();

  // 월드 좌표 계산(회전 반영)
  const toWorld = (q: Pt): Pt => ({
    x: ox + p.x + q.x * Math.cos(p.rot) - q.y * Math.sin(p.rot),
    y: groundY + q.x * Math.sin(p.rot) + q.y * Math.cos(p.rot),
  });
  return {
    center: toWorld(step(hip, up, 14)),
    swordTip: toWorld(step(sHand, swordAng, 8 + BLADE)),
  };
}

function drawLeg(ctx: CanvasRenderingContext2D, hip: Pt, thigh: number, knee: number, color: string, pad: string): void {
  const k = step(hip, thigh, THIGH);
  const ankle = step(k, thigh + knee, SHIN);
  limb(ctx, hip, k, 10, color);
  limb(ctx, k, ankle, 9, color);
  ctx.fillStyle = pad;
  ctx.beginPath();
  ctx.arc(k.x + 1, k.y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  // 부츠(항상 앞을 향함)
  ctx.fillStyle = '#2a2a33';
  ctx.beginPath();
  ctx.roundRect(ankle.x - 5, ankle.y - 3, 15, 7, 3);
  ctx.fill();
}
