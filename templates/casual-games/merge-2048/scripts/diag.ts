// 一次性诊断：盘面尺寸 × 结构的 beam 标定表（A 棋盘变化选型用）
import { writeFileSync } from "node:fs";
import { calibrate } from "../src/game/LevelGen";
import type { Grid } from "../src/game/Board";

function board(size: number, placements: Array<[number, number, number]>): Grid {
  const g: Grid = Array.from({ length: size }, () => Array<number>(size).fill(0));
  for (const [r, c, v] of placements) g[r][c] = v;
  return g;
}

const out: string[] = [];
const cases: Array<{ name: string; size: number; target: number; cells: Array<[number, number, number]> }> = [
  { name: "3x3 t256 [64,64,32,32]", size: 3, target: 256, cells: [[0, 0, 64], [0, 2, 64], [1, 0, 32], [1, 2, 32]] },
  { name: "3x3 t256 [64,64]", size: 3, target: 256, cells: [[0, 0, 64], [2, 2, 64]] },
  { name: "3x3 t512 [128,128]", size: 3, target: 512, cells: [[0, 0, 128], [2, 2, 128]] },
  { name: "3x3 t512 [128,128,64]", size: 3, target: 512, cells: [[0, 0, 128], [0, 2, 128], [2, 1, 64]] },
  { name: "3x3 t1024 [256,256,128]", size: 3, target: 1024, cells: [[0, 0, 256], [0, 2, 256], [2, 1, 128]] },
];
for (const c of cases) {
  const cal = calibrate(board(c.size, c.cells), c.target, true);
  out.push(`${c.name} -> best=${cal?.best ?? "null"}`);
}
writeFileSync("/tmp/fm-diag.txt", out.join("\n"));
console.log("written");