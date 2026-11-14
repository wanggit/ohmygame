import { expect, it, vi } from "vitest";
import {
  Tween,
  TimeScaler,
  Shake,
  clamp,
  lerp,
  approach,
  linear,
  easeOutCubic,
  easeInCubic,
  easeInOutQuad,
  easeOutBack,
  easeOutElastic,
  easeOutBounce,
  squashStretch,
  landSquash,
  jumpStretch,
  popInScale,
  pulse,
  wobble,
  floatTextOffset,
  neutralPose,
  bob,
  limbSway,
  walkCycle,
  idlePose,
  followThrough,
  applyPose,
} from "../templates/casual-games/shared/juice/juice.js";

const EASINGS: Array<[string, (t: number) => number]> = [
  ["linear", linear],
  ["easeOutCubic", easeOutCubic],
  ["easeInCubic", easeInCubic],
  ["easeInOutQuad", easeInOutQuad],
  ["easeOutBack", easeOutBack],
  ["easeOutElastic", easeOutElastic],
  ["easeOutBounce", easeOutBounce],
];

it.each(EASINGS)("%s hits f(0)=0 and f(1)=1", (_name, easing) => {
  expect(easing(0)).toBeCloseTo(0, 5);
  expect(easing(1)).toBeCloseTo(1, 5);
});

it("easeOutBack overshoots between the endpoints", () => {
  const mid = easeOutBack(0.7);
  expect(mid).toBeGreaterThan(1);
});

it("clamp, lerp, and approach stay on spec", () => {
  expect(clamp(5, 0, 1)).toBe(1);
  expect(clamp(-5, 0, 1)).toBe(0);
  expect(lerp(0, 10, 0.5)).toBe(5);
  // 帧率无关：两段 0.05s 与一段 0.1s 结果一致
  const twoSteps = approach(0, 10, 8, 0.05);
  const oneShot = approach(0, 10, 8, 0.1);
  expect(approach(twoSteps, 10, 8, 0.05)).toBeCloseTo(oneShot, 10);
});

it("Tween reports start value, interpolates, and completes once", () => {
  const updates: number[] = [];
  const onComplete = vi.fn();
  const tween = new Tween({
    from: 0,
    to: 10,
    duration: 1,
    easing: linear,
    onUpdate: (value) => updates.push(value),
    onComplete,
  });
  expect(updates).toEqual([0]); // 构造时立即给出初始值
  expect(tween.done).toBe(false);
  expect(tween.update(0.5)).toBe(false);
  expect(updates.at(-1)).toBeCloseTo(5);
  expect(tween.update(0.5)).toBe(true);
  expect(updates.at(-1)).toBeCloseTo(10);
  expect(onComplete).toHaveBeenCalledTimes(1);
  tween.update(1); // 已结束，不再回调
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(tween.done).toBe(true);
});

