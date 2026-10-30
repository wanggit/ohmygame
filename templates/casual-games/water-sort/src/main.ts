import Phaser from "phaser";
import { initBridge, loadProgress, track, showBannerSafe } from "./bridge";
import { UI, GAME_TITLE } from "./config";
import { GameScene, GAME_SCENE_KEY } from "./scene/GameScene";

// DoD：bridge.initialize() 先于游戏启动；失败时游戏照常运行（本地 safe default）。
async function boot(): Promise<void> {
  // 探针：Phaser 会吞掉 window error（转 game 事件），这里显式暴露
  window.addEventListener("error", (e) => {
    console.error("[probe] window error:", e.message, e.error instanceof Error ? e.error.stack : e.error);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[probe] unhandled rejection:", e.reason);
  });

  await initBridge();
  const progress = await loadProgress();

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
    scene: [GameScene],
  });

  game.scene.start(GAME_SCENE_KEY, { level: progress?.level ?? 1 });
  track("game_start", { title: GAME_TITLE });
  // banner 常驻底部（变现）：平台支持则展示，不支持静默跳过
  showBannerSafe();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      track("session_end");
      // mute-on-silent 落地：切后台/静默时不漏音（游戏在后台不该出声）
      game.sound.mute = true;
    } else {
      game.sound.mute = false;
    }
  });
}

void boot();
