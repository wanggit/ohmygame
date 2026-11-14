# pixelfx 集成指南

## 概述

pixelfx 是一个包含 244+ 个高质量像素艺术特效的开源库（MIT 许可），采用纯代码实现。OhMyGame 已集成 pixelfx 的核心架构模式，提供双缓冲渲染、种子化随机、特效管理等能力。

## 快速开始

### 1. 使用特效系统

```typescript
import { EffectManager, Rng } from './src/shared/effects';

// 创建特效管理器
const manager = new EffectManager(512, 512);

// 创建特效
const effectId = manager.create('fire', fireEffect, { seed: 42 });

// 游戏循环
function update(dt: number) {
  manager.update(dt);
  manager.draw();
  manager.composite(ctx);
}
```

### 2. 核心概念

#### 双缓冲系统
- **color 缓冲区**：像素颜色（不透明、抖动或半透明）
- **light 缓冲区**：附加发光（additive glow）

热的东西看起来"热"，因为光照缓冲区叠加在颜色之上。

#### 种子化随机
所有随机数来自特效的种子，确保可重现：
```typescript
const rng = new Rng(42);
rng.next();      // 0-1 随机数
rng.range(a, b); // a-b 范围随机
rng.chance(p);   // p 概率返回 true
```

#### 局部空间绘制
特效围绕自己的原点绘制，绘制器负责放置、镜像和旋转：
```typescript
painter.color(x, y, color);           // 颜色缓冲区
painter.light(x, y, color);           // 光照缓冲区
painter.circle(cx, cy, r, color, useLight);  // 绘制圆形
painter.rect(x, y, w, h, color, useLight);   // 绘制矩形
```

### 3. 特效接口

#### 模拟特效（粒子系统）
```typescript
interface SimulatedEffect {
  create(options?: EffectOptions): Effect;
}

interface Effect {
  update(dt: number): void;
  draw(painter: Painter): void;
}

interface EffectOptions {
  seed?: number;
  colors?: string[];
  scale?: number;
  mirror?: boolean;
}
```

#### 纯特效（基于时间函数）
```typescript
interface PureEffect {
  draw(painter: Painter, time: number, options?: EffectOptions): void;
}

## 工具链

### 特效质量检查

```bash
node scripts/check-effect.mjs <effect-path>
```

检查项目：
- 未种子化的随机数
- 边界溢出
- 循环接缝
- 缺少必要的导出函数

### 特效可视化预览

```bash
node scripts/preview-effect.mjs <effect-path> [options]
```

选项：
- `--frames <n>`：帧数（默认 30）
- `--fps <n>`：帧率（默认 12）
- `--width <n>`：宽度（默认 128）
- `--height <n>`：高度（默认 128）
- `--output <dir>`：输出目录（默认 records）
- `--seed <n>`：随机种子（默认 42）

## 示例项目

查看 `examples/pixelfx-demo/` 目录，包含 5 种特效的完整示例：
- 🔥 Fire（火焰）
- 💥 Explosion（爆炸）
- ❄️ Ice（冰霜）
- ⚡ Lightning（闪电）
- 💚 Heal（治疗）

运行示例：
```bash
cd examples/pixelfx-demo
python3 -m http.server 8080
# 打开浏览器访问 http://localhost:8080
```

## 与 pixelfx 库集成

### 安装 pixelfx

```bash
npm i github:patch-gg/pixelfx
```

### 使用 pixelfx 特效

```typescript
import { createFrame, clearFrame, createFx, composite } from "pixelfx";
import * as frostNova from "pixelfx/fx/ice/frost-nova";

const frame = createFrame(128, 128);
const fx = createFx(frostNova, { seed: 42 });

function update(dt: number) {
  clearFrame(frame);
  fx.update(dt);
  fx.draw(frame, 0, 0);
  composite(frame, ctx);
}
```

### 导出精灵图

```bash
# 导出单个特效
node tools/render.mjs ice/frost-nova --sheet

# 导出整个类别
node tools/render.mjs fire --sheet

# 导出带角色的动作序列
node tools/act.mjs melee/slash --sheet
```


## 特效类别

| 类别 | 数量 | 示例 |
|------|------|------|
| fire | 12 | brazier, campfire, fire breath, fire tornado |
| explosions | 12 | barrel explosion, firework burst, cartoon pow |
| water | 12 | bubbles, drip, fountain, rain splash |
| ice | 10 | blizzard, freeze, frost nova, ice crystal |
| lightning | 11 | ball lightning, chain lightning, plasma ball |
| melee | 12 | claw swipe, dagger flurry, hammer smash |
| impacts | 11 | blunt hit, bullet impact, critical hit |
| projectiles | 13 | arrow, bullet tracer, homing missile |
| arcane | 12 | arcane beam, blink, magic circle |
| status | 13 | bleeding, burning, frozen, poisoned |
| ui | 12 | achievement, coin collect, combo counter |
| transitions | 10 | blinds, burn away, glitch wipe, iris |

完整目录见 [CATALOG.md](https://github.com/patch-gg/pixelfx/blob/main/docs/CATALOG.md)

## 最佳实践

### 选择特效类型
1. **简单反馈**（命中、拾取）：使用纯特效
2. **复杂物理**（爆炸、火焰）：使用模拟特效
3. **循环动画**（火焰、水流）：使用纯特效（可无缝循环）
4. **一次性事件**（爆炸、施法）：使用模拟特效

### 性能优化
```typescript
// 1. 复用帧缓冲
const frame = createFrame(128, 128);  // 创建一次

// 2. 按需更新
if (effectVisible) {
  fx.update(dt);
  fx.draw(frame, x, y);
}

// 3. 使用精灵图（导出后）
// 对于静态特效，导出精灵图比实时计算更高效
```

### 与 Phaser 集成
```typescript
// 方式 1：直接使用代码（推荐）
import { createFrame, createFx, clearFrame, composite } from "pixelfx";
import * as fire from "pixelfx/fx/fire/campfire";

class GameScene extends Phaser.Scene {
  create() {
    this.frame = createFrame(64, 64);
    this.fx = createFx(fire, { seed: 123 });
    this.texture = this.textures.createCanvas('fx', 64, 64);
    this.canvas = this.texture.getSourceImage();
    this.ctx = this.canvas.getContext('2d');
  }
  
  update(time: number, delta: number) {
    clearFrame(this.frame);
    this.fx.update(delta / 1000);
    this.fx.draw(this.frame, 32, 32);
    composite(this.frame, this.ctx);
    this.texture.refresh();
  }
}

// 方式 2：使用精灵图（导出后）
// node tools/render.mjs fire/campfire --sheet
```

## 参考资料

- [pixelfx 仓库](https://github.com/patch-gg/pixelfx)
- [特效目录](https://github.com/patch-gg/pixelfx/blob/main/docs/CATALOG.md)
- [创作指南](https://github.com/patch-gg/pixelfx/blob/main/docs/AUTHORING.md)
- [在线画廊](https://patch-gg.github.io/pixelfx/)
- [如何制作好的像素艺术特效](https://www.spritefusion.com/blog/how-to-make-good-pixel-art-effects-with-claude)

```
