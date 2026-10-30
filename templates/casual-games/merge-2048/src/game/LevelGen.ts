// B1 关卡难度模型：目标值爬升 × 开局块数 × 步数限制（与 A 系列"颜色数/空管/目标步数"同构）。
import { ROCK } from "./Board";
import type { Grid } from "./Board";

export interface LevelData {
  id: number;
  boardSize: number; // 盘面尺寸：3=极限窄盘 / 4=标准 / 5=宽盘休闲
  target: number; // 目标水果值：合出即过关（无步数限制；失败=死局）
  par: number; // 标定最优步数（3 星线）
  initial: Grid; // 初始布局（head start 预置块 + 岩石；确定性）
  spawnSeq: number[]; // 固定 spawn 值序列（确定性；用完回退随机）
  placeSeq: number[]; // 固定 spawn 落位序列（idx % 当步空位数；标定与玩家消费同一序列 = 可达性闭环）
  doubleCells: Array<[number, number]>; // 双倍格 [r,c]（合并落点分数×2）
  portals: Array<[number, number, number, number]>; // 传送对 [fromR,fromC,toR,toC]（每步末互换其上的块）
  frozenStart: Array<[number, number, number]>; // 初始冻结块 [r,c,steps]（值在 initial 里；冻结期间=临时墙）
}

/**
 * 关卡计划（每关目标/盘面不同 = 波浪节奏；实测 beam 标定步数）：
 * - 512s（4×4，~69 步 ≈ 5 分钟）/ 512l（4×4 长链，~158 步）
 * - 1024m（4×4，~130 步 ≈ 8 分钟）/ 1024l（4×4，~196 步）
 * - 2048m（4×4 Boss，~260 步 ≈ 15 分钟）
 * - 5×5 宽盘休闲变体（512sW=71 / 1024mW=130 / 2048mW=251）
 * - 256xs（3×3 极限窄盘，[64,64] ~67 步——空间极限压力）
 */
/**
 * 关卡配方（正交机制密度：rocks/doubles/portals/frozenTiles 可任意组合）。
 * 机制沿难度曲线展开：教学 → 复习 → 组合 → 密度爬升（每种机制出现 6+ 次）。
 */
const PLANS: Record<
  string,
  { boardSize: number; target: number; headStart: number[]; rocks: number; doubles: number; portals: number; frozenTiles: number }
