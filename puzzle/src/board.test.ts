import { describe, expect, it } from 'vitest';
import { COLS, ROWS, Orb, clearCombo, createBoard, findCombos, seededRng, settle, type Combo, type Grid } from './board';
import {
  comboMultiplier,
  createEnemy,
  createKnight,
  enemyIntent,
  resolveTurn,
  takeHit,
  type Enemy,
} from './battle';

const S = Orb.Sword, M = Orb.Magic, H = Orb.Heal, D = Orb.Shield, E = Orb.Energy;
const grid = (rows: number[][]): Grid => rows.map((r) => r.map((orb) => ({ orb: orb as Orb, plus: false })));
const combo = (orb: Orb, n = 3, fullRow = false): Combo => ({
  orb,
  cells: Array.from({ length: n }, (_, i) => ({ r: 0, c: i })),
  plusCount: 0,
  fullRow,
});
const enemyOf = (kind: Enemy['kind']): Enemy => ({ ...createEnemy(0, seededRng(1)), kind });

describe('board', () => {
  it('createBoard has no initial combos', () => {
    for (let s = 0; s < 50; s++) expect(findCombos(createBoard(seededRng(s)))).toEqual([]);
  });

  it('finds horizontal and vertical matches as separate combos', () => {
    const g = grid([
      [S, S, S, M, H, D],
      [M, H, D, M, E, S],
      [H, D, E, M, S, H],
      [D, E, S, H, H, D],
      [E, S, H, D, M, E],
    ]);
    expect(findCombos(g).map((c) => [c.orb, c.cells.length])).toEqual([[S, 3], [M, 3]]);
  });

  it('merges touching matches of the same orb into one combo (L shape)', () => {
    const g = grid([
      [S, M, H, D, E, M],
      [S, H, D, E, M, H],
      [S, S, S, M, H, D],
      [M, D, E, H, M, E],
      [H, E, D, M, D, S],
    ]);
    const combos = findCombos(g);
    expect(combos).toHaveLength(1);
    expect(combos[0].cells).toHaveLength(5);
  });

  it('detects a full row', () => {
    const g = grid([
      [H, H, H, H, H, H],
      [M, S, D, E, S, M],
      [S, D, E, S, M, S],
      [D, E, S, M, D, D],
      [E, S, M, D, E, E],
    ]);
    expect(findCombos(g)[0].fullRow).toBe(true);
  });

  it('surge leaves an enhanced orb at the bottom-left cell of 5+ combos', () => {
    const g = grid([
      [S, S, S, S, S, M],
      [M, H, D, E, M, H],
      [H, D, E, M, H, D],
      [D, E, M, H, D, E],
      [E, M, H, D, E, M],
    ]);
    expect(clearCombo(g, findCombos(g)[0])).toEqual({ r: 0, c: 0 });
    expect(g[0][0]).toEqual({ orb: S, plus: true });
    expect(g[0].slice(1, 5)).toEqual([null, null, null, null]);
  });

  it('settle fills every cell and reports drops', () => {
    const g = createBoard(seededRng(1));
    g[4][2] = null;
    g[3][2] = null;
    const keep = g[2][2];
    const drops = settle(g, seededRng(2));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) expect(g[r][c]).not.toBeNull();
    expect(g[4][2]).toBe(keep);
    expect(drops[4][2]).toBe(2);
    expect(drops[0][2]).toBe(2);
    expect(drops[0][0]).toBe(0);
  });
});

describe('battle', () => {
  it('maps each orb role to a knight action in combo order', () => {
    const k = createKnight();
    const { actions, comboMult, harmony } = resolveTurn(k, [combo(S), combo(H), combo(D)], enemyOf('beast'));
    expect(comboMult).toBe(comboMultiplier(3));
    expect(harmony).toBe(false);
    expect(actions.map((a) => a.type)).toEqual(['phys', 'heal', 'shield']);
    expect(actions[0].value).toBe(Math.round(k.atk * 1.5));
    expect(actions[1].value).toBe(Math.round(k.rcv * 1.5));
    expect(actions[2].value).toBe(Math.round(k.def * 1.5));
  });

  it('enemy kind changes physical vs magic effectiveness', () => {
    const k = createKnight();
    const armored = resolveTurn(k, [combo(S), combo(M)], enemyOf('armored')).actions;
    const spirit = resolveTurn(k, [combo(S), combo(M)], enemyOf('spirit')).actions;
    expect(armored[0].value).toBeLessThan(spirit[0].value); // 검: 갑옷에 약함
    expect(armored[1].value).toBeGreaterThan(spirit[1].value); // 마법: 정령에 약함
  });

  it('harmony bonus applies when 4+ orb kinds are used', () => {
    const k = createKnight();
    const plain = resolveTurn(k, [combo(S), combo(S), combo(S), combo(H)], enemyOf('beast'));
    const mixed = resolveTurn(k, [combo(S), combo(M), combo(D), combo(H)], enemyOf('beast'));
    expect(plain.harmony).toBe(false);
    expect(mixed.harmony).toBe(true);
    expect(mixed.actions[0].value).toBe(Math.round(k.atk * comboMultiplier(4) * 1.2));
  });

  it('energy charges without combo multiplier', () => {
    const { actions } = resolveTurn(createKnight(), [combo(E), combo(S), combo(S)], enemyOf('beast'));
    expect(actions[0]).toEqual({ type: 'energy', value: 20 });
  });

  it('shield absorbs one hit then disappears', () => {
    const k = createKnight();
    k.shield = 300;
    expect(takeHit(k, 200)).toBe(0);
    expect(k.shield).toBe(0);
    expect(takeHit(k, 200)).toBe(200);
    expect(k.hp).toBe(k.maxHp - 200);
  });

  it('every third enemy attack is a telegraphed heavy attack', () => {
    const e = createEnemy(0, seededRng(3));
    expect(enemyIntent(e).heavy).toBe(false);
    e.attacks = 2;
    expect(enemyIntent(e)).toEqual({ heavy: true, damage: Math.round(e.atk * 1.8) });
  });

  it('every fifth enemy is a stronger boss', () => {
    const rng = seededRng(4);
    const normal = createEnemy(3, rng);
    const boss = createEnemy(4, rng);
    expect(boss.boss).toBe(true);
    expect(normal.boss).toBe(false);
    expect(boss.maxHp).toBeGreaterThan(normal.maxHp * 2);
  });
});
