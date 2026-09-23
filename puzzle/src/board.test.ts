import { describe, expect, it } from 'vitest';
import { COLS, ROWS, Orb, clearCombo, createBoard, findCombos, seededRng, settle, type Grid } from './board';
import { comboMultiplier, computeAttack, createFloors, createTeam, elementMultiplier } from './battle';

const F = Orb.Fire, W = Orb.Water, G = Orb.Wood, L = Orb.Light, D = Orb.Dark, H = Orb.Heart;
const grid = (rows: number[][]): Grid => rows.map((r) => r.map((orb) => ({ orb: orb as Orb, plus: false })));

describe('board', () => {
  it('createBoard has no initial combos', () => {
    for (let s = 0; s < 50; s++) expect(findCombos(createBoard(seededRng(s)))).toEqual([]);
  });

  it('finds horizontal and vertical matches as separate combos', () => {
    const g = grid([
      [F, F, F, W, G, L],
      [W, G, L, W, D, H],
      [G, L, D, W, H, F],
      [L, D, H, G, F, W],
      [D, H, F, L, W, G],
    ]);
    const combos = findCombos(g);
    expect(combos.map((c) => [c.orb, c.cells.length])).toEqual([[F, 3], [W, 3]]);
  });

  it('merges touching matches of the same color into one combo (L shape)', () => {
    const g = grid([
      [F, W, G, L, D, H],
      [F, G, L, D, H, W],
      [F, F, F, W, G, L],
      [W, L, D, H, W, G],
      [G, D, H, W, L, D],
    ]);
    const combos = findCombos(g);
    expect(combos).toHaveLength(1);
    expect(combos[0].cells).toHaveLength(5);
  });

  it('detects a full row', () => {
    const g = grid([
      [H, H, H, H, H, H],
      [W, G, L, D, F, W],
      [G, L, D, F, W, G],
      [L, D, F, W, G, L],
      [D, F, W, G, L, D],
    ]);
    const [c] = findCombos(g);
    expect(c.fullRow).toBe(true);
  });

  it('surge leaves an enhanced orb at the bottom-left cell of 5+ combos', () => {
    const g = grid([
      [F, F, F, F, F, W],
      [W, G, L, D, H, G],
      [G, L, D, H, W, L],
      [L, D, H, W, G, D],
      [D, H, W, G, L, H],
    ]);
    const kept = clearCombo(g, findCombos(g)[0]);
    expect(kept).toEqual({ r: 0, c: 0 });
    expect(g[0][0]).toEqual({ orb: F, plus: true });
    expect(g[0].slice(1, 5)).toEqual([null, null, null, null]);
  });

  it('settle fills every cell and reports drops', () => {
    const g = createBoard(seededRng(1));
    const below = g[4][2];
    g[4][2] = null;
    g[3][2] = null;
    const keep = g[2][2];
    const drops = settle(g, seededRng(2));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) expect(g[r][c]).not.toBeNull();
    expect(g[4][2]).toBe(keep);
    expect(drops[4][2]).toBe(2);
    expect(drops[0][2]).toBe(2);
    expect(drops[0][0]).toBe(0);
    expect(below).not.toBeNull();
  });
});

describe('battle', () => {
  it('combo multiplier and element advantage', () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(5)).toBe(2);
    expect(elementMultiplier(F, G)).toBe(2);
    expect(elementMultiplier(G, F)).toBe(0.5);
    expect(elementMultiplier(L, D)).toBe(2);
    expect(elementMultiplier(F, L)).toBe(1);
  });

  it('computes damage and healing per hero', () => {
    const team = createTeam();
    const enemy = createFloors()[1]; // Wood
    const combos = [
      { orb: F, cells: Array(3).fill({ r: 0, c: 0 }), plusCount: 0, fullRow: false },
      { orb: H, cells: Array(4).fill({ r: 0, c: 0 }), plusCount: 0, fullRow: false },
    ];
    const res = computeAttack(team, combos, enemy);
    // 불 영웅: 140 * 1.0 * 콤보1.25 * 상성2
    expect(res.perHero[0]).toBe(350);
    expect(res.perHero.slice(1)).toEqual([0, 0, 0, 0]);
    const rcv = team.reduce((s, h) => s + h.rcv, 0);
    expect(res.heal).toBe(Math.round(rcv * 1.25 * 1.25));
  });
});
