// B1《Fruit Merge》验证脚本：2048 核心规则 + 数值/结束判定。
// 运行：bun scripts/verify.ts
import {
  move,
  spawnTile,
  isGameOver,
  hasWon,
  maxTile,
  emptyGrid,
  emptyCells,
  type Grid,
} from "../src/game/Board";
import { BOARD_SIZE, WIN_VALUE, FRUITS, fruitOf } from "../src/config";
import { targetForLevel, beamSearch, mulberry32 } from "../src/game/LevelGen";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`✓ ${name}`);
  else {
    failures++;
    console.error(`✗ ${name} ${detail}`);
  }
}

function row(values: number[]): Grid {
  const grid = emptyGrid(BOARD_SIZE);
  grid[0] = [...values];
  while (grid[0].length < BOARD_SIZE) grid[0].push(0);
  return grid;
}

// 1) 合并规则（经典 2048 语义）
{
  const res = move(row([2, 2, 4, 0]), "left");
  check("相邻同值合并", res.grid[0][0] === 4 && res.grid[0][1] === 4, JSON.stringify(res.grid[0]));
  check("新合并不二次合并（[2,2,4]→[4,4]非[8]）", res.scoreGain === 4, `gain=${res.scoreGain}`);
}
{
  const res = move(row([2, 2, 2, 2]), "left");
  check("[2,2,2,2]→[4,4]", res.grid[0][0] === 4 && res.grid[0][1] === 4, JSON.stringify(res.grid[0]));
}
{
  const res = move(row([4, 4, 2, 2]), "left");
  check("[4,4,2,2]→[8,4]", res.grid[0][0] === 8 && res.grid[0][1] === 4, JSON.stringify(res.grid[0]));
  check("双合并分数正确", res.scoreGain === 12, `gain=${res.scoreGain}`);
}
{
  const res = move(row([2, 4, 0, 0]), "right");
  check("右滑向右对齐", res.grid[0][2] === 2 && res.grid[0][3] === 4, JSON.stringify(res.grid[0]));
}
{
  const grid = emptyGrid(BOARD_SIZE);
  grid[0][0] = 2;
  grid[1][0] = 2;
  const res = move(grid, "up");
  check("上滑列合并", res.grid[0][0] === 4 && res.grid[1][0] === 0);
}
{
  const grid = emptyGrid(BOARD_SIZE);
  grid[0][0] = 2;
  grid[3][0] = 2;
  const res = move(grid, "down");
  check("下滑列合并到底", res.grid[3][0] === 4);
}
{
  const res = move(row([0, 2, 4, 8]), "left");
  check("压缩换位滑动 moved=true（仅换位）", res.moved === true && res.scoreGain === 0, JSON.stringify(res.grid[0]));
  check("无变化滑动 moved=false", move(row([2, 4, 8, 16]), "left").moved === false);
}
{
  const res = move(row([2, 2, 0, 0]), "left");
  check("合并动画轨迹记录", res.moves.length === 2 && res.merges.length === 1, `moves=${res.moves.length}`);
}

// 2) 生成与结束判定
{
  const grid = emptyGrid(BOARD_SIZE);
  const spawn = spawnTile(grid, () => 0.5);
  check("spawn 落在空位且值为 2/4", spawn !== null && (spawn.value === 2 || spawn.value === 4));
  check("spawn 后棋盘有 1 块", emptyCells(grid).length === BOARD_SIZE * BOARD_SIZE - 1);
}
{
  const full: Grid = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];
  check("满盘无空位 spawn=null", spawnTile(full, () => 0.5) === null);
  check("满盘无相邻同值 = 游戏结束", isGameOver(full));
  const fullButMergeable: Grid = [
    [2, 2, 4, 8],
    [4, 8, 2, 4],
    [8, 2, 4, 8],
    [2, 4, 8, 2],
  ];
  check("满盘有相邻同值 = 未结束", !isGameOver(fullButMergeable));
  check("有空位 = 未结束", !isGameOver(row([2, 4, 8, 0])));
}

