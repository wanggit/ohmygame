/**
 * 主场景：果汁水排序。
 * 竖屏 720×1280 设计分辨率；纯代码绘制（无外部素材，包体最小）。
 */
import Phaser from "phaser";
import { showInterstitial, showRewarded, saveProgress, track, notifyGameReady } from "../bridge";
import { JUICE_COLORS, LEVEL_CONFIG, DIFFICULTY, UI } from "../config";
import { generateLevel, pour, isComplete, type LevelData } from "../game/Level";
import { findHint, legalMoves } from "../game/Solver";

export const GAME_SCENE_KEY = "GameScene";

const DESIGN_W = 720;
const DESIGN_H = 1280;
/** 盘面纵向范围（管子行中心落在此区间；行内管数 ≤ 6，超了换行——踩坑录 #10）。 */
const BOARD_TOP = 250;
const BOARD_BOTTOM = 1180;

/** 自写水珠粒子（重力下落 + 渐小渐隐）。 */
interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  /** 粒子自身颜色（彩带每粒不同色；倒水水流用液体色）。 */
  color: number;
}

/** 撤销快照：连同雾管/锁管/提示次数一起存，撤销后不会漏状态。 */
interface Snapshot {
  tubes: number[][];
  moves: number;
  revealedFog: Set<number>;
  lockUnlocked: boolean;
  freeHints: number;
}

/** 每根管的持久绘制层（Graphics 复用，倒水动画不重建对象）。 */
interface TubeLayers {
  shadow: Phaser.GameObjects.Graphics;
  glass: Phaser.GameObjects.Graphics;
  liquid: Phaser.GameObjects.Graphics;
  gloss: Phaser.GameObjects.Graphics;
  /** 特殊管/归位标记容器：仅状态变化时重建其子对象。 */
  marks: Phaser.GameObjects.Container;
  markKey: string;
  glassDone: boolean;
}

export class GameScene extends Phaser.Scene {
  private data_!: LevelData;
  private tubes: number[][] = [];
  private tubeContainers: Phaser.GameObjects.Container[] = [];
  private tubeLayers: TubeLayers[] = [];
  private selectedIndex: number | null = null;
  private hoverIndex: number | null = null;
  private busy = false;
  private baseX: number[] = [];
  private baseY: number[] = [];
  private demoSteps = 0;
  private demoWin = false;
  private demoAnim = false;
  private demoStream = false;
  private audioReady = false;
  private drops: Drop[] = [];
  private dropGfx?: Phaser.GameObjects.Graphics;
  private pourColor = 0xffffff;
  private moves = 0;
  private movesText!: Phaser.GameObjects.Text;
  private revealedFog = new Set<number>();
  private lockUnlocked = false;
  private hudText!: Phaser.GameObjects.Text;

  /** 开局关卡数据快照（重开复用，保证同一题 + 同一 par + 同一特殊管分配）。 */
  private initialData: LevelData | null = null;
  /** 本次开局是否来自"同题重开"快照（是则不再播绞盘机开局演出）。 */
  private initialDataFromRestart = false;
  /** 撤销栈：整局状态快照（含雾管揭示/锁管状态，撤销才不会漏状态）。 */
  private history: Snapshot[] = [];
  private freeHints = LEVEL_CONFIG.freeHintsPerLevel;
  /** 广告互斥：避免连点弹出多个广告。 */
  private adBusy = false;
  /** 模态面板打开时屏蔽管点击。 */
  private modalOpen = false;
  private totalPoured = 0;
  private colorBlind = true;
  private hintBtnLabel?: Phaser.GameObjects.Text;
  /** jungle 无尽模式：已累计的 +2 管轮数（0 = 普通关卡流程）。 */
  private jungle = 0;
  /** 管几何（随管数自适应布局，5-30 管通用；buildTubes 里算出）。 */
  private tubeW = 100;
  private tubeH = 400;

  constructor() {
    super(GAME_SCENE_KEY);
  }

  init(data: { level?: number; levelData?: LevelData; jungle?: number }): void {
    // 自测参数：?step=N 快进 N 步；?win=1 直达胜利面板；?anim=1 跑一次真实倒水动画；
    // ?stream=1 持续粒子（可见性验证）；?level=N 指定关卡（验证高关卡两行布局）；
    // ?debug=1 暴露只读状态快照（smoke 断言用）；?cb=0 关闭色盲纹样；?jungle=N 无尽轮数
    const query = new URLSearchParams(window.location.search);
    this.demoSteps = Number(query.get("step") ?? "0") || 0;
    this.demoWin = query.get("win") === "1";
    this.demoAnim = query.get("anim") === "1";
    this.demoStream = query.get("stream") === "1";
    if (query.get("cb") === "0") this.colorBlind = false;

    const level = Number(query.get("level") ?? "") || data?.level || 1;
    const jungle = Number(query.get("jungle") ?? "") || data?.jungle || 0;
    this.jungle = jungle;
    const colors = DIFFICULTY.colorsForLevel(level);
    const rules = DIFFICULTY.specialsForLevel(level, colors);
    const spare = DIFFICULTY.spareTubesForLevel(level, colors);
    // jungle 无尽：每轮 +2 管（分散度 +2），30 管封顶（设计"胜利后 +2 管继续"）
    const filled = Math.min(DIFFICULTY.filledTubesForLevel(level, colors) + jungle * 2, 30 - spare);
    // 重开时传回开局快照即可复用同一题（否则"重开"会变成"换题"，par/星级失去可比性）；
    // 无快照则走固定种子生成：同关卡同题（设计"固定随机种子，可复现"）
    this.data_ =
      data?.levelData ??
      generateLevel(
        level,
        LEVEL_CONFIG.tubeCapacity,
        spare,
        colors,
        DIFFICULTY.targetStepsForLevel(level, colors, filled),
        rules,
        { filledTubes: filled, seed: level * 9176 + jungle * 31 + 17 },
      );
    this.initialData = this.data_;
    this.initialDataFromRestart = data?.levelData != null;
    this.tubes = this.data_.tubes.map((t) => t.slice());
    this.selectedIndex = null;
    this.busy = false;
    this.moves = 0;
    this.history = [];
    this.revealedFog = new Set();
    this.lockUnlocked = this.data_.specials.locked === null;
    this.freeHints = LEVEL_CONFIG.freeHintsPerLevel;
    this.adBusy = false;
    this.modalOpen = false;
    this.totalPoured = 0;
    track("level_start", { level: this.data_.level, colors: this.data_.colors, jungle });
  }

  preload(): void {
    // 音频在 create 里后台加载（部分环境 Web Audio 解码会挂起，不能阻塞场景启动）
  }

