# pixelfx 自动触发检查清单

## 使用说明
在游戏开发流程中，**自动使用此检查清单**验证特效覆盖，无需用户手动检查。

---

## 1. 设计阶段检查清单

### VFX 需求识别
- [ ] 已分析游戏机制（战斗、魔法、UI、环境等）
- [ ] 已生成 VFX 需求表
- [ ] 已映射到 pixelfx 类别
- [ ] 已添加到设计文档

**自动触发条件：**
```
如果 游戏机制 包含 [攻击/魔法/爆炸/状态/UI/环境]
那么 自动生成 VFX 需求表
并且 映射到 pixelfx 类别
```

---

## 2. 实现阶段检查清单

### 战斗特效覆盖
- [ ] 近战攻击 → impacts/hit-flash + melee/slash
- [ ] 远程攻击 → projectiles/arrow + impacts/bullet-impact
- [ ] 魔法施法 → arcane/magic-circle + 对应元素特效
- [ ] 爆炸破坏 → explosions/big-explosion + debris
- [ ] 暴击效果 → impacts/critical-hit + 屏幕震动

### 状态特效覆盖
- [ ] 燃烧状态 → status/burning
- [ ] 冰冻状态 → status/frozen
- [ ] 中毒状态 → status/poisoned
- [ ] 流血状态 → status/bleeding
- [ ] 增益状态 → holy/blessing

### UI 特效覆盖
- [ ] 金币拾取 → pickups/coin-spin + ui/coin-collect
- [ ] 道具拾取 → pickups/collect-burst
- [ ] 成就解锁 → ui/achievement
- [ ] 按钮点击 → ui/click-burst
- [ ] 连击计数 → ui/combo-counter

### 环境特效覆盖
- [ ] 天气效果 → weather/rain-splash 或 weather/falling-snow
- [ ] 粒子效果 → weather/fireflies 或 nature/leaf-storm
- [ ] 光照效果 → holy/halo 或 arcane/magic-circle

**自动触发条件：**
```
当 实现 游戏机制 [X] 时
自动 集成 pixelfx 特效 [对应类别]
```

---

## 3. 测试阶段检查清单

### 视觉反馈完整性
- [ ] 所有攻击动作都有视觉反馈
- [ ] 所有技能施放都有视觉反馈
- [ ] 所有受击都有视觉反馈
- [ ] 所有 UI 交互都有视觉反馈
- [ ] 所有拾取都有视觉反馈

### 游戏手感检查
- [ ] 打击感足够强（命中特效 + 屏幕震动）
- [ ] 魔法感足够强（施法特效 + 发光）
- [ ] 爆炸感足够强（爆炸特效 + 碎片）
- [ ] UI 反馈足够强（按钮特效 + 动画）

### 特效质量检查
- [ ] 特效风格与游戏风格一致
- [ ] 特效颜色与游戏色调协调
- [ ] 特效时长与游戏节奏匹配
- [ ] 特效性能（帧率稳定）

**自动触发条件：**
```
当 进行 视觉 QA 时
自动 检查特效覆盖
如果 覆盖不足
那么 推荐补充特效
```

---

## 4. 润色阶段检查清单

### 游戏手感诊断
- [ ] 用户反馈"打击感不够" → 推荐 impacts/hit-flash + 屏幕震动
- [ ] 用户反馈"魔法没感觉" → 推荐 arcane/magic-circle + 发光
- [ ] 用户反馈"爆炸不震撼" → 推荐 explosions/big-explosion + 碎片
- [ ] 用户反馈"UI 反馈弱" → 推荐 ui/coin-collect + 缩放动画

### 特效增强方案
- [ ] 命中特效增强 → impacts/hit-flash + 粒子飞溅
- [ ] 技能特效增强 → 对应元素特效 + 拖尾
- [ ] 爆炸特效增强 → explosions + 烟雾 + 碎片
- [ ] UI 特效增强 → ui + 缩放 + 发光

**自动触发条件：**
```
当 用户反馈 [游戏手感问题] 时
自动 推荐 pixelfx 增强方案
```

---

## 5. 自动触发规则汇总

### 规则 1：设计阶段自动识别
```
触发：游戏机制分析
动作：生成 VFX 需求表
输出：设计文档中的 VFX 需求章节
```

### 规则 2：实现阶段自动集成
```
触发：实现游戏机制 [X]
动作：集成 pixelfx 特效 [对应类别]
输出：游戏代码中的特效集成
```

### 规则 3：测试阶段自动检查
```
触发：视觉 QA
动作：检查特效覆盖
输出：特效覆盖报告 + 补充建议
```

### 规则 4：润色阶段自动增强
```
触发：用户反馈 [游戏手感问题]
动作：推荐 pixelfx 增强方案
输出：特效增强方案
```

---

## 6. 与游戏开发流程集成

### 在 game-studio/web-game-studio 中的集成点

**第 1 步（设计）：**
- 自动识别 VFX 需求
- 自动生成 VFX 需求表
- 映射到 pixelfx 类别

**第 3 步（实现）：**
- 自动集成 pixelfx 特效
- 根据游戏机制选择特效
- 使用 EffectManager 集成

**第 4 步（测试）：**
- 自动检查特效覆盖
- 诊断游戏手感
- 推荐补充特效

**润色阶段：**
- 自动增强游戏手感
- 推荐 pixelfx 增强方案