// 2.5) 岩石规则（墙：分段滑动，不可越过/合并）
{
  const R = -1;
  const rockRow = [2, 2, R, 2];
  const res = move([rockRow, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left");
  check("岩石分段滑动（段内合并、不越过）", res.grid[0][0] === 4 && res.grid[0][2] === R && res.grid[0][3] === 2, JSON.stringify(res.grid[0]));
  const res2 = move([[2, 0, R, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "right");
  check("右滑岩石分段（各段独立对齐）", res2.grid[0][1] === 2 && res2.grid[0][3] === 2 && res2.grid[0][2] === R, JSON.stringify(res2.grid[0]));
  const full = [
    [2, 4, R, 8],
    [4, 8, R, 2],
    [8, 2, R, 4],
    [2, 4, R, 8],
  ];
  check("岩石不参与死局误判（无同值时=结束）", isGameOver(full));
}

// 2.6) 特殊格机制（双倍/冻结/传送）
{
  // 双倍格：合并落点在金格 = 分数×2
  const R2 = -1;
  void R2;
  const resD = move([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left", {
    doubleCells: new Set(["0,0"]),
  });
  check("双倍格合并分数×2", resD.scoreGain === 8, `gain=${resD.scoreGain}`);
  const resN = move([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left");
  check("普通格分数不变", resN.scoreGain === 4, `gain=${resN.scoreGain}`);

  // 冻结块：冻结期间是墙（不移动/不越过）；解冻后正常
  const resF = move([[2, 4, 8, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left", {
    frozen: new Map([["0,1", 3]]),
  });
  check("冻结块=墙（其后块不能越过）", resF.grid[0][0] === 2 && resF.grid[0][1] === 4 && resF.grid[0][2] === 8, JSON.stringify(resF.grid[0]));

  // 传送对：每步末互换其上的块（左滑压缩后 (0,0)=2,(0,1)=4 → 传送把 2 送到 (0,3)）
  const resP = move([[2, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "left", {
    portals: [{ fromR: 0, fromC: 0, toR: 0, toC: 3 }],
  });
  check("传送对互换其上的块", resP.grid[0][3] === 2 && resP.grid[0][1] === 4, JSON.stringify(resP.grid[0]));
}

// 3) 胜利与最大值
{
  const win: Grid = [
    [2048, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  check(`合并出 ${WIN_VALUE} 触发胜利`, hasWon(win, WIN_VALUE));
  check("maxTile 正确", maxTile(win) === 2048);
  check("未达目标未胜利", !hasWon(row([1024, 512, 0, 0]), WIN_VALUE));
}

// 4) 水果链完整
{
  const missing: number[] = [];
  for (let v = 2; v <= 4096; v *= 2) {
    if (!FRUITS[v]) missing.push(v);
  }
  check("水果链 2→4096 全覆盖", missing.length === 0, `missing=${missing.join(",")}`);
  check("2048 = Golden Crop", fruitOf(2048).name === "Golden Crop");
  check("未知值有兜底", fruitOf(65536).emoji.length > 0);
}

// 5) 关卡数据（pregen levels.json）：结构/可解性/时长质量线
{
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const levels = JSON.parse(readFileSync(join(import.meta.dir, "../public/levels.json"), "utf8")) as Array<{
    id: number;
    target: number;
    par: number;
    initial: number[][];
    spawnSeq: number[];
  }>;
  check("关卡数量 = 100", levels.length === 100);

  const targetsOk = levels.every((l) => l.target === targetForLevel(l.id));
  check("目标值爬升与难度模型一致", targetsOk);

  const structureOk = levels.every((l) => {
    const presetCount = l.initial.flat().filter((v) => v > 0).length;
    const sizeOk = l.initial.length === (l as { boardSize: number }).boardSize;
    return presetCount >= 2 && l.spawnSeq.length >= 300 && sizeOk;
  });
  check("head start/spawn/盘面尺寸结构正确（3×3/4×4/5×5）", structureOk);

  const sizeMix = new Set(levels.map((l) => (l as { boardSize: number }).boardSize));
  check("盘面尺寸混合（窄盘/标准/宽盘都有）", sizeMix.has(3) && sizeMix.has(4) && sizeMix.has(5), [...sizeMix].join(","));

  const rockLevels = levels.filter((l) => l.initial.flat().some((v) => v === -1));
  check("岩石关卡存在（墙机制上线）", rockLevels.length >= 4, `${rockLevels.length} 关`);

  const lv = levels as Array<{ doubleCells: number[][]; portals: number[][]; frozenStart: number[][] }>;
  const dblCount = lv.filter((l) => l.doubleCells.length > 0).length;
  const portalCount = lv.filter((l) => l.portals.length > 0).length;
  const frozenCount = lv.filter((l) => l.frozenStart.length > 0).length;
  const comboCount = lv.filter(
    (l) =>
      [l.doubleCells.length > 0, l.portals.length > 0, l.frozenStart.length > 0].filter(Boolean).length >= 2,
  ).length;
  check("双倍格多次出现（≥6 关）", dblCount >= 6, `${dblCount} 关`);
  check("传送格多次出现（≥4 关）", portalCount >= 4, `${portalCount} 关`);
  check("冰冻格多次出现（≥4 关）", frozenCount >= 4, `${frozenCount} 关`);
  check("机制组合关存在（≥2 关多机制同关）", comboCount >= 2, `${comboCount} 关`);

  // 时长质量线：par=标定×1.2 → beam 标定步数 ∈ [55, 280]（玩家 ≈ 4-18 分钟）
  const durationOk = levels.every((l) => {
    const calibSteps = l.par / 1.2;
    return calibSteps >= 55 && calibSteps <= 280;
  });
  check("关卡时长质量线（beam 标定 55-280 步 ≈ 玩家 4-18 分钟）", durationOk);

  const solvable = levels.filter((l) => {
    const lv = l as {
      placeSeq: number[];
      doubleCells: Array<[number, number]>;
      portals: Array<[number, number, number, number]>;
      frozenStart: Array<[number, number, number]>;
    };
    const opts = {
      doubleCells: new Set(lv.doubleCells.map(([r, c]) => `${r},${c}`)),
      portals: lv.portals.map(([fromR, fromC, toR, toC]) => ({ fromR, fromC, toR, toC })),
      frozenStart: lv.frozenStart,
    };
    return beamSearch(l.initial, l.spawnSeq, lv.placeSeq, l.target, 400, 4, opts) !== null;
  });
  check("100 关全部可达成（beam 同序列+同机制模拟）", solvable.length === 100, `${solvable.length}/100`);

  const early = levels.slice(0, 10).reduce((s, l) => s + l.par, 0) / 10;
  const late = levels.slice(90).reduce((s, l) => s + l.par, 0) / 10;
  check("难度曲线总体上升（前 10 vs 后 10 平均 par）", late > early, `early=${early.toFixed(1)} late=${late.toFixed(1)}`);
}

if (failures > 0) {
  console.error(`\n${failures} 项失败`);
  process.exit(1);
}
console.log("\n全部通过");