/**
 * juice —— 休闲游戏打击感与程序化动画核心库
 *
 * 纯 TypeScript、零依赖、引擎无关（Phaser 适配见 ./juice-phaser.ts）。
 * 覆盖两块横切需求：
 *   1. 打击感五件套：hit-stop、屏幕震动、挤压拉伸（squash & stretch）、弹入弹出、飘字；
 *   2. 分部件骨骼程序化动画：walkCycle / idlePose / limbSway / followThrough，
 *      代替逐帧 sprite sheet（配合 sprite-pipeline 技能的 Part-Based Rig 路线）。
 *
 * 单位约定：角度一律用“度”（Phaser tween 的原生单位），时间一律用“秒”。
 * 所有函数对 t=0 / t=1 边界有确定行为，便于单元测试与可重现调参。
 */

// ============ 基础工具 ============

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 帧率无关的指数趋近：rate 越大追得越快。 */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

// ============ Easing ============

export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;

export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);

export const easeInCubic: Easing = (t) => t * t * t;

export const easeInOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** 回弹过冲版（overshoot ≈ 1.7），适合弹入、落地回弹。f(0)=0，f(1)=1。 */
export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** 弹性收尾，适合奖励、升级类强调。f(0)=0，f(1)=1。 */
export const easeOutElastic: Easing = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

export const easeOutBounce: Easing = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

// ============ Tween（引擎无关补间） ============

export interface TweenOptions {
  from: number;
  to: number;
  /** 秒 */
  duration: number;
  easing?: Easing;
  /** 每次 update 回调当前值与进度（0..1） */
  onUpdate: (value: number, progress: number) => void;
  onComplete?: () => void;
}

/**
 * 极简补间：宿主每帧调 update(dt)，返回是否已结束。
 * 适合引擎 tween 不便表达的自定义曲线（配合粒子、Canvas 直绘等）。
 */
export class Tween {
  private elapsed = 0;
  private finished = false;
  private readonly easing: Easing;

  constructor(private readonly options: TweenOptions) {
    this.easing = options.easing ?? easeOutCubic;
    // 立即给出初始值，避免首帧闪烁
    options.onUpdate(options.from, 0);
  }

  update(dt: number): boolean {
    if (this.finished) return true;
    this.elapsed += dt;
    const progress = this.options.duration <= 0 ? 1 : clamp(this.elapsed / this.options.duration, 0, 1);
    const value = lerp(this.options.from, this.options.to, this.easing(progress));
    this.options.onUpdate(value, progress);
    if (progress >= 1) {
      this.finished = true;
      this.options.onComplete?.();
    }
    return this.finished;
  }

  get done(): boolean {
    return this.finished;
  }

  cancel(): void {
    this.finished = true;
  }
}

// ============ Hit-stop / 慢动作（TimeScaler） ============

/**
 * 时间缩放控制器：hit-stop（命中停顿）与短时慢动作。
 * 宿主游戏循环用 `dt * scaler.scale` 消费模拟时间即可；scaler.update 用真实时间推进。
 */
export class TimeScaler {
  private clock = 0;
  private frozenUntil = 0;
  private slowUntil = 0;
  private slowScale = 1;

  /** 命中停顿：停 seconds 秒（推荐 0.04–0.09），期间 scale=0。重复调用取更晚的恢复点。 */
  hitStop(seconds = 0.06): void {
    const until = this.clock + Math.max(0, seconds);
    if (until > this.frozenUntil) this.frozenUntil = until;
  }

  /** 短时慢动作：scale 作用 seconds 秒后恢复 1（如击杀瞬间 0.3 倍速 0.25 秒）。 */
  slowMotion(scale: number, seconds: number): void {
    this.slowScale = clamp(scale, 0, 1);
    this.slowUntil = this.clock + Math.max(0, seconds);
  }

  /** 用真实 dt 推进内部时钟。 */
  update(dt: number): void {
    this.clock += dt;
  }

  get scale(): number {
    if (this.clock < this.frozenUntil) return 0;
    if (this.clock < this.slowUntil) return this.slowScale;
    return 1;
  }

  get frozen(): boolean {
    return this.clock < this.frozenUntil;
  }

  reset(): void {
    this.frozenUntil = 0;
    this.slowUntil = 0;
    this.slowScale = 1;
  }
}

// ============ 屏幕震动（Shake，trauma 模型） ============

export interface ShakeOffset {
  x: number;
  y: number;
  /** 度 */
  angle: number;
}

export interface ShakeOptions {
  /** trauma=1 时的最大像素偏移，默认 10 */
  maxOffset?: number;
  /** trauma=1 时的最大角度偏移（度），默认 1.2 */
  maxAngle?: number;
  /** 噪声频率，越大抖得越碎，默认 18 */
  frequency?: number;
  /** trauma 每秒衰减量，默认 1.8 */
  decay?: number;
}

