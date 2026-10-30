/**
 * 关卡选择（50+ 关可拖动滚动网格）：已通关显示星级、当前关高亮、未解锁显示锁。
 * 解锁规则：可玩 ≤ progress.level 的所有关（自由重玩）；降低 web 试玩用户的卡关流失。
 */
import Phaser from "phaser";
import { UI, SPRITES, fruitOf } from "../config";
import { track, type Progress } from "../bridge";
import { getLevel, levelCount } from "../game/Levels";

export const LEVEL_SELECT_KEY = "LevelSelect";

interface SelectData {
  progress: Progress;
}

const COLS = 5;
const CELL = 112;
const GAP = 14;
/** 滚动可视区（ENDLESS 按钮固定在其下方）。 */
const VIEW_TOP = 232;
const VIEW_BOTTOM = 1148;
/** 位移超过该值 = 拖动滚动意图，不触发选关点击。 */
const DRAG_CLICK_THRESHOLD = 12;

export class LevelSelectScene extends Phaser.Scene {
  private progress!: Progress;
  /** 本次按下后的拖动位移（供 cell 点击判定滚动 vs 点击）。 */
  private movedDist = 0;

  constructor() {
    super({ key: LEVEL_SELECT_KEY });
  }

  preload(): void {
    for (const [key, url] of Object.entries(SPRITES)) this.load.image(key, url);
  }

  init(data: SelectData): void {
    this.progress = data.progress;
    this.progress.stars ??= {};
  }

  create(): void {
    // 背景（与游戏内一致的农场风）
    const g = this.add.graphics();
    g.fillStyle(UI.background, 1);
    g.fillRect(0, 0, 720, 1280);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(120, 180, 46);
    g.fillCircle(168, 190, 34);
    g.fillCircle(580, 140, 40);
    g.fillCircle(624, 152, 30);
    g.fillStyle(UI.field, 1);
    g.fillRect(0, 1180, 720, 100);

    this.add
      .text(360, 105, "SELECT LEVEL", {
        fontFamily: UI.font,
        fontSize: "64px",
        color: "#ffffff",
        stroke: "#1c5c8c",
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    const total = levelCount();
    const stars = this.progress.stars ?? {};
    const starCount = Object.values(stars).reduce((a, b) => a + b, 0);
    this.add
      .text(360, 175, `${total} levels  ·  ★ ${starCount} / ${total * 3}`, {
        fontFamily: UI.font,
        fontSize: "30px",
        color: "#bfe4ff",
      })
      .setOrigin(0.5);

    // 滚动网格（拖动查看 50+ 关；mask 限制可视区）
    const rows = Math.ceil(total / COLS);
    const gridW = COLS * CELL + (COLS - 1) * GAP;
    const startX = (720 - gridW) / 2 + CELL / 2;
    const contentH = rows * (CELL + GAP);

    const maskGfx = this.add.graphics();
    maskGfx.fillStyle(0xffffff, 1);
    maskGfx.fillRect(0, VIEW_TOP, 720, VIEW_BOTTOM - VIEW_TOP);
    maskGfx.setVisible(false); // 仅作裁剪几何，不渲染
    const content = this.add.container(0, 0).setMask(maskGfx.createGeometryMask());

    for (let id = 1; id <= total; id++) {
      const idx = id - 1;
      const cx = startX + (idx % COLS) * (CELL + GAP);
      const cy = VIEW_TOP + CELL / 2 + Math.floor(idx / COLS) * (CELL + GAP);
      this.drawCell(content, cx, cy, id, stars[id] ?? 0);
    }

    // 拖动滚动（点击与拖动区分：位移超过阈值 = 滚动意图）
    const maxScroll = Math.min(0, VIEW_BOTTOM - VIEW_TOP - contentH);
    let dragging = false;
    let dragStartY = 0;
    let contentStartY = 0;
    this.movedDist = 0;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      dragging = true;
      dragStartY = p.y;
      contentStartY = content.y;
      this.movedDist = 0;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!dragging) return;
      const dy = p.y - dragStartY;
      this.movedDist = Math.max(this.movedDist, Math.abs(dy));
      content.y = Phaser.Math.Clamp(contentStartY + dy, maxScroll, 0);
    });
    this.input.on("pointerup", () => {
      dragging = false;
    });

    // 无尽模式入口（固定在滚动区下方）
    const endless = this.add
      .text(360, 1225, "∞  ENDLESS MODE", {
        fontFamily: UI.font,
        fontSize: "34px",
        color: "#4a2c00",
        backgroundColor: "#ffd766",
        padding: { x: 40, y: 14 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    endless.on("pointerdown", () => {
      this.scene.start("Game", { mode: "endless", level: 1, progress: this.progress });
    });

    track("level_select_view", { total, starCount });
  }

  private drawCell(
    parent: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    id: number,
    stars: number,
  ): void {
    const unlocked = id <= this.progress.level;
    const current = id === this.progress.level;
    const cell = this.add.graphics();
    if (current) {
      cell.fillStyle(0xffb703, 1); // 当前关：阳光橙
    } else if (stars > 0) {
      cell.fillStyle(0x8bd45a, 1); // 已通关：绿
    } else if (unlocked) {
      cell.fillStyle(0xf7e8cc, 1); // 可玩：奶油
    } else {
      cell.fillStyle(0x6b7b8c, 1); // 锁定：灰
    }
    cell.fillRoundedRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL, 18);
    if (current) {
      cell.lineStyle(5, 0xffffff, 1);
      cell.strokeRoundedRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL, 18);
    }
    parent.add(cell);

    if (!unlocked) {
      // 锁图标（Graphics 绘制：免 emoji 跨平台问题）
      const lock = this.add.graphics();
      lock.lineStyle(7, 0x3d4a58, 1);
      lock.beginPath();
      lock.arc(cx, cy - 12, 16, Math.PI, 2 * Math.PI, false);
      lock.strokePath();
      lock.fillStyle(0x3d4a58, 1);
      lock.fillRoundedRect(cx - 26, cy - 12, 52, 42, 8);
      parent.add(lock);
      parent.add(
        this.add.text(cx, cy + 42, String(id), { fontFamily: UI.font, fontSize: "26px", color: "#c7d2dc" }).setOrigin(0.5),
      );
      return;
    }

    // 关卡号 + 目标值迷你图标 + 星级
    const level = getLevel(id);
    parent.add(this.add.image(cx, cy - 22, fruitOf(level.target).tex).setDisplaySize(44, 44));
    parent.add(
      this.add.text(cx, cy + 14, String(id), {
        fontFamily: UI.font,
        fontSize: "32px",
        color: current ? "#4a2c00" : "#2b3a1a",
      }).setOrigin(0.5),
    );
    parent.add(
      this.add.text(cx, cy + 42, "★".repeat(stars) + "☆".repeat(3 - stars), {
        fontSize: "22px",
        color: current ? "#7a4a12" : stars > 0 ? "#2b6a12" : "#8a6a3a",
      }).setOrigin(0.5),
    );

    const hit = this.add.rectangle(cx, cy, CELL, CELL).setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => {
      if (this.movedDist > DRAG_CLICK_THRESHOLD) return; // 拖动 = 滚动意图，不触发选关
      this.scene.start("Game", { mode: "levels", level: id, progress: this.progress });
    });
    parent.add(hit);
  }
}
