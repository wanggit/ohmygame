import Phaser from "phaser";
import {
  type Grid,
  type Dir,
  type MoveResult,
  emptyGrid,
  emptyCells,
  move,
  spawnTile,
  isGameOver,
  hasWon,
  maxTile,
  ROCK,
} from "../game/Board";
import { WIN_VALUE, UI, LAYOUT, tileSize, fruitOf, EVENTS, GAME_TITLE, AUDIO, SPRITES } from "../config";
import { saveProgress, showRewarded, showInterstitial, showBanner, track, type Progress } from "../bridge";
import { getLevel, levelCount } from "../game/Levels";
import { type LevelData, bestGreedyMove } from "../game/LevelGen";
import { LEVEL_SELECT_KEY } from "./LevelSelectScene";

export const GAME_SCENE_KEY = "Game";

interface SceneData {
  mode: "levels" | "endless";
  level: number;
  progress: Progress;
}

export class GameScene extends Phaser.Scene {
  private grid: Grid = emptyGrid(4);
  private boardSize = 4;
  private frozen = new Map<string, number>();
  private doubleCells = new Set<string>();
  private portals: Array<{ fromR: number; fromC: number; toR: number; toC: number }> = [];
  private score = 0;
  private best = 0;
  private bestTile = 0;
  private gamesPlayed = 0;
  private winCelebrated = false;
  private busy = false;
  private state: "playing" | "clear" | "fail" | "over" = "playing";
  private data_!: SceneData;

  private tileLayer!: Phaser.GameObjects.Container;
  private tileViews = new Map<string, Phaser.GameObjects.Container>();
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private goalIcon!: Phaser.GameObjects.Image;
  private muted = false;
  private muteBtn!: Phaser.GameObjects.Image;
  private mode: "levels" | "endless" = "levels";
  private level = 1;
  private levelData: LevelData | null = null;
  private spawnPtr = 0;
  private movesUsed = 0;
  private movesLeftText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  // 变现状态：hint 每关免费 1 次（之后看广告）；续命每关限 1 次
  private hintFreeUsed = false;
  private adRevived = false;
  private hintBtn!: Phaser.GameObjects.Text;
  /** 当前提示横幅（同屏仅一条，新提示替换旧的）。 */
  private bannerView: Phaser.GameObjects.Container | null = null;
  /** 各关星级（关卡 id → 1-3），与 Progress.stars 同构。 */
  private stars: Record<number, number> = {};

  constructor() {
    super({ key: GAME_SCENE_KEY });
  }

  preload(): void {
    this.load.audio("merge", AUDIO.merge);
    this.load.audio("swipe", AUDIO.swipe);
    this.load.audio("win", AUDIO.win);
    this.load.audio("over", AUDIO.over);
    // 水果/机制精灵图（Twemoji，跨平台渲染统一）
    for (const [key, url] of Object.entries(SPRITES)) this.load.image(key, url);
  }

  init(data: SceneData): void {
    this.data_ = data;
    this.mode = data.mode;
    this.level = data.level;
    this.score = 0;
    this.best = data.progress.highScore;
    this.bestTile = data.progress.bestTile;
    this.gamesPlayed = data.progress.gamesPlayed;
    this.muted = data.progress.muted ?? false;
    this.stars = { ...(data.progress.stars ?? {}) };
    this.winCelebrated = false;
    this.busy = false;
    this.state = "playing";
    this.spawnPtr = 0;
    this.movesUsed = 0;
  }

