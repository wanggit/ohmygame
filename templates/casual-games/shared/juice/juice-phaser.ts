/**
 * juice 的 Phaser 4 适配层。
 *
 * 通过鸭子类型接口接收 scene / camera 等宿主对象，不依赖 Phaser 类型包，
 * 因此既可在模板项目里直接用（传 `this` 即可），也可在无 Phaser 环境下单元测试。
 * 所有 tween 配置都由纯函数构造（build*Config），动作函数只是“构造 + tweens.add”的语法糖。
 *
 * 用法示例（GameScene 内）：
 *   popIn(this, this.add.image(x, y, "star"));
 *   onMergeSuccess: hitStop(this, this.time, 60); shake(this.cameras.main, 0.35); squashLand(this, tile);
 */

import { floatTextOffset, type Easing } from "./juice.js";

// ============ 鸭子类型宿主接口 ============

export interface TweenConfig {
  targets: unknown;
  [key: string]: unknown;
}

export interface TweenHost {
  add(config: TweenConfig): unknown;
}

export interface TimeHost {
  delayedCall(ms: number, callback: () => void): unknown;
}

export interface CameraHost {
  /** Phaser 系相机震动：durationMs 毫秒、intensity 0..0.01 量级 */
  shake(durationMs: number, intensity?: number): void;
}

export interface SceneHost {
  tweens: TweenHost;
}

export interface ScaleTarget {
  scale: { x: number; y: number };
}

export interface AlphaTarget {
  alpha: number;
}

// ============ tween 配置构造（纯函数，可单测） ============

export interface PopInOptions {
  /** 毫秒，默认 220 */
  durationMs?: number;
  /** 起始缩放，默认 0 */
  from?: number;
}

/** 弹入：scale 从 from 弹到 1（Back.easeOut 过冲）。 */
export function buildPopInConfig(target: unknown, options: PopInOptions = {}): TweenConfig {
  return {
    targets: target,
    scale: { from: options.from ?? 0, to: 1 },
    ease: "Back.easeOut",
    duration: options.durationMs ?? 220,
  };
}

export interface SquashLandOptions {
  /** 毫秒，默认 180 */
  durationMs?: number;
  /** 形变强度 0..1，默认 0.28 */
  strength?: number;
}

/**
 * 落地挤压：scaleX 先宽后复原、scaleY 先扁后复原（Back.easeOut）。
 * strength>0 为落地挤压；strength<0 为起跳拉伸（对称行为，见 juice.ts squashStretch）。
 */
export function buildSquashLandConfig(target: unknown, options: SquashLandOptions = {}): TweenConfig {
  const strength = options.strength ?? 0.28;
  return {
    targets: target,
    scaleX: { from: 1 + strength, to: 1 },
    scaleY: { from: 1 - strength, to: 1 },
    ease: "Back.easeOut",
    duration: options.durationMs ?? 180,
  };
}

export interface FloatUpOptions {
  /** 上浮距离 px，默认 40 */
  distance?: number;
  /** 毫秒，默认 700 */
  durationMs?: number;
}

/** 飘字上浮淡出（得分、+1、Miss 等）。 */
export function buildFloatUpConfig(target: unknown, options: FloatUpOptions = {}): TweenConfig {
  return {
    targets: target,
    y: `-=${options.distance ?? 40}`,
    alpha: { from: 1, to: 0 },
    ease: "Cubic.easeOut",
    duration: options.durationMs ?? 700,
    onComplete: true,
  };
}

export interface PulseOptions {
  /** 放大倍数，默认 1.12 */
  scale?: number;
  /** 毫秒，默认 120 */
  durationMs?: number;
}

/** 心跳脉冲：放大再回弹（可 repeat: -1 做持续心跳，见 README 配方表）。 */
export function buildPulseConfig(target: unknown, options: PulseOptions = {}): TweenConfig {
  return {
    targets: target,
    scale: { from: 1, to: options.scale ?? 1.12 },
    ease: "Sine.easeInOut",
    duration: options.durationMs ?? 120,
    yoyo: true,
  };
}

// ============ 动作函数（构造 + add 的语法糖） ============

/** 弹入出现。 */
export function popIn(scene: SceneHost, target: unknown, options?: PopInOptions): unknown {
  return scene.tweens.add(buildPopInConfig(target, options));
}

/** 落地挤压 / 起跳拉伸（strength 为负）。 */
export function squashLand(scene: SceneHost, target: unknown, options?: SquashLandOptions): unknown {
  return scene.tweens.add(buildSquashLandConfig(target, options));
}

