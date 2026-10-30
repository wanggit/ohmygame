// 果园合并（2048）核心规则：纯函数，可测。规则与经典 2048 一致——
// 滑动压缩 → 相邻同值合并（每格每回合至多合并一次）→ 每回合空位生成 2/4。
export type Grid = number[][];
export type Dir = "left" | "right" | "up" | "down";

export interface TileMove {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  merged: boolean;
}

export interface MoveResult {
  grid: Grid;
  moved: boolean;
  scoreGain: number;
  merges: { r: number; c: number; value: number }[];
  moves: TileMove[];
}

export function emptyGrid(size: number): Grid {
  return Array.from({ length: size }, () => Array<number>(size).fill(0));
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => [...row]);
}

export function maxTile(grid: Grid): number {
  return Math.max(...grid.flat());
}

export function emptyCells(grid: Grid): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === 0) out.push({ r, c });
    }
  }
  return out;
}

/** 岩石格（-1）：永久障碍墙，不可动/不可合并，滑动时块不能越过（行/列按岩石分段）。 */
export const ROCK = -1;

/** 特殊格子选项（增量机制：双倍格/冰冻格/传送格；静态部分由关卡数据提供）。 */
export interface MoveOpts {
  /** 冻结格（"r,c" → 剩余冻结步数）：冻结期间是临时墙（不可动/越过）；由调用方每步递减。 */
  frozen?: Map<string, number>;
  /** 双倍格（"r,c" 集合）：合并落点在此 = 该次合并分数 ×2。 */
  doubleCells?: Set<string>;
  /** 传送对（每步滑动结束后互换两格上的块）。 */
  portals?: Array<{ fromR: number; fromC: number; toR: number; toC: number }>;
}

function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

/**
 * 向 dir 滑动并合并。经典 2048 语义 + 岩石分段：
 * - [2,2,4,_] 左滑 → [4,4,_,_]（新合并的 4 不再与相邻 4 合并）
 * - 岩石是墙：行/列被岩石切段，段内独立滑动合并，块不能越过岩石
 * - 无效滑动（局面不变）返回 moved=false
 */
export function move(grid: Grid, dir: Dir, opts?: MoveOpts): MoveResult {
  const size = grid.length;
  const result = emptyGrid(size);
  const moves: TileMove[] = [];
  const merges: { r: number; c: number; value: number }[] = [];
  let scoreGain = 0;
  let moved = false;
  const frozen = opts?.frozen;
  const doubles = opts?.doubleCells;

  const horizontal = dir === "left" || dir === "right";
  const forward = dir === "left" || dir === "up"; // 是否向 0 端对齐

  for (let line = 0; line < size; line++) {
    const at = (i: number): { r: number; c: number } => ({
      r: horizontal ? line : i,
      c: horizontal ? i : line,
    });
    // 墙 = 岩石或冻结格（冻结期间临时墙）
    const isRockAt = (i: number): boolean => {
      const { r, c } = at(i);
      return grid[r][c] === ROCK || (frozen?.has(cellKey(r, c)) ?? false);
    };

    // 线上按岩石分段（段 = [start, end) 线内索引区间）
    const segments: Array<[number, number]> = [];
    let segStart = 0;
    for (let i = 0; i <= size; i++) {
      if (i === size || isRockAt(i)) {
        if (segStart < i) segments.push([segStart, i]);
        segStart = i + 1;
      }
    }

    for (const [segStartI, segEndI] of segments) {
      const segLen = segEndI - segStartI;
      // 段内取非零序列（跳过墙格；冻结格整格跳过）
      const seq: { value: number; fromR: number; fromC: number }[] = [];
      for (let i = 0; i < segLen; i++) {
        const idx = segStartI + (forward ? i : segLen - 1 - i);
        const { r, c } = at(idx);
        if (grid[r][c] > 0 && !(frozen?.has(cellKey(r, c)) ?? false)) {
          seq.push({ value: grid[r][c], fromR: r, fromC: c });
        }
      }

      // 合并：从对齐端开始，相邻同值合并（每格至多一次）；双倍格落点 = 分数×2
      const merged: { value: number; fromR: number; fromC: number; joined: boolean; second?: { fromR: number; fromC: number } }[] = [];
      for (const cell of seq) {
        const last = merged[merged.length - 1];
        if (last && !last.joined && last.value === cell.value) {
          last.value *= 2;
          last.joined = true;
          last.second = { fromR: cell.fromR, fromC: cell.fromC };
          scoreGain += last.value;
        } else {
          merged.push({ ...cell, joined: false });
        }
      }

      // 写回段内对齐端 + 记录动画轨迹
      for (let i = 0; i < merged.length; i++) {
        const idx = segStartI + (forward ? i : segLen - 1 - i);
        const { r, c } = at(idx);
        const m = merged[i];
        result[r][c] = m.value;
        moves.push({ fromR: m.fromR, fromC: m.fromC, toR: r, toC: c, merged: false });
        if (m.joined && m.second) {
          // 双倍格落点：合并分数 ×2（额外补加一倍）
          if (doubles?.has(cellKey(r, c))) scoreGain += m.value;
          moves.push({ fromR: m.second.fromR, fromC: m.second.fromC, toR: r, toC: c, merged: true });
          merges.push({ r, c, value: m.value });
        }
        if (m.fromR !== r || m.fromC !== c || m.joined) moved = true;
      }
    }

    // 墙格写回：岩石原样；冻结格保留原块值（冻结期间不动）
    for (let i = 0; i < size; i++) {
      const { r, c } = at(i);
      if (grid[r][c] === ROCK) {
        result[r][c] = ROCK;
      } else if (frozen?.has(cellKey(r, c)) ?? false) {
        result[r][c] = grid[r][c];
      }
    }
  }

  // 传送对：每步滑动结束后互换两格上的块（确定性 post-process）
  for (const p of opts?.portals ?? []) {
    const a = result[p.fromR][p.fromC];
    const b = result[p.toR][p.toC];
    if (a !== b) moved = true;
    result[p.fromR][p.fromC] = b;
    result[p.toR][p.toC] = a;
  }

  return { grid: result, moved, scoreGain, merges, moves };
}

/** 空位生成一枚新方块（2 概率 90%，4 概率 10%）。 */
export function spawnTile(grid: Grid, rng: () => number = Math.random): { r: number; c: number; value: number } | null {
  const cells = emptyCells(grid);
  if (cells.length === 0) return null;
  const cell = cells[Math.floor(rng() * cells.length)];
  const value = rng() < 0.9 ? 2 : 4;
  grid[cell.r][cell.c] = value;
  return { ...cell, value };
}

/** 无合法移动 = 游戏结束（无空位且无相邻同值；岩石不可合并）。 */
export function isGameOver(grid: Grid): boolean {
  if (emptyCells(grid).length > 0) return false;
  const size = grid.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = grid[r][c];
      if (v <= 0) continue;
      if (c + 1 < size && v === grid[r][c + 1]) return false;
      if (r + 1 < size && v === grid[r + 1][c]) return false;
    }
  }
  return true;
}

/** 是否达成胜利（合并出目标值即触发一次庆祝，可继续玩）。 */
export function hasWon(grid: Grid, winValue: number): boolean {
  return maxTile(grid) >= winValue;
}