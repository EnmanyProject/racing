// 전투 규칙: 데미지/회복 계산, 파티·적 데이터

import { COLS, Orb, ROWS, type Combo, type Grid } from './board';

export type SkillKind =
  | { type: 'convert'; from: Orb; to: Orb }
  | { type: 'heal'; ratio: number }
  | { type: 'empower'; orb: Orb }
  | { type: 'delay'; turns: number };

export interface Hero {
  name: string;
  orb: Orb;
  atk: number;
  hp: number;
  rcv: number;
  skillName: string;
  skillDesc: string;
  skill: SkillKind;
  maxCd: number;
  cd: number;
}

export interface Enemy {
  name: string;
  orb: Orb;
  maxHp: number;
  hp: number;
  atk: number;
  maxTurns: number;
  turns: number;
  boss?: boolean;
}

export interface AttackResult {
  perHero: number[];
  heal: number;
  comboMult: number;
}

/** 콤보 배율: 1콤보당 +25% */
export function comboMultiplier(comboCount: number): number {
  return comboCount <= 0 ? 0 : 1 + (comboCount - 1) * 0.25;
}

/** 속성 상성: 불>나무>물>불, 빛<->어둠 */
export function elementMultiplier(atk: Orb, def: Orb): number {
  const beats: Partial<Record<Orb, Orb>> = {
    [Orb.Fire]: Orb.Wood,
    [Orb.Wood]: Orb.Water,
    [Orb.Water]: Orb.Fire,
    [Orb.Light]: Orb.Dark,
    [Orb.Dark]: Orb.Light,
  };
  if (beats[atk] === def) return 2;
  if (beats[def] === atk) return 0.5;
  return 1;
}

/** 단일 콤보 기본 위력: 3개=1.0, 1개 추가마다 +25%, 강화 룬 1개당 +15% */
export function comboPower(combo: Combo): number {
  return (1 + (combo.cells.length - 3) * 0.25) * (1 + combo.plusCount * 0.15);
}

export function computeAttack(team: Hero[], combos: Combo[], enemy: Enemy): AttackResult {
  const comboMult = comboMultiplier(combos.length);
  const perHero = team.map((hero) => {
    const mine = combos.filter((c) => c.orb === hero.orb);
    if (!mine.length) return 0;
    const base = mine.reduce((s, c) => s + comboPower(c), 0);
    const rowMult = 1 + 0.2 * mine.filter((c) => c.fullRow).length;
    return Math.round(hero.atk * base * comboMult * rowMult * elementMultiplier(hero.orb, enemy.orb));
  });
  const hearts = combos.filter((c) => c.orb === Orb.Heart).reduce((s, c) => s + comboPower(c), 0);
  const rcv = team.reduce((s, h) => s + h.rcv, 0);
  return { perHero, heal: Math.round(rcv * hearts * comboMult), comboMult };
}

/** 액티브 스킬 적용 */
export function applySkill(skill: SkillKind, grid: Grid, enemy: Enemy, heal: (ratio: number) => void): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      if (skill.type === 'convert' && cell.orb === skill.from) grid[r][c] = { orb: skill.to, plus: cell.plus };
      if (skill.type === 'empower' && cell.orb === skill.orb) cell.plus = true;
    }
  }
  if (skill.type === 'heal') heal(skill.ratio);
  if (skill.type === 'delay') enemy.turns += skill.turns;
}

/** 콤보 수가 많으면 스킬 쿨다운이 추가로 줄어든다 (템포 규칙) */
export const TEMPO_COMBOS = 6;

export function createTeam(): Hero[] {
  const h = (
    name: string,
    orb: Orb,
    atk: number,
    hp: number,
    rcv: number,
    skillName: string,
    skillDesc: string,
    skill: SkillKind,
    maxCd: number,
  ): Hero => ({ name, orb, atk, hp, rcv, skillName, skillDesc, skill, maxCd, cd: maxCd });
  return [
    h('이그니스', Orb.Fire, 140, 320, 20, '홍련 변환', '나무 룬 → 불 룬', { type: 'convert', from: Orb.Wood, to: Orb.Fire }, 6),
    h('마리나', Orb.Water, 125, 360, 30, '해류 변환', '불 룬 → 물 룬', { type: 'convert', from: Orb.Fire, to: Orb.Water }, 6),
    h('실바', Orb.Wood, 110, 400, 45, '숲의 숨결', '최대 HP 40% 회복', { type: 'heal', ratio: 0.4 }, 8),
    h('루멘', Orb.Light, 130, 330, 25, '성광 각인', '모든 빛 룬 강화', { type: 'empower', orb: Orb.Light }, 7),
    h('녹스', Orb.Dark, 150, 300, 15, '시간 왜곡', '적 공격 턴 +2', { type: 'delay', turns: 2 }, 8),
  ];
}

export function createFloors(): Enemy[] {
  const e = (name: string, orb: Orb, hp: number, atk: number, turns: number, boss = false): Enemy => ({
    name,
    orb,
    maxHp: hp,
    hp,
    atk,
    maxTurns: turns,
    turns,
    boss,
  });
  return [
    e('불씨 슬라임', Orb.Fire, 2500, 180, 2),
    e('이끼 골렘', Orb.Wood, 4500, 260, 2),
    e('심해 해파리', Orb.Water, 6500, 320, 2),
    e('그림자 기사', Orb.Dark, 9000, 450, 3),
    e('성룡 아우렐', Orb.Light, 18000, 520, 2, true),
  ];
}
