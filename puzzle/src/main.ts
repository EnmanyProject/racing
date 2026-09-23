// Rune Drift: 렌더링, 입력, 턴 진행

import {
  COLS,
  ROWS,
  Orb,
  clearCombo,
  createBoard,
  findCombos,
  settle,
  swap,
  type Cell,
  type Combo,
  type Grid,
  type Pos,
} from './board';
import {
  TEMPO_COMBOS,
  applySkill,
  computeAttack,
  createFloors,
  createTeam,
  type Enemy,
  type Hero,
} from './battle';

const W = 480;
const H = 800;
const CELL = 80;
const BOARD_Y = H - ROWS * CELL; // 400
const TEAM_Y = 298;
const SLOT_W = 88;
const SLOT_GAP = 5;
const HPBAR_Y = 380;

const DRAG_MS = 5000;
const CLEAR_STEP_MS = 260;
const FADE_MS = 240;
const SLIDE_SPEED = 1400; // px/s

const ORB_COLOR: Record<Orb, [string, string]> = {
  [Orb.Fire]: ['#ffb199', '#e8391c'],
  [Orb.Water]: ['#a8dcff', '#1b7fe0'],
  [Orb.Wood]: ['#b6f5b0', '#23a347'],
  [Orb.Light]: ['#fff4b0', '#e8b100'],
  [Orb.Dark]: ['#e0b8ff', '#7a2ed6'],
  [Orb.Heart]: ['#ffd0e6', '#e8458f'],
};

type Phase = 'idle' | 'drag' | 'clear' | 'fall' | 'attack' | 'next' | 'won' | 'lost';

interface Float {
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  t0: number;
  dur: number;
}

interface Fading {
  cells: { r: number; c: number; cell: Cell }[];
  t0: number;
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// ---- 게임 상태 ----
let grid: Grid;
let team: Hero[];
let floors: Enemy[];
let floorIdx: number;
let enemy: Enemy;
let enemyHpShown: number;
let maxHp: number;
let hp: number;
let hpShown: number;
let phase: Phase;
let phaseT = 0;
let offs: { x: number; y: number }[][];
let drag: { pos: Pos; cell: Cell; px: number; py: number; t0: number | null } | null = null;
let pending: Combo[] = [];
let turnCombos: Combo[] = [];
let nextClearAt = 0;
let fading: Fading[] = [];
let floats: Float[] = [];
let toast: { text: string; t0: number } | null = null;
let shakeUntil = 0;
let heroFlash: number[] = [];

const rng = Math.random;

function resetGame(): void {
  grid = createBoard(rng);
  team = createTeam();
  floors = createFloors();
  floorIdx = 0;
  enemy = floors[0];
  enemyHpShown = enemy.hp;
  maxHp = team.reduce((s, h) => s + h.hp, 0);
  hp = hpShown = maxHp;
  offs = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ x: 0, y: 0 })));
  heroFlash = team.map(() => 0);
  fading = [];
  floats = [];
  drag = null;
  setPhase('idle', performance.now());
}

function setPhase(p: Phase, now: number): void {
  phase = p;
  phaseT = now;
}

// ---- 턴 진행 ----
function beginResolve(now: number): void {
  pending = findCombos(grid);
  if (!pending.length) {
    endResolve(now);
    return;
  }
  nextClearAt = now;
  setPhase('clear', now);
}

function stepClear(now: number): void {
  if (now < nextClearAt) return;
  const combo = pending.shift();
  if (!combo) {
    fading = [];
    const drops = settle(grid, rng);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) offs[r][c].y -= drops[r][c] * CELL;
    setPhase('fall', now);
    return;
  }
  turnCombos.push(combo);
  fading.push({ cells: combo.cells.map((p) => ({ ...p, cell: grid[p.r][p.c]! })), t0: now });
  const surge = clearCombo(grid, combo);
  const cx = combo.cells.reduce((s, p) => s + p.c, 0) / combo.cells.length;
  const cy = combo.cells.reduce((s, p) => s + p.r, 0) / combo.cells.length;
  floats.push({
    text: `${turnCombos.length} Combo`,
    x: (cx + 0.5) * CELL,
    y: BOARD_Y + (cy + 0.5) * CELL,
    color: '#fff',
    size: 22,
    t0: now,
    dur: 700,
  });
  if (surge) {
    floats.push({
      text: 'SURGE!',
      x: (surge.c + 0.5) * CELL,
      y: BOARD_Y + surge.r * CELL + 10,
      color: '#ffe066',
      size: 18,
      t0: now,
      dur: 800,
    });
  }
  beep(330 + turnCombos.length * 55);
  nextClearAt = now + (pending.length ? CLEAR_STEP_MS : FADE_MS);
}