> = {
  // 基础配方
  "512s": { boardSize: 4, target: 512, headStart: [128, 128, 64, 64], rocks: 0, doubles: 0, portals: 0, frozenTiles: 0 },
  "512l": { boardSize: 4, target: 512, headStart: [64, 64, 32, 32], rocks: 0, doubles: 0, portals: 0, frozenTiles: 0 },
  "1024m": { boardSize: 4, target: 1024, headStart: [256, 256, 128, 128], rocks: 0, doubles: 0, portals: 0, frozenTiles: 0 },
  "1024l": { boardSize: 4, target: 1024, headStart: [256, 256, 64, 64], rocks: 0, doubles: 0, portals: 0, frozenTiles: 0 },
  "2048m": { boardSize: 4, target: 2048, headStart: [512, 512, 256, 256], rocks: 0, doubles: 0, portals: 0, frozenTiles: 0 },
  "512sW": { boardSize: 5, target: 512, headStart: [128, 128, 64, 64], rocks: 0, doubles: 0, portals: 0, frozenTiles: 0 },
  "1024mW": { boardSize: 5, target: 1024, headStart: [256, 256, 128, 128], rocks: 0, doubles: 0, portals: 0, frozenTiles: 0 },
  "2048mW": { boardSize: 5, target: 2048, headStart: [512, 512, 256, 256], rocks: 0, doubles: 0, portals: 0, frozenTiles: 0 },
  "256xs": { boardSize: 3, target: 256, headStart: [64, 64], rocks: 0, doubles: 0, portals: 0, frozenTiles: 0 },
  // 单机制配方（教学+复习）
  "512d": { boardSize: 4, target: 512, headStart: [128, 128, 64, 64], rocks: 0, doubles: 2, portals: 0, frozenTiles: 0 },
  "1024d": { boardSize: 5, target: 1024, headStart: [256, 256, 128, 128], rocks: 0, doubles: 2, portals: 0, frozenTiles: 0 },
  "512r": { boardSize: 4, target: 512, headStart: [128, 128, 64, 64], rocks: 2, doubles: 0, portals: 0, frozenTiles: 0 },
  "1024r": { boardSize: 5, target: 1024, headStart: [256, 256, 128, 128], rocks: 2, doubles: 0, portals: 0, frozenTiles: 0 },
  "1024r3": { boardSize: 5, target: 1024, headStart: [256, 256, 128, 128], rocks: 3, doubles: 0, portals: 0, frozenTiles: 0 },
  "1024f": { boardSize: 4, target: 1024, headStart: [256, 256, 128, 128], rocks: 0, doubles: 0, portals: 0, frozenTiles: 1 },
  "512p": { boardSize: 5, target: 512, headStart: [128, 128, 64, 64], rocks: 0, doubles: 0, portals: 1, frozenTiles: 0 },
  "1024p": { boardSize: 5, target: 1024, headStart: [256, 256, 128, 128], rocks: 0, doubles: 0, portals: 2, frozenTiles: 0 },
  // 组合配方（高阶：多机制同关）
  "512rd": { boardSize: 4, target: 512, headStart: [128, 128, 64, 64], rocks: 2, doubles: 2, portals: 0, frozenTiles: 0 },
  "1024rd": { boardSize: 5, target: 1024, headStart: [256, 256, 128, 128], rocks: 3, doubles: 2, portals: 0, frozenTiles: 0 },
  "1024pf": { boardSize: 5, target: 1024, headStart: [256, 256, 128, 128], rocks: 0, doubles: 0, portals: 1, frozenTiles: 1 },
  "2048all": { boardSize: 4, target: 2048, headStart: [512, 512, 256, 256], rocks: 2, doubles: 2, portals: 1, frozenTiles: 1 },
};

// 10 关节奏循环 ×3 段位（机制沿难度曲线：教学→复习→组合→密度爬升）
const WAVE: string[] = ["512s", "512sW", "1024m", "512s", "512d", "1024mW", "512s", "512l", "512d", "2048m"];
const WAVE_MID: string[] = ["1024m", "512r", "512d", "1024mW", "1024l", "512r", "512d", "1024f", "256xs", "2048m"];
const WAVE_HARD: string[] = ["1024l", "2048m", "1024r3", "512p", "512rd", "1024d", "1024f", "1024pf", "1024rd", "2048all"];

export function planForLevel(level: number): {
  boardSize: number;
  target: number;
  headStart: number[];
  rocks: number;
  doubles: number;
  portals: number;
  frozenTiles: number;
} {
  const waveIdx = (level - 1) % 10;
  const seg = Math.min(2, Math.floor((level - 1) / 34));
  const key = seg === 0 ? WAVE[waveIdx] : seg === 1 ? WAVE_MID[waveIdx] : WAVE_HARD[waveIdx];
  return PLANS[key];
}

export function targetForLevel(level: number): number {
  return planForLevel(level).target;
}

export function headStartForLevel(level: number): number[] {
  return planForLevel(level).headStart;
}

export function boardSizeForLevel(level: number): number {
  return planForLevel(level).boardSize;
}

export function rocksForLevel(level: number): number {
  return planForLevel(level).rocks;
}

/** Boss 关（每 10 关）：4×4 2048 长挑战。 */
export function isBossLevel(level: number): boolean {
  return level % 10 === 0 && planForLevel(level).boardSize === 4;
}

/** 极限窄盘关（3×3）：空间压力挑战。 */
export function isMiniLevel(level: number): boolean {
  return planForLevel(level).boardSize === 3;
}

// ---------- 种子随机（mulberry32）：关卡完全确定性 ----------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 策略模拟（难度标定用；par = 最快达成步数 × 1.35） ----------

import { move, spawnTile, emptyCells, maxTile, cloneGrid, type Dir, type MoveOpts } from "./Board";

const DIRS: Dir[] = ["left", "up", "right", "down"];

