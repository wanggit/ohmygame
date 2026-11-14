/**
 * 种子化随机数生成器（借鉴 pixelfx）
 * 
 * 确保特效可重现：帧 40 每次都一样
 * 所有随机数来自特效的种子
 */

export class Rng {
  private state: number;
  
  constructor(seed: number = 1) {
    this.state = seed;
  }
  
  /**
   * 生成 0-1 随机数
   */
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0xffffffff;
  }
  
  /**
   * 生成指定范围随机数
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  
  /**
   * 按概率返回 true
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
  
  /**
   * 从数组中随机选择
   */
  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }
  
  /**
   * 生成整数随机数
   */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  
  /**
   * 生成随机角度（弧度）
   */
  angle(): number {
    return this.next() * Math.PI * 2;
  }
  
  /**
   * 生成随机向量
   */
  vector(length: number = 1): { x: number; y: number } {
    const angle = this.angle();
    return {
      x: Math.cos(angle) * length,
      y: Math.sin(angle) * length,
    };
  }
}
