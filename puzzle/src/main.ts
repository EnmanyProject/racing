// Rune Knight: 렌더링, 입력, 턴 진행
// 상단: 횡으로 전진하는 기사와 몬스터 / 하단: 기사를 지원하는 룬 퍼즐

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
  RESIST,
  TEMPO_COMBOS,
  applySpell,
  createEnemy,
  createKnight,
  createSpells,
  enemyIntent,
  finisherDamage,
  levelUp,
  resolveTurn,
  takeHit,
  type Action,
  type Enemy,
  type EnemyKind,
  type Knight,
  type Spell,
} from './battle';

const W = 480;
const H = 800;
const CELL = 80;
const BOARD_Y = H - ROWS * CELL; // 400
const SCENE_Y = 40;
const GROUND_Y = 262;
const KNIGHT_X = 110;
const ENEMY_X = 350;
const SPELL_Y = 298;
const SLOT_W = 88;
const SLOT_GAP = 5;
const HPBAR_Y = 377;
const ENERGY_Y = 392;

const DRAG_MS = 5000;
const CLEAR_STEP_MS = 260;
const FADE_MS = 240;
const SLIDE_SPEED = 1400; // px/s
const WALK_SPEED = 170; // px/s
const ACTION_MS = 330;

const ORB_COLOR: Record<Orb, [string, string]> = {
  [Orb.Sword]: ['#ffb199', '#d9321a'],
  [Orb.Magic]: ['#d7c2ff', '#6a3ce0'],
  [Orb.Heal]: ['#ffd0e6', '#e8458f'],
  [Orb.Shield]: ['#b8f0e6', '#1f9e8a'],
  [Orb.Energy]: ['#fff4b0', '#e0a800'],
};
const ORB_NAME: Record<Orb, string> = {
  [Orb.Sword]: '검',
  [Orb.Magic]: '마법',
  [Orb.Heal]: '힐',
  [Orb.Shield]: '방패',
  [Orb.Energy]: '기력',
};

type Phase = 'walk' | 'idle' | 'drag' | 'clear' | 'fall' | 'act' | 'enemy' | 'defeat' | 'lost';

type QueuedAction = Action | { type: 'finisher'; value: number };

interface Float {
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  t0: number;
  dur: number;
}

interface Fx {
  type: 'slash' | 'bolt' | 'heal' | 'shield' | 'energy' | 'finisher' | 'hit';
  t0: number;
  dur: number;
  heavy?: boolean;
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// ---- 게임 상태 ----
let grid: Grid;
let knight: Knight;
let spells: Spell[];
let enemy: Enemy;
let enemyIndex = 0;
let enemyX = ENEMY_X;
let kills = 0;
let best = loadBest();
let enemyHpShown = 0;
let hpShown = 0;
let energyShown = 0;
let phase: Phase = 'walk';
let phaseT = 0;
let scroll = 0;
let offs: { x: number; y: number }[][];
let drag: { pos: Pos; cell: Cell; px: number; py: number; t0: number | null } | null = null;
let pending: Combo[] = [];
let turnCombos: Combo[] = [];
let nextClearAt = 0;
let fading: { cells: { r: number; c: number; cell: Cell }[]; t0: number }[] = [];
let floats: Float[] = [];
let fx: Fx[] = [];
let actions: QueuedAction[] = [];
let nextActionAt = 0;
let harmony = false;
let toast: { text: string; t0: number } | null = null;
let shakeUntil = 0;
let spellFlash: number[] = [];
let knightLungeT = -1e9;
let knightHurtT = -1e9;
let enemyLungeT = -1e9;
let enemyHurtT = -1e9;

const rng = Math.random;

function resetGame(): void {
  const now = performance.now();
  grid = createBoard(rng);
  knight = createKnight();
  spells = createSpells();
  spellFlash = spells.map(() => -1e9);
  enemyIndex = 0;
  kills = 0;
  scroll = 0;
  hpShown = knight.hp;
  energyShown = 0;
  offs = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ x: 0, y: 0 })));
  fading = [];
  floats = [];
  fx = [];
  drag = null;
  turnCombos = [];
  spawnEnemy(now);
}

function spawnEnemy(now: number): void {
  enemy = createEnemy(enemyIndex, rng);
  enemyHpShown = enemy.hp;
  enemyX = W + 90;
  setPhase('walk', now);
  if (enemy.boss) toastMsg(`보스 출현: ${enemy.name}`, now);
}

function setPhase(p: Phase, now: number): void {
  phase = p;
  phaseT = now;
}