/** 评分：合并收益 + 空位 + 最大块接近度（目标导向——纯拼图下把目标块推一起）。 */
function scoreMove(grid: Grid, dir: Dir, size: number, opts?: MoveOpts): number {
  const res = move(grid, dir, opts);
  if (!res.moved) return -1;
  const empties = emptyCells(res.grid).length;
  const max = maxTile(res.grid);
  const pos: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (res.grid[r][c] === max) pos.push([r, c]);
    }
  }
  let approach = 0;
  if (pos.length >= 2) {
    const d = Math.abs(pos[0][0] - pos[1][0]) + Math.abs(pos[0][1] - pos[1][1]);
    approach = (7 - d) * 22; // 距离越近分越高（主导项：目标导向）
  }
  return res.scoreGain * 10 + empties * 4 + approach;
}

/**
 * 一步贪心最优方向（hint 功能用；runtime opts = 冰冻/双倍/传送当前状态）。
 * 死局或四向皆无效返回 null。注意：仅供提示，不参与标定（标定走 beamSearch）。
 */
export function bestGreedyMove(grid: Grid, opts?: MoveOpts): Dir | null {
  const size = grid.length;
  let best: Dir | null = null;
  let bestScore = -1;
  for (const dir of DIRS) {
    const s = scoreMove(grid, dir, size, opts);
    if (s > bestScore) {
      bestScore = s;
      best = dir;
    }
  }
  return bestScore > 0 ? best : null;
}

/**
 * 模拟游玩：给定布局与 spawn/落位序列，返回达成 target 的步数（策略选向）。
 * 落位消费 placeSeq（与玩家实际同一序列 = 标定可达性传导到玩家体验）。
 */
export function simulateRun(
  initial: Grid,
  spawnSeq: number[],
  placeSeq: number[],
  target: number,
  maxMoves: number,
  opts?: SimOpts,
): number | null {
  const size = initial.length;
  const grid = cloneGrid(initial);
  let spawnPtr = 0;
  const frozen = new Map<string, number>(opts?.frozenStart?.map(([r, c, s]) => [`${r},${c}`, s]));
  const seen = new Set<string>(); // 循环检测：贪心震荡直接判失败
  for (let step = 1; step <= maxMoves; step++) {
    const key = grid.map((r) => r.join(",")).join("|");
    if (seen.has(key)) return null;
    seen.add(key);
    let best: Dir | null = null;
    let bestScore = -1;
    for (const dir of DIRS) {
      const s = scoreMove(grid, dir, size);
      if (s > bestScore) {
        bestScore = s;
        best = dir;
      }
    }
    if (best === null) return null; // 死局
    const res = move(grid, best, {
      frozen,
      doubleCells: opts?.doubleCells,
      portals: opts?.portals,
    });
    for (let r = 0; r < size; r++) grid[r] = [...res.grid[r]];
    // 冻结递减（每步 -1，<=0 解冻）
    for (const [k, v] of frozen) {
      if (v <= 1) frozen.delete(k);
      else frozen.set(k, v - 1);
    }
    // spawn：序列为空 = 纯拼图关不 spawn（与 GameScene 行为一致）
    if (spawnSeq.length > 0 && spawnPtr < spawnSeq.length) {
      const cells = emptyCells(grid);
      if (cells.length > 0) {
        const value = spawnSeq[spawnPtr];
        const place = placeSeq[spawnPtr] ?? 0;
        spawnPtr++;
        const cell = cells[place % cells.length];
        grid[cell.r][cell.c] = value;
      }
    }
    if (maxTile(grid) >= target) return step;
  }
  return null;
}

/** 标定/模拟的特殊格静态选项。 */
export interface SimOpts {
  frozenStart?: Array<[number, number, number]>;
  doubleCells?: Set<string>;
  portals?: Array<{ fromR: number; fromC: number; toR: number; toC: number }>;
}

/**
 * 标定：spawnEnabled=false（纯拼图关）时空序列模拟一次；
 * true 时对 6 组 spawn/落位序列模拟取最快——采用的序列与关卡数据一致（可达性闭环）。
 */
/**
 * beam search 标定（贪心天花板的解法）：每步保留 top-N 局面继续展开。
 * 能达成贪心到不了的 1024/2048/4096 目标（lookahead 3-4 层）。
 */