  create(): void {
    const w = window as unknown as { __creates?: number };
    w.__creates = (w.__creates ?? 0) + 1;
    this.drawScene();
    this.tileLayer = this.add.container(0, 0).setDepth(10);
    this.drawHud();
    this.newGame();
    this.bindInput();
    // banner 常驻底部（本地/无平台时 no-op；棋盘底 ~1020px，banner 不遮挡）
    showBanner("bottom");
    // mute-on-silent：页面隐藏即静音（Playgama checklist 要求）
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.sound.pauseAll();
      else if (!this.muted) this.sound.resumeAll();
    });
  }

  // ---------- 音效（sound.add 预建；sound.play() 返回值不可靠——A1 踩坑） ----------

  private playSfx(key: string, rate = 1, volume = 1): void {
    if (this.muted) return;
    try {
      const s = this.sound.add(key, { rate, volume }) as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;
      s.once("complete", () => s.destroy());
      s.play();
    } catch {
      /* 音频不可用不影响玩法 */
    }
  }

  /** 合并音调随合并值升高（越大越"贵重"的手感）。 */
  private playMerge(value: number): void {
    const rate = 1 + Math.log2(Math.max(2, value) / 2) * 0.07;
    this.playSfx("merge", Math.min(rate, 2), 0.9);
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    if (this.muted) this.sound.pauseAll();
    else this.sound.resumeAll();
    this.muteBtn.setTexture(this.muted ? "uiSoundOff" : "uiSoundOn");
    this.persist();
  }

  // ---------- 场景绘制（果园美术焕新） ----------

  private drawScene(): void {
    const g = this.add.graphics();
    g.fillStyle(UI.background, 1);
    g.fillRect(0, 0, 720, 1280);
    g.fillStyle(0xffffff, 0.85);
    for (const [x, y, s] of [
      [110, 300, 1],
      [560, 220, 0.8],
      [420, 460, 0.6],
    ] as const) {
      g.fillCircle(x, y, 42 * s);
      g.fillCircle(x + 48 * s, y + 8 * s, 34 * s);
      g.fillCircle(x - 46 * s, y + 10 * s, 30 * s);
    }
    g.fillStyle(UI.field, 1);
    g.fillRect(0, 620, 720, 660);
    g.fillStyle(0x58a63c, 1);
    for (let i = 0; i < 5; i++) {
      g.fillRoundedRect(60, 900 + i * 84, 600, 26, 13);
    }
    g.fillStyle(0xf2e2c2, 1);
    g.fillRect(0, 1236, 720, 16);
    for (let x = 40; x < 720; x += 90) {
      g.fillRoundedRect(x, 1204, 24, 56, 8);
    }
  }

  private boardGfx: Phaser.GameObjects.Graphics | null = null;

  private drawBoard(): void {
    this.boardGfx?.destroy();
    const g = this.add.graphics().setDepth(5);
    this.boardGfx = g;
    g.fillStyle(UI.tileEdge, 1);
    g.fillRoundedRect((720 - LAYOUT.boardWidth) / 2, LAYOUT.boardTop, LAYOUT.boardWidth, LAYOUT.boardWidth, 28);
    const ts = tileSize(this.boardSize);
    g.fillStyle(0xf7e8cc, 1);
    for (let r = 0; r < this.boardSize; r++) {
      for (let c = 0; c < this.boardSize; c++) {
        const { x, y } = this.boardXY(r, c);
        const key = `${r},${c}`;
        if (this.doubleCells.has(key)) {
          g.fillStyle(0xffd766, 1); // 双倍格：金底
        } else if (this.portals.some((p) => (p.fromR === r && p.fromC === c) || (p.toR === r && p.toC === c))) {
          g.fillStyle(0xc9a6f0, 1); // 传送格：紫底
        } else {
          g.fillStyle(0xf7e8cc, 1);
        }
        g.fillRoundedRect(x - ts / 2 + 6, y - ts / 2 + 6, ts - 12, ts - 12, 18);
      }
    }
    // 双倍格 ★ 标记 + 传送门环
    for (const [r, c] of this.levelData?.doubleCells ?? []) {
      const { x, y } = this.boardXY(r, c);
      const star = this.add.text(x, y, "★", { fontSize: `${ts * 0.42}px`, color: "#b26a00" }).setOrigin(0.5).setDepth(6);
      star.setAlpha(0.55);
    }
    for (const p of this.portals) {
      for (const [pr, pc] of [
        [p.fromR, p.fromC],
        [p.toR, p.toC],
      ] as const) {
        const { x, y } = this.boardXY(pr, pc);
        const ring = this.add.graphics().setDepth(6);
        ring.lineStyle(5, 0x7c3aed, 1);
        ring.strokeCircle(x, y, ts * 0.32);
        ring.lineStyle(3, 0xa78bfa, 1);
        ring.strokeCircle(x, y, ts * 0.2);
      }
    }
  }

  private drawHud(): void {
    this.add
      .text(360, LAYOUT.hudY, "FRUIT MERGE", {
        fontFamily: UI.font,
        fontSize: "72px",
        color: "#ffffff",
        stroke: "#1c5c8c",
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    const card = this.add.graphics();
    card.fillStyle(0x1c5c8c, 0.85);
    card.fillRoundedRect(60, LAYOUT.scoreCardY - 52, 280, 120, 22);
    card.fillRoundedRect(380, LAYOUT.scoreCardY - 52, 280, 120, 22);
    this.add
      .text(200, LAYOUT.scoreCardY - 30, "SCORE", { fontFamily: UI.font, fontSize: "28px", color: "#bfe4ff" })
      .setOrigin(0.5);
    this.scoreText = this.add
      .text(200, LAYOUT.scoreCardY + 22, "0", { fontFamily: UI.font, fontSize: "44px", color: "#ffffff" })
      .setOrigin(0.5);
    this.add
      .text(520, LAYOUT.scoreCardY - 30, "BEST", { fontFamily: UI.font, fontSize: "28px", color: "#bfe4ff" })
      .setOrigin(0.5);
    this.bestText = this.add
      .text(520, LAYOUT.scoreCardY + 22, "0", { fontFamily: UI.font, fontSize: "44px", color: "#ffffff" })
      .setOrigin(0.5);

    this.muteBtn = this.add
      .image(668, LAYOUT.hudY - 32, this.muted ? "uiSoundOff" : "uiSoundOn")
      .setDisplaySize(56, 56)
      .setInteractive({ useHandCursor: true });
    this.muteBtn.on("pointerdown", () => this.toggleMute());

    // MENU 按钮（☰ 文本符号，跨平台一致）：返回关卡选择
    const menuBtn = this.add
      .text(52, LAYOUT.hudY - 32, "☰", {
        fontFamily: UI.font,
        fontSize: "52px",
        color: "#ffffff",
        stroke: "#1c5c8c",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerdown", () => this.backToLevelSelect());

    // HINT 按钮（底板 + 图标 + 文案；棋盘下方拇指黄金位，banner 之上）：每关免费 1 次，之后看激励视频
    const hintBg = this.add.graphics();
    hintBg.fillStyle(0xffd766, 1);
    hintBg.fillRoundedRect(210, 1061, 300, 66, 16);
    hintBg.lineStyle(4, 0xb26a00, 1);
    hintBg.strokeRoundedRect(210, 1061, 300, 66, 16);
    hintBg.setInteractive(
      new Phaser.Geom.Rectangle(210, 1061, 300, 66),
      Phaser.Geom.Rectangle.Contains,
    );
    hintBg.on("pointerdown", () => this.useHint());
    this.add.image(272, 1094, "uiHint").setDisplaySize(46, 46);
    this.hintBtn = this.add
      .text(392, 1094, "HINT", {
        fontFamily: UI.font,
        fontSize: "34px",
        color: "#4a2c00",
      })
      .setOrigin(0.5);

    // TARGET 大面板（明确目标：大 emoji + 大数字；Boss 关带徽章）
    const infoY = LAYOUT.scoreCardY + 112;
    const infoBg = this.add.graphics();
    infoBg.fillStyle(0xffb703, 0.95);
    infoBg.fillRoundedRect(70, infoY - 52, 580, 104, 22);
    infoBg.lineStyle(4, 0xb26a00, 1);
    infoBg.strokeRoundedRect(70, infoY - 52, 580, 104, 22);
    this.goalIcon = this.add.image(196, infoY, "f512").setDisplaySize(72, 72);
    this.goalText = this.add.text(300, infoY, "", { fontFamily: UI.font, fontSize: "56px", color: "#5c2e00" }).setOrigin(0.5);
    this.movesLeftText = this.add
      .text(630, infoY, "", { fontFamily: UI.font, fontSize: "30px", color: "#5c2e00" })
      .setOrigin(1, 0.5);
    this.add
      .text(360, infoY - 78, "TARGET", { fontFamily: UI.font, fontSize: "26px", color: "#ffffff", stroke: "#b26a00", strokeThickness: 6 })
      .setOrigin(0.5);
  }

  private boardXY(r: number, c: number): { x: number; y: number } {
    const ts = tileSize(this.boardSize);
    return {
      x: (720 - LAYOUT.boardWidth) / 2 + LAYOUT.boardPad + c * (ts + LAYOUT.tileGap) + ts / 2,
      y: LAYOUT.boardTop + LAYOUT.boardPad + r * (ts + LAYOUT.tileGap) + ts / 2,
    };
  }

  // ---------- 棋盘渲染 ----------

  private renderTiles(popKeys: Set<string> = new Set(), spawnKey = ""): void {
    this.tileLayer.removeAll(true);
    this.tileViews.clear();
    const ts = tileSize(this.boardSize);
    for (let r = 0; r < this.boardSize; r++) {
      for (let c = 0; c < this.boardSize; c++) {
        const value = this.grid[r][c];
        if (value === 0) continue;
        const { x, y } = this.boardXY(r, c);
        if (value === ROCK) {
          // 岩石（墙）：底衬 + 石块精灵
          const view = this.add.container(x, y);
          const plate = this.add.graphics();
          plate.fillStyle(0x8d8d9e, 0.3);
          plate.fillRoundedRect(-ts / 2 + 6, -ts / 2 + 6, ts - 12, ts - 12, 18);
          view.add(plate);
          view.add(this.add.image(0, 0, "rock").setDisplaySize(ts * 0.76, ts * 0.76));
          this.tileLayer.add(view);
          continue;
        }
        const fruit = fruitOf(value);
        const view = this.add.container(x, y);
        const bg = this.add.graphics();
        bg.fillStyle(fruit.bg, 1);
        bg.fillRoundedRect(-ts / 2 + 6, -ts / 2 + 6, ts - 12, ts - 12, 18);
        view.add(bg);
        const icon = this.add
          .image(0, value >= 128 ? -ts * 0.07 : 0, fruit.tex)
          .setDisplaySize(ts * 0.62, ts * 0.62);
        view.add(icon);
        if (value >= 128) {
          const label = this.add
            .text(0, ts / 2 - 32, String(value), { fontFamily: UI.font, fontSize: "22px", color: "#7a4a12" })
            .setOrigin(0.5);
          view.add(label);
        }
        this.tileLayer.add(view);
        this.tileViews.set(`${r},${c}`, view);

        const key = `${r},${c}`;
        if (this.frozen.has(key)) {
          // 冰壳覆盖（冻结块：临时墙）
          const ice = this.add.graphics();
          ice.fillStyle(0x9fd8ff, 0.55);
          ice.fillRoundedRect(-ts / 2 + 4, -ts / 2 + 4, ts - 8, ts - 8, 16);
          ice.lineStyle(3, 0x5bb8ff, 0.9);
          ice.strokeRoundedRect(-ts / 2 + 4, -ts / 2 + 4, ts - 8, ts - 8, 16);
          view.add(ice);
          const left = this.frozen.get(key) ?? 0;
          view.add(
            this.add
              .text(0, -ts / 2 + 22, `❄ ${left}`, { fontFamily: UI.font, fontSize: "20px", color: "#0b4f80" })
              .setOrigin(0.5),
          );
        }
        if (popKeys.has(key)) {
          view.setScale(0.55);
          this.tweens.add({ targets: view, scale: 1, duration: 180, ease: "Back.easeOut" });
          this.juiceBurst(x, y, fruit.bg);
        } else if (spawnKey === key) {
          view.setScale(0.1);
          this.tweens.add({ targets: view, scale: 1, duration: 220, ease: "Back.easeOut" });
        }
      }
    }
  }

  /** 果汁飞溅粒子（自写池：Phaser 粒子 Canvas 渲染器不出粒子）。 */
  private juiceBurst(x: number, y: number, color: number): void {
    for (let i = 0; i < 10; i++) {
      const p = this.add.circle(x, y, 6 + Math.random() * 6, color).setDepth(30);
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 90;
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 360 + Math.random() * 220,
        ease: "Cubic.easeOut",
        onComplete: () => p.destroy(),
      });
    }
  }

  // ---------- 游戏流程 ----------

  private newGame(): void {
    this.state = "playing";
    this.hintFreeUsed = false;
    this.adRevived = false;
    this.hintBtn.setText("HINT");
    if (this.mode === "levels") {
      this.levelData = getLevel(this.level);
      this.boardSize = this.levelData.boardSize;
      this.grid = this.levelData.initial.map((row) => [...row]);
      this.spawnPtr = 0;
      this.movesUsed = 0;
      // 特殊格状态（确定性：来自关卡数据）
      this.frozen = new Map(this.levelData.frozenStart.map(([r, c, s]) => [`${r},${c}`, s]));
      this.doubleCells = new Set(this.levelData.doubleCells.map(([r, c]) => `${r},${c}`));
      this.portals = this.levelData.portals.map(([fromR, fromC, toR, toC]) => ({ fromR, fromC, toR, toC }));
      // 卡点漏斗：level_start 带 target/par，用于统计各关流失与难度曲线
      track(EVENTS.levelStart, {
        level: this.level,
        target: this.levelData.target,
        par: this.levelData.par,
        boardSize: this.boardSize,
      });
    } else {
      this.levelData = null;
      this.boardSize = 4;
      this.grid = emptyGrid(this.boardSize);
      this.frozen = new Map();
      this.doubleCells = new Set();
      this.portals = [];
      spawnTile(this.grid);
      spawnTile(this.grid);
    }
    this.drawBoard();
    this.score = 0;
    this.winCelebrated = false;
    this.updateHud();
    this.renderTiles(new Set());
    this.showMechanicHints();
  }

  /** 机制教学：新机制首次出现显示提示横幅（机制教学准则）。 */
  private showMechanicHints(): void {
    const hints: string[] = [];
    if (this.levelData && this.levelData.initial.flat().some((v) => v === -1)) {
      hints.push("ROCKS — walls that tiles can never move through!");
    }
    if (this.doubleCells.size > 0) {
      hints.push("GOLD CELLS — DOUBLE your score when you merge on them!");
    }
    if (this.frozen.size > 0) {
      hints.push("FROZEN TILES — walls until the ice melts!");
    }
    if (this.portals.length > 0) {
      hints.push("PORTALS — swap their tiles after every move!");
    }
    if (this.boardSize === 3) {
      hints.push("MINI BOARD — space is tight, plan every move!");
    }
    if (hints.length === 0) return;
    this.flashBanner(hints);
  }

  /** 通用提示横幅（机制教学 / hint 方向提示共用；同屏仅保留一条）。 */
  private flashBanner(lines: string[]): void {
    this.bannerView?.destroy(); // 新提示替换旧提示，避免叠加
    const banner = this.add.container(360, 250).setDepth(100);
    const bg = this.add.graphics();
    bg.fillStyle(0x120b26, 0.92);
    bg.fillRoundedRect(-320, -70, 640, 140, 22);
    bg.lineStyle(4, UI.accent, 1);
    bg.strokeRoundedRect(-320, -70, 640, 140, 22);
    banner.add(bg);
    const text = this.add
      .text(0, 0, lines.join("\n"), {
        fontFamily: UI.font,
        fontSize: lines.length > 1 ? "25px" : "29px",
        color: "#f2ecff",
        align: "center",
        wordWrap: { width: 580 },
      })
      .setOrigin(0.5);
    banner.add(text);
    banner.setAlpha(0);
    this.bannerView = banner;
    this.tweens.add({ targets: banner, alpha: 1, duration: 250 });
    this.tweens.add({
      targets: banner,
      alpha: 0,
      delay: 3600,
      duration: 400,
      onComplete: () => {
        banner.destroy();
        if (this.bannerView === banner) this.bannerView = null;
      },
    });
  }

  // ---------- 变现钩子（P0）：hint / 续命激励视频 / 过关插屏 ----------

  /** hint 入口：每关免费 1 次，之后看激励视频（beam 贪心一步 = 最优方向提示）。 */
  private useHint(): void {
    if (this.busy || this.state !== "playing") return;
    if (!this.hintFreeUsed) {
      this.hintFreeUsed = true;
      this.hintBtn.setText("HINT ▶ AD"); // 免费用完，后续需看广告
      this.showHintArrow();
      return;
    }
    void (async () => {
      track(EVENTS.adImpression, { placement: "hint", level: this.level });
      const rewarded = await showRewarded("hint");
      if (rewarded) {
        track(EVENTS.adReward, { placement: "hint", level: this.level });
        this.showHintArrow();
      }
    })();
  }

  private showHintArrow(): void {
    const dir = bestGreedyMove(this.grid, {
      frozen: this.frozen,
      doubleCells: this.doubleCells,
      portals: this.portals,
    });
    if (dir === null) return;
    track(EVENTS.hintUsed, { level: this.level, dir });
    const arrow = { left: "⬅", right: "➡", up: "⬆", down: "⬇" }[dir];
    this.flashBanner([`${arrow} Try swiping ${dir.toUpperCase()}!`]);
  }

  /** 失败续命（rewarded）：每关限 1 次——看广告换取"洗牌救命"。返回是否续命成功。 */
  private async tryAdRevive(): Promise<boolean> {
    if (this.state !== "fail" || this.adRevived) return false;
    track(EVENTS.adImpression, { placement: "continue", level: this.level });
    const rewarded = await showRewarded("continue");
    if (!rewarded || this.state !== "fail") return false;
    this.adRevived = true;
    track(EVENTS.adReward, { placement: "continue", level: this.level });
    track(EVENTS.undoReward, { level: this.level });
    this.reviveShuffle();
    return true;
  }

  /**
   * 洗牌救命（DESIGN.md 的 shuffle 钩子落地）：保留块值重新排布 + 移除最小 2 块腾空间 + 解冻。
   * 岩石格不动（盘面机制不变）；重排避开岩石格，回到 playing 状态。
   */
  private reviveShuffle(): void {
    const size = this.boardSize;
    const values: number[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const v = this.grid[r][c];
        if (v > 0) values.push(v);
      }
    }
    // 移除最小的 2 块（救命的核心：腾出空间），再 Fisher-Yates 洗牌
    values.sort((a, b) => a - b);
    values.splice(0, Math.min(2, values.length));
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    // 写回：岩石保留、冻结解除（续命福利）、其余按洗牌序填充
    this.frozen.clear();
    let k = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.grid[r][c] === ROCK) continue;
        this.grid[r][c] = k < values.length ? values[k++] : 0;
      }
    }
    this.state = "playing";
    this.drawBoard();
    this.renderTiles(new Set());
    this.updateHud();
    this.flashBanner(["🌱 Second chance — the harvest lives on!"]);
  }

  private updateHud(): void {
    (window as unknown as { __level?: number }).__level = this.level;
    this.scoreText.setText(String(this.score));
    this.bestText.setText(String(this.best));
    if (this.mode === "levels" && this.levelData) {
      const goal = fruitOf(this.levelData.target);
      const boss = this.level % 10 === 0 && this.boardSize === 4 ? "BOSS · " : "";
      const mini = this.boardSize === 3 ? "MINI · " : this.boardSize === 5 ? "WIDE · " : "";
      this.goalIcon.setTexture(goal.tex).setVisible(true);
      this.goalText.setText(String(this.levelData.target));
      this.movesLeftText.setText(`${mini}${boss}L${this.level} · ${this.movesUsed}`);
    } else {
      this.goalIcon.setVisible(false);
      this.goalText.setText("∞");
      this.movesLeftText.setText(`ENDLESS · ${this.movesUsed}`);
    }
  }

  private tryMove(dir: Dir): void {
    if (this.busy || this.state !== "playing") return; // 弹窗期间锁输入：否则每滑重复触发过关判定
    const res: MoveResult = move(this.grid, dir, {
      frozen: this.frozen,
      doubleCells: this.doubleCells,
      portals: this.portals,
    });
    if (!res.moved) {
      if (isGameOver(this.grid)) this.gameOver();
      return;
    }
    this.busy = true;
    this.playSfx("swipe", 1, 0.45);

    const pending = res.moves.length;
    let done = 0;
    const finish = (): void => {
      done++;
      if (done < pending) return;
      this.grid = res.grid;
      this.score += res.scoreGain;
      if (this.score > this.best) this.best = this.score;
      this.movesUsed++;
      // 冻结递减（每步 -1，<=0 解冻）
      for (const [k, v] of this.frozen) {
        if (v <= 1) this.frozen.delete(k);
        else this.frozen.set(k, v - 1);
      }
      const popKeys = new Set(res.merges.map((m) => `${m.r},${m.c}`));
      if (res.merges.length > 0) {
        this.playMerge(Math.max(...res.merges.map((m) => m.value)));
      }
      // spawn：关卡模式消费固定序列（值 + 落位与标定一致 = 可达性闭环），无尽模式随机
      const cells = emptyCells(this.grid);
      if (cells.length > 0) {
        if (this.levelData && this.spawnPtr < this.levelData.spawnSeq.length) {
          const value = this.levelData.spawnSeq[this.spawnPtr];
          const place = this.levelData.placeSeq[this.spawnPtr];
          this.spawnPtr++;
          const cell = cells[place % cells.length];
          this.grid[cell.r][cell.c] = value;
          this.renderTiles(popKeys, `${cell.r},${cell.c}`);
        } else if (this.levelData) {
          this.renderTiles(popKeys);
        } else {
          const spawned = spawnTile(this.grid);
          this.renderTiles(popKeys, spawned ? `${spawned.r},${spawned.c}` : "");
        }
      } else {
        this.renderTiles(popKeys);
      }
      this.updateHud();
      this.busy = false;

      // 关卡模式：过关 / 失败判定（无步数限制；失败=死局）
      if (this.mode === "levels" && this.levelData) {
        if (maxTile(this.grid) >= this.levelData.target) {
          this.levelComplete();
          return;
        }
        if (isGameOver(this.grid)) {
          this.levelFail();
          return;
        }
      } else if (!this.winCelebrated && hasWon(this.grid, WIN_VALUE)) {
        this.winCelebrated = true;
        this.celebrateWin();
      } else if (isGameOver(this.grid)) {
        this.gameOver();
      }
      this.persist();
    };

    if (pending === 0) {
      finish();
      return;
    }
    for (const mv of res.moves) {
      const view = this.tileViews.get(`${mv.fromR},${mv.fromC}`);
      const to = this.boardXY(mv.toR, mv.toC);
      if (!view) {
        finish();
        continue;
      }
      this.tweens.add({
        targets: view,
        x: to.x,
        y: to.y,
        duration: 120,
        ease: "Cubic.easeOut",
        onComplete: finish,
      });
    }
  }

  /** 关卡完成：星级按步数 vs par 评定（≤par=3 星；≤par×1.4=2 星；其余 1 星）。 */
  private levelComplete(): void {
    if (this.state !== "playing") return;
    this.state = "clear";
    const w = window as unknown as { __clears?: number };
    w.__clears = (w.__clears ?? 0) + 1;
    const d = this.levelData!;
    const stars = this.movesUsed <= d.par ? 3 : this.movesUsed <= d.par * 1.4 ? 2 : 1;
    track(EVENTS.win, { level: this.level, moves: this.movesUsed, stars });
    this.playSfx("win", 1, 0.8);
    // 星级入档（取历史最高；此时 this.level 仍是本关 id）
    this.stars[this.level] = Math.max(this.stars[this.level] ?? 0, stars);

    this.level = Math.min(this.level + 1, levelCount());
    this.persist();

    const overlay = this.add.container(360, 640).setDepth(70);
    const bg = this.add.graphics();
    bg.fillStyle(0x12324d, 0.94);
    bg.fillRoundedRect(-280, -240, 560, 480, 28);
    bg.lineStyle(5, UI.accent, 1);
    bg.strokeRoundedRect(-280, -240, 560, 480, 28);
    overlay.add(bg);
    overlay.add(
      this.add.text(0, -160, "LEVEL CLEAR!", { fontFamily: UI.font, fontSize: "52px", color: "#ffd766" }).setOrigin(0.5),
    );
    overlay.add(
      this.add
        .text(0, -70, "★".repeat(stars) + "☆".repeat(3 - stars), { fontSize: "72px", color: "#ffd766" })
        .setOrigin(0.5),
    );
    overlay.add(
      this.add
        .text(0, 20, `Moves ${this.movesUsed}  ·  Par ${d.par}`, { fontFamily: UI.font, fontSize: "30px", color: "#bfe4ff" })
        .setOrigin(0.5),
    );
    const btn = this.add
      .text(0, 130, "NEXT LEVEL", {
        fontFamily: UI.font,
        fontSize: "38px",
        color: "#1c3d12",
        backgroundColor: "#8bd45a",
        padding: { x: 44, y: 22 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on("pointerdown", () => {
      overlay.destroy();
      // 过关插屏（每 2 关一次，避免过度打断导致流失）：关闭后进下一关
      if (this.level % 2 === 0) {
        track(EVENTS.adImpression, { placement: "level_end", type: "interstitial", level: this.level });
        void (async () => {
          await showInterstitial("level_end");
          this.newGame();
        })();
      } else {
        this.newGame();
      }
    });
    overlay.add(btn);
    overlay.setScale(0.8);
    this.tweens.add({ targets: overlay, scale: 1, duration: 200, ease: "Back.easeOut" });
    for (let i = 0; i < 18; i++) {
      this.juiceBurst(360 + (Math.random() - 0.5) * 400, 640 + (Math.random() - 0.5) * 300, 0xffd766);
    }
  }

  /** 关卡失败（死局）：主按钮=看广告续命（变现黄金位），次按钮=重试同关。 */
  private levelFail(): void {
    if (this.state !== "playing") return;
    this.state = "fail";
    track(EVENTS.fail, { level: this.level, moves: this.movesUsed, target: this.levelData?.target });
    this.playSfx("over", 1, 0.7);
    this.persist();

    const overlay = this.add.container(360, 640).setDepth(70);
    const bg = this.add.graphics();
    bg.fillStyle(0x12324d, 0.94);
    bg.fillRoundedRect(-280, -250, 560, 500, 28);
    overlay.add(bg);
    overlay.add(
      this.add.text(0, -175, "NO MORE MOVES", { fontFamily: UI.font, fontSize: "50px", color: "#ffffff" }).setOrigin(0.5),
    );
    overlay.add(
      this.add
        .text(0, -105, `Target ${this.levelData!.target}  ·  Par ${this.levelData!.par}`, {
          fontFamily: UI.font,
          fontSize: "30px",
          color: "#bfe4ff",
        })
        .setOrigin(0.5),
    );

    // 主 CTA：看广告续命（洗牌救命）——每关限 1 次；已用则主按钮直接是重试
    const canRevive = !this.adRevived;
    const adBtn = this.add
      .text(0, canRevive ? -5 : 40, canRevive ? "▶ WATCH AD — CONTINUE" : "TRY AGAIN", {
        fontFamily: UI.font,
        fontSize: canRevive ? "34px" : "38px",
        color: "#4a2c00",
        backgroundColor: canRevive ? "#ffd766" : "#8bd45a",
        padding: { x: 40, y: 22 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    adBtn.on("pointerdown", () => {
      adBtn.disableInteractive();
      if (!canRevive) {
        overlay.destroy();
        this.newGame();
        return;
      }
      void (async () => {
        const revived = await this.tryAdRevive();
        if (revived) overlay.destroy();
        else adBtn.setInteractive({ useHandCursor: true }); // 未看完广告：恢复可点
      })();
    });
    overlay.add(adBtn);

    if (canRevive) {
      const btn = this.add
        .text(0, 115, "TRY AGAIN", {
          fontFamily: UI.font,
          fontSize: "32px",
          color: "#1c3d12",
          backgroundColor: "#8bd45a",
          padding: { x: 40, y: 18 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => {
        overlay.destroy();
        this.newGame();
      });
      overlay.add(btn);
    }
    overlay.setScale(0.8);
    this.tweens.add({ targets: overlay, scale: 1, duration: 200, ease: "Back.easeOut" });
  }

  private celebrateWin(): void {
    track(EVENTS.win, { score: this.score });
    this.playSfx("win", 1, 0.8);
    const banner = this.add.container(360, 640).setDepth(60);
    const bg = this.add.graphics();
    bg.fillStyle(0x12324d, 0.94);
    bg.fillRoundedRect(-260, -140, 520, 280, 28);
    bg.lineStyle(5, UI.accent, 1);
    bg.strokeRoundedRect(-260, -140, 520, 280, 28);
    banner.add(bg);
    banner.add(this.add.image(0, -70, "f2048").setDisplaySize(96, 96));
    banner.add(
      this.add.text(0, 34, "GOLDEN CROP!", { fontFamily: UI.font, fontSize: "52px", color: "#ffd766" }).setOrigin(0.5),
    );
    banner.add(
      this.add
        .text(0, 100, "Harvest complete — keep growing!", { fontFamily: UI.font, fontSize: "26px", color: "#f2ecff" })
        .setOrigin(0.5),
    );
    for (let i = 0; i < 26; i++) {
      this.juiceBurst(360 + (Math.random() - 0.5) * 400, 640 + (Math.random() - 0.5) * 300, 0xffd766);
    }
    this.time.delayedCall(2600, () => {
      this.tweens.add({ targets: banner, alpha: 0, duration: 400, onComplete: () => banner.destroy() });
    });
  }

  private gameOver(): void {
    if (this.state !== "playing") return;
    this.state = "over";
    track(EVENTS.over, { score: this.score, bestTile: maxTile(this.grid) });
    this.playSfx("over", 1, 0.7);
    this.gamesPlayed++;
    this.persist();

    const overlay = this.add.container(360, 640).setDepth(70);
    const bg = this.add.graphics();
    bg.fillStyle(0x12324d, 0.94);
    bg.fillRoundedRect(-280, -220, 560, 440, 28);
    overlay.add(bg);
    overlay.add(
      this.add
        .text(0, -140, "HARVEST OVER", { fontFamily: UI.font, fontSize: "52px", color: "#ffffff" })
        .setOrigin(0.5),
    );
    overlay.add(
      this.add
        .text(0, -50, `Score ${this.score}   ·   Best ${this.best}`, {
          fontFamily: UI.font,
          fontSize: "32px",
          color: "#bfe4ff",
        })
        .setOrigin(0.5),
    );
    const btn = this.add
      .text(0, 80, "PLAY AGAIN", {
        fontFamily: UI.font,
        fontSize: "38px",
        color: "#1c3d12",
        backgroundColor: "#8bd45a",
        padding: { x: 44, y: 22 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on("pointerdown", () => {
      overlay.destroy();
      this.newGame();
    });
    overlay.add(btn);
    overlay.setScale(0.8);
    this.tweens.add({ targets: overlay, scale: 1, duration: 200, ease: "Back.easeOut" });
  }

  private currentProgress(): Progress {
    return {
      level: this.level,
      highScore: this.best,
      bestTile: Math.max(this.bestTile, maxTile(this.grid)),
      gamesPlayed: this.gamesPlayed,
      muted: this.muted,
      stars: this.stars,
    };
  }

  private persist(): void {
    const progress = this.currentProgress();
    this.bestTile = progress.bestTile;
    void saveProgress(progress);
  }

  /** 返回关卡选择（先存档；弹窗/动画期间禁止切换）。 */
  private backToLevelSelect(): void {
    if (this.busy || this.state === "clear") return;
    this.persist();
    this.scene.start(LEVEL_SELECT_KEY, { progress: this.currentProgress() });
  }

  // ---------- 输入（滑动 + 键盘） ----------

  private bindInput(): void {
    let startX = 0;
    let startY = 0;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      startX = p.x;
      startY = p.y;
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const dx = p.x - startX;
      const dy = p.y - startY;
      const threshold = 24;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
      if (Math.abs(dx) > Math.abs(dy)) this.tryMove(dx > 0 ? "right" : "left");
      else this.tryMove(dy > 0 ? "down" : "up");
    });

    const kb = this.input.keyboard;
    if (kb) {
      kb.on("keydown-LEFT", () => this.tryMove("left"));
      kb.on("keydown-RIGHT", () => this.tryMove("right"));
      kb.on("keydown-UP", () => this.tryMove("up"));
      kb.on("keydown-DOWN", () => this.tryMove("down"));
    }
  }
}

export { GAME_TITLE };