it("Tween with zero duration finishes immediately", () => {
  const onComplete = vi.fn();
  const tween = new Tween({ from: 2, to: 3, duration: 0, onUpdate: () => {}, onComplete });
  expect(tween.update(0)).toBe(true);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it("TimeScaler freezes on hit-stop and restores after the window", () => {
  const scaler = new TimeScaler();
  scaler.update(1); // clock = 1
  scaler.hitStop(0.06);
  expect(scaler.scale).toBe(0);
  expect(scaler.frozen).toBe(true);
  scaler.update(0.05);
  expect(scaler.scale).toBe(0);
  scaler.update(0.02); // clock = 1.07 > 1.06
  expect(scaler.scale).toBe(1);
  expect(scaler.frozen).toBe(false);
});

it("TimeScaler keeps the later hit-stop window on overlap", () => {
  const scaler = new TimeScaler();
  scaler.hitStop(0.05);
  scaler.update(0.03);
  scaler.hitStop(0.05); // 新窗口到 clock+0.05 = 0.08，晚于旧窗口 0.05
  scaler.update(0.04); // clock = 0.07
  expect(scaler.scale).toBe(0);
  scaler.update(0.02); // clock = 0.09
  expect(scaler.scale).toBe(1);
});

it("TimeScaler applies slow motion and reset restores full speed", () => {
  const scaler = new TimeScaler();
  scaler.slowMotion(0.3, 0.2);
  expect(scaler.scale).toBe(0.3);
  scaler.update(0.3);
  expect(scaler.scale).toBe(1);
  scaler.slowMotion(0.5, 10);
  scaler.reset();
  expect(scaler.scale).toBe(1);
});

it("Shake clamps trauma, decays to inactive, and is deterministic", () => {
  const shake = new Shake({ decay: 2, maxOffset: 10 });
  shake.add(1.5); // clamp 到 1
  const first = shake.update(0.016);
  const other = new Shake({ decay: 2, maxOffset: 10 });
  other.add(1.5);
  expect(other.update(0.016)).toEqual(first); // 确定性
  expect(Math.abs(first.x)).toBeLessThanOrEqual(10);
  expect(shake.active).toBe(true);
  for (let i = 0; i < 100; i++) shake.update(0.016); // 1.6s 衰减窗口
  expect(shake.active).toBe(false);
  const settled = shake.update(0.016);
  expect(settled.x).toBeCloseTo(0);
  expect(settled.y).toBeCloseTo(0);
  expect(settled.angle).toBeCloseTo(0);
});

it("squashStretch recovers to 1:1 and flips direction for stretch", () => {
  const land = squashStretch(0, 0.3);
  expect(land.scaleX).toBeCloseTo(1.3);
  expect(land.scaleY).toBeCloseTo(0.7);
  const settled = squashStretch(1, 0.3);
  expect(settled.scaleX).toBeCloseTo(1);
  expect(settled.scaleY).toBeCloseTo(1);
  const stretch = jumpStretch(0);
  expect(stretch.scaleY).toBeGreaterThan(1); // 起跳：纵向拉长
  expect(stretch.scaleX).toBeLessThan(1);
  expect(landSquash(0).scaleX).toBeCloseTo(1.28); // 默认强度
});

it("feedback curves respect their endpoints", () => {
  expect(popInScale(0)).toBeCloseTo(0);
  expect(popInScale(1)).toBeCloseTo(1);
  expect(popInScale(0.5)).toBeGreaterThan(1); // Back 过冲
  expect(pulse(0)).toBe(0);
  expect(pulse(1)).toBeCloseTo(0);
  expect(pulse(0.5)).toBeCloseTo(1);
  expect(wobble(0)).toBe(0);
  const start = floatTextOffset(0);
  expect(start.y).toBeCloseTo(0);
  expect(start.alpha).toBe(1);
  const end = floatTextOffset(1);
  expect(end.y).toBeCloseTo(-40);
  expect(end.alpha).toBe(0);
});

it("bob stays within [-amplitude, 0] and limbSway within ±amplitude", () => {
  for (let t = 0; t < 4; t += 0.13) {
    const b = bob(t, 5);
    expect(b).toBeGreaterThanOrEqual(-5);
    expect(b).toBeLessThanOrEqual(0);
    const sway = limbSway(t, 20);
    expect(sway).toBeGreaterThanOrEqual(-20);
    expect(sway).toBeLessThanOrEqual(20);
  }
});

it("walkCycle loops with its period and counter-swings limbs", () => {
  const config = { frequency: 1.4, legAmplitude: 22, armAmplitude: 16 };
  const at = (t: number) => walkCycle(t, config);
  const period = 1 / 1.4;
  const a = at(0.31);
  const b = at(0.31 + period);
  expect(a.body.y).toBeCloseTo(b.body.y, 6);
  expect(a.leftLeg.angle).toBeCloseTo(b.leftLeg.angle, 6);
  expect(a.head.angle).toBeCloseTo(b.head.angle, 6);
  // 自然步态：左臂与右腿同相、左右臂反相（幅度不同，按幅度归一后同相位）
  expect(a.leftArm.angle).toBeCloseTo(-a.rightArm.angle, 6);
  expect(a.leftLeg.angle).toBeCloseTo(-a.rightLeg.angle, 6);
  expect(a.leftArm.angle / 16).toBeCloseTo(a.leftLeg.angle / 22, 6);
});

it("idlePose breathes and followThrough converges to its target", () => {
  const pose = idlePose(0.7);
  expect(pose.body.scaleX).toBe(1);
  expect(pose.leftLeg.angle).toBe(0);
  expect(Math.abs(pose.body.y)).toBeLessThanOrEqual(2);

  let state = { angle: 0, velocity: 0 };
  for (let i = 0; i < 240; i++) state = followThrough(state, 30, 1 / 60);
  expect(state.angle).toBeCloseTo(30, 1);
  expect(Math.abs(state.velocity)).toBeLessThan(1);
});

it("applyPose offsets add and scales multiply", () => {
  const base = { x: 10, y: 20, angle: 5, scaleX: 1, scaleY: 1 };
  const merged = applyPose(base, { x: -3, y: 2, angle: -5, scaleX: 1.2, scaleY: 0.8 });
  expect(merged).toEqual({ x: 7, y: 22, angle: 0, scaleX: 1.2, scaleY: 0.8 });
  expect(neutralPose()).toEqual({ x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1 });
});

// ============ juice-phaser 适配层（fake 宿主） ============

interface FakeTweenHost {
  add: ReturnType<typeof vi.fn>;
  pauseAll: ReturnType<typeof vi.fn>;
  resumeAll: ReturnType<typeof vi.fn>;
}

function fakeHosts() {
  const captured: Array<Record<string, unknown>> = [];
  const tweens: FakeTweenHost = {
    add: vi.fn((config: Record<string, unknown>) => {
      captured.push(config);
      return config;
    }),
    pauseAll: vi.fn(),
    resumeAll: vi.fn(),
  };
  const delayed: Array<{ ms: number; callback: () => void }> = [];
  const time = {
    delayedCall: vi.fn((ms: number, callback: () => void) => {
      delayed.push({ ms, callback });
    }),
  };
  const camera = { shake: vi.fn() };
  return { scene: { tweens }, time, camera, captured, delayed };
}

it("buildPopInConfig and popIn target scale 0 → 1 with Back ease", async () => {
  const { buildPopInConfig, popIn } = await import(
    "../templates/casual-games/shared/juice/juice-phaser.js"
  );
  const config = buildPopInConfig("sprite", { durationMs: 100 });
  expect(config).toMatchObject({
    targets: "sprite",
    scale: { from: 0, to: 1 },
    ease: "Back.easeOut",
    duration: 100,
  });
  const host = fakeHosts();
  popIn(host.scene, "sprite");
  expect(host.captured[0]).toMatchObject({ targets: "sprite", duration: 220 });
});

it("buildSquashLandConfig widens X and squashes Y at the start", async () => {
  const { buildSquashLandConfig } = await import(
    "../templates/casual-games/shared/juice/juice-phaser.js"
  );
  const config = buildSquashLandConfig("tile", { strength: 0.2 });
  expect(config).toMatchObject({
    scaleX: { from: 1.2, to: 1 },
    scaleY: { from: 0.8, to: 1 },
    duration: 180,
  });
});

it("floatUp destroys the target after the tween completes", async () => {
  const { floatUp, buildFloatUpConfig } = await import(
    "../templates/casual-games/shared/juice/juice-phaser.js"
  );
  const plain = buildFloatUpConfig("text");
  expect(plain).toMatchObject({ y: "-=40", alpha: { from: 1, to: 0 }, duration: 700 });
  const host = fakeHosts();
  const destroy = vi.fn();
  floatUp(host.scene, { destroy });
  const config = host.captured[0];
  (config.onComplete as () => void)();
  expect(destroy).toHaveBeenCalledTimes(1);
});

it("hitStop pauses tweens and resumes via delayedCall", async () => {
  const { hitStop } = await import("../templates/casual-games/shared/juice/juice-phaser.js");
  const host = fakeHosts();
  hitStop(host.scene, host.time, 60);
  expect(host.scene.tweens.pauseAll).toHaveBeenCalledTimes(1);
  expect(host.scene.tweens.resumeAll).not.toHaveBeenCalled();
  expect(host.delayed[0].ms).toBe(60);
  host.delayed[0].callback();
  expect(host.scene.tweens.resumeAll).toHaveBeenCalledTimes(1);
});

it("shake maps trauma into a clamped camera intensity", async () => {
  const { shake } = await import("../templates/casual-games/shared/juice/juice-phaser.js");
  const camera = { shake: vi.fn() };
  shake(camera, 0.5);
  expect(camera.shake.mock.calls[0]![0]).toBe(160);
  expect(camera.shake.mock.calls[0]![1] as number).toBeCloseTo(0.006);
  shake(camera, 5); // 超量 trauma 不得超过 intensity 上限 0.01
  expect(camera.shake.mock.calls[1]![1]).toBe(0.01);
});

it("hitFeel fires hit-stop, shake, squash, and flash together", async () => {
  const { hitFeel } = await import("../templates/casual-games/shared/juice/juice-phaser.js");
  const host = fakeHosts();
  const target = { alpha: 1, scale: { x: 1, y: 1 } };
  hitFeel(
    { scene: host.scene, time: host.time, camera: host.camera },
    target,
    { hitStopMs: 50, shakeTrauma: 0.6 },
  );
  expect(host.scene.tweens.pauseAll).toHaveBeenCalledTimes(1);
  expect(host.camera.shake.mock.calls[0]![0]).toBe(160);
  expect(host.camera.shake.mock.calls[0]![1] as number).toBeCloseTo(0.0072);
  // squash + flash 两次 tween
  expect(host.scene.tweens.add).toHaveBeenCalledTimes(2);
});

it("applyPartPose writes offsets onto the part", async () => {
  const { applyPartPose } = await import(
    "../templates/casual-games/shared/juice/juice-phaser.js"
  );
  const part = { x: 0, y: 0, angle: 0, scale: { x: 1, y: 1 } };
  applyPartPose(part, 100, 200, 5, { x: 2, y: -3, angle: 10, scaleX: 1.1, scaleY: 0.9 });
  expect(part).toEqual({ x: 102, y: 197, angle: 15, scale: { x: 1.1, y: 0.9 } });
});