export function beamSearch(
  initial: Grid,
  spawnSeq: number[],
  placeSeq: number[],
  target: number,
  maxMoves: number,
  beamWidth = 4,
  opts?: SimOpts,
): number | null {
  interface BeamState {
    grid: Grid;
    spawnPtr: number;
    gain: number;
    score: number;
    frozen: Map<string, number>;
  }
  const startFrozen = new Map<string, number>(opts?.frozenStart?.map(([r, c, s]) => [`${r},${c}`, s]));
  const startKey = initial.map((r) => r.join(",")).join("|");
  let states: BeamState[] = [{ grid: cloneGrid(initial), spawnPtr: 0, gain: 0, score: 0, frozen: startFrozen }];
  const seen = new Set<string>([startKey + "#0"]);

  for (let step = 1; step <= maxMoves; step++) {
    const next: BeamState[] = [];
    for (const st of states) {
      for (const dir of DIRS) {
        const res = move(st.grid, dir, {
          frozen: st.frozen,
          doubleCells: opts?.doubleCells,
          portals: opts?.portals,
        });
        if (!res.moved) continue;
        const g = res.grid;
        if (maxTile(g) >= target) return step;
        // 冻结递减
        const frozen = new Map(st.frozen);
        for (const [k, v] of frozen) {
          if (v <= 1) frozen.delete(k);
          else frozen.set(k, v - 1);
        }
        let ptr = st.spawnPtr;
        if (spawnSeq.length > 0 && ptr < spawnSeq.length) {
          const cells = emptyCells(g);
          if (cells.length > 0) {
            const cell = cells[(placeSeq[ptr] ?? 0) % cells.length];
            g[cell.r][cell.c] = spawnSeq[ptr];
            ptr++;
          }
        }
        const key = g.map((r) => r.join(",")).join("|") + "#" + ptr + "#" + [...frozen.values()].join("-");
        if (seen.has(key)) continue;
        seen.add(key);
        const gain = st.gain + res.scoreGain;
        // 评估：最大块进度 + 空间 + 合并收益 + 相邻同值对（合并潜力，导向排布）
        let pairBonus = 0;
        for (let r = 0; r < g.length; r++) {
          for (let c = 0; c < g.length; c++) {
            const v = g[r][c];
            if (v <= 0) continue;
            if (c + 1 < g.length && g[r][c + 1] === v) pairBonus += v;
            if (r + 1 < g.length && g[r + 1][c] === v) pairBonus += v;
          }
        }
        const score = Math.log2(maxTile(g)) * 140 + emptyCells(g).length * 26 + gain * 0.6 + pairBonus * 0.9;
        next.push({ grid: g, spawnPtr: ptr, gain, score, frozen });
      }
    }
    if (next.length === 0) return null;
    next.sort((a, b) => b.score - a.score);
    states = next.slice(0, beamWidth);
  }
  return null;
}

export function calibrate(
  initial: Grid,
  target: number,
  spawnEnabled = true,
  opts?: SimOpts,
): { best: number; spawnSeq: number[]; placeSeq: number[] } | null {
  if (!spawnEnabled) {
    const steps = beamSearch(initial, [], [], target, 400, 4, opts);
    return steps === null ? null : { best: steps, spawnSeq: [], placeSeq: [] };
  }
  let best: { best: number; spawnSeq: number[]; placeSeq: number[] } | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const rng = mulberry32(attempt * 7717 + 13);
    const spawnSeq: number[] = [];
    const placeSeq: number[] = [];
    for (let i = 0; i < 320; i++) {
      spawnSeq.push(rng() < 0.9 ? 2 : 4);
      placeSeq.push(Math.floor(rng() * 16));
    }
    const steps = beamSearch(initial, spawnSeq, placeSeq, target, 400, 4, opts);
    if (steps !== null && (best === null || steps < best.best)) {
      best = { best: steps, spawnSeq, placeSeq };
    }
  }
  return best;
}

/**
 * 生成一关：head start 预置 + spawn 经典模式 + 时长质量线（beam 55-280 步 = 玩家 4-18 分钟）。
 * 关键设计：无步数失败（失败=死局）；par=标定最优×1.2（3 星线）；布局换 retry 直到时长达标。
 */