function endResolve(now: number): void {
  const extra = turnCombos.length >= TEMPO_COMBOS ? 1 : 0;
  for (const h of team) h.cd = Math.max(0, h.cd - 1 - extra);
  if (extra) toastMsg('TEMPO! 스킬 쿨다운 추가 감소', now);

  if (turnCombos.length) {
    const res = computeAttack(team, turnCombos, enemy);
    let total = 0;
    res.perHero.forEach((dmg, i) => {
      if (!dmg) return;
      total += dmg;
      heroFlash[i] = now;
      floats.push({
        text: String(dmg),
        x: slotX(i) + SLOT_W / 2,
        y: TEAM_Y - 4,
        color: ORB_COLOR[team[i].orb][1],
        size: 20,
        t0: now,
        dur: 900,
      });
    });
    if (total) {
      enemy.hp = Math.max(0, enemy.hp - total);
      floats.push({ text: `-${total}`, x: W / 2, y: 170, color: '#fff', size: 36, t0: now + 200, dur: 1000 });
    }
    if (res.heal) {
      hp = Math.min(maxHp, hp + res.heal);
      floats.push({ text: `+${res.heal}`, x: W / 2, y: HPBAR_Y - 6, color: '#7dffa0', size: 20, t0: now, dur: 900 });
    }
  }
  setPhase('attack', now);
}

function afterAttack(now: number): void {
  if (enemy.hp <= 0) {
    beep(880, 0.25);
    if (floorIdx + 1 >= floors.length) setPhase('won', now);
    else setPhase('next', now);
    return;
  }
  enemy.turns--;
  if (enemy.turns <= 0) {
    enemy.turns = enemy.maxTurns;
    hp = Math.max(0, hp - enemy.atk);
    shakeUntil = now + 350;
    beep(110, 0.3);
    floats.push({ text: `-${enemy.atk}`, x: W / 2, y: HPBAR_Y - 6, color: '#ff6b6b', size: 26, t0: now, dur: 1000 });
  }
  setPhase(hp <= 0 ? 'lost' : 'idle', now);
}

// ---- 입력 ----
function toLogical(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) * W) / rect.width, y: ((e.clientY - rect.top) * H) / rect.height };
}

function slotX(i: number): number {
  return (W - (SLOT_W * 5 + SLOT_GAP * 4)) / 2 + i * (SLOT_W + SLOT_GAP);
}

canvas.addEventListener('pointerdown', (e) => {
  const now = performance.now();
  const { x, y } = toLogical(e);
  unlockAudio();
  if (phase === 'won' || phase === 'lost') {
    if (now - phaseT > 800) resetGame();
    return;
  }
  if (phase !== 'idle') return;

  if (y >= BOARD_Y) {
    const pos = { r: Math.floor((y - BOARD_Y) / CELL), c: Math.floor(x / CELL) };
    const cell = grid[pos.r]?.[pos.c];
    if (!cell) return;
    drag = { pos, cell, px: x, py: y, t0: null };
    canvas.setPointerCapture(e.pointerId);
    setPhase('drag', now);
    return;
  }

  if (y >= TEAM_Y && y < TEAM_Y + 76) {
    const i = team.findIndex((_, k) => x >= slotX(k) && x < slotX(k) + SLOT_W);
    if (i < 0) return;
    const hero = team[i];
    if (hero.cd > 0) {
      toastMsg(`${hero.skillName}: ${hero.skillDesc} (${hero.cd}턴 남음)`, now);
      return;
    }
    applySkill(hero.skill, grid, enemy, (ratio) => {
      const amount = Math.round(maxHp * ratio);
      hp = Math.min(maxHp, hp + amount);
      floats.push({ text: `+${amount}`, x: W / 2, y: HPBAR_Y - 6, color: '#7dffa0', size: 22, t0: now, dur: 900 });
    });
    hero.cd = hero.maxCd;
    heroFlash[i] = now;
    toastMsg(`${hero.name} — ${hero.skillName}!`, now);
    beep(660, 0.2);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const now = performance.now();
  const { x, y } = toLogical(e);
  drag.px = Math.max(0, Math.min(W, x));
  drag.py = Math.max(BOARD_Y, Math.min(H, y));
  const target = {
    r: Math.min(ROWS - 1, Math.floor((drag.py - BOARD_Y) / CELL)),
    c: Math.min(COLS - 1, Math.floor(drag.px / CELL)),
  };
  // 빠르게 움직여도 한 칸씩(대각선 포함) 따라가며 교환
  while (target.r !== drag.pos.r || target.c !== drag.pos.c) {
    const next = { r: drag.pos.r + Math.sign(target.r - drag.pos.r), c: drag.pos.c + Math.sign(target.c - drag.pos.c) };
    swap(grid, drag.pos, next);
    offs[drag.pos.r][drag.pos.c] = { x: (next.c - drag.pos.c) * CELL, y: (next.r - drag.pos.r) * CELL };
    drag.pos = next;
    drag.t0 ??= now;
    tick();
  }
});

const endDrag = (): void => {
  if (!drag) return;
  const now = performance.now();
  const moved = drag.t0 !== null;
  drag = null;
  if (!moved) {
    setPhase('idle', now);
    return;
  }
  turnCombos = [];
  beginResolve(now);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function toastMsg(text: string, now: number): void {
  toast = { text, t0: now };
}

// ---- 사운드 ----
let audio: AudioContext | null = null;
function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
  } catch {
    audio = null;
  }
}
function beep(freq: number, dur = 0.12): void {
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.08, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + dur);
}
function tick(): void {
  beep(900, 0.03);
}

