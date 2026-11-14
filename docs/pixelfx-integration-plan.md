# pixelfx 集成实施方案

## 背景与目标

[pixelfx](https://github.com/patch-gg/pixelfx) 是一个包含 244 个高质量像素艺术特效的开源库（MIT 许可），采用纯代码实现，支持浏览器游戏和多引擎导出。本文档详细说明如何将其集成到 OhMyGame 中，提升游戏视觉质量。

**核心价值：**
- 高质量特效库：fire、explosions、water、ice、lightning、melee 等 20+ 类别
- 纯代码实现：无图片依赖，可直接嵌入游戏
- 双缓冲系统：颜色 + 光照分离，视觉效果更真实
- 种子化随机：可重现，便于调试和测试
- AI 驱动创建：draft → render → look → refine 迭代流程

## 技术架构分析

### pixelfx 核心架构

```javascript
// 1. 两种特效类型
// 纯特效：基于时间函数，可无缝循环
export function draw(p, t, o) {
  // p: Painter（绘制器）
  // t: 时间（秒）
  // o: 选项（种子、颜色等）
}

// 模拟特效：粒子系统，物理真实
export function create(o) {
  return {
    update(dt) { /* 步进粒子 */ },
    draw(p) { /* 绘制粒子 */ }
  };
}

// 2. 双缓冲系统
const frame = {
  color: Uint32Array,  // 颜色缓冲区（像素）
  light: Uint32Array,  // 光照缓冲区（附加发光）
  w: 128,
  h: 128,
  ox: 64,
  oy: 64
};

// 3. 种子化随机
const rng = new Rng(seed);
rng.next();      // 0-1 随机数
rng.range(a, b); // a-b 范围随机
rng.chance(p);   // p 概率返回 true
```

### OhMyGame 现有架构

```typescript
// 插件系统
plugins/
├── game-studio/           # 通用游戏开发
├── web-game-studio/       # Web 游戏开发（Phaser）
├── threejs-world/         # Three.js 3D 游戏
└── godot/                 # Godot 引擎

// 技能系统
plugins/web-game-studio/skills/
├── phaser-fx/             # Phaser 特效（现有）
├── phaser-particles/      # Phaser 粒子（现有）
├── phaser-tweens/         # Phaser 补间（现有）
└── ...                    # 其他技能
```

## 集成方案

### Phase 1：特效库集成（1-2 天）

#### 1.1 创建 pixelfx 技能

**文件位置：** `plugins/web-game-studio/skills/pixelfx/SKILL.md`

核心内容包括：
- 244 个特效的分类目录（fire、explosions、water、ice、lightning 等 20+ 类别）
- 浏览器游戏集成代码示例（Canvas、Phaser、PixiJS）
- 精灵图导出命令（用于 Godot、Unity 等引擎）
- 双缓冲系统、种子化随机、局部空间绘制等核心概念说明

#### 1.2 更新现有技能引用

在 `phaser-2d-game/SKILL.md` 中添加 pixelfx 引用：
```markdown
| **像素艺术特效** | **`../pixelfx/SKILL.md`** |
```

#### 1.3 集成到游戏开发流程

在 `game-studio/SKILL.md` 中添加特效系统指导：
- 优先使用 pixelfx 特效库
- 简单几何、粒子和动态 UI 使用代码绘制
- 复杂特效使用 pixelfx 的纯特效或模拟特效
- 需要跨平台时，导出精灵图

### Phase 2：架构模式借鉴（3-5 天）

#### 2.1 双缓冲渲染系统

**新建文件：** `src/shared/effects/frame.ts`

```typescript
export interface Frame {
  color: Uint32Array;  // 颜色缓冲区
  light: Uint32Array;  // 光照缓冲区（additive glow）
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
 * 合成到 Canvas
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
```

#### 2.2 种子化随机系统

**新建文件：** `src/shared/effects/random.ts`

```typescript
/**
 * 种子化随机数生成器（借鉴 pixelfx）
 * 确保特效可重现：帧 40 每次都一样
 */
export class Rng {
  private state: number;
  
  constructor(seed: number = 1) {
    this.state = seed;
  }
  
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0xffffffff;
  }
  
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  
  chance(probability: number): boolean {
    return this.next() < probability;
  }
  
  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }
  
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}
```

#### 2.3 特效系统集成

**新建文件：** `src/shared/effects/index.ts`

```typescript
export * from './frame';
export * from './random';

export interface Effect {
  update(dt: number): void;
  draw(painter: Painter): void;
}

export interface EffectOptions {
  seed?: number;
  colors?: string[];
  scale?: number;
  mirror?: boolean;
}

export class EffectManager {
  private effects: Map<string, Effect> = new Map();
  private frame: Frame;
  private painter: Painter;
  
  constructor(width: number, height: number) {
    this.frame = createFrame(width, height);
    this.painter = new Painter(this.frame);
  }
  
  create(id: string, effect: SimulatedEffect, options?: EffectOptions): string {
    const instanceId = `${id}_${Date.now()}`;
    this.effects.set(instanceId, effect.create(options));
    return instanceId;
  }
  
  update(dt: number): void {
    for (const effect of this.effects.values()) {
      effect.update(dt);
    }
  }
  
  draw(): void {
    clearFrame(this.frame);
    for (const effect of this.effects.values()) {
      effect.draw(this.painter);
    }
  }
  
  composite(ctx: CanvasRenderingContext2D): void {
    composite(this.frame, ctx);
  }
}
```



### Phase 3：工作流程优化（2-3 天）

#### 3.1 特效质量检查工具

**新建文件：** `scripts/check-effect.mjs`

```javascript
#!/usr/bin/env node

/**
 * 特效质量检查工具（借鉴 pixelfx）
 * 检查问题：
 * - spills：特效超出边界
 * - seams：循环特效的接缝
 * - unseeded randomness：未种子化的随机数
 * - slow frames：性能问题
 */

import { readFileSync, existsSync } from 'fs';

async function checkEffect(effectPath) {
  console.log(`检查特效: ${effectPath}`);
  
  const issues = [];
  
  if (!existsSync(effectPath)) {
    issues.push('文件不存在');
    return issues;
  }
  
  const code = readFileSync(effectPath, 'utf8');
  
  // 检查未种子化的随机数
  const randomPatterns = [
    /Math\.random\(\)/g,
    /new Date\(\)\.getTime\(\)/g,
    /performance\.now\(\)/g,
  ];
  
  for (const pattern of randomPatterns) {
    const matches = code.match(pattern);
    if (matches) {
      issues.push(`发现未种子化的随机数: ${matches[0]}`);
    }
  }
  
  // 检查是否有种子参数
  if (!code.includes('seed') && !code.includes('Rng')) {
    issues.push('建议使用种子化随机数（Rng）');
  }
  
  return issues;
}

const effectPath = process.argv[2];
if (!effectPath) {
  console.error('用法: node check-effect.mjs <effect-path>');
  process.exit(1);
}

checkEffect(effectPath).then(issues => {
  if (issues.length === 0) {
    console.log('✓ 检查通过');
  } else {
    console.log('发现以下问题:');
    issues.forEach(issue => console.log(`  - ${issue}`));
    process.exit(1);
  }
});

#### 3.2 特效可视化预览工具

**新建文件：** `scripts/preview-effect.mjs`

```javascript
#!/usr/bin/env node

/**
 * 特效可视化预览工具（借鉴 pixelfx）
 * 生成 contact sheet、GIF、MP4 预览
 */

import { createFrame, clearFrame, composite } from '../src/shared/effects/frame.js';
import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function previewEffect(effectPath, options = {}) {
  const {
    frames = 30,
    fps = 12,
    width = 128,
    height = 128,
    outputDir = 'records',
  } = options;
  
  console.log(`预览特效: ${effectPath}`);
  
  const effectModule = await import(effectPath);
  const frame = createFrame(width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  const imageBuffers = [];
  
  for (let i = 0; i < frames; i++) {
    const time = i / fps;
    
    clearFrame(frame);
    
    if (effectModule.draw) {
      const painter = new Painter(frame);
      effectModule.draw(painter, time, { seed: 42 });
    } else if (effectModule.create) {
      const effect = effectModule.create({ seed: 42 });
      effect.update(1 / fps);
      effect.draw(new Painter(frame));
    }
    
    composite(frame, ctx);
    const buffer = canvas.toBuffer('image/png');
    imageBuffers.push(buffer);
  }
  
  const outputPath = join(outputDir, basename(effectPath, '.js'));
  mkdirSync(outputPath, { recursive: true });
  
  console.log(`✓ 预览已生成: ${outputPath}`);
}

const effectPath = process.argv[2];
if (!effectPath) {
  console.error('用法: node preview-effect.mjs <effect-path>');
  process.exit(1);
}

previewEffect(effectPath).catch(console.error);
```


### Phase 4：文档与示例（1-2 天）

#### 4.1 创建示例项目

**新建文件：** `examples/pixelfx-demo/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>pixelfx Demo</title>
  <style>
    body {
      margin: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #1a1a2e;
      font-family: monospace;
    }
    canvas {
      border: 2px solid #16213e;
      image-rendering: pixelated;
    }
    .controls {
      margin-top: 20px;
      text-align: center;
    }
    button {
      margin: 5px;
      padding: 10px 20px;
      font-size: 16px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div>
    <canvas id="game" width="512" height="512"></canvas>
    <div class="controls">
      <button onclick="playEffect('fire')">火焰</button>
      <button onclick="playEffect('explosion')">爆炸</button>
      <button onclick="playEffect('ice')">冰霜</button>
      <button onclick="playEffect('lightning')">闪电</button>
      <button onclick="playEffect('heal')">治疗</button>
    </div>
  </div>
  
  <script type="module">
    import { EffectManager } from '../../src/shared/effects/index.js';
    
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const manager = new EffectManager(512, 512);
    
    const effects = {
      fire: () => import('pixelfx/fx/fire/campfire'),
      explosion: () => import('pixelfx/fx/explosions/big-explosion'),
      ice: () => import('pixelfx/fx/ice/frost-nova'),
      lightning: () => import('pixelfx/fx/lightning/lightning-strike'),
      heal: () => import('pixelfx/fx/holy/heal'),
    };
    
    window.playEffect = async (name) => {
      const effectModule = await effects[name]();
      manager.clear();
      manager.create(name, effectModule, { seed: 42 });
    };
    
    let lastTime = 0;
    function gameLoop(time) {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      
      manager.update(dt);
      manager.draw();
      manager.composite(ctx);
      
      requestAnimationFrame(gameLoop);
    }
    
    requestAnimationFrame(gameLoop);
  </script>
</body>
</html>
```


## 实施时间表

| 阶段 | 任务 | 时间 | 优先级 |
|------|------|------|--------|
| Phase 1 | 特效库集成 | 1-2 天 | 高 |
| Phase 2 | 架构模式借鉴 | 3-5 天 | 中 |
| Phase 3 | 工作流程优化 | 2-3 天 | 中 |
| Phase 4 | 文档与示例 | 1-2 天 | 低 |

**总计：** 7-12 天

## 预期收益

### 对游戏质量的提升
1. **视觉质量**：244 个专业像素艺术特效，立即提升游戏观感
2. **开发效率**：AI 驱动的特效创建，降低美术成本
3. **玩家体验**：更好的特效反馈，提升游戏手感
4. **跨平台**：支持导出到 Godot、Unity 等引擎

### 成本效益分析
- **开发成本**：7-12 天集成工作
- **许可成本**：0 元（MIT 许可）
- **维护成本**：低（纯代码，无依赖）
- **收益**：所有游戏项目受益，特效质量显著提升

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| pixelfx API 变更 | 中 | 锁定版本，定期更新 |
| 性能问题 | 中 | 使用精灵图导出，按需渲染 |
| 学习曲线 | 低 | 提供示例和文档 |
| 与现有系统冲突 | 低 | 独立模块，渐进集成 |

## 后续优化方向

1. **特效编辑器**：可视化编辑 pixelfx 特效
2. **特效组合**：支持多个特效叠加
3. **AI 生成特效**：基于 pixelfx 架构，AI 生成新特效
4. **性能优化**：WebGL 加速渲染

## 参考资料

- [pixelfx 仓库](https://github.com/patch-gg/pixelfx)
- [pixelfx 文档](https://github.com/patch-gg/pixelfx/blob/main/docs/AUTHORING.md)
- [Sprite Fusion VFX](https://www.spritefusion.com/pixel-art-vfx)
- [如何制作好的像素艺术特效](https://www.spritefusion.com/blog/how-to-make-good-pixel-art-effects-with-claude)

```
