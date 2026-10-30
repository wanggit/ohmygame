/**
 * 难度校准工具：实测"随机洗牌局面 + DFS 求解"的解长分布，作为 targetStepsForLevel 的数值依据。
 * 调难度参数前先跑它——门槛一旦超出可达区间，生成器会全军覆没走兜底，产出假关卡。
 *
 * 运行：bun run measure
 */
import { shuffleDeal } from "../src/game/Level";
import { findSolution } from "../src/game/Solver";
import { LEVEL_CONFIG } from "../src/config";

// 实测：随机洗牌局面的真实 solver 解长分布（不过滤），用于校准 targetSteps。
// 矩阵覆盖难度模型的四个维度：色数（1-10 管经典发牌）、分散度（filled > colors）、
// 锁管时限、冰管（空管排水槽）。
const MATRIX: [string, number, number, number, number, number][] = [
  // [label, colors, filled, spare, lockMoves, ice]
  ["3c 整管", 3, 3, 2, 0, 0],
  ["4c 整管", 4, 4, 2, 0, 0],
  ["5c 整管", 5, 5, 2, 0, 0],
  ["6c 整管", 6, 6, 2, 0, 0],
  ["7c 整管", 7, 7, 2, 0, 0],
  ["8c 整管", 8, 8, 2, 0, 0],
  ["9c 整管", 9, 9, 2, 0, 0],
  ["10c 整管", 10, 10, 2, 0, 0],
  ["10c 分散15", 10, 15, 3, 0, 0],
  ["10c 分散27(30管)", 10, 27, 3, 0, 0],
  ["10c f27+锁12", 10, 27, 3, 12, 0],
  ["10c f16+锁8", 10, 16, 3, 8, 0],
  ["10c f16+锁8+冰1", 10, 16, 3, 8, 1],
  ["10c f27+锁12+冰2", 10, 27, 3, 12, 2],
];

for (const [label, colors, filled, spare, lockMoves, iceCount] of MATRIX) {
  const lens: number[] = [];
  let unsolvable = 0;
  for (let i = 0; i < 30; i++) {
    const tubes = shuffleDeal(colors, LEVEL_CONFIG.tubeCapacity, spare, { filledTubes: filled });
    const empties = tubes.map((t, ix) => (t.length === 0 ? ix : -1)).filter((ix) => ix >= 0);
    const locked = lockMoves > 0 && empties.length > 0 ? { index: empties[0], moves: lockMoves } : undefined;
    // 冰管从空管取（与 Level.assignSpecials 口径一致）
    const ice = new Set<number>();
    const freeEmpties = empties.filter((ix) => ix !== locked?.index);
    for (let n = 0; n < iceCount && n < freeEmpties.length; n++) ice.add(freeEmpties[n]);
    const sol = findSolution(tubes, LEVEL_CONFIG.tubeCapacity, ice.size > 0 ? ice : undefined, locked);
    if (sol) lens.push(sol.length);
    else unsolvable++;
  }
  lens.sort((a, b) => a - b);
  const q = (p: number) => lens[Math.floor(lens.length * p)] ?? -1;
  console.log(
    `${label} tubes=${filled + spare} solvable=${lens.length}/30 unsolved=${unsolvable} ` +
      `min=${q(0)} p25=${q(0.25)} p50=${q(0.5)} p75=${q(0.75)} max=${lens[lens.length - 1]}`,
  );
}
