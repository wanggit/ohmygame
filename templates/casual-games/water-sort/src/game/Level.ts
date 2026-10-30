/**
 * 关卡状态与生成。
 * 生成策略：随机洗牌 → 一次性求解（同时验证可解性并测得解长，求解自带特殊管约束）
 * → 解长落在目标难度范围则接受，否则记录最接近的候选 → 不合格重试。
 * 兜底用随机发牌 + 真实解长（**不能用 scramble**：纯色满管互倒只是换位，打不乱）。
 *
 * 可复现（设计"固定随机种子"）：传入 seed 时全流程确定性——同关卡同题，
 * "同局重开 par 可比"与自动化验证都靠它；不传 seed 时退回 Math.random。
 */
import { findSolution, type Tubes } from "./Solver";
import type { SpecialRules } from "../config";

/** mulberry32：小而稳的确定性 PRNG（种子开局可复现）。 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TubeSpecials {
  /** 雾管：颜色不可见（倒出时揭示）。 */
  fog: Set<number>;
  /** 冰管：**空管起步**，只能倒入不能倒出（排水槽语义，见 assignSpecials）。 */
  ice: Set<number>;
  /** 锁管：空管，lockMoves 次倒水后解锁。 */
  locked: number | null;
  lockMoves: number;
}

export interface GenerateOptions {
  /** 装色管数（分散度）：默认 = colors（每管整段发牌）。 */
  filledTubes?: number;
  /** 固定随机种子：同 (seed, 参数) 必得同一副牌。 */
  seed?: number;
}

export interface LevelData {
  level: number;
  capacity: number;
  colors: number;
  tubes: Tubes;
  /** solver 解长（星级 par 基准）。 */
  minSteps: number;
  specials: TubeSpecials;
}

export function generateLevel(
  level: number,
  capacity: number,
  spareTubes: number,
  colors: number,
  targetSteps: { min: number; max: number },
  rules: SpecialRules,
  options: GenerateOptions = {},
): LevelData {
  const rng = options.seed !== undefined ? makeRng(options.seed) : Math.random;
  const filledTubes = Math.max(colors, options.filledTubes ?? colors);
  let best: { tubes: Tubes; minSteps: number; specials: TubeSpecials } | null = null;
  let bestScore = Infinity;
  // 高颜色数时 solver 求解变慢，减少尝试次数控制生成耗时（关卡生成在 init 里同步跑，
  // 卡住就是白屏；量级要保证最坏情况也在几十毫秒内）
  const maxAttempts = colors >= 8 ? 20 : 30;
  // DFS 解长有波动（存在短"巧解"），下限与颜色数结构性挂钩，排除过短的巧解
  const effectiveMin = Math.max(targetSteps.min, Math.round(colors * 1.5));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tubes = shuffleDeal(colors, capacity, spareTubes, { filledTubes, rng });
    const specials = assignSpecials(tubes, rules, rng);
    const locked = specials.locked !== null ? { index: specials.locked, moves: specials.lockMoves } : undefined;
    // 一次求解同时拿到"可解性 + 解长"（求解本身就在特殊管约束下进行）。
    // 别拆成"先求解长、再单独验证特殊管"——那是 2~3 次 solver，高关卡直接卡半秒。
    const solution = findSolution(tubes, capacity, specials.ice.size > 0 ? specials.ice : undefined, locked);
    if (solution === null) continue;
    const steps = solution.length;
    const inRange = steps >= effectiveMin && steps <= targetSteps.max;
    // 离目标范围的距离（越小越好）：短于下限与超上限同样算偏离，尝试用尽时据此挑最接近的候选
    const score = inRange ? 0 : steps < effectiveMin ? effectiveMin - steps : steps - targetSteps.max;
    if (!inRange && score >= bestScore) continue;

    if (inRange) {
      return { level, capacity, colors, tubes, minSteps: steps, specials };
    }
    bestScore = score;
    best = { tubes, minSteps: steps, specials };
  }
  if (best) return { level, capacity, colors, ...best };

  // 兜底：直接随机发牌 + **确认可解**的真实解长。**不能用 scramble**：水排序规则下纯色满管
  // 互倒只是换位，从完成态根本打不乱，会返回"开局即胜利 + 假 par"的废关卡（实测踩坑）。
  // 也不能只试一次就把 tubes 交出去——solver 超节点上限时会返回 null，那关卡就是不可解的。
  for (let i = 0; i < 6; i++) {
    const tubes = shuffleDeal(colors, capacity, spareTubes, { filledTubes, rng });
    const solution = findSolution(tubes, capacity);
    if (solution !== null) {
      return {
        level,
        capacity,
        colors,
        tubes,
        minSteps: solution.length,
        specials: { fog: new Set(), ice: new Set(), locked: null, lockMoves: 0 },
      };
    }
  }
  // 极端情况（solver 全超限）：返回最后一副牌，par 用下限近似。可解性由 verify 兜底检查把关。
  return {
    level,
    capacity,
    colors,
    tubes: shuffleDeal(colors, capacity, spareTubes, { filledTubes, rng }),
    minSteps: Math.max(1, effectiveMin),
    specials: { fog: new Set(), ice: new Set(), locked: null, lockMoves: 0 },
  };
}