  create(): void {
    // 后台加载音频：加载完成前 playSound 静默
    this.load.audio("pour", "audio/pour.wav");
    this.load.audio("click", "audio/click.mp3");
    this.load.audio("win", "audio/win.ogg");
    this.load.audio("ding", "audio/ding.mp3");
    this.load.audio("fail", "audio/fail.mp3");
    this.load.once("complete", () => {
      this.audioReady = true;
    });
    this.load.start();

    this.drawBackground();
    this.drawHud();
    this.buildTubes();
    this.bindInput();
    if (this.demoWin) {
      this.tubes = this.data_.tubes.map(() => []).map((_, i) => (i < this.data_.colors ? Array(this.data_.capacity).fill(i) : []));
      this.tubes.forEach((_, i) => this.redrawTube(i));
      this.checkWin();
    } else if (this.demoSteps > 0) {
      this.runAutoSteps(this.demoSteps);
    } else if (this.demoAnim) {
      // 真实动画链路自测：选中 → 倒水（走 animatePour 全流程）
      const move = findHint(this.tubes, this.data_.capacity, this.data_.specials.ice, this.lockInfo());
      if (move) {
        this.time.delayedCall(300, () => this.onTubeTap(move.from));
        this.time.delayedCall(520, () => this.onTubeTap(move.to));
      }
    } else if (this.demoStream) {
      // 粒子可见性自测：持续发射（截图必须能看到粒子才算通过）
      this.pourColor = 0xff8c1a;
      this.dropGfx = this.add.graphics().setDepth(20);
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => this.spawnDrops(DESIGN_W / 2, 380, 30),
      });
    } else if (new URLSearchParams(window.location.search).get("intro") !== "0" && !this.initialDataFromRestart) {
      // 绞盘机增量开局（差异化卖点）：新关卡的管子是"绞出来"的，不是静态摆出。
      // 纯演出层：不改生成/规则；?intro=0 关闭；重开（同题快照）不再播
      this.playWinchIntro();
    }

    // 场景已就绪 → 移除 Bridge 的 loading overlay（否则会挡玩家点击约 3 秒）
    void notifyGameReady();

    // 自动化断言用（smoke）：?debug=1 才暴露，生产不泄露雾管答案
    if (new URLSearchParams(window.location.search).get("debug") === "1") this.exposeDebug();
  }

  /** 只读状态快照，供 scripts/smoke.ts 断言（撤销 / 同局重开 / 免费提示 / 卡关）。 */
  private exposeDebug(): void {
    const scene = this;
    (window as unknown as { __juice: unknown }).__juice = {
      get snapshot() {
        return {
          level: scene.data_.level,
          moves: scene.moves,
          par: scene.data_.minSteps,
          tubes: scene.tubes.map((t) => t.slice()),
          initialTubes: scene.data_.tubes.map((t) => t.slice()),
          freeHints: scene.freeHints,
          colorBlind: scene.colorBlind,
          tubeCount: scene.tubes.length,
          tubeW: scene.tubeW,
          jungle: scene.jungle,
          modalOpen: scene.modalOpen,
          positions: scene.baseX.map((x, i) => ({ x, y: scene.baseY[i] })),
          stuck:
            legalMoves(scene.tubes, scene.data_.capacity, scene.data_.specials.ice, scene.lockInfo()).length === 0,
        };
      },
    };
  }

  // ---------- 自写粒子池（水珠：重力下落 + 渐小渐隐） ----------

  private spawnDrops(x: number, y: number, count: number, color = this.pourColor): void {
    for (let i = 0; i < count; i++) {
      this.drops.push({
        x: x + Phaser.Math.Between(-18, 18),
        y: y + Phaser.Math.Between(-10, 6),
        vx: Phaser.Math.Between(-90, 90),
        vy: Phaser.Math.Between(30, 200),
        life: 0,
        maxLife: Phaser.Math.Between(220, 480) / 1000,
        size: Phaser.Math.Between(3, 7),
        color,
      });
    }
  }

  update(_time: number, delta: number): void {
    if (!this.dropGfx || this.drops.length === 0) return;
    const dt = Math.min(delta, 50) / 1000;
    const gfx = this.dropGfx;
    gfx.clear();
    const gravity = 1500;
    for (const d of this.drops) {
      d.vy += gravity * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life += dt;
      const t = d.life / d.maxLife;
      if (t < 1) {
        gfx.fillStyle(d.color, 1);
        gfx.fillCircle(d.x, d.y, d.size * (1 - t * 0.55));
      }
    }
    this.drops = this.drops.filter((d) => d.life < d.maxLife);
  }

  private playSound(name: "pour" | "click" | "win" | "ding" | "fail", volume = 0.7, rate = 1): void {
    if (!this.audioReady) return;
    try {
      this.sound.play(name, { volume, rate });
    } catch {
      /* 音频加载失败静默 */
    }
  }

  /**
   * 锁管状态（贯穿提示 / 卡关判定 / 求解）：锁未解除时该管完全不可用。
   * 少了它，提示会闪一根点不动的管、真死局弹不出出口面板（踩坑）。
   */
  private lockInfo(): { index: number; remaining: number } | undefined {
    const sp = this.data_.specials;
    if (sp.locked === null || this.lockUnlocked) return undefined;
    return { index: sp.locked, remaining: Math.max(0, sp.lockMoves - this.moves) };
  }

  /** 自测用：无动画快进 N 步（每步走提示逻辑），供 headless 截图中间态。 */
  private runAutoSteps(remaining: number): void {
    if (remaining <= 0) return;
    const move = findHint(this.tubes, this.data_.capacity, this.data_.specials.ice, this.lockInfo());
    if (!move) return;
    const next = pour(this.tubes, move.from, move.to, this.data_.capacity);
    if (!next) return;
    this.tubes = next;
    this.redrawTube(move.from);
    this.redrawTube(move.to);
    if (isComplete(this.tubes, this.data_.capacity)) {
      this.checkWin();
      return;
    }
    this.time.delayedCall(60, () => this.runAutoSteps(remaining - 1));
  }

  // ---------- 绘制 ----------

  private drawBackground(): void {
    const g = this.add.graphics();

    // 墙面：暖色竖向渐变
    g.fillGradientStyle(0xffd9a8, 0xffd9a8, 0xffe8c9, 0xffe8c9, 1);
    g.fillRect(0, 0, DESIGN_W, DESIGN_H);

    // 顶部条纹遮阳棚
    const awningH = 130;
    const stripeW = 90;
    for (let x = -stripeW; x < DESIGN_W + stripeW; x += stripeW * 2) {
      g.fillStyle(0xff8c1a, 1);
      g.fillRect(x, 0, stripeW, awningH);
      g.fillStyle(0xfff6ea, 1);
      g.fillRect(x + stripeW, 0, stripeW, awningH);
    }
    // 棚檐波浪边
    g.fillStyle(0xe06e00, 1);
    for (let x = 0; x < DESIGN_W + 90; x += 90) {
      g.fillCircle(x + 45, awningH, 46);
    }
    g.fillStyle(0xffd9a8, 1);
    g.fillRect(0, awningH + 40, DESIGN_W, 40);

    // 两侧搁架与罐子剪影（放在试管区之上，避免与管口视觉重叠）
    const shelfY = [300, 430];
    for (const y of shelfY) {
      g.fillStyle(0xd98f4d, 1);
      g.fillRect(40, y, 180, 16);
      g.fillRect(DESIGN_W - 220, y, 180, 16);
      // 罐子
      const jars = [0xff8c1a, 0xb44adf, 0x63c22b];
      for (let j = 0; j < 3; j++) {
        const jarColor = jars[(j + y) % 3];
        for (const bx of [70, DESIGN_W - 190]) {
          g.fillStyle(jarColor, 0.85);
          g.fillRoundedRect(bx + j * 52, y - 58, 38, 58, 8);
          g.fillStyle(0xffffff, 0.35);
          g.fillRect(bx + j * 52 + 8, y - 50, 8, 34);
        }
      }
    }

    // 漂浮光斑
    for (let i = 0; i < 12; i++) {
      const x = Phaser.Math.Between(30, DESIGN_W - 30);
      const y = Phaser.Math.Between(180, 1100);
      const r = Phaser.Math.Between(10, 34);
      g.fillStyle(0xffffff, 0.10);
      g.fillCircle(x, y, r);
    }

    // 台面：木纹渐变 + 台沿高光
    const tableY = 1120;
    g.fillGradientStyle(0xd98f4d, 0xd98f4d, 0xb8722f, 0xb8722f, 1);
    g.fillRect(0, tableY, DESIGN_W, DESIGN_H - tableY);
    g.fillStyle(0xffffff, 0.28);
    g.fillRect(0, tableY, DESIGN_W, 10);
    g.fillStyle(0x8a5320, 0.35);
    for (let x = 0; x < DESIGN_W; x += 140) {
      g.fillRoundedRect(x + 20, tableY + 40 + (x % 280 === 0 ? 30 : 90), 100, 12, 6);
    }
    // 台面上的小果汁杯装饰（左右角落）
    for (const cx of [86, DESIGN_W - 86]) {
      g.fillStyle(0xffffff, 0.55);
      g.fillRoundedRect(cx - 26, tableY + 60, 52, 74, 12);
      g.fillStyle(0xff8c1a, 0.9);
      g.fillRoundedRect(cx - 22, tableY + 84, 44, 46, 10);
      g.fillStyle(0xffffff, 0.5);
      g.fillRoundedRect(cx - 14, tableY + 90, 10, 26, 5);
    }
  }

  private drawHud(): void {
    // 顶部信息底板：关卡号/步数压在遮阳棚条纹上会看不清，垫一块浅板保证可读
    const plate = this.add.graphics();
    plate.fillStyle(0xffffff, 0.86);
    plate.fillRoundedRect(218, 54, 284, 132, 26);

    this.hudText = this.add
      .text(DESIGN_W / 2, 102, `LEVEL ${this.data_.level}`, {
        fontFamily: "Arial, sans-serif",
        fontSize: "40px",
        color: "#5b3a1e",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // 左：提示 / 撤销；右：色盲辅助 / 重开。四个按钮对称排布，中间留给信息底板。
    this.makeButton(82, 88, "💡", UI.accent, () => void this.useHint());
    this.makeButton(172, 88, "↩", UI.accent, () => this.undo());
    this.makeButton(DESIGN_W - 172, 88, "👁", UI.accent, () => this.toggleColorBlind());
    this.makeButton(DESIGN_W - 82, 88, "↻", UI.accent, () => this.restartLevel());

    this.hintBtnLabel = this.add
      .text(82, 148, this.hintLabel(), {
        fontFamily: "Arial, sans-serif",
        fontSize: "20px",
        color: "#5b3a1e",
        fontStyle: "bold",
      })
      // 白描边：角标落在遮阳棚条纹上也读得清
      .setStroke("#ffffff", 5)
      .setOrigin(0.5);

    // 步数 / 目标步数（星级评定基准）
    this.movesText = this.add
      .text(DESIGN_W / 2, 154, this.movesLabel(), {
        fontFamily: "Arial, sans-serif",
        fontSize: "22px",
        color: "#9a7248",
      })
      .setOrigin(0.5);
  }

  /** 提示按钮角标：还有免费次数时亮出来（降低广告摩擦，玩家知道第一次不花钱）。 */
  private hintLabel(): string {
    return this.freeHints > 0 ? `FREE ${this.freeHints}` : "AD";
  }

  /** 禁用反馈：晃动 + 轻音。 */
  private rejectTube(index: number): void {
    this.playSound("click", 0.3);
    const container = this.tubeContainers[index];
    if (!container) return;
    this.tweens.killTweensOf(container);
    this.tweens.add({
      targets: container,
      x: this.baseX[index] + 9,
      yoyo: true,
      repeat: 3,
      duration: 45,
      onComplete: () => {
        container.x = this.baseX[index];
      },
    });
  }

  private movesLabel(): string {
    const lockLeft = this.data_.specials.locked !== null && !this.lockUnlocked
      ? `  ·  🔒 ${Math.max(0, this.data_.specials.lockMoves - this.moves)}`
      : "";
    const jungleTag = this.jungle > 0 ? `  ·  JUNGLE×${this.jungle}` : "";
    return `MOVES ${this.moves}  ·  PAR ${this.data_.minSteps || "-"}${lockLeft}${jungleTag}`;
  }

  private makeButton(x: number, y: number, label: string, color: number, onTap: () => void, radius = 44): void {
    const bg = this.add.circle(x, y, radius, 0xffffff, 0.92).setStrokeStyle(6, color);
    this.add
      .text(x, y, label, { fontFamily: "Arial, sans-serif", fontSize: `${Math.round(radius * 0.92)}px`, color: "#5b3a1e" })
      .setOrigin(0.5);
    // 只让 bg 接收输入：文字若也 setInteractive，点到文字会同时命中 bg + text，回调跑两次
    // （提示会连弹两个广告、NEXT 会跑两次插屏 + 两次 restart）。
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerdown", () => {
      this.playSound("click", 0.5);
      onTap();
    });
  }

  /**
   * 布局几何：管数 5→30+ 通用（最多 5 行，管宽随每行管数自适应收窄）。
   * 管宽/管高随行数缩放：1-2 行 400 高经典瓶，5 行 30 管缩到 ~146 高（"30 管盲盒"盘面）。
   * 旧版 7 根管单行 gap 算出负值（管宽写死 100）→ 现在管宽随 perRow 收窄，几何永不重叠。
   */
  private layoutFor(count: number): { rows: number; perRow: number; ys: number[] } {
    const rows = count <= 6 ? 1 : count <= 12 ? 2 : count <= 18 ? 3 : count <= 24 ? 4 : 5;
    const perRow = Math.ceil(count / rows);
    this.tubeW = Math.min(100, Math.floor((DESIGN_W - 60 - (perRow - 1) * 12) / perRow));
    const pitch = Math.floor((BOARD_BOTTOM - BOARD_TOP) / rows);
    this.tubeH = Phaser.Math.Clamp(pitch - 40, 140, 400);
    const ys: number[] = [];
    for (let r = 0; r < rows; r++) ys.push(BOARD_TOP + Math.floor(pitch / 2) + r * pitch);
    return { rows, perRow, ys };
  }

  private buildTubes(): void {
    this.tubeContainers.forEach((c) => c.destroy());
    this.tubeContainers = [];
    this.tubeLayers = [];

    const count = this.tubes.length;
    const { perRow, ys } = this.layoutFor(count);
    const tubeW = this.tubeW;
    const tubeH = this.tubeH;

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / perRow);
      const rowCount = Math.min(perRow, count - row * perRow);
      const inRow = i % perRow;
      const gap = Math.max(12, Math.min(30, (DESIGN_W - 60 - rowCount * tubeW) / Math.max(1, rowCount - 1)));
      const x = DESIGN_W / 2 + (inRow - (rowCount - 1) / 2) * (tubeW + gap);
      const y = ys[row];

      const container = this.add.container(x, y);
      container.setSize(tubeW, tubeH);
      // 固定绘制层（顺序即 z 序）：阴影 → 玻璃 → 液体 → 光泽 → 标记
      const layers: TubeLayers = {
        shadow: this.add.graphics(),
        glass: this.add.graphics(),
        liquid: this.add.graphics(),
        gloss: this.add.graphics(),
        marks: this.add.container(0, 0),
        markKey: "",
        glassDone: false,
      };
      container.add([layers.shadow, layers.glass, layers.liquid, layers.gloss, layers.marks]);
      this.tubeContainers.push(container);
      this.tubeLayers.push(layers);
      this.baseX[i] = x;
      this.baseY[i] = y;
      this.redrawTube(i);
    }
  }

  /** 统一输入：scene 级判定最近管（避免相邻热区重叠导致误判，点缝隙归最近管）。
   *  与 buildTubes 分离：加管重建布局时不能重复注册监听。 */
  private bindInput(): void {
    this.input.removeAllListeners();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const idx = this.tubeAt(pointer.x, pointer.y);
      if (idx !== null) this.onTubeTap(idx);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.busy) return;
      const idx = this.tubeAt(pointer.x, pointer.y);
      if (idx !== this.hoverIndex) {
        const prev = this.hoverIndex;
        this.hoverIndex = idx;
        if (prev !== null) this.updateLift(prev);
        if (idx !== null) this.updateLift(idx);
      }
    });
  }

  /** 世界坐标 → 最近的管（横向容差点到缝隙；纵向宽容上下余量）。 */
  private tubeAt(worldX: number, worldY: number): number | null {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.tubeContainers.length; i++) {
      const dy = worldY - this.baseY[i];
      if (Math.abs(dy) > this.tubeH / 2 + 80) continue;
      const dx = Math.abs(worldX - this.baseX[i]);
      const maxDx = (this.tubeW + 34) / 2 + 10;
      if (dx <= maxDx && dx < bestDist) {
        bestDist = dx;
        best = i;
      }
    }
    return best >= 0 ? best : null;
  }

  /**
   * 绞盘机增量开局（差异化卖点）：新关卡的管子不是静态摆出，而是"绞出来"的——
   * 顶部绞盘摇柄转动，管子按 2-4 根一批绞出落位。纯演出层（不改生成/规则，可解性不变），
   * 输入不锁（点管照常生效），结束后清理演出对象。
   */
  private playWinchIntro(): void {
    // 分批 2,3,4 循环（确定性批数 → 演出时长有界，自动化截图不会抓到半程）：
    // 30 管最坏 11 批 ≈ 2.8s 收尾
    const groups: number[][] = [];
    let g: number[] = [];
    const size = () => 2 + (groups.length % 3);
    for (let i = 0; i < this.tubes.length; i++) {
      g.push(i);
      if (g.length >= size()) {
        groups.push(g);
        g = [];
      }
    }
    if (g.length > 0) groups.push(g);

    // 绞盘机：滚轮横梁 + 摇柄（画在盘面顶部中央，绞完淡出）
    const wx = DESIGN_W / 2;
    const wy = BOARD_TOP - 30;
    const winch = this.add.container(wx, wy).setDepth(30);
    const body = this.add.graphics();
    body.fillStyle(0x8a5320, 1);
    body.fillRoundedRect(-130, -16, 260, 32, 14);
    body.fillStyle(0xffffff, 0.25);
    body.fillRoundedRect(-122, -10, 244, 8, 4);
    winch.add(body);
    const hub = this.add.graphics();
    hub.fillStyle(0x5b3a1e, 1);
    hub.fillCircle(142, 0, 13);
    winch.add(hub);
    const crank = this.add.container(142, 0);
    const arm = this.add.graphics();
    arm.fillStyle(0x5b3a1e, 1);
    arm.fillRoundedRect(-5, -5, 50, 10, 5);
    arm.fillStyle(0xffd25a, 1);
    arm.fillCircle(46, 0, 11);
    crank.add(arm);
    winch.add(crank);

    let delay = 0;
    for (const indices of groups) {
      this.time.delayedCall(delay, () => {
        this.playSound("click", 0.35);
        this.tweens.add({ targets: crank, angle: crank.angle + 130, duration: 260, ease: "Cubic.easeOut" });
        for (const i of indices) {
          const c = this.tubeContainers[i];
          if (!c) continue;
          c.y = this.baseY[i] - 130;
          c.alpha = 0;
          this.tweens.add({
            targets: c,
            y: this.baseY[i],
            alpha: 1,
            duration: 280,
            ease: "Back.easeOut",
            onComplete: () => {
              c.alpha = 1;
              c.y = this.baseY[i];
            },
          });
        }
      });
      delay += 250;
    }
    this.time.delayedCall(delay + 350, () => {
      // 清理演出残留：中途 hover/点击会杀掉入场 tween，这里兜底恢复全部管状态
      for (let i = 0; i < this.tubeContainers.length; i++) {
        const c = this.tubeContainers[i];
        if (c) {
          c.alpha = 1;
          if (this.selectedIndex !== i && this.hoverIndex !== i) c.y = this.baseY[i];
        }
      }
      this.tweens.add({
        targets: winch,
        alpha: 0,
        y: wy - 24,
        duration: 280,
        onComplete: () => winch.destroy(),
      });
    });
  }

  /** 统一的抬起状态：选中 > 悬停 > 静止（绝对目标值，避免 tween 叠加漂移）。 */
  private updateLift(index: number): void {
    const container = this.tubeContainers[index];
    if (!container) return;
    const lift = this.selectedIndex === index ? -30 : this.hoverIndex === index ? -12 : 0;
    // 选中/操作中的管置于顶层，避免被相邻管遮挡
    container.setDepth(this.selectedIndex === index ? 10 : 0);
    this.tweens.killTweensOf(container);
    this.tweens.add({
      targets: container,
      y: this.baseY[index] + lift,
      duration: 110,
      ease: "Quad.easeOut",
    });
  }

  /** 静态层（玻璃）只画一次；液体层每帧 clear 重画。Graphics 全程复用，
   *  倒水动画每帧两根管重画时不再 new/destroy 对象（GC 抖动源）。 */
  private drawGlassStatic(index: number): void {
    const layers = this.tubeLayers[index];
    const TUBE_W = this.tubeW;
    const TUBE_H = this.tubeH;
    const left = -TUBE_W / 2;
    const top = -TUBE_H / 2;

    // 玻璃管：外阴影 + 玻璃体（液体画在其上，最后再叠玻璃光泽）
    layers.shadow.clear();
    layers.shadow.fillStyle(0x000000, 0.12);
    layers.shadow.fillRoundedRect(left + 6, top + 12, TUBE_W, TUBE_H, 26);

    layers.glass.clear();
    layers.glass.fillStyle(0xffffff, 0.45);
    layers.glass.fillRoundedRect(left, top, TUBE_W, TUBE_H, 26);

    // 玻璃光泽层：内高光、描边、管口
    layers.gloss.clear();
    layers.gloss.fillStyle(0xffffff, 0.38);
    layers.gloss.fillRoundedRect(left + 12, top + 22, 11, TUBE_H - 76, 6);
    layers.gloss.lineStyle(8, UI.tubeRim, 1);
    layers.gloss.strokeRoundedRect(left, top, TUBE_W, TUBE_H, 26);
    // 管口椭圆（玻璃口的透视）
    layers.gloss.lineStyle(6, UI.tubeRim, 0.9);
    layers.gloss.strokeEllipse(0, top + 6, TUBE_W - 12, 18);

    layers.glassDone = true;
  }

  /** 只重画液体层（倒水动画每帧调用）。 */
  private redrawLiquid(index: number, topFillRatio = 1): void {
    const layers = this.tubeLayers[index];
    if (!layers) return;
    if (!layers.glassDone) this.drawGlassStatic(index);

    const tubeW = this.tubeW;
    const tubeH = this.tubeH;
    const left = -tubeW / 2;
    // 液体：连续同色融合成块 + 液面椭圆 + 渐变（消除积木感）；雾管液体隐藏为雾色
    const stack = this.tubes[index];
    const capacity = this.data_.capacity;
    const segH = (tubeH - 28) / capacity;
    const innerW = tubeW - 22;
    const floorY = tubeH / 2 - 14;
    const isFog = this.data_.specials.fog.has(index) && !this.revealedFog.has(index);
    const FOG = { hex: 0x9aa7b8, dark: 0x7a8798, name: "Fog", pattern: -1 };

    const blocks: { color: number; len: number }[] = [];
    let i = 0;
    while (i < stack.length) {
      let j = i;
      while (j + 1 < stack.length && stack[j + 1] === stack[i]) j++;
      blocks.push({ color: stack[i], len: j - i + 1 });
      i = j + 1;
    }

    const liquid = layers.liquid;
    liquid.clear();
    let yCursor = floorY;
    for (let b = 0; b < blocks.length; b++) {
      const blk = blocks[b];
      const isTop = b === blocks.length - 1;
      const ratio = isTop ? Phaser.Math.Clamp(topFillRatio, 0.08, 1) : 1;
      const blockH = blk.len * segH * ratio;
      const yTop = yCursor - blockH;
      const c = isFog ? FOG : JUICE_COLORS[blk.color];

      // 块体：纯色 + 底部暗带 + 顶部亮带（Canvas/WebGL 一致；不用 fillGradientStyle）
      liquid.fillStyle(c.hex, 1);
      liquid.fillRect(left + 11, yTop + 6, innerW, Math.max(2, blockH - 6));
      liquid.fillStyle(c.dark, 0.6);
      liquid.fillRect(left + 11, yTop + blockH - 16, innerW, Math.max(0, Math.min(14, blockH - 10)));
      liquid.fillStyle(0xffffff, 0.13);
      liquid.fillRect(left + 11, yTop + 8, innerW, Math.min(20, blockH * 0.35));
      // 顶部液面：椭圆面（"面"的透视）
      liquid.fillStyle(c.hex, 1);
      liquid.fillEllipse(0, yTop + 6, innerW, 18);
      liquid.fillStyle(0xffffff, 0.32);
      liquid.fillEllipse(-6, yTop + 3, innerW - 36, 7);
      // 块底部与下层衔接的弧（若有下层）
      if (b > 0) {
        liquid.fillStyle(c.hex, 0.9);
        liquid.fillEllipse(0, yTop + blockH, innerW, 10);
      }
      // 色盲辅助纹样：颜色之外的第二条区分通道（每块画在块体中央）
      if (!isFog && this.colorBlind && blockH >= 30) {
        this.drawPattern(liquid, JUICE_COLORS[blk.color].pattern, 0, yTop + blockH / 2, Math.min(16, blockH * 0.3));
      }
      yCursor = yTop;
    }
  }

  /** 色盲辅助纹样（0-9 十种几何图形，白描边压在色块上，任何色觉下都可区分）。 */
  private drawPattern(g: Phaser.GameObjects.Graphics, pattern: number, cx: number, cy: number, r: number): void {
    const w = Math.max(2, r * 0.22);
    g.lineStyle(w, 0xffffff, 0.55);
    g.fillStyle(0xffffff, 0.32);
    switch (pattern % 10) {
      case 0:
        g.strokeCircle(cx, cy, r * 0.72);
        break;
      case 1:
        g.fillCircle(cx, cy, r * 0.72);
        break;
      case 2:
        g.fillTriangle(cx, cy - r * 0.85, cx + r * 0.85, cy + r * 0.65, cx - r * 0.85, cy + r * 0.65);
        break;
      case 3:
        g.fillRect(cx - r * 0.62, cy - r * 0.62, r * 1.24, r * 1.24);
        break;
      case 4:
        g.fillPoints(
          [
            { x: cx, y: cy - r * 0.9 },
            { x: cx + r * 0.8, y: cy },
            { x: cx, y: cy + r * 0.9 },
            { x: cx - r * 0.8, y: cy },
          ],
          true,
        );
        break;
      case 5:
        g.fillRect(cx - r * 0.2, cy - r * 0.85, r * 0.4, r * 1.7);
        g.fillRect(cx - r * 0.85, cy - r * 0.2, r * 1.7, r * 0.4);
        break;
      case 6: {
        const pts: Phaser.Math.Vector2[] = [];
        for (let k = 0; k < 10; k++) {
          const rad = k % 2 === 0 ? r * 0.9 : r * 0.38;
          const ang = -Math.PI / 2 + (k * Math.PI) / 5;
          pts.push(new Phaser.Math.Vector2(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad));
        }
        g.fillPoints(pts, true);
        break;
      }
      case 7:
        for (let k = -1; k <= 1; k++) {
          g.lineBetween(cx - r * 0.8 + k * r * 0.55, cy + r * 0.8, cx + r * 0.3 + k * r * 0.55, cy - r * 0.8);
        }
        break;
      case 9:
        g.lineBetween(cx - r * 0.7, cy - r * 0.7, cx + r * 0.7, cy + r * 0.7);
        g.lineBetween(cx - r * 0.7, cy + r * 0.7, cx + r * 0.7, cy - r * 0.7);
        break;
      default:
        g.fillCircle(cx, cy - r * 0.62, r * 0.3);
        g.fillCircle(cx + r * 0.62, cy + r * 0.42, r * 0.3);
        g.fillCircle(cx - r * 0.62, cy + r * 0.42, r * 0.3);
        break;
    }
  }

  /** 整管重画：液体层（可带顶部填充比）+ 标记层（仅状态变化时重建）。 */
  private redrawTube(index: number, topFillRatio = 1): void {
    const layers = this.tubeLayers[index];
    if (!layers) return;
    this.redrawLiquid(index, topFillRatio);
    this.redrawMarks(index);
  }

  /** 特殊管标记层：仅在标记状态变化时重建（雾 ? / 冰 ❄ / 锁 🔒 / 归位 ✨）。 */
  private redrawMarks(index: number): void {
    const layers = this.tubeLayers[index];
    if (!layers) return;
    const stack = this.tubes[index];
    const capacity = this.data_.capacity;
    const isFog = this.data_.specials.fog.has(index) && !this.revealedFog.has(index);
    const isIce = this.data_.specials.ice.has(index);
    const isLocked = this.data_.specials.locked === index && !this.lockUnlocked;
    const isDone = stack.length === capacity && stack.every((c) => c === stack[0]);
    const key = `${isFog ? "f" : ""}|${isIce ? "i" : ""}|${isLocked ? "l" : ""}|${isDone ? "d" : ""}`;
    if (key === layers.markKey) return;
    const justCompleted = !layers.markKey.endsWith("|d") && isDone;
    layers.markKey = key;

    const marks = layers.marks;
    marks.removeAll(true);
    const TUBE_W = this.tubeW;
    const TUBE_H = this.tubeH;
    const top = -TUBE_H / 2;
    const left = -TUBE_W / 2;

    // 特殊管标记：雾管 ? / 冰管 ❄ / 锁管 🔒
    if (isFog && stack.length > 0) {
      marks.add(
        this.add
          .text(0, 0, "?", { fontFamily: "Arial, sans-serif", fontSize: "56px", color: "#5b6b7c", fontStyle: "bold" })
          .setOrigin(0.5),
      );
    }
    if (isIce) {
      const ice = this.add.graphics();
      ice.fillStyle(0xbfe8ff, 0.85);
      ice.fillRoundedRect(left + 4, top - 8, TUBE_W - 8, 34, 12);
      marks.add(ice);
      marks.add(
        this.add
          .text(0, top + 9, "❄", { fontFamily: "Arial, sans-serif", fontSize: "30px", color: "#2b6fa8" })
          .setOrigin(0.5),
      );
    }
    if (isLocked) {
      const lockBox = this.add.graphics();
      lockBox.fillStyle(0xffb020, 0.95);
      lockBox.fillRoundedRect(-34, -36, 68, 68, 14);
      marks.add(lockBox);
      marks.add(
        this.add
          .text(0, -2, "🔒", { fontFamily: "Arial, sans-serif", fontSize: "42px" })
          .setOrigin(0.5),
      );
    }

    if (isDone) {
      // 归位描边：一管倒满纯色是本品类最强的正反馈，给它持续的"奖章"边框
      const glow = this.add.graphics();
      glow.lineStyle(7, 0xffd25a, 0.95);
      glow.strokeRoundedRect(left - 2, top - 2, TUBE_W + 4, TUBE_H + 4, 28);
      marks.add(glow);
      if (justCompleted) this.celebrateTube(index);
    }
  }

  /** 归位爽点：管子弹跳 + 金色闪光 + 彩色水花 + 短促叮声。 */
  private celebrateTube(index: number): void {
    const container = this.tubeContainers[index];
    if (!container) return;
    // 倒完"叮"（独立 ding 音色，不再用 win 升调凑）
    this.playSound("ding", 0.65);
    this.tweens.killTweensOf(container);
    this.tweens.add({
      targets: container,
      scaleX: 1.09,
      scaleY: 1.09,
      yoyo: true,
      duration: 130,
      ease: "Back.easeOut",
      onComplete: () => container.setScale(1, 1),
    });
    const c = JUICE_COLORS[this.tubes[index][0]];
    if (!this.dropGfx) this.dropGfx = this.add.graphics().setDepth(20);
    this.pourColor = c.hex;
    this.spawnDrops(this.baseX[index], this.baseY[index] - this.tubeH / 2, 26);
  }

  // ---------- 交互 ----------

  private onTubeTap(index: number): void {
    if (this.busy || this.modalOpen) return;
    // 特殊管限制：锁管完全不可用；冰管只能作为目标（不能当源倒出）
    const sp = this.data_.specials;
    const isLocked = sp.locked === index && !this.lockUnlocked;
    const asSource = this.selectedIndex === null || this.selectedIndex === index;
    if (isLocked || (sp.ice.has(index) && asSource)) {
      this.rejectTube(index);
      return;
    }
    if (this.selectedIndex === null) {
      if (this.tubes[index].length === 0) return;
      this.selectedIndex = index;
      this.updateLift(index);
      this.playSound("click", 0.45);
      return;
    }
    if (this.selectedIndex === index) {
      this.selectedIndex = null;
      this.updateLift(index);
      this.playSound("click", 0.35);
      return;
    }
    const from = this.selectedIndex;
    const next = pour(this.tubes, from, index, this.data_.capacity);
    if (next) {
      this.pushHistory();
      this.selectedIndex = null;
      this.updateLift(from);
      this.moves++;
      this.totalPoured += next[index].length - this.tubes[index].length;
      // 雾管揭示：颜色一旦被倒出就公开（设计规则写的是"倒出时揭示"，旧版漏了写 revealedFog，
      // 导致雾管开局后永远是 ?，规则失效）
      if (sp.fog.has(from) && !this.revealedFog.has(from)) {
        this.revealedFog.add(from);
        this.redrawMarks(from);
      }
      // 锁管解锁判定
      if (sp.locked !== null && !this.lockUnlocked && this.moves >= sp.lockMoves) {
        this.lockUnlocked = true;
        this.redrawTube(sp.locked);
        const lockContainer = this.tubeContainers[sp.locked];
        if (lockContainer) {
          this.tweens.killTweensOf(lockContainer);
          this.tweens.add({
            targets: lockContainer,
            scaleX: 1.12,
            scaleY: 1.12,
            yoyo: true,
            duration: 160,
            onComplete: () => lockContainer.setScale(1, 1),
          });
        }
        this.playSound("win", 0.4);
      }
      if (this.movesText) this.movesText.setText(this.movesLabel());
      this.animatePour(from, index, next);
    } else {
      // 非法则把选择转移到新管（标准水排序手感）
      this.selectedIndex = this.tubes[index].length > 0 ? index : null;
      this.updateLift(from);
      this.updateLift(index);
      if (this.selectedIndex === index) this.playSound("click", 0.35);
    }
  }

  // ---------- 撤销 / 卡关 / 提示 ----------

  private pushHistory(): void {
    this.history.push({
      tubes: this.tubes.map((t) => t.slice()),
      moves: this.moves,
      revealedFog: new Set(this.revealedFog),
      lockUnlocked: this.lockUnlocked,
      freeHints: this.freeHints,
    });
    // 栈深上限：避免长局内存无限增长（超出丢最旧的，撤销仍保留最近 50 步）
    if (this.history.length > 50) this.history.shift();
  }

  /** 撤销一步（免费无限次）：误触不再毁局，是水排序品类的基本预期。 */
  private undo(): void {
    if (this.busy || this.modalOpen) return;
    const snap = this.history.pop();
    if (!snap) {
      this.playSound("click", 0.2);
      return;
    }
    this.tubes = snap.tubes.map((t) => t.slice());
    this.moves = snap.moves;
    this.revealedFog = new Set(snap.revealedFog);
    this.lockUnlocked = snap.lockUnlocked;
    this.freeHints = snap.freeHints;
    this.selectedIndex = null;
    this.hoverIndex = null;
    for (let i = 0; i < this.tubes.length; i++) {
      this.redrawTube(i);
      this.updateLift(i);
    }
    if (this.movesText) this.movesText.setText(this.movesLabel());
    if (this.hintBtnLabel) this.hintBtnLabel.setText(this.hintLabel());
    this.playSound("click", 0.4);
    track("undo", { level: this.data_.level, moves: this.moves });
  }

  /** 卡关检测：无合法移动且未完成 → 立刻给出口（撤销 / 重置 / 看广告加一管）。 */
  private checkStuck(): void {
    if (this.modalOpen || isComplete(this.tubes, this.data_.capacity)) return;
    // 口径与游戏规则一致：锁管锁定期完全不可用（不传 lock 会漏判死局 → 出口面板弹不出）
    const moves = legalMoves(this.tubes, this.data_.capacity, this.data_.specials.ice, this.lockInfo());
    if (moves.length > 0) return;
    track("stuck", { level: this.data_.level, moves: this.moves });
    this.showStuckPanel();
  }

  /** 附加一根空管（rewarded 奖励）：最高价值的救局手段，比"看广告解一步"更让玩家有掌控感。 */
  private addSpareTube(): void {
    this.tubes.push([]);
    this.buildTubes();
  }

  private toggleColorBlind(): void {
    this.colorBlind = !this.colorBlind;
    for (let i = 0; i < this.tubes.length; i++) {
      this.tubeLayers[i].liquid.clear();
      this.tubeLayers[i].glassDone = false;
      this.redrawTube(i);
    }
  }

  private animatePour(from: number, to: number, nextState: number[][]): void {
    this.busy = true;
    const src = this.tubeContainers[from];
    const dst = this.tubeContainers[to];
    const color = JUICE_COLORS[this.tubes[from][this.tubes[from].length - 1]];
    const dir = dst.x >= src.x ? 1 : -1;
    const POUR_ANGLE = 62;
    const TUBE_H = this.tubeH;
    const segH = (TUBE_H - 28) / this.data_.capacity;

    // 音效跟着水流走：开始倒时播，水流结束时停。
    // 用 sound.add() 拿确定实例（this.sound.play 的返回值跨 SoundManager 不可靠，
    // 可能返回 boolean，没有 stop 方法）。
    const pourSound = this.audioReady ? this.sound.add("pour") : null;
    pourSound?.play({ volume: 0.55 });

    // 倾倒全程源管置于顶层（不被相邻管遮挡），回位后归零
    src.setDepth(10);

    this.tweens.killTweensOf(src);
    // 瓶口对位：旋转 POUR_ANGLE 后，源管口恰好落在目标管口正上方
    const rot = Phaser.Math.DegToRad(dir * POUR_ANGLE);
    const mouthOffsetX = Math.sin(rot) * (TUBE_H / 2);
    const mouthOffsetY = -Math.cos(rot) * (TUBE_H / 2);
    const targetMouthX = dst.x;
    const targetMouthY = this.baseY[to] - TUBE_H / 2 - 64;

    // 1) 抬起 + 轻微反向蓄力（anticipation）→ 飞到目标管口正上方（口对口）并倾斜
    this.tweens.add({
      targets: src,
      y: this.baseY[from] - 40,
      x: src.x - dir * 12,
      duration: 90,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: src,
          x: targetMouthX - mouthOffsetX,
          y: targetMouthY - mouthOffsetY,
          angle: dir * POUR_ANGLE,
          duration: 220,
          ease: "Cubic.easeOut",
          onComplete: () => this.startStream(src, dst, color, dir, from, to, nextState, segH, pourSound),
        });
      },
    });
  }

  /** 倾倒阶段：粒子水流（受重力落进目标管）+ 目标液面涨落 + 源液面下降。 */
  private startStream(
    src: Phaser.GameObjects.Container,
    dst: Phaser.GameObjects.Container,
    color: { hex: number; dark: number; name: string },
    dir: number,
    from: number,
    to: number,
    nextState: number[][],
    segH: number,
    pourSound: Phaser.Sound.BaseSound | null,
  ): void {
    // 柔边水珠纹理（一次性生成；Canvas 渲染器不支持 tint，WebGL 下会染成液体色）
    if (!this.textures.exists("drop")) {
      const tex = this.make.graphics({}, false);
      tex.fillStyle(0xffffff, 0.3);
      tex.fillCircle(8, 8, 8);
      tex.fillStyle(0xffffff, 0.65);
      tex.fillCircle(8, 8, 5.5);
      tex.fillStyle(0xffffff, 1);
      tex.fillCircle(8, 8, 3);
      tex.generateTexture("drop", 16, 16);
      tex.destroy();
    }

    const a = Phaser.Math.DegToRad(src.angle);
    // 发射点：管口下边沿（倒水的实际出口，随旋转）
    const MOUTH_OFFSET = this.tubeH / 2 - 14;
    const mouthX = src.x + Math.sin(a) * MOUTH_OFFSET;
    const mouthY = src.y - Math.cos(a) * MOUTH_OFFSET;

    const oldFilled = this.tubes[to].length;
    const newFilled = nextState[to].length;
    const oldSrcFilled = this.tubes[from].length;
    const newSrcFilled = nextState[from].length;

    // 粒子水流：自写粒子池（Phaser ParticleEmitter 在 Canvas 渲染器下不出粒子，弃用）。
    // 物理手动更新 + Graphics 直接绘制，行为完全确定。
    // 粒子总量与倒出水量（段数）成正比：发射率恒定，倾倒时长 = 段数 × 170ms。
    const amount = nextState[to].length - this.tubes[to].length;
    const pourMs = Math.max(170, amount * 170);
    this.pourColor = color.hex;
    this.dropGfx = this.add.graphics().setDepth(20);
    // ~1850 粒/秒（1 段 ≈ 320 粒，段数加倍则粒子总量加倍）
    const emitTimer = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => this.spawnDrops(mouthX, mouthY, 30),
    });

    // 液面涨落：目标顶部块涨到满、源顶部块下降（与倾倒同步）
    const targetState = { r: Math.max(0.12, oldFilled / Math.max(1, newFilled)) };
    const srcState = { r: Math.max(0.12, newSrcFilled / Math.max(1, oldSrcFilled)) };
    this.tweens.add({
      targets: targetState,
      r: 1,
      duration: pourMs,
      ease: "Sine.easeOut",
      onUpdate: () => {
        // 只重画液体层（玻璃/标记不变），避免每帧重建 Graphics 对象
        this.redrawLiquid(to, targetState.r);
        this.redrawLiquid(from, srcState.r);
      },
    });
    this.tweens.add({ targets: srcState, r: 1, duration: pourMs, ease: "Sine.easeOut" });

    // 倾倒收尾 + 状态落定 + 回位（follow-through 轻摆）
    this.time.delayedCall(pourMs, () => {
      emitTimer.remove();
      // 状态落定优先：音频停止失败不得影响游戏逻辑
      this.tubes = nextState;
      this.redrawTube(from);
      this.redrawTube(to);
      try {
        pourSound?.stop();
        pourSound?.destroy();
      } catch {
        /* 音频停止失败静默 */
      }
      // 目标管落位反馈
      this.tweens.killTweensOf(dst);
      dst.setScale(1, 1);
      this.tweens.add({ targets: dst, scaleY: 1.05, scaleX: 0.97, duration: 90, yoyo: true, ease: "Sine.easeOut" });
      // 源管沿弧线飞回并回正（末端 overshoot 摆动）
      this.tweens.add({
        targets: src,
        x: this.baseX[from],
        y: this.baseY[from],
        angle: 0,
        duration: 230,
        ease: "Back.easeOut",
        onComplete: () => {
          src.setDepth(0);
          this.busy = false;
          this.checkWin();
          // 走投无路时立刻弹出口面板（赢了会先开胜利面板，此处自动跳过）
          this.checkStuck();
        },
      });
    });
  }

  // ---------- 流程 ----------

  private restartLevel(): void {
    if (this.busy || this.adBusy) return;
    track("level_restart", { level: this.data_.level, moves: this.moves });
    // 传回开局快照：重开是同一题（par / 星级可比），不是换题
    this.scene.restart({ level: this.data_.level, levelData: this.initialData ?? undefined });
  }

  /** 提示：每关先送几次免费，用完才走 rewarded（强制广告的摩擦太大，结果是没人用 = 零收入）。 */
  private async useHint(): Promise<void> {
    if (this.busy || this.adBusy || this.modalOpen) return;
    if (this.freeHints > 0) {
      this.freeHints--;
      if (this.hintBtnLabel) this.hintBtnLabel.setText(this.hintLabel());
      this.applyHint("free");
      return;
    }
    this.adBusy = true;
    const granted = await showRewarded("hint");
    this.adBusy = false;
    if (!granted) return;
    track("revive_rewarded", { placement: "hint", level: this.data_.level });
    this.applyHint("rewarded");
  }

  private applyHint(source: "free" | "rewarded"): void {
    const move = findHint(this.tubes, this.data_.capacity, this.data_.specials.ice, this.lockInfo());
    if (!move) return;
    track("hint_use", { level: this.data_.level, source });
    this.flashTube(move.from);
    this.flashTube(move.to);
  }

  private flashTube(index: number): void {
    const container = this.tubeContainers[index];
    if (!container) return;
    this.tweens.add({
      targets: container,
      scale: 1.08,
      yoyo: true,
      repeat: 3,
      duration: 160,
      ease: "Sine.easeInOut",
    });
  }

  private checkWin(): void {
    if (!isComplete(this.tubes, this.data_.capacity)) return;
    this.playSound("win", 0.8);
    track("level_complete", {
      level: this.data_.level,
      moves: this.moves,
      par: this.data_.minSteps,
      stars: DIFFICULTY.starsForSteps(this.moves, this.data_.minSteps || this.moves),
    });
    void saveProgress({ level: this.data_.level + 1, totalPoured: this.totalPoured });
    this.showWinPanel();
  }

  /** 卡关面板：走投无路时立刻给三个出口，别让玩家瞎点然后流失。 */
  private showStuckPanel(): void {
    this.modalOpen = true;
    // 失败/无解"低沉"（设计音效表）
    this.playSound("fail", 0.55);
    const objs: Phaser.GameObjects.GameObject[] = [];
    const overlay = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x000000, 0.5);
    overlay.setInteractive();
    objs.push(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(UI.panel, 1);
    panel.fillRoundedRect(DESIGN_W / 2 - 290, DESIGN_H / 2 - 250, 580, 500, 36);
    objs.push(panel);

    objs.push(
      this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 - 160, "OUT OF MOVES", {
          fontFamily: "Arial, sans-serif",
          fontSize: "52px",
          color: "#e06e00",
          fontStyle: "bold",
        })
        .setOrigin(0.5),
      this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 - 100, "No legal pour left — pick a way out", {
          fontFamily: "Arial, sans-serif",
          fontSize: "26px",
          color: "#9a7248",
        })
        .setOrigin(0.5),
    );

    const close = () => {
      objs.forEach((o) => o.destroy());
      this.modalOpen = false;
    };
    const rowY = DESIGN_H / 2 + 40;
    const opts: { label: string; sub: string; color: number; onTap: () => void | Promise<void> }[] = [
      {
        label: "↩",
        sub: "UNDO",
        color: UI.accent,
        onTap: () => {
          close();
          this.undo();
        },
      },
      {
        label: "+1",
        sub: "TUBE · AD",
        color: 0x3ba7ff,
        onTap: async () => {
          close();
          if (this.adBusy) return;
          this.adBusy = true;
          const granted = await showRewarded("add_tube");
          this.adBusy = false;
          if (!granted) return;
          track("revive_rewarded", { placement: "add_tube", level: this.data_.level });
          this.addSpareTube();
        },
      },
      {
        label: "↻",
        sub: "RESET",
        color: 0x9a7248,
        onTap: () => {
          close();
          this.restartLevel();
        },
      },
    ];
    opts.forEach((opt, i) => {
      const x = DESIGN_W / 2 + (i - 1) * 180;
      const bg = this.add.circle(x, rowY, 72, 0xffffff, 1).setStrokeStyle(6, opt.color);
      const icon = this.add
        .text(x, rowY - 10, opt.label, { fontFamily: "Arial, sans-serif", fontSize: "44px", color: "#5b3a1e", fontStyle: "bold" })
        .setOrigin(0.5);
      const sub = this.add
        .text(x, rowY + 38, opt.sub, { fontFamily: "Arial, sans-serif", fontSize: "20px", color: "#9a7248" })
        .setOrigin(0.5);
      // 只让 bg 接收输入（文字再 interactive 会触发两次）
      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerdown", () => void opt.onTap());
      objs.push(bg, icon, sub);
    });
  }

  private showWinPanel(): void {
    this.modalOpen = true;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const overlay = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x000000, 0.45);
    overlay.setInteractive();
    objs.push(overlay);
    const panel = this.add.graphics();
    panel.fillStyle(UI.panel, 1);
    panel.fillRoundedRect(DESIGN_W / 2 - 260, DESIGN_H / 2 - 240, 520, 480, 36);
    objs.push(panel);

    const title = this.add
      .text(DESIGN_W / 2, DESIGN_H / 2 - 120, "JUICY!", {
        fontFamily: "Arial, sans-serif",
        fontSize: "96px",
        color: "#e06e00",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    objs.push(title);
    // 彩带：胜利时刻的高光，别让结算面板死气沉沉
    this.spawnConfetti();

    const stars = DIFFICULTY.starsForSteps(this.moves, this.data_.minSteps || this.moves);
    const starChars = "★".repeat(stars) + "☆".repeat(3 - stars);
    const starText = this.add
      .text(DESIGN_W / 2, DESIGN_H / 2 - 48, starChars, {
        fontFamily: "Arial, sans-serif",
        fontSize: "56px",
        color: "#ffb020",
      })
      .setOrigin(0.5);
    objs.push(starText);
    // 星星逐个弹出（stagger），结算有节奏感
    starText.setScale(0.2);
    this.tweens.add({ targets: starText, scale: 1, duration: 260, ease: "Back.easeOut", delay: 120 });

    const sub = this.add
      .text(DESIGN_W / 2, DESIGN_H / 2 + 8, `${this.moves} moves · par ${this.data_.minSteps || "-"}`, {
        fontFamily: "Arial, sans-serif",
        fontSize: "32px",
        color: "#9a7248",
      })
      .setOrigin(0.5);
    objs.push(sub);

    // 按钮不得压住副标题（旧版 r=110 顶边正好落在副标题上，文案被遮）
    // 双出口：NEXT（标准难度递进）/ JUNGLE+（无尽模式：下一局 +2 管继续，30 管封顶）
    const btnY = DESIGN_H / 2 + 140;
    let gone = false;
    const goNext = async (jungleContinue: boolean): Promise<void> => {
      if (gone) return;
      gone = true;
      objs.forEach((o) => o.destroy());
      this.modalOpen = false;
      // 前几关保护 + 之后每 N 关一次插屏（胜利面板是自然停顿点，不打断操作）
      const level = this.data_.level;
      if (
        level >= LEVEL_CONFIG.interstitialStartLevel &&
        level % LEVEL_CONFIG.interstitialEveryLevels === 0
      ) {
        await showInterstitial("level_complete");
      }
      this.scene.restart({ level: level + 1, jungle: jungleContinue ? this.jungle + 1 : 0 });
    };
    const makeWinBtn = (x: number, label: string, sub: string, color: number, onTap: () => void) => {
      const bg = this.add.circle(x, btnY, 76, color).setStrokeStyle(8, 0xffffff, 0.55);
      objs.push(bg);
      objs.push(
        this.add
          .text(x, btnY - 14, label, {
            fontFamily: "Arial, sans-serif",
            fontSize: label.length > 5 ? "32px" : "40px",
            color: "#ffffff",
            fontStyle: "bold",
          })
          .setOrigin(0.5),
        this.add
          .text(x, btnY + 26, sub, { fontFamily: "Arial, sans-serif", fontSize: "19px", color: "#ffffff" })
          .setOrigin(0.5),
      );
      bg.setScale(0.6);
      this.tweens.add({ targets: bg, scale: 1, duration: 220, ease: "Back.easeOut", delay: 260 });
      // 只让 bg 接收输入：文字再 interactive 会触发两次（两次插屏 + 两次 restart）
      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerdown", onTap);
    };
    makeWinBtn(DESIGN_W / 2 - 118, "NEXT", "LEVEL +1", UI.accent, () => void goNext(false));
    makeWinBtn(DESIGN_W / 2 + 118, "JUNGLE+", "+2 TUBES", 0x4da01c, () => void goNext(true));
  }

  /** 胜利彩带：随机果汁色水珠从顶部洒落。 */
  private spawnConfetti(): void {
    if (!this.dropGfx) this.dropGfx = this.add.graphics().setDepth(30);
    for (let i = 0; i < 70; i++) {
      const c = JUICE_COLORS[Phaser.Math.Between(0, JUICE_COLORS.length - 1)];
      this.drops.push({
        x: Phaser.Math.Between(40, DESIGN_W - 40),
        y: Phaser.Math.Between(-160, -20),
        vx: Phaser.Math.Between(-60, 60),
        vy: Phaser.Math.Between(120, 320),
        life: 0,
        maxLife: Phaser.Math.Between(1200, 2200) / 1000,
        size: Phaser.Math.Between(5, 11),
        color: c.hex,
      });
    }
  }
}