// ---- 업데이트 ----
function update(dt: number, now: number): void {
  let moving = false;
  const step = SLIDE_SPEED * dt;
  for (const row of offs) {
    for (const o of row) {
      o.x = approach(o.x, step);
      o.y = approach(o.y, step);
      if (o.x || o.y) moving = true;
    }
  }
  enemyHpShown += (enemy.hp - enemyHpShown) * Math.min(1, dt * 6);
  hpShown += (hp - hpShown) * Math.min(1, dt * 6);

  if (phase === 'drag' && drag?.t0 != null && now - drag.t0 >= DRAG_MS) endDrag();
  if (phase === 'clear') stepClear(now);
  if (phase === 'fall' && !moving) beginResolve(now);
  if (phase === 'attack' && now - phaseT > 900) afterAttack(now);
  if (phase === 'next' && now - phaseT > 1300) {
    floorIdx++;
    enemy = floors[floorIdx];
    enemyHpShown = enemy.hp;
    setPhase('idle', now);
  }
  floats = floats.filter((f) => now - f.t0 < f.dur);
}

function approach(v: number, step: number): number {
  if (Math.abs(v) <= step) return 0;
  return v - Math.sign(v) * step;
}

// ---- 렌더링 ----
function render(now: number): void {
  ctx.save();
  ctx.fillStyle = '#15122a';
  ctx.fillRect(0, 0, W, H);
  if (now < shakeUntil) ctx.translate((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);

  drawHeader();
  drawEnemy(now);
  drawTeam(now);
  drawHpBar();
  drawBoard(now);
  drawFloats(now);
  drawOverlay(now);
  ctx.restore();
}

function drawHeader(): void {
  ctx.fillStyle = '#0d0b1a';
  ctx.fillRect(0, 0, W, 40);
  ctx.fillStyle = '#c9c3ff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`RUNE DRIFT`, 14, 20);
  ctx.textAlign = 'right';
  ctx.fillText(`FLOOR ${floorIdx + 1} / ${floors.length}`, W - 14, 20);
}

function drawEnemy(now: number): void {
  const [light, dark] = ORB_COLOR[enemy.orb];
  const cx = W / 2;
  const cy = 150;
  const bob = Math.sin(now / 500) * 6;
  const hit = phase === 'attack' && now - phaseT < 300;
  const R = enemy.boss ? 78 : 60;

  const bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 220);
  bg.addColorStop(0, dark + '55');
  bg.addColorStop(1, '#15122a00');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 40, W, TEAM_Y - 40);

  if (enemy.hp > 0 || phase === 'attack') {
    ctx.save();
    ctx.translate(cx + (hit ? (Math.random() - 0.5) * 10 : 0), cy + bob);
    if (enemy.boss) {
      ctx.fillStyle = dark;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * R * 0.4, -R * 0.7);
        ctx.lineTo(s * R * 0.9, -R * 1.35);
        ctx.lineTo(s * R * 0.75, -R * 0.5);
        ctx.fill();
      }
    }
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.3, 5, 0, 0, R);
    g.addColorStop(0, hit ? '#fff' : light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, R, R * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1030';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * R * 0.32, -R * 0.1, R * 0.12, R * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(enemy.name + (enemy.boss ? ' (BOSS)' : ''), cx, 66);

  // 공격 카운트다운
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = enemy.turns <= 1 ? '#ff6b6b' : '#c9c3ff';
  ctx.fillText(`공격까지 ${enemy.turns}턴`, cx, 86);

  // HP 바
  const bw = 300;
  const bx = cx - bw / 2;
  const by = 250;
  ctx.fillStyle = '#000a';
  roundRect(bx, by, bw, 14, 7);
  ctx.fill();
  ctx.fillStyle = dark;
  roundRect(bx, by, Math.max(0, (bw * enemyHpShown) / enemy.maxHp), 14, 7);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.fillText(`${Math.ceil(enemy.hp)} / ${enemy.maxHp}`, cx, by + 30);
  drawOrb(enemy.orb, false, bx - 16, by + 7, 11, 1);
}

