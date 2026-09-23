// 전투 규칙: 퍼즐 콤보 → 기사 지원 효과 변환, 지원 마법, 몬스터 생성

import { COLS, Orb, ROWS, type Combo, type Grid, type Rng } from './board';

export interface Knight {
  maxHp: number;
  hp: number;
  /** 물리 공격력 (검 룬) */
  atk: number;
  /** 마법 공격력 (마법 룬) */
  mag: number;
  /** 회복력 (힐 룬) */
  rcv: number;
  /** 방어력 (방패 룬 → 보호막) */
  def: number;
  /** 다음 몬스터 공격을 흡수하는 보호막. 몬스터 공격 1회 후 사라짐 */
  shield: number;
  /** 필살 게이지 0~100 (기력 룬) */
  energy: number;
  level: number;
}

export function createKnight(): Knight {
  return { maxHp: 1500, hp: 1500, atk: 150, mag: 140, rcv: 170, def: 200, shield: 0, energy: 0, level: 1 };
}

/** 몬스터 체질: 물리/마법 피해 배율이 다르다 */
export type EnemyKind = 'beast' | 'armored' | 'spirit';

export const RESIST: Record<EnemyKind, { phys: number; magic: number; label: string }> = {
  beast: { phys: 1, magic: 1, label: '야수 · 약점 없음' },
  armored: { phys: 0.5, magic: 1.5, label: '갑옷 · 물리↓ 마법↑' },
  spirit: { phys: 1.5, magic: 0.5, label: '정령 · 물리↑ 마법↓' },
};

export interface Enemy {
  name: string;
  kind: EnemyKind;
  maxHp: number;
  hp: number;
  atk: number;
  maxTurns: number;
  turns: number;
  /** 지금까지 한 공격 횟수 (3번째마다 강공격) */
  attacks: number;
  boss: boolean;
}

export type Action =
  | { type: 'phys' | 'magic'; value: number; heavy: boolean; pierce: boolean }
  | { type: 'heal' | 'shield' | 'energy'; value: number };

export interface TurnResult {
  /** 콤보 순서대로 기사가 수행하는 행동 */
  actions: Action[];
  comboMult: number;
  /** 한 턴에 4종 이상 룬을 쓰면 모든 효과 +20% */
  harmony: boolean;
}

export const HARMONY_KINDS = 4;
export const HARMONY_MULT = 1.2;
export const ENERGY_PER_COMBO = 20;
export const FINISHER_MULT = 10;
export const HEAVY_EVERY = 3;
export const HEAVY_MULT = 1.8;

/** 콤보 배율: 1콤보당 +25% */
export function comboMultiplier(comboCount: number): number {
  return comboCount <= 0 ? 0 : 1 + (comboCount - 1) * 0.25;
}

/** 단일 콤보 기본 위력: 3개=1.0, 1개 추가마다 +25%, 강화 룬 1개당 +15% */
export function comboPower(combo: Combo): number {
  return (1 + (combo.cells.length - 3) * 0.25) * (1 + combo.plusCount * 0.15);
}

/** 한 턴의 콤보를 기사의 행동 목록으로 변환 */
export function resolveTurn(knight: Knight, combos: Combo[], enemy: Enemy): TurnResult {
  const comboMult = comboMultiplier(combos.length);
  const harmony = new Set(combos.map((c) => c.orb)).size >= HARMONY_KINDS;
  const bonus = harmony ? HARMONY_MULT : 1;
  const res = RESIST[enemy.kind];
  const actions: Action[] = combos.map((c): Action => {
    const p = comboPower(c) * comboMult * bonus;
    const row = c.fullRow ? 1.2 : 1;
    const heavy = c.cells.length >= 5;
    switch (c.orb) {
      case Orb.Sword:
        return { type: 'phys', value: Math.round(knight.atk * p * row * res.phys), heavy, pierce: c.fullRow };
      case Orb.Magic:
        return { type: 'magic', value: Math.round(knight.mag * p * row * res.magic), heavy, pierce: c.fullRow };
      case Orb.Heal:
        return { type: 'heal', value: Math.round(knight.rcv * p) };
      case Orb.Shield:
        return { type: 'shield', value: Math.round(knight.def * p) };
      default:
        // 기력은 콤보 배율 없이 콤보 크기만큼 충전
        return { type: 'energy', value: Math.round(ENERGY_PER_COMBO * comboPower(c) * bonus) };
    }
  });
  return { actions, comboMult, harmony };
}

/** 필살기: 저항 무시 */
export function finisherDamage(knight: Knight): number {
  return knight.atk * FINISHER_MULT;
}

