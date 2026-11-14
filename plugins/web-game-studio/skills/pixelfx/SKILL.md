---
name: pixelfx
description: Use when the user asks for "pixel art effects", "fire effect", "explosion", "water splash", "ice spell", "lightning", "magic effect", "hit effect", "particle effect", "VFX", "visual effect", "game juice", "impact feedback", or any pixel art animation request. Provides 244+ ready-to-use pixel art effects with code examples and sprite sheet export.
version: 1.0.0
---

# pixelfx - Pixel Art Effects Library
# pixelfx - Pixel Art Effects Library

244 个高质量像素艺术特效，纯代码实现，支持浏览器游戏和精灵图导出。MIT 许可，可商用。

## 自动触发机制

pixelfx 在游戏开发流程中**自动触发**，无需用户手动指定。触发时机：

### 1. 设计阶段（自动识别 VFX 需求）
当游戏设计包含以下机制时，**自动添加 VFX 需求到设计文档**：

| 游戏机制 | 自动触发的特效类别 | 典型特效 |
|---------|------------------|---------|
| **攻击系统** | impacts, melee | hit-flash, critical-hit, blunt-hit, slash |
| **魔法系统** | arcane, fire, ice, lightning | fire-ball, frost-nova, lightning-strike, arcane-beam |
| **爆炸/破坏** | explosions | big-explosion, barrel-explosion, debris |
| **状态效果** | status | burning, frozen, poisoned, bleeding |
| **治疗/增益** | holy | heal, blessing, divine-shield |
| **暗影/诅咒** | shadow | curse, dark-explosion, black-hole |
| **环境效果** | weather, nature | rain, snow, fireflies, leaf-storm |
| **UI 反馈** | ui | coin-collect, achievement, combo-counter |
| **拾取/掉落** | pickups, spawn-death | coin-drop, collect-burst, poof |
| **移动/冲刺** | moves | dash-strike, ground-pound, arrow-shot |

### 2. 实现阶段（自动集成特效）
当实现游戏机制时，**自动使用 pixelfx 对应特效**：

```typescript
// 实现攻击系统时，自动集成：
import { impacts, melee } from 'pixelfx';
// → hit-flash, critical-hit, blunt-hit

// 实现魔法系统时，自动集成：
import { fire, ice, lightning, arcane } from 'pixelfx';
// → fire-ball, frost-nova, lightning-strike, arcane-beam

// 实现 UI 系统时，自动集成：
import { ui, pickups } from 'pixelfx';
// → coin-collect, achievement, collect-burst
```

### 3. 测试阶段（自动检查 VFX 覆盖）
当进行视觉 QA 时，**自动检查特效覆盖**：

**检查清单：**
- [ ] 所有攻击都有命中特效
- [ ] 所有魔法都有施法特效
- [ ] 所有爆炸都有粒子特效
- [ ] 所有 UI 交互都有反馈特效
- [ ] 所有拾取都有收集特效
- [ ] 游戏手感足够强（打击感、反馈感）

**如果覆盖不足，自动推荐补充特效。**

### 4. 润色阶段（自动增强游戏手感）
当用户说"打击感不够"、"反馈太弱"、"不够爽"时，**自动推荐 pixelfx 增强方案**：

| 问题 | 自动推荐 |
|------|---------|
| 打击感弱 | impacts/hit-flash + 屏幕震动 + 粒子飞溅 |
| 魔法没感觉 | arcane/magic-circle + 发光 + 粒子拖尾 |
| 爆炸不震撼 | explosions/big-explosion + 碎片 + 烟雾 |
| UI 反馈弱 | ui/coin-collect + 缩放动画 + 发光 |

## 核心概念

244 个高质量像素艺术特效，纯代码实现，支持浏览器游戏和精灵图导出。MIT 许可，可商用。

## 快速开始

### 在浏览器游戏中使用（Canvas、Phaser、PixiJS）

```javascript
import { createFrame, clearFrame, createFx, composite } from "pixelfx";
import * as frostNova from "pixelfx/fx/ice/frost-nova";

// 创建帧缓冲
const frame = createFrame(128, 128);

// 创建特效实例
const fx = createFx(frostNova, { seed: 42 });

// 游戏循环
function update(dt) {
  clearFrame(frame);
  fx.update(dt);
  fx.draw(frame, 0, 0);  // 在 (0,0) 位置绘制
  composite(frame, ctx); // 合成到画布
}
```

### 导出精灵图（用于 Godot、Unity 等）

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
| **fire** | 12 | brazier, campfire, fire breath, fire tornado |
| **explosions** | 12 | barrel explosion, firework burst, cartoon pow |
| **water** | 12 | bubbles, drip, fountain, rain splash |
| **ice** | 10 | blizzard, freeze, frost nova, ice crystal |
| **lightning** | 11 | ball lightning, chain lightning, plasma ball |
| **melee** | 12 | claw swipe, dagger flurry, hammer smash |
| **impacts** | 11 | blunt hit, bullet impact, critical hit |
| **projectiles** | 13 | arrow, bullet tracer, homing missile |
| **arcane** | 12 | arcane beam, blink, magic circle |
| **status** | 13 | bleeding, burning, frozen, poisoned |
| **ui** | 12 | achievement, coin collect, combo counter |
| **transitions** | 10 | blinds, burn away, glitch wipe, iris |