/**
 * trauma 模型的屏幕震动：add() 累积“冲击量”（0..1），update(dt) 给出当前偏移。
 * 偏移 ∝ trauma²，小冲击几乎不动、大冲击明显，多次命中叠加。
 */
export class Shake {
  private trauma = 0;
  private time = 0;
  private readonly maxOffset: number;
  private readonly maxAngle: number;
  private readonly frequency: number;
  private readonly decay: number;

  constructor(options: ShakeOptions = {}) {
    this.maxOffset = options.maxOffset ?? 10;
    this.maxAngle = options.maxAngle ?? 1.2;
    this.frequency = options.frequency ?? 18;
    this.decay = options.decay ?? 1.8;
  }

  /** 累积冲击量（自动 clamp 到 0..1）。轻微点击 0.15，重击 0.4，爆炸 0.8。 */
  add(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  update(dt: number): ShakeOffset {
    this.time += dt;
    this.trauma = clamp(this.trauma - this.decay * dt, 0, 1);
    const shake = this.trauma * this.trauma;
    const t = this.time * this.frequency;
    // 确定性伪噪声（sin 叠加）：同参数同结果，不引入随机源
    return {
      x: this.maxOffset * shake * Math.sin(t * 1.7) * Math.sin(t * 0.9 + 1.3),
      y: this.maxOffset * shake * Math.sin(t * 2.1 + 2.4) * Math.sin(t * 1.1),
      angle: this.maxAngle * shake * Math.sin(t * 1.3 + 0.7),
    };
  }

  get active(): boolean {
    return this.trauma > 0;
  }

  reset(): void {
    this.trauma = 0;
  }
}

// ============ 挤压拉伸（Squash & Stretch） ============

export interface Scale2D {
  scaleX: number;
  scaleY: number;
}

/**
 * 恢复型挤压拉伸：progress 0→1 从形变恢复到 1:1。
 * strength 为正 = 落地挤压（横向变宽、纵向压扁）；为负 = 起跳拉伸（纵向拉长）。
 * 推荐 strength 0.2–0.35；配合 Tween 或直接每帧代入。
 */
export function squashStretch(progress: number, strength: number): Scale2D {
  const p = clamp(progress, 0, 1);
  const amount = strength * (1 - easeOutBack(p));
  return { scaleX: 1 + amount, scaleY: 1 - amount };
}

/** 落地挤压（语义别名）：strength 默认 0.28。 */
export function landSquash(progress: number, strength = 0.28): Scale2D {
  return squashStretch(progress, strength);
}

/** 起跳拉伸（语义别名）：strength 默认 0.22。 */
export function jumpStretch(progress: number, strength = 0.22): Scale2D {
  return squashStretch(progress, -strength);
}

// ============ 常用反馈曲线 ============

/** 弹入缩放曲线：t 0→1，从 0 弹到 1（带过冲）。直接当 scale 用。 */
export function popInScale(t: number): number {
  return easeOutBack(clamp(t, 0, 1));
}

/** 心跳/提示脉冲：t 0→1，输出 0..1..0。 */
export function pulse(t: number): number {
  return Math.sin(Math.PI * clamp(t, 0, 1));
}

/** 衰减晃动：t 0→1，输出 -1..1 的衰减正弦（选错抖动、警告摇摆）。 */
export function wobble(t: number, decay = 4): number {
  const p = clamp(t, 0, 1);
  return Math.sin(p * Math.PI * 6) * Math.exp(-decay * p);
}

/** 飘字轨迹：t 0→1，返回上浮偏移（px，负值向上）与不透明度。 */
export function floatTextOffset(t: number, distance = 40): { y: number; alpha: number } {
  const p = clamp(t, 0, 1);
  return {
    y: -distance * easeOutCubic(p),
    // 前 60% 时间保持可读，后段淡出
    alpha: p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4,
  };
}

// ============ 分部件骨骼程序化动画（Part-Based Rig） ============

/**
 * 部件姿态：所有值都是“相对基准位”的偏移，叠加到部件的静态摆放上。
 * 角度单位为度，正角为顺时针（与 Phaser 一致）。
 */
export interface PartPose {
  x: number;
  y: number;
  angle: number;
  scaleX: number;
  scaleY: number;
}

export function neutralPose(): PartPose {
  return { x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1 };
}

/** 上下浮动（道具悬浮、角色呼吸）：返回 y 偏移（px，负值向上）。 */
export function bob(t: number, amplitude = 4, frequency = 1, phase = 0): number {
  return -amplitude * (0.5 + 0.5 * Math.sin(2 * Math.PI * frequency * t + phase));
}

/** 四肢摆动角（度）：走路/跑步手臂大腿摆动的基础波形。 */
export function limbSway(t: number, amplitude = 18, frequency = 1, phase = 0): number {
  return amplitude * Math.sin(2 * Math.PI * frequency * t + phase);
}

export interface WalkCycleConfig {
  /** 步频（Hz），默认 1.4 ≈ 休闲游戏小跑 */
  frequency?: number;
  /** 腿摆角幅度（度），默认 22 */
  legAmplitude?: number;
  /** 臂摆角幅度（度），默认 16 */
  armAmplitude?: number;
  /** 身体起伏（px），默认 3 */
  bodyBob?: number;
  /** 头部附加起伏（px），默认 2 */
  headBob?: number;
}

export interface WalkPose {
  body: PartPose;
  head: PartPose;
  leftArm: PartPose;
  rightArm: PartPose;
  leftLeg: PartPose;
  rightLeg: PartPose;
}

/**
 * 走路循环姿态采样：任意时刻 t（秒）给出全身六部件的偏移。
 * 相位约定：左臂与右腿同相、右臂与左腿同相（自然步态）；身体起伏为 2 倍频（一步一沉）。
 * 播放：游戏循环里按 t 累加，把返回值叠加到各部件 pivot 上即可，无需 sprite sheet。
 */
export function walkCycle(t: number, config: WalkCycleConfig = {}): WalkPose {
  const frequency = config.frequency ?? 1.4;
  const legAmplitude = config.legAmplitude ?? 22;
  const armAmplitude = config.armAmplitude ?? 16;
  const bodyBobPx = config.bodyBob ?? 3;
  const headBobPx = config.headBob ?? 2;

  const phase = 2 * Math.PI * frequency * t;
  const legAngle = limbSway(t, legAmplitude, frequency);
  const armAngle = limbSway(t, armAmplitude, frequency);
  const bodyY = -bodyBobPx * (0.5 + 0.5 * Math.sin(2 * phase));
  const headY = bodyY - headBobPx * (0.5 + 0.5 * Math.sin(2 * phase + 0.6));

  const pose = (y: number, angle: number): PartPose => ({ x: 0, y, angle, scaleX: 1, scaleY: 1 });
  return {
    body: pose(bodyY, 0),
    head: pose(headY, limbSway(t, 3, frequency, 0.6)),
    leftArm: pose(0, armAngle),
    rightArm: pose(0, -armAngle),
    leftLeg: pose(0, legAngle),
    rightLeg: pose(0, -legAngle),
  };
}

export interface IdlePoseConfig {
  /** 呼吸频率（Hz），默认 0.45 */
  breathFrequency?: number;
  /** 身体起伏（px），默认 2 */
  breathAmplitude?: number;
  /** 微摆角幅度（度），默认 2 */
  swayAmplitude?: number;
}

/**
 * 待机姿态：呼吸起伏 + 极轻微摆。t 为秒。
 * 用于替代“idle 微动画”生成帧（参见 sprite-pipeline 的 Animation Triage）。
 */
export function idlePose(t: number, config: IdlePoseConfig = {}): WalkPose {
  const breathFrequency = config.breathFrequency ?? 0.45;
  const breathAmplitude = config.breathAmplitude ?? 2;
  const swayAmplitude = config.swayAmplitude ?? 2;

  const bodyY = bob(t, breathAmplitude, breathFrequency);
  const sway = limbSway(t, swayAmplitude, breathFrequency * 0.5, 1.2);
  const pose = (y: number, angle: number): PartPose => ({ x: 0, y, angle, scaleX: 1, scaleY: 1 });
  return {
    body: pose(bodyY, 0),
    head: pose(bodyY * 1.4, sway * 0.6),
    leftArm: pose(0, sway * 0.5),
    rightArm: pose(0, -sway * 0.5),
    leftLeg: pose(0, 0),
    rightLeg: pose(0, 0),
  };
}

export interface FollowState {
  angle: number;
  velocity: number;
}

/**
 * 跟随（follow-through）弹簧：让尾巴、头发、挂件等延迟追向目标角（度）。
 * 每帧调用，把返回的 angle 应用到部件上。stiffness 越大追得越快，damping 越大摆动收敛越快。
 */
export function followThrough(
  state: FollowState,
  targetAngle: number,
  dt: number,
  stiffness = 40,
  damping = 6,
): FollowState {
  const spring = (targetAngle - state.angle) * stiffness;
  const velocity = (state.velocity + spring * dt) * Math.exp(-damping * dt);
  return { angle: state.angle + velocity * dt, velocity };
}

/** 单部件姿态叠加：把偏移量合并到基准姿态上。 */
export function applyPose(base: PartPose, offset: PartPose): PartPose {
  return {
    x: base.x + offset.x,
    y: base.y + offset.y,
    angle: base.angle + offset.angle,
    scaleX: base.scaleX * offset.scaleX,
    scaleY: base.scaleY * offset.scaleY,
  };
}