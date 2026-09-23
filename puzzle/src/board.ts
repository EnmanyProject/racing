// 보드 로직 (렌더링과 무관한 순수 함수)

export const COLS = 6;
export const ROWS = 5;

/** 룬 = 기사를 돕는 역할 */
export const Orb = {
  Sword: 0, // 물리 공격
  Magic: 1, // 마법 공격
  Heal: 2, // 회복
  Shield: 3, // 보호막
  Energy: 4, // 필살 게이지
} as const;
export type Orb = (typeof Orb)[keyof typeof Orb];
export const ORB_TYPES = 5;

export interface Cell {
  orb: Orb;
  /** 강화 룬: 콤보에 포함되면 효과 보너스 */
  plus: boolean;
}

export type Grid = (Cell | null)[][];
export type Rng = () => number;
export interface Pos {
  r: number;
  c: number;
}

export interface Combo {
  orb: Orb;
  cells: Pos[];
  plusCount: number;
  /** 가로 한 줄(6개)을 모두 포함 */
  fullRow: boolean;
}

/** 강화 룬을 남기는 콤보 최소 크기 (서지 규칙) */
export const SURGE_SIZE = 5;

export function randomOrb(rng: Rng): Orb {
  return Math.floor(rng() * ORB_TYPES) as Orb;
}

/** 시작 시점에 이미 맞춰진 콤보가 없는 보드 생성 */
export function createBoard(rng: Rng): Grid {
  const g: Grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row: (Cell | null)[] = [];
    g.push(row);
    for (let c = 0; c < COLS; c++) {
      let orb: Orb;
      do {
        orb = randomOrb(rng);
      } while (
        (c >= 2 && row[c - 1]!.orb === orb && row[c - 2]!.orb === orb) ||
        (r >= 2 && g[r - 1][c]!.orb === orb && g[r - 2][c]!.orb === orb)
      );
      row.push({ orb, plus: false });
    }
  }
  return g;
}

export function cloneGrid(g: Grid): Grid {
  return g.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function swap(g: Grid, a: Pos, b: Pos): void {
  const t = g[a.r][a.c];
  g[a.r][a.c] = g[b.r][b.c];
  g[b.r][b.c] = t;
}

/**
 * 가로/세로 3개 이상 연속된 룬을 찾고, 인접한 같은 색 매치를 하나의 콤보로 묶는다.
 * 콤보는 위→아래, 왼→오 순으로 정렬된다.
 */
export function findCombos(g: Grid): Combo[] {
  const marked = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));

  for (let r = 0; r < ROWS; r++) {
    let start = 0;
    for (let c = 1; c <= COLS; c++) {
      if (c < COLS && same(g[r][c], g[r][start])) continue;
      if (c - start >= 3 && g[r][start]) for (let k = start; k < c; k++) marked[r][k] = true;
      start = c;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let start = 0;
    for (let r = 1; r <= ROWS; r++) {
      if (r < ROWS && same(g[r][c], g[start][c])) continue;
      if (r - start >= 3 && g[start][c]) for (let k = start; k < r; k++) marked[k][c] = true;
      start = r;
    }
  }

  const seen = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  const combos: Combo[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!marked[r][c] || seen[r][c]) continue;
      const orb = g[r][c]!.orb;
      const cells: Pos[] = [];
      const stack: Pos[] = [{ r, c }];
      seen[r][c] = true;
      while (stack.length) {
        const p = stack.pop()!;
        cells.push(p);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = p.r + dr;
          const nc = p.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          if (seen[nr][nc] || !marked[nr][nc] || g[nr][nc]!.orb !== orb) continue;
          seen[nr][nc] = true;
          stack.push({ r: nr, c: nc });
        }
      }
      let fullRow = false;
      for (let rr = 0; rr < ROWS && !fullRow; rr++) {
        fullRow = cells.filter((p) => p.r === rr).length === COLS;
      }
      combos.push({
        orb,
        cells,
        plusCount: cells.filter((p) => g[p.r][p.c]!.plus).length,
        fullRow,
      });
    }
  }
  return combos;
}

function same(a: Cell | null, b: Cell | null): boolean {
  return !!a && !!b && a.orb === b.orb;
}

/**
 * 콤보 룬 제거. 서지 규칙: 5개 이상 콤보는 가장 아래(동률이면 왼쪽) 칸에 강화 룬 하나를 남긴다.
 * 남겨진 강화 룬 위치를 반환.
 */
export function clearCombo(g: Grid, combo: Combo): Pos | null {
  for (const p of combo.cells) g[p.r][p.c] = null;
  if (combo.cells.length < SURGE_SIZE) return null;
  const keep = combo.cells.reduce((a, b) => (b.r > a.r || (b.r === a.r && b.c < a.c) ? b : a));
  g[keep.r][keep.c] = { orb: combo.orb, plus: true };
  return keep;
}

/**
 * 빈칸을 중력으로 채우고 위에서 새 룬을 떨어뜨린다.
 * 반환값 drops[r][c]: 해당 칸 룬이 떨어진 칸 수 (애니메이션용).
 */
export function settle(g: Grid, rng: Rng): number[][] {
  const drops = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const cell = g[r][c];
      if (!cell) continue;
      g[r][c] = null;
      g[write][c] = cell;
      drops[write][c] = write - r;
      write--;
    }
    const empty = write + 1;
    for (let r = write; r >= 0; r--) {
      g[r][c] = { orb: randomOrb(rng), plus: false };
      drops[r][c] = empty;
    }
  }
  return drops;
}

/** 시드 고정 RNG (테스트/리플레이용) */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
