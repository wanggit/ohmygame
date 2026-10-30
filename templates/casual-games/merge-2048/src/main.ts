import Phaser from "phaser";
import { initBridge, loadProgress, saveProgress, track, type Progress } from "./bridge";
import { UI, GAME_TITLE, EVENTS } from "./config";
import { GameScene, GAME_SCENE_KEY } from "./scene/GameScene";
import { LevelSelectScene, LEVEL_SELECT_KEY } from "./scene/LevelSelectScene";
import { loadLevels } from "./game/Levels";

// DoD：bridge.initialize() 先于游戏启动；失败时游戏照常运行（本地 safe default）。

/** 启动进度（boot() 加载后注入，BootScene.create 读取并跳转目标场景）。 */
let bootProgress: Progress;

/**
 * BootScene：Phaser 会 auto-start 场景数组的第一个 scene 且不带 data——
 * 用空 BootScene 接住 auto-start，再按 URL 分发到选关/关卡/无尽（data 干净传递）。
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "Boot" });
  }

  create(): void {
    const params = new URLSearchParams(location.search);
    const endless = params.has("endless");
    const urlLevel = Number(params.get("level") ?? 0);
    if (endless) {
      this.scene.start(GAME_SCENE_KEY, { mode: "endless", level: 1, progress: bootProgress });
    } else if (urlLevel > 0) {
      this.scene.start(GAME_SCENE_KEY, { mode: "levels", level: urlLevel, progress: bootProgress });
    } else {
      this.scene.start(LEVEL_SELECT_KEY, { progress: bootProgress });
    }
    // 调试探针（与 __creates/__level 同风格）：自动化验收脚本访问 Phaser 实例用
    (window as unknown as { __game?: Phaser.Game }).__game = this.game;
  }
}

async function boot(): Promise<void> {
  // 探针：Phaser 会吞掉 window error（转 game 事件），这里显式暴露
  window.addEventListener("error", (e) => {
    console.error("[probe] window error:", e.message, e.error instanceof Error ? e.error.stack : e.error);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[probe] unhandled rejection:", e.reason);
  });

  await initBridge();
  bootProgress = (await loadProgress()) ?? {
    level: 1,
    highScore: 0,
    bestTile: 0,
    gamesPlayed: 0,
    muted: false,
    stars: {},
  };
  await loadLevels();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: UI.background,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 720,
      height: 1280,
    },
    scene: [BootScene, LevelSelectScene, GameScene],
  });

  track(EVENTS.start, { title: GAME_TITLE });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) track(EVENTS.sessionEnd);
  });
}

void boot();

export type { Progress };
export { saveProgress };