/** 몬스터의 다음 공격 예고 */
export function enemyIntent(enemy: Enemy): { damage: number; heavy: boolean } {
  const heavy = (enemy.attacks + 1) % HEAVY_EVERY === 0;
  return { damage: Math.round(enemy.atk * (heavy ? HEAVY_MULT : 1)), heavy };
}

/** 보호막 먼저 깎고 남은 피해를 HP에. 보호막은 공격 1회 후 소멸. 실제 HP 피해 반환 */
export function takeHit(knight: Knight, damage: number): number {
  const through = Math.max(0, damage - knight.shield);
  knight.shield = 0;
  knight.hp = Math.max(0, knight.hp - through);
  return through;
}

/** 몬스터 처치 시 기사 성장 */
export function levelUp(knight: Knight): void {
  knight.level++;
  knight.atk = Math.round(knight.atk * 1.07);
  knight.mag = Math.round(knight.mag * 1.07);
  knight.def = Math.round(knight.def * 1.06);
  knight.rcv = Math.round(knight.rcv * 1.05);
  knight.maxHp += 60;
  knight.hp += 60;
}

export type SpellKind =
  | { type: 'convert'; from: Orb; to: Orb }
  | { type: 'empower'; orb: Orb }
  | { type: 'barrier'; ratio: number }
  | { type: 'delay'; turns: number };

/** 플레이어(지원자)가 기사를 돕는 액티브 마법 */
export interface Spell {
  name: string;
  desc: string;
  orb: Orb;
  kind: SpellKind;
  maxCd: number;
  cd: number;
}

export function applySpell(kind: SpellKind, grid: Grid, knight: Knight, enemy: Enemy): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      if (kind.type === 'convert' && cell.orb === kind.from) grid[r][c] = { orb: kind.to, plus: cell.plus };
      if (kind.type === 'empower' && cell.orb === kind.orb) cell.plus = true;
    }
  }
  if (kind.type === 'barrier') knight.shield += Math.round(knight.maxHp * kind.ratio);
  if (kind.type === 'delay') enemy.turns += kind.turns;
}

/** 콤보 수가 많으면 마법 쿨다운이 추가로 줄어든다 (템포 규칙) */
export const TEMPO_COMBOS = 6;

export function createSpells(): Spell[] {
  const s = (name: string, desc: string, orb: Orb, kind: SpellKind, maxCd: number): Spell => ({
    name,
    desc,
    orb,
    kind,
    maxCd,
    cd: maxCd,
  });
  return [
    s('검기 각인', '모든 검 룬 강화', Orb.Sword, { type: 'empower', orb: Orb.Sword }, 7),
    s('마력 전환', '검 룬 → 마법 룬', Orb.Magic, { type: 'convert', from: Orb.Sword, to: Orb.Magic }, 6),
    s('생명 전환', '방패 룬 → 힐 룬', Orb.Heal, { type: 'convert', from: Orb.Shield, to: Orb.Heal }, 7),
    s('수호 결계', '보호막 (최대 HP 50%)', Orb.Shield, { type: 'barrier', ratio: 0.5 }, 8),
    s('시간 왜곡', '몬스터 공격 +2턴', Orb.Energy, { type: 'delay', turns: 2 }, 9),
  ];
}

const MONSTERS: [string, EnemyKind][] = [
  ['굶주린 늑대', 'beast'],
  ['멧돼지 전사', 'beast'],
  ['강철 골렘', 'armored'],
  ['해골 기사', 'armored'],
  ['불꽃 정령', 'spirit'],
  ['그림자 망령', 'spirit'],
];
const BOSSES: [string, EnemyKind][] = [
  ['오거 족장', 'beast'],
  ['흑철 거인', 'armored'],
  ['심연의 리치', 'spirit'],
];

/** 5번째마다 보스. 만날수록 강해진다. */
export const BOSS_EVERY = 5;

export function createEnemy(index: number, rng: Rng): Enemy {
  const boss = index % BOSS_EVERY === BOSS_EVERY - 1;
  const [name, kind] = boss
    ? BOSSES[Math.floor(index / BOSS_EVERY) % BOSSES.length]
    : MONSTERS[Math.floor(rng() * MONSTERS.length)];
  const hp = Math.round(1800 * Math.pow(1.22, index) * (boss ? 2.2 : 1));
  const atk = Math.round(260 * Math.pow(1.13, index) * (boss ? 1.3 : 1));
  const turns = boss ? 2 : 2 + Math.floor(rng() * 2);
  return { name, kind, maxHp: hp, hp, atk, maxTurns: turns, turns, attacks: 0, boss };
}
