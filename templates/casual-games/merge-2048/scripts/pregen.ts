// 关卡预生成：生成 100 关并写出 public/levels.json（游戏秒开 + 测试与运行数据一致）。
// 运行：bun scripts/pregen.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateLevel } from "../src/game/LevelGen";

const COUNT = 100;
const out: ReturnType<typeof generateLevel>[] = [];
const t0 = Date.now();

for (let i = 1; i <= COUNT; i++) {
  const level = generateLevel(i);
  out.push(level);
  console.log(
    `${i}/100 target=${level.target} par=${level.par} limit=${level.moveLimit} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}

const path = join(import.meta.dir, "../public/levels.json");
writeFileSync(path, JSON.stringify(out));
console.log(`✓ 已生成 ${COUNT} 关 → public/levels.json（${((Date.now() - t0) / 1000).toFixed(1)}s）`);