export function generateLevel(id: number): LevelData {
  const boardSize = boardSizeForLevel(id);
  const target = targetForLevel(id);
  const headStart = headStartForLevel(id);
  const rng = mulberry32(id * 7919 + 104729);

  for (let retry = 0; retry < 24; retry++) {
    // 初始布局：岩石（墙）先放 + head start 块随机落位（retry 换位置调时长）
    const initial: Grid = Array.from({ length: boardSize }, () => Array<number>(boardSize).fill(0));
    const cells = emptyCells(initial);
    const rocks = rocksForLevel(id);
    for (let i = 0; i < rocks; i++) {
      const idx = Math.floor(rng() * cells.length);
      const cell = cells.splice(idx, 1)[0];
      initial[cell.r][cell.c] = ROCK;
    }
    for (const value of headStart) {
      const idx = Math.floor(rng() * cells.length);
      const cell = cells.splice(idx, 1)[0];
      initial[cell.r][cell.c] = value;
    }

    // 特殊格生成（正交密度可组合；retry 换位置）
    const plan = planForLevel(id);
    const doubleCells: Array<[number, number]> = [];
    const portals: Array<[number, number, number, number]> = [];
    const frozenStart: Array<[number, number, number]> = [];
    const simOpts: SimOpts = {};
    if (plan.doubles > 0) {
      const free = emptyCells(initial);
      for (let i = 0; i < plan.doubles && free.length > 0; i++) {
        const cell = free.splice(Math.floor(rng() * free.length), 1)[0];
        doubleCells.push([cell.r, cell.c]);
      }
      simOpts.doubleCells = new Set(doubleCells.map(([r, c]) => `${r},${c}`));
    }
    if (plan.frozenTiles > 0) {
      // 冻结块：取 head 块冻结 4 步（临时墙 → 解冻参与合成）
      const occupied: Array<[number, number]> = [];
      for (let r = 0; r < boardSize; r++) {
        for (let c = 0; c < boardSize; c++) {
          if (initial[r][c] > 0) occupied.push([r, c]);
        }
      }
      for (let i = 0; i < plan.frozenTiles && occupied.length > 0; i++) {
        const [r, c] = occupied.splice(Math.floor(rng() * occupied.length), 1)[0];
        frozenStart.push([r, c, 4]);
      }
      if (frozenStart.length > 0) simOpts.frozenStart = frozenStart;
    }
    if (plan.portals > 0) {
      const free = emptyCells(initial);
      for (let i = 0; i < plan.portals && free.length >= 2; i++) {
        const a = free.splice(Math.floor(rng() * free.length), 1)[0];
        const b = free.splice(Math.floor(rng() * free.length), 1)[0];
        portals.push([a.r, a.c, b.r, b.c]);
      }
      if (portals.length > 0) {
        simOpts.portals = portals.map(([fromR, fromC, toR, toC]) => ({ fromR, fromC, toR, toC }));
      }
    }

    const cal = calibrate(initial, target, true, simOpts);
    if (cal === null) continue;
    // 时长质量线：beam 55-280 步（玩家 ≈ 4-18 分钟）；不足/过长都换布局
    if (cal.best < 55 || cal.best > 280) continue;

    const par = Math.ceil(cal.best * 1.2);
    return {
      id,
      boardSize,
      target,
      par,
      initial,
      spawnSeq: cal.spawnSeq,
      placeSeq: cal.placeSeq,
      doubleCells,
      portals,
      frozenStart,
    };
  }
  // 硬兜底（极少触发）：对角 head start + 其标定序列
  const fallbackInitial: Grid = Array.from({ length: boardSize }, () => Array<number>(boardSize).fill(0));
  fallbackInitial[0][0] = headStart[0] ?? 2;
  fallbackInitial[boardSize - 1][boardSize - 1] = headStart[1] ?? 4;
  const cal = calibrate(fallbackInitial, target, true) ?? { best: 60, spawnSeq: [], placeSeq: [] };
  return {
    id,
    boardSize,
    target,
    par: Math.ceil(cal.best * 1.2),
    initial: fallbackInitial,
    spawnSeq: cal.spawnSeq,
    placeSeq: cal.placeSeq,
    doubleCells: [],
    portals: [],
    frozenStart: [],
  };
}