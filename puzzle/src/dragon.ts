// 용 몬스터 절차적 렌더링 (왼쪽=기사 방향을 바라봄, 원점=발밑 중앙)

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

/** 발밑 원점 기준 입 위치 (브레스 시작점) */
export function mouthOffset(jaw: number): { x: number; y: number } {
  return { x: -104 - jaw * 10, y: -98 };
}

export interface DragonPose {
  kind: EnemyKind;
  boss: boolean;
  now: number;
  /** 0~1: 입 벌림 + 머리 전진 */
  jaw: number;
  hurt: boolean;
}

export function drawDragon(ctx: CanvasRenderingContext2D, pose: DragonPose): void {
  const { kind, boss, now, jaw, hurt } = pose;
  let p = PALETTE[kind];
  if (boss) p = { ...p, horn: '#ffd24a' };
  if (hurt) p = mapPalette(p, (c) => mix(c, '#ffffff', 0.55));

  const flap = Math.sin(now / 260);
  const breath = Math.sin(now / 700);
  const sway = Math.sin(now / 500);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (kind === 'spirit') {
    ctx.shadowColor = p.eye;
    ctx.shadowBlur = 16;
    ctx.globalAlpha *= 0.9;
  }

  drawWing(ctx, p.dark, p.dark, p.horn, 14, -74, flap + 0.3, 0.85);
  drawTail(ctx, p, sway, kind);
  drawLeg(ctx, p.dark, p.horn, 54, -40, true);
  drawLeg(ctx, p.dark, p.horn, -4, -42, false);
  drawBody(ctx, p, breath, kind);
  const head = { x: -58 - jaw * 10, y: -100 + Math.sin(now / 650) * 3 - jaw * 4 };
  drawNeck(ctx, p, head);
  drawHead(ctx, p, head, jaw, boss, now);
  drawLeg(ctx, p.body, p.horn, 42, -38, true);
  drawLeg(ctx, p.body, p.horn, -16, -40, false);
  drawWing(ctx, p.wing, p.dark, p.horn, 2, -72, flap, 1);

  ctx.restore();
}

type Pt = { x: number; y: number };

function quad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
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

function drawWing(
  ctx: CanvasRenderingContext2D,
  membrane: string,
  bone: string,
  claw: string,
  ax: number,
  ay: number,
  flap: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(-0.2 - flap * 0.35);
  ctx.scale(scale, scale);

  ctx.fillStyle = membrane;
  ctx.globalAlpha *= 0.93;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(34, -56);
  ctx.lineTo(60, -82);
  ctx.lineTo(122, -96);
  ctx.quadraticCurveTo(104, -72, 126, -56);
  ctx.quadraticCurveTo(100, -42, 106, -16);
  ctx.quadraticCurveTo(78, -12, 42, 4);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha /= 0.93;

  ctx.strokeStyle = bone;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(34, -56);
  ctx.lineTo(60, -82);
  ctx.stroke();
  ctx.lineWidth = 3;
  for (const [fx, fy] of [[122, -96], [126, -56], [106, -16]]) {
    ctx.beginPath();
    ctx.moveTo(60, -82);
    ctx.lineTo(fx, fy);
    ctx.stroke();
  }
  ctx.fillStyle = claw;
  spike(ctx, { x: 60, y: -84 }, -2.2, 12, 3);
  ctx.restore();
}

function drawTail(ctx: CanvasRenderingContext2D, p: Palette, sway: number, kind: EnemyKind): void {
  const a = { x: 52, y: -46 };
  const c = { x: 98, y: -34 + sway * 5 };
  const b = { x: 134, y: -72 + sway * 12 };
  const N = 14;
  ctx.strokeStyle = p.body;
  let prev = a;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const pt = quad(a, c, b, t);
    ctx.lineWidth = 22 - t * 17;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    prev = pt;
  }
  // 등 가시
  ctx.fillStyle = p.dark;
  for (const t of [0.15, 0.35, 0.55, 0.75]) {
    const pt = quad(a, c, b, t);
    spike(ctx, { x: pt.x, y: pt.y - (10 - t * 7) }, -Math.PI / 2 + 0.5, 12 - t * 6, 4);
  }
  // 꼬리 끝: 스페이드 / 영룡은 불꽃
  const tip = b;
  const dir = Math.atan2(b.y - c.y, b.x - c.x);
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(dir);
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

function drawLeg(ctx: CanvasRenderingContext2D, color: string, claw: string, hx: number, hy: number, rear: boolean): void {
  const knee = rear ? { x: hx + 10, y: hy + 20 } : { x: hx - 6, y: hy + 20 };
  const foot = { x: hx + (rear ? -2 : -8), y: -3 };
  ctx.strokeStyle = color;
  ctx.lineWidth = rear ? 18 : 15;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(knee.x, knee.y);
  ctx.stroke();
  ctx.lineWidth = rear ? 11 : 10;
  ctx.beginPath();
  ctx.moveTo(knee.x, knee.y);
  ctx.lineTo(foot.x, foot.y);
  ctx.stroke();
  ctx.fillStyle = claw;
  for (let i = 0; i < 3; i++) spike(ctx, { x: foot.x - 4 + i * 5, y: -2 }, Math.PI - 0.2, 9, 2.5);
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

function drawNeck(ctx: CanvasRenderingContext2D, p: Palette, head: Pt): void {
  const a = { x: -16, y: -60 };
  const c = { x: -48, y: -62 };
  const b = { x: head.x + 8, y: head.y + 4 };
  ctx.strokeStyle = p.body;
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
  ctx.stroke();
  // 목 앞쪽 비늘
  ctx.strokeStyle = p.belly;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(a.x - 6, a.y + 8);
  ctx.quadraticCurveTo(c.x - 6, c.y + 6, b.x - 6, b.y + 8);
  ctx.stroke();
  ctx.fillStyle = p.dark;
  for (const t of [0.25, 0.5, 0.75]) {
    const pt = quad(a, c, b, t);
    spike(ctx, { x: pt.x + 6, y: pt.y - 10 }, -Math.PI / 2 + 0.6, 11, 4);
  }
}

function drawHead(ctx: CanvasRenderingContext2D, p: Palette, head: Pt, jaw: number, boss: boolean, now: number): void {
  ctx.save();
  ctx.translate(head.x, head.y);

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