function drawTeam(now: number): void {
  team.forEach((hero, i) => {
    const x = slotX(i);
    const [light, dark] = ORB_COLOR[hero.orb];
    const flash = Math.max(0, 1 - (now - heroFlash[i]) / 400);
    const g = ctx.createLinearGradient(x, TEAM_Y, x, TEAM_Y + 76);
    g.addColorStop(0, dark);
    g.addColorStop(1, '#1d1838');
    ctx.fillStyle = g;
    roundRect(x, TEAM_Y - flash * 8, SLOT_W, 76, 10);
    ctx.fill();
    ctx.lineWidth = hero.cd === 0 ? 3 : 1.5;
    ctx.strokeStyle = hero.cd === 0 ? `hsl(50, 100%, ${60 + Math.sin(now / 150) * 15}%)` : light + '88';
    ctx.stroke();

    drawOrb(hero.orb, false, x + SLOT_W / 2, TEAM_Y + 24 - flash * 8, 15, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(hero.name, x + SLOT_W / 2, TEAM_Y + 56);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = hero.cd === 0 ? '#ffe066' : '#aaa';
    ctx.fillText(hero.cd === 0 ? 'SKILL 준비' : `CD ${hero.cd}`, x + SLOT_W / 2, TEAM_Y + 70);
  });
}

function drawHpBar(): void {
  const x = 14;
  const w = W - 28;
  ctx.fillStyle = '#000a';
  roundRect(x, HPBAR_Y, w, 12, 6);
  ctx.fill();
  const ratio = hpShown / maxHp;
  ctx.fillStyle = ratio > 0.5 ? '#4cd964' : ratio > 0.2 ? '#ffcc00' : '#ff4d4d';
  roundRect(x, HPBAR_Y, Math.max(0, w * ratio), 12, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`HP ${Math.ceil(hp)} / ${maxHp}`, W / 2, HPBAR_Y + 6);
}

function drawBoard(now: number): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#2a2248' : '#231d3e';
      ctx.fillRect(c * CELL, BOARD_Y + r * CELL, CELL, CELL);
    }
  }

  // 사라지는 콤보
  for (const f of fading) {
    const t = Math.min(1, (now - f.t0) / FADE_MS);
    for (const p of f.cells) {
      drawOrb(p.cell.orb, p.cell.plus, (p.c + 0.5) * CELL, BOARD_Y + (p.r + 0.5) * CELL, 34 * (1 + t * 0.3), 1 - t);
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, BOARD_Y, W, H - BOARD_Y);
  ctx.clip();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      if (drag && drag.pos.r === r && drag.pos.c === c) {
        // 잡고 있는 룬의 자리: 반투명 가이드
        drawOrb(cell.orb, cell.plus, (c + 0.5) * CELL, BOARD_Y + (r + 0.5) * CELL, 34, 0.25);
        continue;
      }
      const o = offs[r][c];
      drawOrb(cell.orb, cell.plus, (c + 0.5) * CELL + o.x, BOARD_Y + (r + 0.5) * CELL + o.y, 34, 1);
    }
  }
  ctx.restore();

  if (drag) {
    drawOrb(drag.cell.orb, drag.cell.plus, drag.px, drag.py - 10, 40, 0.95);
    if (drag.t0 != null) {
      const left = Math.max(0, 1 - (now - drag.t0) / DRAG_MS);
      ctx.fillStyle = '#000a';
      ctx.fillRect(0, BOARD_Y - 8, W, 8);
      ctx.fillStyle = left > 0.3 ? '#6be3ff' : '#ff6b6b';
      ctx.fillRect(0, BOARD_Y - 8, W * left, 8);
    }
  }

  if (turnCombos.length && (phase === 'clear' || phase === 'fall' || phase === 'attack')) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 28px sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000';
    const text = `${turnCombos.length} COMBO`;
    ctx.strokeText(text, W - 12, BOARD_Y - 16);
    ctx.fillStyle = turnCombos.length >= TEMPO_COMBOS ? '#ffe066' : '#fff';
    ctx.fillText(text, W - 12, BOARD_Y - 16);
  }
}