/** 飘字上浮淡出，结束后自动销毁目标（若支持 destroy）。 */
export function floatUp(scene: SceneHost, target: unknown, options?: FloatUpOptions): unknown {
  const config = buildFloatUpConfig(target, options);
  config.onComplete = (): void => {
    const maybe = target as { destroy?: () => void };
    maybe.destroy?.();
  };
  return scene.tweens.add(config);
}

/** 心跳脉冲（单次放大回弹）。 */
export function pulse(scene: SceneHost, target: unknown, options?: PulseOptions): unknown {
  return scene.tweens.add(buildPulseConfig(target, options));
}

/** 命中白闪：alpha 压低再弹回。 */
export function flashHit(scene: SceneHost, target: unknown & AlphaTarget, durationMs = 90): unknown {
  return scene.tweens.add({
    targets: target,
    alpha: { from: 0.25, to: 1 },
    ease: "Quad.easeOut",
    duration: durationMs,
  });
}

/**
 * 命中停顿（hit-stop）：冻结画面动画 ms 毫秒后恢复。
 * Phaser 的全局时间缩放不在稳定 API 上，这里用“暂停 tween + 定时恢复”的保守实现：
 * 若宿主提供 tweens.pauseAll / resumeAll 则暂停动画，否则退化为纯延迟回调。
 */
export function hitStop(
  scene: SceneHost & { tweens: TweenHost & { pauseAll?(): void; resumeAll?(): void } },
  time: TimeHost,
  ms = 60,
): void {
  scene.tweens.pauseAll?.();
  time.delayedCall(ms, () => {
    scene.tweens.resumeAll?.();
  });
}

/** 屏幕震动：trauma 语义的强度换算为 Phaser intensity（推荐 0.2–0.8 内映射）。 */
export function shake(camera: CameraHost, trauma = 0.4, durationMs = 160): void {
  const intensity = Math.min(0.01, trauma * 0.012);
  camera.shake(durationMs, intensity);
}

// ============ 组合配方：打击感一键触发 ============

export interface HitFeelHost {
  scene: SceneHost & { tweens: TweenHost & { pauseAll?(): void; resumeAll?(): void } };
  time: TimeHost;
  camera?: CameraHost;
}

export interface HitFeelOptions {
  /** hit-stop 毫秒，0 表示跳过，默认 60 */
  hitStopMs?: number;
  /** 震动强度 0..1，0 表示跳过，默认 0.4 */
  shakeTrauma?: number;
  /** 是否对目标做挤压，默认 true（目标需有 scale） */
  squash?: boolean;
}

/**
 * 命中反馈组合拳：hit-stop + 震动 + 目标挤压 + 白闪。
 * 消除/合并/受击等“命中瞬间”调用一次即可；参数按 README 配方表微调。
 */
export function hitFeel(host: HitFeelHost, target?: unknown, options: HitFeelOptions = {}): void {
  const hitStopMs = options.hitStopMs ?? 60;
  const trauma = options.shakeTrauma ?? 0.4;
  if (hitStopMs > 0) hitStop(host.scene, host.time, hitStopMs);
  if (trauma > 0 && host.camera) shake(host.camera, trauma);
  if (target && options.squash !== false) squashLand(host.scene, target);
  if (target && (target as AlphaTarget).alpha !== undefined) flashHit(host.scene, target as AlphaTarget);
}

// ============ 部件骨骼的 Phaser 摆放辅助 ============

export interface PartHost extends ScaleTarget {
  angle: number;
  x: number;
  y: number;
}

export interface PartPoseLike {
  x: number;
  y: number;
  angle: number;
  scaleX: number;
  scaleY: number;
}

/**
 * 把 juice.ts walkCycle / idlePose 输出的部件偏移叠加到基准摆放上。
 * baseX/baseY/baseAngle 为部件的静态位置（pivot 对齐后的初始摆放）。
 */
export function applyPartPose(
  part: PartHost,
  baseX: number,
  baseY: number,
  baseAngle: number,
  offset: PartPoseLike,
): void {
  part.x = baseX + offset.x;
  part.y = baseY + offset.y;
  part.angle = baseAngle + offset.angle;
  part.scale.x = offset.scaleX;
  part.scale.y = offset.scaleY;
}

// 便捷再导出：GameScene 里通常只需要从本文件 import
export { floatTextOffset };
export type { Easing };