// ---- 퍼즐 해결 ----
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
  addFloat(`${ORB_NAME[combo.orb]} ${turnCombos.length}`, (cx + 0.5) * CELL, BOARD_Y + (cy + 0.5) * CELL, '#fff', 20, now, 700);
  if (surge) addFloat('SURGE!', (surge.c + 0.5) * CELL, BOARD_Y + surge.r * CELL + 10, '#ffe066', 18, now, 800);
  beep(330 + turnCombos.length * 55);
  nextClearAt = now + (pending.length ? CLEAR_STEP_MS : FADE_MS);
}

/** 퍼즐 결과를 기사의 행동 큐로 변환 */
function endResolve(now: number): void {
  const tempo = turnCombos.length >= TEMPO_COMBOS ? 1 : 0;
  for (const s of spells) s.cd = Math.max(0, s.cd - 1 - tempo);
  if (tempo) toastMsg('TEMPO! 마법 쿨다운 추가 감소', now);

  const result = resolveTurn(knight, turnCombos, enemy);
  harmony = result.harmony;
  if (harmony) toastMsg('조화 보너스! 모든 효과 +20%', now);
  actions = [...result.actions];
  queueFinisher();
  nextActionAt = now + 150;
  setPhase('act', now);
}

function runAction(a: QueuedAction, now: number): void {
  const kx = KNIGHT_X;
  const ky = GROUND_Y - 50;
  switch (a.type) {
    case 'phys':
    case 'magic': {
      if (enemy.hp <= 0) return;
      enemy.hp = Math.max(0, enemy.hp - a.value);
      enemyHurtT = now;
      if (a.type === 'phys') knightLungeT = now;
      fx.push({ type: a.type === 'phys' ? 'slash' : 'bolt', t0: now, dur: 280, heavy: a.heavy });
      const tag = a.heavy ? '강타 ' : a.pierce ? '관통 ' : '';
      addFloat(tag + a.value, enemyX + rand(-20, 20), GROUND_Y - 110, ORB_COLOR[a.type === 'phys' ? Orb.Sword : Orb.Magic][0], a.heavy ? 28 : 22, now, 900);
      beep(a.type === 'phys' ? 220 : 520, 0.1);
      break;
    }
    case 'heal': {
      const before = knight.hp;
      knight.hp = Math.min(knight.maxHp, knight.hp + a.value);
      fx.push({ type: 'heal', t0: now, dur: 500 });
      addFloat(`+${knight.hp - before}`, kx, ky - 50, '#7dffa0', 22, now, 900);
      beep(700, 0.12);
      break;
    }
    case 'shield':
      knight.shield += a.value;
      fx.push({ type: 'shield', t0: now, dur: 500 });
      addFloat(`보호막 +${a.value}`, kx, ky - 50, ORB_COLOR[Orb.Shield][0], 18, now, 900);
      beep(440, 0.12);
      break;
    case 'energy':
      knight.energy = Math.min(100, knight.energy + a.value);
      fx.push({ type: 'energy', t0: now, dur: 400 });
      addFloat(`기력 +${a.value}`, kx, ky - 50, ORB_COLOR[Orb.Energy][0], 18, now, 900);
      beep(990, 0.08);
      break;
    case 'finisher':
      if (enemy.hp <= 0) return;
      enemy.hp = Math.max(0, enemy.hp - a.value);
      enemyHurtT = now;
      knightLungeT = now;
      shakeUntil = now + 300;
      fx.push({ type: 'finisher', t0: now, dur: 600 });
      addFloat(`필살 ${a.value}`, enemyX, GROUND_Y - 130, '#ffe066', 34, now, 1200);
      beep(150, 0.4);
      break;
  }
}

function stepActions(now: number): void {
  if (now < nextActionAt) return;
  const a = actions.shift();
  if (a) {
    if (a.type === 'finisher') {
      // 몬스터가 이미 쓰러졌으면 필살기는 다음 몬스터를 위해 아껴 둔다
      if (enemy.hp > 0) {
        runAction({ type: 'finisher', value: finisherDamage(knight) }, now);
        knight.energy = 0;
      }
    } else {
      runAction(a, now);
      queueFinisher();
    }
    nextActionAt = now + (a.type === 'finisher' ? 700 : ACTION_MS);
    return;
  }
  afterActions(now);
}

/** 기력이 가득 차면 행동 큐 끝에 필살기 추가 */
function queueFinisher(): void {
  if (knight.energy >= 100 && !actions.some((q) => q.type === 'finisher')) actions.push({ type: 'finisher', value: 0 });
}