function drawOrb(orb: Orb, plus: boolean, x: number, y: number, R: number, alpha: number): void {
  if (alpha <= 0) return;
  const [light, dark] = ORB_COLOR[orb];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.25, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();

  // 속성 심볼
  const s = R * 0.45;
  ctx.fillStyle = '#ffffffd0';
  ctx.beginPath();
  switch (orb) {
    case Orb.Fire:
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s, 0, s * 0.6, s * 0.7);
      ctx.quadraticCurveTo(0, s * 1.1, -s * 0.6, s * 0.7);
      ctx.quadraticCurveTo(-s, 0, 0, -s);
      break;
    case Orb.Water:
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.9, s * 0.2, s * 0.6, s * 0.6);
      ctx.arc(0, s * 0.35, s * 0.62, 0.3, Math.PI - 0.3);
      ctx.quadraticCurveTo(-s * 0.9, s * 0.2, 0, -s);
      break;
    case Orb.Wood:
      ctx.ellipse(0, 0, s * 0.5, s, Math.PI / 4, 0, Math.PI * 2);
      break;
    case Orb.Light:
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 - Math.PI / 2;
        const rr = k % 2 ? s * 0.4 : s;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      break;
    case Orb.Dark:
      ctx.arc(0, 0, s, Math.PI * 0.25, Math.PI * 1.75);
      ctx.arc(s * 0.35, 0, s * 0.75, Math.PI * 1.6, Math.PI * 0.4, true);
      break;
    case Orb.Heart:
      ctx.moveTo(0, s * 0.8);
      ctx.bezierCurveTo(-s * 1.4, -s * 0.2, -s * 0.6, -s * 1.1, 0, -s * 0.4);
      ctx.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.4, -s * 0.2, 0, s * 0.8);
      break;
  }
  ctx.closePath();
  ctx.fill();

  if (plus) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(0, 0, R - 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffe066';
    ctx.font = `bold ${Math.round(R * 0.55)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', R * 0.62, -R * 0.62);
  }
  ctx.restore();
}

function drawFloats(now: number): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floats) {
    const t = (now - f.t0) / f.dur;
    if (t < 0) continue;
    ctx.globalAlpha = Math.max(0, 1 - t * t);
    ctx.font = `bold ${f.size}px sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.strokeText(f.text, f.x, f.y - t * 30);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - t * 30);
  }
  ctx.globalAlpha = 1;
}

function drawOverlay(now: number): void {
  if (toast && now - toast.t0 < 1800) {
    ctx.globalAlpha = Math.min(1, (1800 - (now - toast.t0)) / 300);
    ctx.fillStyle = '#000c';
    roundRect(30, TEAM_Y - 52, W - 60, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(toast.text, W / 2, TEAM_Y - 34);
    ctx.globalAlpha = 1;
  }

  if (phase === 'idle' && floorIdx === 0 && turnCombos.length === 0) {
    ctx.fillStyle = '#ffffffb0';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('룬을 잡고 5초 동안 자유롭게 끌어 같은 색 3개 이상을 맞추세요', W / 2, BOARD_Y - 10);
  }

  const banner = (title: string, sub: string, color: string): void => {
    ctx.fillStyle = '#000b';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(title, W / 2, H / 2 - 20);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(sub, W / 2, H / 2 + 24);
  };
  if (phase === 'next') banner('FLOOR CLEAR', `다음 층: ${floors[floorIdx + 1].name}`, '#ffe066');
  if (phase === 'won') banner('VICTORY', '탭하여 다시 시작', '#ffe066');
  if (phase === 'lost') banner('DEFEAT', '탭하여 다시 시작', '#ff6b6b');
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

// ---- 루프 ----
function resize(): void {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt, now);
  render(now);
  requestAnimationFrame(frame);
}

resetGame();
requestAnimationFrame(frame);
