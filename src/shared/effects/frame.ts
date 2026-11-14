/**
 * 双缓冲帧系统（借鉴 pixelfx)
 * 
 * color 缓冲区：像素颜色（不透明、抖动或半透明）
 * light 缓冲区：附加发光（additive glow）
 * 
 * 热的东西看起来"热"，因为光照缓冲区叠加在颜色之上
 */

export interface Frame {
  color: Uint32Array;
  light: Uint32Array;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

export function createFrame(width: number, height: number): Frame {
  return {
    color: new Uint32Array(width * height),
    light: new Uint32Array(width * height),
    width,
    height,
    originX: Math.floor(width / 2),
    originY: Math.floor(height / 2),
  };
}

export function clearFrame(frame: Frame): void {
  frame.color.fill(0);
  frame.light.fill(0);
}

/**
 * 将帧合成到 Canvas
 * light 缓冲区使用 additive 混合模式
 */
export function composite(frame: Frame, ctx: CanvasRenderingContext2D): void {
  const imageData = ctx.createImageData(frame.width, frame.height);
  const data = imageData.data;
  
  for (let i = 0; i < frame.color.length; i++) {
    const color = frame.color[i];
    const light = frame.light[i];
    
    // 颜色缓冲区
    let r = (color >> 16) & 0xff;
    let g = (color >> 8) & 0xff;
    let b = color & 0xff;
    let a = (color >> 24) & 0xff;
    
    // 光照缓冲区（additive）
    if (light > 0) {
      const lr = (light >> 16) & 0xff;
      const lg = (light >> 8) & 0xff;
      const lb = light & 0xff;
      
      r = Math.min(255, r + lr);
      g = Math.min(255, g + lg);
      b = Math.min(255, b + lb);
    }
    
    const idx = i * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = a;
  }
  
  ctx.putImageData(imageData, 0, 0);
}

/**
 * 像素绘制器（局部空间）
 * 特效围绕自己的原点绘制，绘制器负责放置、镜像和旋转
 */
export class Painter {
  constructor(private frame: Frame) {}
  
  /**
   * 在颜色缓冲区绘制像素
   */
  color(x: number, y: number, color: number): void {
    const px = Math.floor(x + this.frame.originX);
    const py = Math.floor(y + this.frame.originY);
    
    if (px >= 0 && px < this.frame.width && py >= 0 && py < this.frame.height) {
      const idx = py * this.frame.width + px;
      this.frame.color[idx] = color;
    }
  }
  
  /**
   * 在光照缓冲区绘制发光
   */
  light(x: number, y: number, color: number): void {
    const px = Math.floor(x + this.frame.originX);
    const py = Math.floor(y + this.frame.originY);
    
    if (px >= 0 && px < this.frame.width && py >= 0 && py < this.frame.height) {
      const idx = py * this.frame.width + px;
      this.frame.light[idx] = color;
    }
  }
  
  /**
   * 绘制圆形
   */
  circle(cx: number, cy: number, radius: number, color: number, useLight = false): void {
    const drawFn = useLight ? this.light.bind(this) : this.color.bind(this);
    
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius) {
          drawFn(cx + x, cy + y, color);
        }
      }
    }
  }
  
  /**
   * 绘制矩形
   */
  rect(x: number, y: number, w: number, h: number, color: number, useLight = false): void {
    const drawFn = useLight ? this.light.bind(this) : this.color.bind(this);
    
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        drawFn(x + dx, y + dy, color);
      }
    }
  }
}