function afterActions(now: number): void {
  if (enemy.hp <= 0) {
    kills++;
    if (kills > best) saveBest((best = kills));
    levelUp(knight);
    addFloat(`LEVEL ${knight.level}`, KNIGHT_X, GROUND_Y - 150, '#ffe066', 20, now, 1200);
    beep(880, 0.25);
    setPhase('defeat', now);
    return;
  }
  enemy.turns--;
  if (enemy.turns <= 0) {
    enemyLungeT = now;
    setPhase('enemy', now);
    return;
  }
  setPhase('idle', now);
}

function enemyStrike(now: number): void {
  const intent = enemyIntent(enemy);
  const blocked = Math.min(knight.shield, intent.damage);
  const dealt = takeHit(knight, intent.damage);
  enemy.attacks++;
  enemy.turns = enemy.maxTurns;
  knightHurtT = now;
  shakeUntil = now + (intent.heavy ? 500 : 300);
  fx.push({ type: 'hit', t0: now, dur: 300 });
  if (blocked) addFloat(`막음 ${blocked}`, KNIGHT_X, GROUND_Y - 150, ORB_COLOR[Orb.Shield][0], 16, now, 1000);
  addFloat(dealt ? `-${dealt}` : 'BLOCK', KNIGHT_X, GROUND_Y - 120, dealt ? '#ff6b6b' : '#b8f0e6', intent.heavy ? 30 : 24, now, 1000);
  beep(110, 0.3);
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
  if (phase === 'lost') {
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

  if (y >= SPELL_Y && y < SPELL_Y + 72) {
    const i = spells.findIndex((_, k) => x >= slotX(k) && x < slotX(k) + SLOT_W);
    if (i < 0) return;
    const spell = spells[i];
    if (spell.cd > 0) {
      toastMsg(`${spell.name}: ${spell.desc} (${spell.cd}턴 남음)`, now);
      return;
    }
    const shieldBefore = knight.shield;
    applySpell(spell.kind, grid, knight, enemy);
    if (knight.shield > shieldBefore) {
      fx.push({ type: 'shield', t0: now, dur: 500 });
      addFloat(`보호막 +${knight.shield - shieldBefore}`, KNIGHT_X, GROUND_Y - 100, ORB_COLOR[Orb.Shield][0], 18, now, 900);
    }
    spell.cd = spell.maxCd;
    spellFlash[i] = now;
    toastMsg(`${spell.name}!`, now);
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
    beep(900, 0.03);
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

function addFloat(text: string, x: number, y: number, color: string, size: number, t0: number, dur: number): void {
  floats.push({ text, x, y, color, size, t0, dur });
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem('runeKnight.best')) || 0;
  } catch {
    return 0;
  }
}
function saveBest(v: number): void {
  try {
    localStorage.setItem('runeKnight.best', String(v));
  } catch {
    // 저장 불가 환경은 무시
  }
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
  const k = Math.min(1, dt * 6);
  enemyHpShown += (enemy.hp - enemyHpShown) * k;
  hpShown += (knight.hp - hpShown) * k;
  energyShown += (knight.energy - energyShown) * k;

  switch (phase) {
    case 'walk': {
      const d = Math.min(WALK_SPEED * dt, enemyX - ENEMY_X);
      scroll += d;
      enemyX -= d;
      if (enemyX <= ENEMY_X) setPhase('idle', now);
      break;
    }
    case 'drag':
      if (drag?.t0 != null && now - drag.t0 >= DRAG_MS) endDrag();
      break;
    case 'clear':
      stepClear(now);
      break;
    case 'fall':
      if (!moving) beginResolve(now);
      break;
    case 'act':
      stepActions(now);
      break;
    case 'enemy':
      if (now - phaseT >= 220 && enemyLungeT >= phaseT && knightHurtT < phaseT) enemyStrike(now);
      if (now - phaseT > 700) setPhase(knight.hp <= 0 ? 'lost' : 'idle', now);
      break;
    case 'defeat':
      if (now - phaseT > 800) {
        enemyIndex++;
        spawnEnemy(now);
      }
      break;
  }
  floats = floats.filter((f) => now - f.t0 < f.dur);
  fx = fx.filter((f) => now - f.t0 < f.dur);
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

  drawScene(now);
  drawHeader();
  drawSpells(now);
  drawKnightBars(now);
  drawBoard(now);
  drawFloats(now);
  drawOverlay(now);
  ctx.restore();
}

function drawHeader(): void {
  ctx.fillStyle = '#0d0b1a';
  ctx.fillRect(0, 0, W, SCENE_Y);
  ctx.fillStyle = '#c9c3ff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('RUNE KNIGHT', 14, 20);
  ctx.textAlign = 'right';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(`${Math.floor(scroll / 30)}m · 처치 ${kills} · Lv ${knight.level}`, W - 14, 20);
}

function drawScene(now: number): void {
  // 하늘
  const sky = ctx.createLinearGradient(0, SCENE_Y, 0, GROUND_Y);
  sky.addColorStop(0, '#2b2a5c');
  sky.addColorStop(1, '#6d5a9c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, SCENE_Y, W, GROUND_Y - SCENE_Y);

  // 원경 산 (느린 패럴랙스)
  ctx.fillStyle = '#433a73';
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = 0; x <= W + 20; x += 20) {
    const wx = x + scroll * 0.2;
    ctx.lineTo(x, GROUND_Y - 70 - Math.sin(wx / 90) * 30 - Math.sin(wx / 37) * 10);
  }
  ctx.lineTo(W, GROUND_Y);
  ctx.fill();

  // 근경 언덕
  ctx.fillStyle = '#2f5a3e';
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = 0; x <= W + 20; x += 20) {
    const wx = x + scroll * 0.5;
    ctx.lineTo(x, GROUND_Y - 25 - Math.sin(wx / 60) * 12);
  }
  ctx.lineTo(W, GROUND_Y);
  ctx.fill();

  // 땅
  ctx.fillStyle = '#5a4630';
  ctx.fillRect(0, GROUND_Y, W, SPELL_Y - 6 - GROUND_Y);
  ctx.fillStyle = '#6f5a3c';
  const tile = 40;
  for (let x = -((scroll % tile) + tile); x < W + tile; x += tile) {
    ctx.fillRect(x, GROUND_Y + 4, tile - 10, 5);
  }
  ctx.fillStyle = '#3f7a45';
  ctx.fillRect(0, GROUND_Y - 3, W, 4);

  drawEnemy(now);
  drawKnight(now);
  drawFx(now);
}