完整目录见 [CATALOG.md](https://github.com/patch-gg/pixelfx/blob/main/docs/CATALOG.md)

## 核心概念

### 1. 双缓冲系统
- **color 缓冲区**：像素颜色（不透明、抖动或半透明）
- **light 缓冲区**：附加发光（additive glow）

热的东西看起来"热"，因为光照缓冲区叠加在颜色之上。

### 2. 种子化随机
所有随机数来自特效的种子，确保帧 40 每次都一样：
```javascript
const fx = createFx(effect, { seed: 42 });  // 可重现
```

### 3. 局部空间绘制
特效围绕自己的原点绘制，绘制器负责放置、镜像和旋转：
```javascript
fx.draw(frame, x, y);           // 放置在 (x,y)
fx.draw(frame, x, y, { mirror: true });  // 水平镜像
```

### 4. 两种特效类型
- **纯特效** `draw(p, t, o)`：基于时间函数，可无缝循环
- **模拟特效** `create(o)`：粒子系统，物理真实（火花弹跳、烟雾翻滚）

## 最佳实践

### 选择特效
1. **简单反馈**（命中、拾取）：使用纯特效
2. **复杂物理**（爆炸、火焰）：使用模拟特效
3. **循环动画**（火焰、水流）：使用纯特效（可无缝循环）
4. **一次性事件**（爆炸、施法）：使用模拟特效

### 性能优化
```javascript
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

```javascript
// 方式 1：直接使用代码（推荐）
import { createFrame, createFx, clearFrame, composite } from "pixelfx";
import * as fire from "pixelfx/fx/fire/campfire";

class GameScene extends Phaser.Scene {
  create() {
    this.frame = createFrame(64, 64);
    this.fx = createFx(fire, { seed: 123 });
    
    // 创建纹理
    this.texture = this.textures.createCanvas('fx', 64, 64);
    this.canvas = this.texture.getSourceImage();
    this.ctx = this.canvas.getContext('2d');
  }
  
  update(time, delta) {
    clearFrame(this.frame);
    this.fx.update(delta / 1000);
    this.fx.draw(this.frame, 32, 32);
    composite(this.frame, this.ctx);
    this.texture.refresh();
  }
}

// 方式 2：使用精灵图（导出后）
// node tools/render.mjs fire/campfire --sheet
// 然后在 Phaser 中加载精灵图
```

## 创建自定义特效

### 工作流程
1. **draft**：创建特效草稿
```bash
node tools/new.mjs arcane/my-spell
```

2. **render**：渲染并查看
```bash
node tools/render.mjs arcane/my-spell
# 查看 records/arcane/my-spell/contact.png
```

3. **look**：检查问题
```bash
node tools/check.mjs arcane/my-spell
# 检查 spills、seams、unseeded randomness、slow frames
```

4. **refine**：迭代改进
```bash
# 编辑 src/fx/arcane/my-spell.js
node tools/render.mjs arcane/my-spell
```

### 特效模板

```javascript
// src/fx/arcane/my-spell.js
export const meta = {
  name: "my-spell",
  category: "arcane",
  loop: false,
  seed: 1,
};

// 纯特效
export function draw(p, t, o) {
  const { seed = 1 } = o;
  const rng = new Rng(seed);
  
  // 绘制逻辑
  p.color("#ff00ff", () => {
    p.circle(64, 64, 20);
  });
  
  // 光照效果
  p.light("#ff88ff", () => {
    p.circle(64, 64, 25);
  });
}

// 或模拟特效
export function create(o) {
  const particles = new Particles({ seed: o.seed });
  
  // 初始化粒子
  for (let i = 0; i < 50; i++) {
    particles.spawn(P.SPARK, 64, 64, 
      rng.range(-50, 50), 
      rng.range(-100, -50),
      rng.range(0.5, 1.5),
      "#ff8800"
    );
  }
  
  return {
    update(dt) {
      particles.update(dt);
    },
    draw(p) {
      particles.draw(p);
    }
  };
}
```

## 与其他技能配合

- **phaser-particles**：pixelfx 提供更高质量的像素艺术粒子
- **phaser-tweens**：pixelfx 特效可与补间动画结合
- **phaser-fx**：pixelfx 光照可与 Phaser 滤镜配合

## 参考资料

- [pixelfx 仓库](https://github.com/patch-gg/pixelfx)
- [特效目录](https://github.com/patch-gg/pixelfx/blob/main/docs/CATALOG.md)
- [创作指南](https://github.com/patch-gg/pixelfx/blob/main/docs/AUTHORING.md)
- [在线画廊](https://patch-gg.github.io/pixelfx/)
