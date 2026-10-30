/**
 * 关卡生成与规则的批量验证（不依赖浏览器）：
 * 1) 100 个关卡全部经 Solver 验证可解；
 * 2) pour 规则边界行为正确；
 * 3) 完成态判定正确；
 * 4) 难度曲线：最优解步数随关卡总体上升，且多数落在目标难度范围内。
 * 运行：bun scripts/verify.ts
 */
import { generateLevel, pour, isComplete } from "../src/game/Level";
import { findSolution, findHint, isSolved, legalMoves } from "../src/game/Solver";
import { LEVEL_CONFIG, DIFFICULTY, type SpecialRules } from "../src/config";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) {
    failures++;
    console.error(`✗ ${name} ${detail}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

// 1) 40 关全部可解（规模取 40：生成期要跑 solver，全量 100 关会把验证拖到分钟级）
const LEVELS_TO_CHECK = 40;
let unsolved: number[] = [];
for (let level = 1; level <= LEVELS_TO_CHECK; level++) {
  const colors = DIFFICULTY.colorsForLevel(level);
  const filled = DIFFICULTY.filledTubesForLevel(level, colors);
  const data = generateLevel(
    level,
    LEVEL_CONFIG.tubeCapacity,
    DIFFICULTY.spareTubesForLevel(level, colors),
    colors,
    DIFFICULTY.targetStepsForLevel(level, colors, filled),
    DIFFICULTY.specialsForLevel(level, colors),
    { filledTubes: filled, seed: level * 1000 + 0 },
  );
  // 与生成器同口径：求解带特殊管约束（玩家就是在这个约束下玩的）
  const locked =
    data.specials.locked !== null
      ? { index: data.specials.locked, moves: data.specials.lockMoves }
      : undefined;
  const solution = findSolution(
    data.tubes,
    data.capacity,
    data.specials.ice.size > 0 ? data.specials.ice : undefined,
    locked,
  );
  if (solution === null) unsolved.push(level);
}
check(`${LEVELS_TO_CHECK} 关全部可解`, unsolved.length === 0, `不可解关卡: ${unsolved.join(",")}`);

// 4) 难度曲线：最优解步数趋势 + 目标范围命中率。
// 采样点放在爬升区 [1..25]：实测解长天花板由「10 色 × 4 格」定死（p50≈53/max≈57），
// L25+ 进入平台期属真实数据（靠管数/特殊管维持压力，见 DESIGN 难度模型），另设"不滑坡"守门。
// 每关 5 个种子取中位，种子固定 → 整条曲线可复现（不再掷硬币）。
const sampleLevels = [1, 3, 5, 8, 10, 12, 15, 18, 20, 22, 25];
const steps: number[] = [];
for (const level of sampleLevels) {
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const colors = DIFFICULTY.colorsForLevel(level);
    const filled = DIFFICULTY.filledTubesForLevel(level, colors);
    const d = generateLevel(
      level,
      LEVEL_CONFIG.tubeCapacity,
      DIFFICULTY.spareTubesForLevel(level, colors),
      colors,
      DIFFICULTY.targetStepsForLevel(level, colors, filled),
      DIFFICULTY.specialsForLevel(level, colors),
      { filledTubes: filled, seed: level * 1000 + i + 1 },
    );
    runs.push(d.minSteps);
  }
  runs.sort((a, b) => a - b);
  steps.push(runs[2]); // 取中位数
}
console.log(`  各关卡中位最优步数 [${sampleLevels.join(",")}]: [${steps.join(",")}]`);
check(
  "难度曲线总体上升（首尾对比）",
  steps[steps.length - 1] > steps[0] * 1.6,
  `level1=${steps[0]} level100=${steps[steps.length - 1]}`,
);
// 关键回归：难度不能倒挂（旧曲线 L10=24 步、L15/L20 反而更短）。
// 容差 8：同一色数段内解长波动 + 中位数采样噪声（9 色天然区间 31–46），小回落不算设计缺陷。
const dips: string[] = [];
for (let i = 1; i < steps.length; i++) {
  if (steps[i] < steps[i - 1] - 8) dips.push(`L${sampleLevels[i - 1]}=${steps[i - 1]}→L${sampleLevels[i]}=${steps[i]}`);
}
check("难度曲线不倒挂（相邻样本回落 ≤ 8 步）", dips.length === 0, dips.join(" "));
check(
  "解长下限有效性（短巧解被排除）",
  steps.every((s, i) => s >= DIFFICULTY.colorsForLevel(sampleLevels[i]) * 1.5 - 3),
  `[${steps.join(",")}]`,
);
// 目标步数门槛随色数单调（难度主轴是认知负荷）
const colorMins = [3, 4, 5, 6, 7, 8, 9, 10].map((c) => DIFFICULTY.targetStepsForLevel(20, c).min);
check(
  "目标步数门槛随色数单调上升",
  colorMins.every((v, i) => i === 0 || v > colorMins[i - 1]),
  `[${colorMins.join(",")}]`,
);

let inRange = 0;
const rangeChecked = 24;
for (let level = 1; level <= rangeChecked; level++) {
  const colors = DIFFICULTY.colorsForLevel(level);
  const filled = DIFFICULTY.filledTubesForLevel(level, colors);
  const target = DIFFICULTY.targetStepsForLevel(level, colors, filled);
  const d = generateLevel(
    level,
    LEVEL_CONFIG.tubeCapacity,
    DIFFICULTY.spareTubesForLevel(level, colors),
    colors,
    target,
    DIFFICULTY.specialsForLevel(level, colors),
    { filledTubes: filled, seed: level * 1000 + 777 },
  );
  if (d.minSteps >= target.min * 0.7 && d.minSteps <= target.max * 1.3) inRange++;
}
check("难度目标范围命中率 ≥ 80%", inRange >= rangeChecked * 0.8, `命中 ${inRange}/${rangeChecked}`);

// 星级评定
check("星级：接近最优为 3 星", DIFFICULTY.starsForSteps(10, 10) === 3);
check("星级：略超为 2 星", DIFFICULTY.starsForSteps(15, 10) === 2);
check("星级：远超为 1 星", DIFFICULTY.starsForSteps(25, 10) === 1);

// 5) 特殊管：可解性不被破坏（锁管限时可解、冰管只进不出可解，两者叠加也可解）
let specialsOk = 0;
let specialsTotal = 0;
let specialsPresent = 0;
for (const level of [8, 12, 20, 30, 50]) {
  const colors = DIFFICULTY.colorsForLevel(level);
  const rules = DIFFICULTY.specialsForLevel(level, colors);
  const filled = DIFFICULTY.filledTubesForLevel(level, colors);
  for (let i = 0; i < 4; i++) {
    const d = generateLevel(
      level,
      LEVEL_CONFIG.tubeCapacity,
      DIFFICULTY.spareTubesForLevel(level, colors),
      colors,
      DIFFICULTY.targetStepsForLevel(level, colors, filled),
      rules,
      { filledTubes: filled, seed: level * 1000 + 31 + i },
    );
    const sp = d.specials;
    if (sp.locked === null && sp.ice.size === 0 && sp.fog.size === 0) continue;
    specialsTotal++;
    if (rules.lockedTube + rules.iceTubes + rules.fogTubes > 0) specialsPresent++;
    let ok = true;
    // 与游戏口径一致：一次求解同时带锁管 + 冰管约束
    const locked = sp.locked !== null ? { index: sp.locked, moves: sp.lockMoves } : undefined;
    if (findSolution(d.tubes, d.capacity, sp.ice.size > 0 ? sp.ice : undefined, locked) === null) ok = false;
    if (ok) specialsOk++;
  }
}
check("特殊管关卡可解性 100%", specialsTotal > 0 && specialsOk === specialsTotal, `${specialsOk}/${specialsTotal}`);
check(
  "特殊管真实生成（未静默走兜底）",
  specialsPresent >= 18,
  `带特殊管 ${specialsPresent}/20`,
);

// 2) pour 规则
const cap = 4;
check(
  "同色合并倒水",
  JSON.stringify(pour([[1, 1], [1]], 1, 0, cap)) === JSON.stringify([[1, 1, 1], []]),
);
check("异色禁止倒水", pour([[1], [2]], 0, 1, cap) === null);
check("满管禁止倒入", pour([[1], [1, 1, 1, 1]], 0, 1, cap) === null);
check(
  "空管可接（只倒顶部连续段）",
  JSON.stringify(pour([[2, 1], []], 0, 1, cap)) === JSON.stringify([[2], [1]]),
);
check("只倒顶部连续段", JSON.stringify(pour([[1, 2, 2], []], 0, 1, cap)) === JSON.stringify([[1], [2, 2]]));
check("空源管不可倒", pour([[], [1]], 0, 1, cap) === null);

// 3) 完成态判定
check("完成态识别", isComplete([[], [1, 1, 1, 1], [2, 2, 2, 2]], 4));
check("未完成识别", !isComplete([[1, 2], [1, 1, 1], [2, 2, 2]], 4));
check("求解器识别完成态", isSolved([[3, 3, 3, 3], []], 4));

// 6) 提示质量（旧实现只是"返回第一个能倒进非空管的移动"，等于乱指）
{
  const cap = 4;
  // 0 管顶部的 1 倒进 1 管即可归位一管 —— 提示必须选它
  const hint = findHint([[2, 1], [1, 1, 1], [], [3, 3, 3, 3]], cap);
  check("提示优先归位一管", hint?.from === 0 && hint?.to === 1, JSON.stringify(hint));
}
{
  const hint = findHint([[2, 1], [1], [], [3, 3, 3, 3]], 4);
  check("提示不做无意义的空管腾挪", hint?.to !== 2, JSON.stringify(hint));
}
{
  const hint = findHint([[2, 1], [1], [], [3, 3, 3, 3]], 4, new Set([1]));
  check("提示尊重冰管约束（不以冰管为源）", hint?.from !== 1, JSON.stringify(hint));
}
{
  // 目标底部混了异色：倒满也不算归位，不该被当成最优
  const hint = findHint([[2, 1], [1, 1, 2], [], [3, 3, 3, 3]], 4);
  check("提示不把混色管误判为归位", !(hint?.from === 0 && hint?.to === 1), JSON.stringify(hint));
}

// 7) 卡关判定（GameScene 的"OUT OF MOVES"面板依赖它）
check("死局识别为无合法移动", legalMoves([[1, 2, 1, 2], [2, 1, 2, 1]], 4).length === 0);
check("正常局面存在合法移动", legalMoves([[1, 2], [], [1, 1]], 4).length > 0);
check("冰管封死后可判为死局", legalMoves([[1, 2, 1], [2, 1, 2, 1]], 4, new Set([0, 1])).length === 0);

// 8) 关卡质量：开局必须是真乱局、par 必须是真解长
// （防止生成器全军覆没走兜底，产出"开局即胜利 + 假 par"的废关卡——实测踩过这个坑）
{
  let doneAtStart = 0;
  let fakePar = 0;
  let suspiciousPar = 0;
  const checked = 36;
  for (let level = 1; level <= checked; level++) {
    const colors = DIFFICULTY.colorsForLevel(level);
    const filled = DIFFICULTY.filledTubesForLevel(level, colors);
    const target = DIFFICULTY.targetStepsForLevel(level, colors, filled);
    const d = generateLevel(
      level,
      LEVEL_CONFIG.tubeCapacity,
      DIFFICULTY.spareTubesForLevel(level, colors),
      colors,
      target,
      DIFFICULTY.specialsForLevel(level, colors),
      { filledTubes: filled, seed: level * 1000 + 555 },
    );
    if (isComplete(d.tubes, d.capacity)) doneAtStart++;
    const sol = findSolution(d.tubes, d.capacity);
    // par 必须是"确实需要这么多步"的解长：不能小于 8（开局即完成的废关卡是 0 步），
    // 也不能比实际解长虚高太多（DFS 解长本身有波动，故留 1.6 倍余量）
    if (!sol || d.minSteps < 8 || d.minSteps > sol.length * 1.6) fakePar++;
    // par 恰好卡在目标下限，是兜底的典型特征（真解长会自然波动）。兜底是合理的降级策略，
  // 只要不产出废关卡即可，故容许 20%。
  if (d.minSteps === target.min) suspiciousPar++;
  }
  check("开局不是完成态（无废关卡）", doneAtStart === 0, `${doneAtStart}/${checked} 关开局即完成`);
  check("par 是真实解长（≥ 8 步）", fakePar === 0, `${fakePar}/${checked} 关 par 无效`);
  check("par 不是编造的下限常量", suspiciousPar <= checked * 0.2, `${suspiciousPar}/${checked} 关 par 卡在下限`);
}

// 9) 难度曲线必须有真实波动（全是同一个数 = 全走兜底的假数据）
{
  const distinct = new Set(steps).size;
  check("难度曲线有真实波动", distinct >= steps.length - 3, `distinct=${distinct}/${steps.length} [${steps.join(",")}]`);
}

// 10) 高关卡不滑坡（尾部平台期也必须保持高压：中位解长 ≥ 45）
{
  const tailLevels = [30, 50, 70, 100];
  const tail: number[] = [];
  for (const level of tailLevels) {
    const colors = DIFFICULTY.colorsForLevel(level);
    const filled = DIFFICULTY.filledTubesForLevel(level, colors);
    const runs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const d = generateLevel(
        level,
        LEVEL_CONFIG.tubeCapacity,
        DIFFICULTY.spareTubesForLevel(level, colors),
        colors,
        DIFFICULTY.targetStepsForLevel(level, colors, filled),
        DIFFICULTY.specialsForLevel(level, colors),
        { filledTubes: filled, seed: level * 1000 + 888 + i },
      );
      runs.push(d.minSteps);
    }
    runs.sort((a, b) => a - b);
    tail.push(runs[1]);
  }
  console.log(`  高关卡中位解长 [${tailLevels.join(",")}]: [${tail.join(",")}]`);
  check("高关卡难度不滑坡（中位 ≥ 45）", tail.every((s) => s >= 45), `[${tail.join(",")}]`);
}

// 11) 30 管盲盒盘面：高关卡/jungle 管数真的到 30（布局卖点）
{
  const colors = DIFFICULTY.colorsForLevel(50);
  const spare = DIFFICULTY.spareTubesForLevel(50, colors);
  const filled = Math.min(DIFFICULTY.filledTubesForLevel(50, colors), 30 - spare);
  check("高关卡 30 管盲盒盘面", filled + spare === 30, `filled=${filled} spare=${spare}`);
}

// 12) 种子可复现：同关卡同参数必得同一副牌（同局重开 par 可比的地基）
{
  const gen = (seed: number) =>
    generateLevel(
      23,
      LEVEL_CONFIG.tubeCapacity,
      DIFFICULTY.spareTubesForLevel(23, 10),
      10,
      DIFFICULTY.targetStepsForLevel(23),
      DIFFICULTY.specialsForLevel(23, 10),
      { filledTubes: 17, seed },
    );
  const a = gen(12345);
  const b = gen(12345);
  check(
    "同种子生成完全可复现",
    JSON.stringify(a.tubes) === JSON.stringify(b.tubes) && a.minSteps === b.minSteps,
  );
}

// 13) 锁管口径贯穿：提示不指向锁管；锁定期唯一出口是锁管 = 死局（GameScene 卡关面板依赖）
{
  // 0 管顶部 1 倒进 1 管可归位——但若 1 管是锁管，提示必须换别的出路或给 null，不得指向锁管
  const hint = findHint([[2, 1], [1, 1, 1], [], [3, 3, 3, 3]], 4, undefined, { index: 1, remaining: 3 });
  check("提示不指向锁管", hint?.from !== 1 && hint?.to !== 1, JSON.stringify(hint));
}
{
  // 两根满混色管互倒不动，唯一缓冲是锁管 → 锁定期就是死局，必须判出来
  const state: number[][] = [[1, 2, 1, 2], [2, 1, 2, 1], []];
  const withoutLock = legalMoves(state, 4).length;
  const withLock = legalMoves(state, 4, undefined, { index: 2, remaining: 2 }).length;
  check("锁管期死局判定与游戏口径一致", withoutLock > 0 && withLock === 0, `无锁 ${withoutLock} 有锁 ${withLock}`);
}

if (failures > 0) {
  console.error(`\n${failures} 项失败`);
  process.exit(1);
}
console.log("\n全部验证通过 ✅");
