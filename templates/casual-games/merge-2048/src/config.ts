export const GAME_TITLE = "Fruit Merge: 2048 Harvest";

export const BOARD_SIZE = 4;
export const WIN_VALUE = 2048;

export const UI = {
  background: 0x2f7dbd, // 天空蓝
  field: 0x6cbf4a, // 田地绿
  tileBase: 0xfff6e6, // 木格奶油底
  tileEdge: 0xd9a86c,
  accent: 0xffb703, // 阳光橙
  hudText: "#ffffff",
  font: "Arial Rounded MT Bold, Arial, sans-serif",
} as const;

/** 水果链：值 → sprite 纹理 key + emoji（emoji 仅作降级/调试用）+ 底色（2048 = Golden Crop 收获目标）。 */
export const FRUITS: Record<number, { emoji: string; tex: string; bg: number; name: string }> = {
  2: { emoji: "🍒", tex: "f2", bg: 0xffd9d9, name: "Cherry" },
  4: { emoji: "🍋", tex: "f4", bg: 0xfff3b0, name: "Lemon" },
  8: { emoji: "🍊", tex: "f8", bg: 0xffd199, name: "Orange" },
  16: { emoji: "🍎", tex: "f16", bg: 0xffb3b3, name: "Apple" },
  32: { emoji: "🍑", tex: "f32", bg: 0xffd6b0, name: "Peach" },
  64: { emoji: "🥝", tex: "f64", bg: 0xd7f0c2, name: "Kiwi" },
  128: { emoji: "🍇", tex: "f128", bg: 0xd9c2f0, name: "Grape" },
  256: { emoji: "🍉", tex: "f256", bg: 0xffbdbd, name: "Melon" },
  512: { emoji: "🍍", tex: "f512", bg: 0xffe699, name: "Pineapple" },
  1024: { emoji: "🍓", tex: "f1024", bg: 0xffc2c2, name: "Strawberry" },
  2048: { emoji: "🏆", tex: "f2048", bg: 0xffe08a, name: "Golden Crop" },
  4096: { emoji: "👑", tex: "f4096", bg: 0xfff0b3, name: "Crown Harvest" },
  8192: { emoji: "🌟", tex: "f8192", bg: 0xfff6cc, name: "Star Harvest" },
};

export function fruitOf(value: number): { emoji: string; tex: string; bg: number; name: string } {
  return FRUITS[value] ?? FRUITS[8192];
}

/**
 * 精灵图资源（Twemoji 15.1.0，CC-BY 4.0，署名见 CREDITS.md）。
 * 替换系统 emoji：跨平台渲染统一（Windows/Android 不再走各自的 emoji 字体）。
 */
export const SPRITES: Record<string, string> = {
  f2: "sprites/1f352.png", // cherry
  f4: "sprites/1f34b.png", // lemon
  f8: "sprites/1f34a.png", // tangerine
  f16: "sprites/1f34e.png", // red apple
  f32: "sprites/1f351.png", // peach
  f64: "sprites/1f95d.png", // kiwi
  f128: "sprites/1f347.png", // grapes
  f256: "sprites/1f349.png", // watermelon
  f512: "sprites/1f34d.png", // pineapple
  f1024: "sprites/1f353.png", // strawberry
  f2048: "sprites/1f3c6.png", // trophy
  f4096: "sprites/1f451.png", // crown
  f8192: "sprites/1f31f.png", // glowing star
  rock: "sprites/1faa8.png", // 岩石墙
  ice: "sprites/2744.png", // 冰冻格
  portal: "sprites/1f300.png", // 传送格
  uiHint: "sprites/1f4a1.png", // 💡 hint 按钮
  uiSoundOn: "sprites/1f50a.png", // 🔊
  uiSoundOff: "sprites/1f507.png", // 🔇
};

/** 布局（720×1280 竖屏）。 */
export const LAYOUT = {
  hudY: 110,
  scoreCardY: 240,
  boardTop: 412, // TARGET 面板下沿 404 + 8px 间距（修复面板被棋盘遮挡）
  boardPad: 28,
  tileGap: 16,
  boardWidth: 640,
} as const;

export function tileSize(size: number): number {
  return (LAYOUT.boardWidth - LAYOUT.boardPad * 2 - LAYOUT.tileGap * (size - 1)) / size;
}

/** 音效（Mixkit Free License，商用免署名；来源记录见 CREDITS.md）。 */
export const AUDIO = {
  merge: "audio/merge-pop.mp3",
  swipe: "audio/swipe.mp3",
  win: "audio/win-jingle.mp3",
  over: "audio/game-over.mp3",
} as const;

/**
 * 事件埋点约定（与 bridge.track 对齐）。
 * 变现漏斗：ad_impression → ad_reward_granted；卡点漏斗：level_start → level_complete / level_fail。
 */
export const EVENTS = {
  start: "game_start",
  levelStart: "level_start",
  over: "game_over",
  win: "level_complete",
  fail: "level_fail",
  undoReward: "revive_rewarded",
  adImpression: "ad_impression",
  adReward: "ad_reward_granted",
  hintUsed: "hint_used",
  sessionEnd: "session_end",
} as const;