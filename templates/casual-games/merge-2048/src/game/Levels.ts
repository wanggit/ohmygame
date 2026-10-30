// 内置关卡数据（pregen.ts 预生成 → public/levels.json；失败时回退动态生成）。
import type { LevelData } from "./LevelGen";
import { generateLevel } from "./LevelGen";

let levels: LevelData[] | null = null;

export async function loadLevels(): Promise<void> {
  if (levels) return;
  try {
    const res = await fetch("levels.json");
    if (res.ok) {
      levels = (await res.json()) as LevelData[];
      return;
    }
  } catch {
    /* 离线/文件缺失回退动态生成 */
  }
  levels = Array.from({ length: 100 }, (_, i) => generateLevel(i + 1));
}

export function getLevel(id: number): LevelData {
  if (!levels) throw new Error("levels not loaded");
  return levels[Math.min(Math.max(1, id), levels.length) - 1];
}

export function levelCount(): number {
  return levels?.length ?? 100;
}