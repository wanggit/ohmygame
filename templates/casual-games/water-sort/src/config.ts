/** 主题与玩法配置：A1《Juice Sort · 鲜榨果汁》。换皮变奏（A2/A3）只需改此文件。 */

export const GAME_TITLE = "Juice Sort: Color Water Puzzle";

/** 每种果汁：id 用于逻辑，hex 用于绘制，name 用于无障碍与文案，pattern 为色盲辅助纹样。 */
export interface JuiceColor {
  id: number;
  hex: number;
  dark: number;
  name: string;
  /** 色盲辅助纹样编号（0-8，见 GameScene.drawPattern）：保证颜色之外还有第二条区分通道。 */
  pattern: number;
}

/** 果汁配色（明亮、区分度高，深色底上可读；近似色（Peach/Watermelon、Lemon/Orange）已错开纹样）。 */
export const JUICE_COLORS: JuiceColor[] = [
  { id: 0, hex: 0xff8c1a, dark: 0xe06e00, name: "Orange", pattern: 0 },
  { id: 1, hex: 0xb44adf, dark: 0x9330bd, name: "Grape", pattern: 1 },
  { id: 2, hex: 0x63c22b, dark: 0x4da01c, name: "Lime", pattern: 2 },
  { id: 3, hex: 0xff5f7e, dark: 0xe04462, name: "Watermelon", pattern: 3 },
  { id: 4, hex: 0x3ba7ff, dark: 0x2289e0, name: "Blueberry", pattern: 4 },
  { id: 5, hex: 0xffd21a, dark: 0xe0b400, name: "Lemon", pattern: 5 },
  { id: 6, hex: 0xff7ac8, dark: 0xe05eb0, name: "Peach", pattern: 6 },
  { id: 7, hex: 0x2fd6c3, dark: 0x17b8a5, name: "Mint", pattern: 7 },
  { id: 8, hex: 0x8b5a2b, dark: 0x744a22, name: "Cola", pattern: 8 },
  { id: 9, hex: 0xff3b5c, dark: 0xd82344, name: "Strawberry", pattern: 9 },
];

export const LEVEL_CONFIG = {
  /** 每管容量（液体段数）。 */
  tubeCapacity: 4,
  /** 前 N 关不插 interstitial（新手期保护，避免开局就劝退）。 */
  interstitialStartLevel: 3,
  /** 此后每 N 关插一次 interstitial（不在操作中触发，见 GameScene）。 */
  interstitialEveryLevels: 3,
  /** 每关赠送的免费提示次数，用完后才走 rewarded。 */
  freeHintsPerLevel: 1,
};

/**
 * 难度模型（模板核心资产：模型进模板，数值靠玩测数据迭代）。
 * 维度：颜色数（认知负荷）/ 分散度=装色管数（同色单位摊到更多管，管数 5→30）/
 *      目标最少步数（纠缠深度）/ 特殊管（锁管时限、冰管只进不出、雾管不可见）。
 *
 * 校准纪律（踩坑录 #7）：改数值前先 `bun run measure`。
 * 实测解长天花板由「10 色 × 4 格」定死：p50 封顶 ≈53、max ≈57（24-40 样本）。
 * 难度爬升区在 L1-L25（12→52 步）；尾部（L25+）解长进入平台期，
 * 靠管数 5→30、锁管 4→12 步、冰/雾管密度维持压力与变化。
 */