function drawKnight(now: number): void {
  const walking = phase === 'walk';
  const lunge = lungeCurve(now - knightLungeT, 260) * 60;
  const hurt = now - knightHurtT < 300;
  const x = KNIGHT_X + lunge - (hurt ? 10 : 0);
  const stepPhase = walking ? Math.sin(now / 90) : 0;
  const bob = walking ? Math.abs(Math.sin(now / 90)) * -3 : Math.sin(now / 600) * 1.5;

  ctx.save();
  ctx.translate(x, GROUND_Y + bob);
  if (hurt && Math.floor(now / 60) % 2) ctx.globalAlpha = 0.5;

  // 다리
  ctx.fillStyle = '#39414f';
  ctx.fillRect(-10 + stepPhase * 5, -24, 8, 24);
  ctx.fillRect(2 - stepPhase * 5, -24, 8, 24);

  // 방패(뒤쪽 팔)
  ctx.fillStyle = '#2b5cd6';
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-26, -54);
  ctx.lineTo(-10, -54);
  ctx.lineTo(-10, -36);
  ctx.quadraticCurveTo(-18, -24, -26, -36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 몸통 갑옷
  const armor = ctx.createLinearGradient(-14, -60, 14, -20);
  armor.addColorStop(0, '#eef2f8');
  armor.addColorStop(1, '#8a94a8');
  ctx.fillStyle = armor;
  ctx.beginPath();
  ctx.roundRect(-14, -60, 28, 38, 6);
  ctx.fill();
  ctx.fillStyle = '#2b5cd6';
  ctx.fillRect(-7, -52, 14, 28);
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(-7, -40, 14, 3);

  // 투구
  ctx.fillStyle = armor;
  ctx.beginPath();
  ctx.arc(0, -70, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(2, -72, 10, 3);
  ctx.strokeStyle = '#e8391c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-2, -82);
  ctx.quadraticCurveTo(-12, -90, -20, -74);
  ctx.stroke();

  // 검: 평소엔 치켜들고, 공격 시 앞으로 휘두름
  const swing = lungeCurve(now - knightLungeT, 260);
  const angle = -1.2 + swing * 1.9;
  const casting = fx.some((f) => f.type === 'bolt');
  ctx.translate(12, -44);
  ctx.rotate(angle);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(-4, -3, 10, 6);
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(5, -8, 4, 16);
  ctx.fillStyle = casting ? ORB_COLOR[Orb.Magic][0] : '#dfe6f0';
  if (casting) {
    ctx.shadowColor = ORB_COLOR[Orb.Magic][1];
    ctx.shadowBlur = 16;
  }
  ctx.beginPath();
  ctx.moveTo(9, -3);
  ctx.lineTo(48, -2);
  ctx.lineTo(54, 0);
  ctx.lineTo(48, 2);
  ctx.lineTo(9, 3);
  ctx.fill();
  ctx.restore();

  // 보호막 버블
  if (knight.shield > 0) {
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(now / 200) * 0.05;
    ctx.fillStyle = ORB_COLOR[Orb.Shield][0];
    ctx.strokeStyle = ORB_COLOR[Orb.Shield][1];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y - 45, 44, 52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.restore();
  }
}

/** 0→1→0 형태의 돌진 곡선 */
function lungeCurve(t: number, dur: number): number {
  if (t < 0 || t > dur) return 0;
  return Math.sin((t / dur) * Math.PI);
}

const KIND_COLOR: Record<EnemyKind, [string, string]> = {
  beast: ['#d8a070', '#7a4a26'],
  armored: ['#c8d0dc', '#4a5468'],
  spirit: ['#c8a8ff', '#5a2ea8'],
};

function drawEnemy(now: number): void {
  const dying = phase === 'defeat' ? Math.min(1, (now - phaseT) / 600) : 0;
  const [light, dark] = KIND_COLOR[enemy.kind];
  const S = enemy.boss ? 1.45 : 1;
  const lunge = lungeCurve(now - enemyLungeT, 300) * -70;
  const hurt = now - enemyHurtT < 200;
  const x = enemyX + lunge + (hurt ? rand(-4, 4) : 0);
  const float = enemy.kind === 'spirit' ? -18 + Math.sin(now / 300) * 6 : 0;
  const bob = Math.sin(now / 400) * 2;

  ctx.save();
  ctx.globalAlpha = 1 - dying;
  ctx.translate(x, GROUND_Y + float + bob);
  ctx.scale(S * (1 - dying * 0.3), S * (1 - dying * 0.3));

  const g = ctx.createRadialGradient(-10, -50, 5, 0, -35, 50);
  g.addColorStop(0, hurt ? '#fff' : light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  if (enemy.kind === 'beast') {
    ctx.ellipse(0, -30, 38, 30, 0, 0, Math.PI * 2);
    ctx.moveTo(-24, -52);
    ctx.lineTo(-30, -74);
    ctx.lineTo(-10, -58);
    ctx.moveTo(8, -58);
    ctx.lineTo(22, -76);
    ctx.lineTo(26, -52);
  } else if (enemy.kind === 'armored') {
    ctx.roundRect(-32, -72, 64, 72, 10);
  } else {
    ctx.arc(0, -44, 32, Math.PI, 0);
    ctx.lineTo(32, -6);
    for (let i = 0; i < 4; i++) {
      const wx = 32 - (i + 1) * 16;
      ctx.quadraticCurveTo(wx + 8, -6 + (i % 2 ? -10 : 10) + Math.sin(now / 150 + i) * 3, wx, -6);
    }
    ctx.closePath();
  }
  ctx.fill();

  // 눈 (기사를 향해 왼쪽을 봄)
  ctx.fillStyle = enemy.kind === 'armored' ? '#ff9a2a' : enemy.kind === 'spirit' ? '#6be3ff' : '#ff3a3a';
  if (enemy.kind === 'armored') {
    ctx.fillRect(-26, -54, 34, 6);
  } else {
    for (const ex of [-20, -2]) {
      ctx.beginPath();
      ctx.arc(ex, -40, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (enemy.boss) {
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(-18, -74);
    ctx.lineTo(-12, -90);
    ctx.lineTo(-4, -78);
    ctx.lineTo(0, -94);
    ctx.lineTo(4, -78);
    ctx.lineTo(12, -90);
    ctx.lineTo(18, -74);
    ctx.fill();
  }
  ctx.restore();

  if (phase === 'defeat') return;

  // 이름, 체질, HP, 공격 예고
  const cx = Math.min(W - 90, x);
  const top = 56;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(enemy.name + (enemy.boss ? ' (BOSS)' : ''), cx, top + 4);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#d9d4ff';
  ctx.fillText(RESIST[enemy.kind].label, cx, top + 20);

  const bw = 150;
  ctx.fillStyle = '#000a';
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, top + 26, bw, 10, 5);
  ctx.fill();
  ctx.fillStyle = '#e8391c';
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, top + 26, Math.max(0, (bw * enemyHpShown) / enemy.maxHp), 10, 5);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.fillText(`${Math.ceil(enemy.hp)} / ${enemy.maxHp}`, cx, top + 48);

  if (phase !== 'walk') {
    const intent = enemyIntent(enemy);
    const danger = intent.damage >= knight.hp + knight.shield;
    const text = `${intent.heavy ? '강공격' : '공격'} ${intent.damage} · ${enemy.turns}턴 후`;
    ctx.font = 'bold 12px sans-serif';
    const tw = ctx.measureText(text).width + 16;
    ctx.fillStyle = intent.heavy || danger ? '#7a1020dd' : '#000a';
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2, top + 54, tw, 20, 10);
    ctx.fill();
    ctx.fillStyle = enemy.turns <= 1 ? '#ff8a8a' : '#fff';
    ctx.fillText(text, cx, top + 68);
  }
}

function drawFx(now: number): void {
  for (const f of fx) {
    const t = (now - f.t0) / f.dur;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    const ex = enemyX;
    const ey = GROUND_Y - 40;
    switch (f.type) {
      case 'slash': {
        ctx.strokeStyle = ORB_COLOR[Orb.Sword][0];
        ctx.lineWidth = f.heavy ? 10 : 6;
        ctx.shadowColor = ORB_COLOR[Orb.Sword][1];
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(ex - 10, ey, f.heavy ? 56 : 42, -1.2 + t, 0.9 + t);
        ctx.stroke();
        break;
      }
      case 'bolt': {
        const sx = KNIGHT_X + 40;
        const px = sx + (ex - sx) * Math.min(1, t * 2.2);
        ctx.fillStyle = ORB_COLOR[Orb.Magic][0];
        ctx.shadowColor = ORB_COLOR[Orb.Magic][1];
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(px, ey - 10, f.heavy ? 16 : 11, 0, Math.PI * 2);
        ctx.fill();
        if (t > 0.45) {
          ctx.beginPath();
          ctx.arc(ex, ey - 10, 20 + t * 30, 0, Math.PI * 2);
          ctx.strokeStyle = ORB_COLOR[Orb.Magic][0];
          ctx.lineWidth = 4;
          ctx.stroke();
        }
        break;
      }
      case 'heal':
        ctx.fillStyle = '#7dffa0';
        for (let i = 0; i < 6; i++) {
          const px = KNIGHT_X - 25 + i * 10;
          const py = GROUND_Y - 20 - t * 70 - (i % 2) * 15;
          ctx.fillRect(px - 2, py - 6, 4, 12);
          ctx.fillRect(px - 6, py - 2, 12, 4);
        }
        break;
      case 'shield':
        ctx.strokeStyle = ORB_COLOR[Orb.Shield][0];
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(KNIGHT_X, GROUND_Y - 45, 30 + t * 20, 38 + t * 20, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'energy':
        ctx.strokeStyle = ORB_COLOR[Orb.Energy][0];
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r1 = 20 + t * 30;
          ctx.beginPath();
          ctx.moveTo(KNIGHT_X + Math.cos(a) * r1, GROUND_Y - 45 + Math.sin(a) * r1);
          ctx.lineTo(KNIGHT_X + Math.cos(a) * (r1 + 10), GROUND_Y - 45 + Math.sin(a) * (r1 + 10));
          ctx.stroke();
        }
        break;
      case 'finisher':
        ctx.fillStyle = '#fff6c0';
        ctx.fillRect(0, SCENE_Y, W, GROUND_Y - SCENE_Y + 30);
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(ex - 80, ey - 70);
        ctx.lineTo(ex + 60, ey + 40);
        ctx.stroke();
        break;
      case 'hit':
        ctx.fillStyle = '#ff3a3a55';
        ctx.fillRect(0, SCENE_Y, W, GROUND_Y - SCENE_Y + 30);
        break;
    }
    ctx.restore();
  }
}

function drawSpells(now: number): void {
  ctx.fillStyle = '#15122a';
  ctx.fillRect(0, SPELL_Y - 6, W, BOARD_Y - SPELL_Y + 6);
  spells.forEach((spell, i) => {
    const x = slotX(i);
    const [light, dark] = ORB_COLOR[spell.orb];
    const flash = Math.max(0, 1 - (now - spellFlash[i]) / 400);
    const ready = spell.cd === 0;
    const g = ctx.createLinearGradient(x, SPELL_Y, x, SPELL_Y + 72);
    g.addColorStop(0, ready ? dark : dark + '88');
    g.addColorStop(1, '#1d1838');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, SPELL_Y - flash * 6, SLOT_W, 72, 10);
    ctx.fill();
    ctx.lineWidth = ready ? 3 : 1.5;
    ctx.strokeStyle = ready ? `hsl(50, 100%, ${60 + Math.sin(now / 150) * 15}%)` : light + '66';
    ctx.stroke();

    drawOrb(spell.orb, false, x + SLOT_W / 2, SPELL_Y + 20 - flash * 6, 13, ready ? 1 : 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(spell.name, x + SLOT_W / 2, SPELL_Y + 50);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = ready ? '#ffe066' : '#aaa';
    ctx.fillText(ready ? '사용 가능' : `${spell.cd}턴`, x + SLOT_W / 2, SPELL_Y + 65);
  });
}

function drawKnightBars(now: number): void {
  const x = 14;
  const w = W - 28;
  const ratio = hpShown / knight.maxHp;
  const intent = enemyIntent(enemy);
  const danger = phase !== 'walk' && phase !== 'defeat' && intent.damage >= knight.hp + knight.shield;

  ctx.fillStyle = '#000a';
  ctx.beginPath();
  ctx.roundRect(x, HPBAR_Y, w, 12, 6);
  ctx.fill();
  ctx.fillStyle = ratio > 0.5 ? '#4cd964' : ratio > 0.25 ? '#ffcc00' : '#ff4d4d';
  ctx.beginPath();
  ctx.roundRect(x, HPBAR_Y, Math.max(0, w * ratio), 12, 6);
  ctx.fill();
  // 예상 피해 구간 표시
  if (phase !== 'walk' && phase !== 'defeat') {
    const loss = Math.max(0, intent.damage - knight.shield);
    const from = Math.max(0, knight.hp - loss) / knight.maxHp;
    ctx.fillStyle = `rgba(255,40,40,${0.35 + Math.sin(now / 150) * 0.2})`;
    ctx.fillRect(x + w * from, HPBAR_Y, Math.max(0, w * (ratio - from)), 12);
  }
  if (knight.shield > 0) {
    ctx.strokeStyle = ORB_COLOR[Orb.Shield][0];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 1, HPBAR_Y - 1, w + 2, 14, 7);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const shieldText = knight.shield > 0 ? `  +보호막 ${knight.shield}` : '';
  ctx.fillText(`기사 HP ${Math.ceil(knight.hp)} / ${knight.maxHp}${shieldText}`, W / 2, HPBAR_Y + 6.5);

  // 필살 게이지
  ctx.fillStyle = '#000a';
  ctx.fillRect(x, ENERGY_Y, w, 5);
  ctx.fillStyle = energyShown >= 99.5 ? `hsl(50,100%,${60 + Math.sin(now / 100) * 20}%)` : ORB_COLOR[Orb.Energy][1];
  ctx.fillRect(x, ENERGY_Y, (w * energyShown) / 100, 5);

  if (danger && phase !== 'lost') {
    ctx.globalAlpha = 0.6 + Math.sin(now / 120) * 0.4;
    ctx.fillStyle = '#ff4d4d';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('! 치명타 경고 — 힐/방패로 버티세요', 14, GROUND_Y + 26);
    ctx.globalAlpha = 1;
  }
}

function drawBoard(now: number): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#2a2248' : '#231d3e';
      ctx.fillRect(c * CELL, BOARD_Y + r * CELL, CELL, CELL);
    }
  }

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
  const locked = phase === 'walk' || phase === 'defeat' || phase === 'lost';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      if (drag && drag.pos.r === r && drag.pos.c === c) {
        drawOrb(cell.orb, cell.plus, (c + 0.5) * CELL, BOARD_Y + (r + 0.5) * CELL, 34, 0.25);
        continue;
      }
      const o = offs[r][c];
      drawOrb(cell.orb, cell.plus, (c + 0.5) * CELL + o.x, BOARD_Y + (r + 0.5) * CELL + o.y, 34, 1);
    }
  }
  if (locked) {
    ctx.fillStyle = '#0d0b1aa0';
    ctx.fillRect(0, BOARD_Y, W, H - BOARD_Y);
    if (phase === 'walk') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('기사 전진 중…', W / 2, BOARD_Y + (H - BOARD_Y) / 2);
    }
  }
  ctx.restore();

  if (drag) {
    drawOrb(drag.cell.orb, drag.cell.plus, drag.px, drag.py - 10, 40, 0.95);
    if (drag.t0 != null) {
      const left = Math.max(0, 1 - (now - drag.t0) / DRAG_MS);
      ctx.fillStyle = '#000a';
      ctx.fillRect(0, BOARD_Y - 4, W, 4);
      ctx.fillStyle = left > 0.3 ? '#6be3ff' : '#ff6b6b';
      ctx.fillRect(0, BOARD_Y - 4, W * left, 4);
    }
  }

  if (turnCombos.length && (phase === 'clear' || phase === 'fall' || phase === 'act')) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 26px sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000';
    const text = `${turnCombos.length} COMBO${harmony && phase === 'act' ? ' · 조화' : ''}`;
    ctx.strokeText(text, W - 12, BOARD_Y + 32);
    ctx.fillStyle = turnCombos.length >= TEMPO_COMBOS ? '#ffe066' : '#fff';
    ctx.fillText(text, W - 12, BOARD_Y + 32);
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

  // 역할 심볼
  const s = R * 0.5;
  ctx.fillStyle = '#ffffffe0';
  ctx.beginPath();
  switch (orb) {
    case Orb.Sword:
      ctx.moveTo(0, -s * 1.1);
      ctx.lineTo(s * 0.18, -s * 0.8);
      ctx.lineTo(s * 0.18, s * 0.35);
      ctx.lineTo(s * 0.55, s * 0.35);
      ctx.lineTo(s * 0.55, s * 0.52);
      ctx.lineTo(s * 0.14, s * 0.52);
      ctx.lineTo(s * 0.14, s);
      ctx.lineTo(-s * 0.14, s);
      ctx.lineTo(-s * 0.14, s * 0.52);
      ctx.lineTo(-s * 0.55, s * 0.52);
      ctx.lineTo(-s * 0.55, s * 0.35);
      ctx.lineTo(-s * 0.18, s * 0.35);
      ctx.lineTo(-s * 0.18, -s * 0.8);
      break;
    case Orb.Magic:
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 - Math.PI / 2;
        const rr = k % 2 ? s * 0.35 : s;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      break;
    case Orb.Heal:
      ctx.moveTo(0, s * 0.8);
      ctx.bezierCurveTo(-s * 1.4, -s * 0.2, -s * 0.6, -s * 1.1, 0, -s * 0.4);
      ctx.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.4, -s * 0.2, 0, s * 0.8);
      break;
    case Orb.Shield:
      ctx.moveTo(-s * 0.8, -s * 0.8);
      ctx.lineTo(s * 0.8, -s * 0.8);
      ctx.lineTo(s * 0.8, 0);
      ctx.quadraticCurveTo(s * 0.6, s * 0.7, 0, s);
      ctx.quadraticCurveTo(-s * 0.6, s * 0.7, -s * 0.8, 0);
      break;
    case Orb.Energy:
      ctx.moveTo(s * 0.2, -s);
      ctx.lineTo(-s * 0.6, s * 0.15);
      ctx.lineTo(-s * 0.05, s * 0.15);
      ctx.lineTo(-s * 0.25, s);
      ctx.lineTo(s * 0.6, -s * 0.2);
      ctx.lineTo(s * 0.05, -s * 0.2);
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
    ctx.beginPath();
    ctx.roundRect(40, SCENE_Y + 8, W - 80, 30, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(toast.text, W / 2, SCENE_Y + 23);
    ctx.globalAlpha = 1;
  }

  if (phase === 'idle' && kills === 0 && enemy.attacks === 0 && enemy.turns === enemy.maxTurns) {
    ctx.fillStyle = '#000b';
    ctx.fillRect(0, BOARD_Y, W, 26);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('검=물리 · 마법=마법 · 힐=회복 · 방패=보호막 · 기력=필살기', W / 2, BOARD_Y + 13);
  }

  if (phase === 'lost') {
    ctx.fillStyle = '#000b';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('기사 쓰러짐', W / 2, H / 2 - 50);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText(`${Math.floor(scroll / 30)}m 전진 · 몬스터 ${kills}마리 처치`, W / 2, H / 2);
    ctx.fillText(`최고 기록 ${best}마리`, W / 2, H / 2 + 30);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#c9c3ff';
    ctx.fillText('탭하여 다시 시작', W / 2, H / 2 + 70);
  }
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
