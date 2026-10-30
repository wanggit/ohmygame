/**
 * 水排序求解器（DFS + 状态去重）。
 * 用途：1) 生成关卡时验证可解性；2) 提示按钮给出一步可行解的第一步。
 */

export type Tubes = number[][];

export interface PourMove {
  from: number;
  to: number;
}

/** 求解节点上限：够找到解即可，太大在高色数 + 限时锁管下会把主线程卡死（实测 >5 分钟）。
 *  下限也不能太小——DFS 不完备时会把"其实可解"的局面误判为无解（实测 150k 会漏）。 */
const CAP_NODES = 260_000;

function hash(tubes: Tubes): string {
  // 排序消除空管/等价管排列差异，压缩状态空间。
  return tubes
    .map((t) => t.join(","))
    .sort()
    .join("|");
}

/** 合法倒水集合；剪掉"把纯色管倒进空管"这类无意义移动。
 *  frozenSources 中的管不能作为源（冰管）；locked 为限时锁管（remaining 步内完全不可用）。 */
export function legalMoves(
  tubes: Tubes,
  capacity: number,
  frozenSources?: Set<number>,
  locked?: { index: number; remaining: number },
): PourMove[] {
  const lockedNow = locked !== undefined && locked.remaining > 0 ? locked.index : -1;
  const moves: PourMove[] = [];
  for (let from = 0; from < tubes.length; from++) {
    if (frozenSources?.has(from)) continue;
    if (from === lockedNow) continue;
    const src = tubes[from];
    if (src.length === 0) continue;
    const top = src[src.length - 1];
    // 源管顶部同色段
    let run = 0;
    for (let i = src.length - 1; i >= 0 && src[i] === top; i--) run++;
    // 纯色满段倒进空管没有意义
    const srcIsPureComplete = run === src.length && src.length === capacity;
    for (let to = 0; to < tubes.length; to++) {
      if (to === from) continue;
      if (to === lockedNow) continue;
      const dst = tubes[to];
      if (dst.length >= capacity) continue;
      if (dst.length > 0 && dst[dst.length - 1] !== top) continue;
      if (dst.length === 0 && srcIsPureComplete) continue;
      // 空管之间只保留一个代表，减少对称分支
      if (dst.length === 0 && src.length === run && moves.some((m) => tubes[m.to].length === 0 && tubes[m.from].length === run)) continue;
      moves.push({ from, to });
    }
  }
  return moves;
}

function applyMove(tubes: Tubes, move: PourMove, capacity: number): Tubes {
  const next = tubes.map((t) => t.slice());
  const src = next[move.from];
  const dst = next[move.to];
  const top = src[src.length - 1];
  let run = 0;
  for (let i = src.length - 1; i >= 0 && src[i] === top; i--) run++;
  const amount = Math.min(run, capacity - dst.length);
  for (let i = 0; i < amount; i++) dst.push(src.pop()!);
  return next;
}

export function isSolved(tubes: Tubes, capacity: number): boolean {
  return tubes.every((t) => t.length === 0 || (t.length === capacity && t.every((c) => c === t[0])));
}

/** 求一组解；无解或超节点上限返回 null。
 *  frozenSources 中的管不能作为源（冰管可解性验证）；
 *  locked 为限时锁管：前 moves 步内该管完全不可用（与游戏内"锁 N 步后解锁"规则一致，
 *  否则验证会过严——把"锁几步"当成"永远锁死"，导致高关卡生成全部失败）。 */
export function findSolution(
  tubes: Tubes,
  capacity: number,
  frozenSources?: Set<number>,
  locked?: { index: number; moves: number },
): PourMove[] | null {
  const visited = new Set<string>();
  let nodes = 0;
  const path: PourMove[] = [];

  const dfs = (state: Tubes, lockRemaining: number): boolean => {
    if (isSolved(state, capacity)) return true;
    if (nodes++ > CAP_NODES) return false;
    // 锁未解除时状态才受剩余步数影响；解除后 key 退回纯局面，去重更有效
    const key = lockRemaining > 0 ? `${lockRemaining}|${hash(state)}` : hash(state);
    if (visited.has(key)) return false;
    visited.add(key);
    const lock = locked ? { index: locked.index, remaining: lockRemaining } : undefined;
    for (const move of legalMoves(state, capacity, frozenSources, lock)) {
      path.push(move);
      if (dfs(applyMove(state, move, capacity), Math.max(0, lockRemaining - 1))) return true;
      path.pop();
    }
    return false;
  };

  return dfs(tubes.map((t) => t.slice()), locked?.moves ?? 0) ? path : null;
}

/**
 * 提示：返回一步"有效推进"的移动（启发式打分，不是随便一步合法移动）。
 * 优先级：归位一管 > 合并同色段 > 倒空源管释放缓冲 > 其它；倒进空管只是兜底。
 * 打分只做单步前瞻（提示要快），走投无路时由调用方的求解器兜底。
 * locked 为限时锁管（与游戏内"锁 N 步后解锁"一致）：锁定期锁管完全不可用，
 * 提示不得指向它（否则会闪一根玩家点不动的管）。
 */
export function findHint(
  tubes: Tubes,
  capacity: number,
  frozenSources?: Set<number>,
  locked?: { index: number; remaining: number },
): PourMove | null {
  const moves = legalMoves(tubes, capacity, frozenSources, locked);
  if (moves.length === 0) return null;

  let best: PourMove | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const src = tubes[move.from];
    const dst = tubes[move.to];
    const top = src[src.length - 1];
    let run = 0;
    for (let i = src.length - 1; i >= 0 && src[i] === top; i--) run++;
    const merged = Math.min(run, capacity - dst.length);
    const dstAfter = dst.length + merged;

    let score = 0;
    // 1) 归位：倒完正好满管且整管同色（目标底部若混了异色不算归位）
    if (dstAfter === capacity && dst.every((c) => c === top)) score += 100;
    // 2) 合并到已有同色液体（目标本来非空 = 真合并，不是搬去空管）
    if (dst.length > 0) score += 45;
    score += merged * 8;
    // 3) 源管倒空 = 释放一根缓冲管
    if (src.length === run) score += 28;
    // 4) 惩罚：把段搬进空管（只是腾挪，不产生合并；除非没别的选择）
    if (dst.length === 0) score -= 32;
    // 5) 惩罚：源管倒出后露出异色（制造新的杂乱顶）
    if (src.length - run > 0 && src[src.length - run - 1] !== top) score -= 12;

    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
