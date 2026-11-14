/**
 * 特效系统（借鉴 pixelfx 架构）
 * 
 * 提供双缓冲渲染、种子化随机、特效管理等核心功能
 */

export * from './frame.js';
export * from './random.js';

import { Frame, Painter, createFrame, clearFrame, composite } from './frame.js';

/**
 * 特效接口（模拟特效）
 */
export interface Effect {
  update(dt: number): void;
  draw(painter: Painter): void;
}

/**
 * 纯特效（基于时间函数）
 */
export interface PureEffect {
  draw(painter: Painter, time: number, options?: EffectOptions): void;
}

/**
 * 模拟特效工厂（粒子系统）
 */
export interface SimulatedEffect {
  create(options?: EffectOptions): Effect;
}

/**
 * 特效选项
 */
export interface EffectOptions {
  seed?: number;
  colors?: string[];
  scale?: number;
  mirror?: boolean;
}

/**
 * 特效管理器
 * 统一管理特效生命周期，支持纯特效和模拟特效
 */
export class EffectManager {
  private effects: Map<string, Effect> = new Map();
  private frame: Frame;
  private painter: Painter;
  
  constructor(width: number, height: number) {
    this.frame = createFrame(width, height);
    this.painter = new Painter(this.frame);
  }
  
  /**
   * 创建模拟特效实例
   */
  create(id: string, effect: SimulatedEffect, options?: EffectOptions): string {
    const instanceId = `${id}_${Date.now()}`;
    this.effects.set(instanceId, effect.create(options));
    return instanceId;
  }
  
  /**
   * 更新所有特效
   */
  update(dt: number): void {
    for (const effect of this.effects.values()) {
      effect.update(dt);
    }
  }
  
  /**
   * 绘制所有特效到帧
   */
  draw(): void {
    clearFrame(this.frame);
    
    for (const effect of this.effects.values()) {
      effect.draw(this.painter);
    }
  }
  
  /**
   * 绘制纯特效（一次性）
   */
  drawPure(effect: PureEffect, time: number, options?: EffectOptions): void {
    effect.draw(this.painter, time, options);
  }
  
  /**
   * 合成到 Canvas
   */
  composite(ctx: CanvasRenderingContext2D): void {
    composite(this.frame, ctx);
  }
  
  /**
   * 移除特效
   */
  remove(id: string): void {
    this.effects.delete(id);
  }
  
  /**
   * 清除所有特效
   */
  clear(): void {
    this.effects.clear();
  }
  
  /**
   * 获取当前特效数量
   */
  get count(): number {
    return this.effects.size;
  }
}