/**
 * 分配特殊管：锁管/冰管取空管（互不重复，且至少留 1 根自由空管做缓冲）；雾管随机取装色管。
 *
 * **冰管必须从空管取**（踩坑录）：随机混色管做冰管（只进不出）倒不出底色 = 必然死局，
 * 实测 10 色 0/20 可解——生成器 20 次尝试全灭走兜底，冰管特性等于没做还白烧 500ms×20 的 solver。
 * 空管冰管 = "只进不出的排水槽"：可作倒入目标（承诺一种颜色），倒进去就取不回。
 */
function assignSpecials(tubes: Tubes, rules: SpecialRules, rng: () => number = Math.random): TubeSpecials {
  const specials: TubeSpecials = {
    fog: new Set(),
    ice: new Set(),
    locked: null,
    lockMoves: rules.lockMoves,
  };
  const filled = tubes.map((t, i) => (t.length > 0 ? i : -1)).filter((i) => i >= 0);
  const empties = tubes.map((t, i) => (t.length === 0 ? i : -1)).filter((i) => i >= 0);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  if (rules.lockedTube > 0 && empties.length > 0) {
    specials.locked = pick(empties);
  }
  // 冰管也从空管取；锁管+冰管占用后至少留 1 根自由空管，否则开局 0 缓冲必死局
  const freeEmpties = empties.filter((i) => i !== specials.locked);
  if (rules.iceTubes > 0 && freeEmpties.length >= 2) {
    const shuffled = [...freeEmpties].sort(() => rng() - 0.5);
    for (let n = 0; n < rules.iceTubes && n < shuffled.length; n++) {
      if (freeEmpties.length - specials.ice.size <= 1) break;
      specials.ice.add(shuffled[n]);
    }
  }
  const pool = filled.filter((i) => i !== specials.locked).sort(() => rng() - 0.5);
  for (let n = 0; n < rules.fogTubes && n < pool.length; n++) {
    const idx = pool[n];
    if (!specials.ice.has(idx)) specials.fog.add(idx);
  }
  return specials;
}

/**
 * 随机洗牌发牌：colors 份×capacity 单位的色袋，**均匀摊到 filledTubes 根装色管**
 * （每管 base 或 base+1 单位），再加 spareTubes 根空管。
 * filledTubes = colors 时即经典"每管整段"发牌；增大 filledTubes 即提高同色分散度（乱度）。
 * 导出供难度校准脚本实测解长分布。
 */
export function shuffleDeal(
  colors: number,
  capacity: number,
  spareTubes: number,
  options: { filledTubes?: number; rng?: () => number } = {},
): Tubes {
  const rng = options.rng ?? Math.random;
  const filledTubes = Math.max(colors, options.filledTubes ?? colors);
  const bag: number[] = [];
  for (let c = 0; c < colors; c++) for (let i = 0; i < capacity; i++) bag.push(c);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const tubes: Tubes = [];
  const base = Math.floor(bag.length / filledTubes);
  const rem = bag.length % filledTubes;
  let idx = 0;
  for (let t = 0; t < filledTubes; t++) {
    const n = base + (t < rem ? 1 : 0);
    tubes.push(bag.slice(idx, idx + n));
    idx += n;
  }
  for (let s = 0; s < spareTubes; s++) tubes.push([]);
  return tubes;
}

/** 纯函数倒水：成功返回新状态，失败返回 null。 */
export function pour(tubes: Tubes, from: number, to: number, capacity: number): Tubes | null {
  const src = tubes[from];
  const dst = tubes[to];
  if (!src || !dst || from === to) return null;
  if (src.length === 0 || dst.length >= capacity) return null;
  const top = src[src.length - 1];
  if (dst.length > 0 && dst[dst.length - 1] !== top) return null;
  const next = tubes.map((t) => t.slice());
  const s = next[from];
  const d = next[to];
  let run = 0;
  for (let i = s.length - 1; i >= 0 && s[i] === top; i--) run++;
  const amount = Math.min(run, capacity - d.length);
  if (amount <= 0) return null;
  for (let i = 0; i < amount; i++) d.push(s.pop()!);
  return next;
}

export function isComplete(tubes: Tubes, capacity: number): boolean {
  return tubes.every((t) => t.length === 0 || (t.length === capacity && t.every((c) => c === t[0])));
}