export const DIFFICULTY = {
  /** 颜色数：第 1 关 3 色（教学），此后每 3 关 +1，封顶 10（设计上限）。 */
  colorsForLevel(level: number): number {
    if (level <= 1) return 3;
    return Math.min(4 + Math.floor((level - 2) / 3), 10);
  },
  /**
   * 分散度增量（同色分散度）：装色管数 = 色数 + 此增量。
   * 增量越大，每管单位越少（40 单位摊到 27 管 = 多数管只装 1-2 格），盘面越乱、管数越多。
   * 实测难度峰值在 1.5-2 倍色数附近；继续摊薄解长趋平，但"30 管盲盒"的视觉混乱度继续上升。
   */
  spreadExtraForLevel(level: number): number {
    if (level < 8) return 0;
    return Math.min(17, Math.floor((level - 5) * 0.5));
  },
  /** 装色管数（总管数 = 此值 + spareTubesForLevel）。 */
  filledTubesForLevel(level: number, colors: number): number {
    return colors + this.spreadExtraForLevel(level);
  },
  /**
   * 空管数：空管是本品类最强的难度旋钮，但不能随便减——1 根空管再叠一根锁管（同为空管），
   * 前 lockMoves 步就是 0 可用缓冲，直接死局（实测 level 9/12 稳定不可解）。
   * L20+ 给 3 根：锁管 + 冰管各占 1 根后仍留 1 根自由缓冲。
   */
  spareTubesForLevel(level: number, colors: number): number {
    if (level <= 4) return 2;
    if (level >= 20) return 3;
    if (colors >= 6) return 2;
    return level % 3 === 0 ? 1 : 2;
  },
  /**
   * 目标最少步数范围（用 solver 解长筛选关卡）。
   * 难度主轴是**色数**（认知负荷），分散度/锁管次之，关卡号只做微调。
   * min 锚定在实测分布 p25 附近（保证命中率），max = 2×min（宽松上界，接受解长自然波动）。
   *
   * 数值必须落在**实测可达区间**内（`bun run measure`，40 样本/配置）：
   * 4色 p50=16、5色 19、6色 24、7色 28、8色 32、9色 38、10色 42（整管发牌）；
   * 分散度每 +1 管约 +1 步，锁管每 +1 步约 +0.5 步；天花板 p50≈53。
   * 门槛一旦超出可达区间，生成器会全军覆没走兜底，产出"开局即胜利 + 假 par"的废关卡（实测踩坑）。
   */
  targetStepsForLevel(level: number, colors?: number, filled?: number): { min: number; max: number } {
    const c = colors ?? this.colorsForLevel(level);
    const f = filled ?? this.filledTubesForLevel(level, c);
    const rules = this.specialsForLevel(level, c);
    const lock = rules.lockedTube > 0 ? rules.lockMoves : 0;
    const min = Math.min(
      50,
      Math.round(c * 3.2 + Math.min(12, Math.max(0, f - c) * 0.9) + lock * 0.35),
    );
    return { min, max: min * 2 };
  },
  /**
   * 特殊管规则（每类都经 solver 可解性验证，保证不破坏关卡）。
   * fog=雾管（颜色不可见，倒出时揭示）；locked=锁管（N 步后解锁的缓冲管）；
   * ice=冰管（**空管起步**，只进不出的排水槽——随机混色管做冰管倒不出底色 = 必然死局，实测 0/20 可解）。 */
  specialsForLevel(level: number, colors: number): SpecialRules {
    if (level < 7) return { fogTubes: 0, lockedTube: 0, iceTubes: 0, lockMoves: 0 };
    return {
      fogTubes: level >= 12 && colors >= 6 ? (level >= 30 ? 2 : 1) : 0,
      lockedTube: level >= 8 ? 1 : 0,
      iceTubes: level >= 20 ? (level >= 40 ? 2 : 1) : 0,
      // 锁定时长随关卡增长（尾部难度杠杆）：L8=5 步 → L44+ 封顶 12 步
      lockMoves: Math.min(12, 4 + Math.floor(level / 6)),
    };
  },
  /** 星级：相对最优解的用步效率。 */
  starsForSteps(steps: number, minSteps: number): 1 | 2 | 3 {
    if (steps <= Math.round(minSteps * 1.25)) return 3;
    if (steps <= Math.round(minSteps * 1.75)) return 2;
    return 1;
  },
};

export interface SpecialRules {
  /** 雾管数量（随机分配给装色管）。 */
  fogTubes: number;
  /** 锁管数量（0 或 1；锁定空管，N 步后解锁）。 */
  lockedTube: number;
  /** 冰管数量（随机分配给装色管；只能倒入不能倒出）。 */
  iceTubes: number;
  /** 解锁所需倒水次数。 */
  lockMoves: number;
}

/** 界面配色（果汁摊风格暖色）。 */
export const UI = {
  background: 0xffe8c9,
  backgroundDeep: 0xffd9a8,
  panel: 0xfff6ea,
  tubeGlass: 0xffffff,
  tubeRim: 0xf2b26b,
  text: 0x5b3a1e,
  textSoft: 0x9a7248,
  accent: 0xff8c1a,
  accentDark: 0xe06e00,
};
