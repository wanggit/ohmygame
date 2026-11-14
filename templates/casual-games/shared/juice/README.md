# juice —— 打击感与程序化动画共享库

休闲游戏模板的横切基建之一（pipeline T10 共享脚手架的第一块）。纯 TypeScript、零依赖，
覆盖两块所有玩法通用的需求：

1. **打击感五件套**：hit-stop（命中停顿）、屏幕震动、挤压拉伸、弹入弹出、飘字；
2. **分部件骨骼程序化动画**：`walkCycle` / `idlePose` / `limbSway` / `followThrough`，
   用代码摆骨骼代替逐帧 sprite sheet（对应 sprite-pipeline 技能的 Part-Based Rig 路线）。

## 文件

| 文件 | 内容 | 依赖 |
| --- | --- | --- |
| `juice.ts` | 引擎无关核心：easing、Tween、TimeScaler、Shake、squash/stretch、反馈曲线、部件骨骼采样 | 无 |
| `juice-phaser.ts` | Phaser 4 适配：tween 配方、hitFeel 组合拳、applyPartPose | 仅依赖 `juice.ts`（鸭子类型，不依赖 Phaser 类型包） |

## 接入

实例化模板或新建游戏时，把本目录复制到游戏项目（如 `src/juice/`），按需 import：

```ts
import { hitFeel, popIn, floatUp, applyPartPose } from "./juice/juice-phaser";
import { walkCycle, TimeScaler, Shake } from "./juice/juice";

// 命中瞬间（消除/合并/受击）——一行给出打击感
hitFeel({ scene: this, time: this.time, camera: this.cameras.main }, targetSprite);
```

`juice-phaser.ts` 的宿主接口是鸭子类型（`SceneHost` / `TimeHost` / `CameraHost`），
传 Phaser `Scene` 即可直接用；单元测试里传 fake 宿主即可离线验证。

## 打击感五件套配方表

参数是休闲游戏的起点值，按游戏节奏微调（快节奏游戏整体缩时长）。

| 效果 | 触发时机 | 推荐参数 | 实现 |
| --- | --- | --- | --- |
| hit-stop | 每次命中/合并瞬间 | 40–90ms（连击时递减到 30ms，避免黏） | `hitStop(scene, time, ms)` 或 `TimeScaler.hitStop()` |
| 屏幕震动 | 重击、爆炸、失败 | trauma 0.15（轻点）/ 0.4（重击）/ 0.8（爆炸），160ms | `shake(camera, trauma)` 或 `Shake.add()` |
| 挤压拉伸 | 落地、起跳、弹出 | strength 0.22–0.35，180ms，Back.easeOut | `squashLand(scene, target)` |
| 弹入弹出 | UI/道具出现、得分跳字 | scale 0→1，220ms，Back.easeOut | `popIn(scene, target)` |
| 飘字 | 得分、+1、连击提示 | 上浮 40px，700ms，前 60% 不透明 | `floatUp(scene, text)` |

组合拳 `hitFeel(host, target, options)` 一次触发 hit-stop + 震动 + 挤压 + 白闪，
是消除/合并类玩法的默认命中反馈；轻量交互（选中、悬停）只用 popIn/pulse 即可，
**不要给每次点击都上全套**——反馈强度要和操作的重要性匹配。

音效与五件套同步触发（同一调用点），是"手感"的另一半；延迟超过 50ms 玩家就会感觉"不跟手"。

## 分部件骨骼动画规范（Part-Based Rig）

### 什么时候用

角色需要走路/跑步/待机/挥动等**关节运动**时，优先用部件骨骼而不是生成 sprite sheet
（生成器做不好帧间一致性，参见 sprite-pipeline 的 Animation Triage）。

### 素材制备

1. 生成/绘制**单帧完整角色**（正面或侧面，风格锚点见 sprite-pipeline）；
2. 按关节切成独立透明部件，推荐六件套：`head` / `body` / `leftArm` / `rightArm` / `leftLeg` / `rightLeg`；
   非人形角色按语义切（头/身/触角/尾巴…）；
3. 每个部件的 **pivot 放在关节点**（肩、髋、颈），不是部件中心；
4. 切片后统一走 `sprite-prepare.mjs` 抠底归一（`--bg` + `--anchor center`）；
5. 部件命名固定用上表英文名，pivot 命名 `part-<name>-pivot`，运行时与 `WalkPose` 字段对应。

### 播放

```ts
const t = (this.time.now / 1000) % (1 / 1.4); // 1.4Hz 步频，取模循环
const pose = walkCycle(t, { frequency: 1.4 });
applyPartPose(this.head, headBaseX, headBaseY, 0, pose.head);
applyPartPose(this.leftArm, armBaseX, armBaseY, 0, pose.leftArm);
// ...
```

- 角度单位是**度**（Phaser 原生），顺时针为正；
- 左右镜像 = 角度取反 + `scaleX = -1`，一套相位即可驱动两侧；
- 待机用 `idlePose(t)`（呼吸 + 微摆）；尾巴/头发/挂件用 `followThrough()` 弹簧延迟跟随；
- 想要"重量感"：走路 `bodyBob` 调大、步频调低；"轻快感"反过来。

## 与既有模块的关系

- `src/shared/effects/`（pixelfx 双缓冲特效）管**像素特效**；本库管**对象级动画与打击感**，互补。
- 特效爆点（粒子）在命中瞬间与 `hitFeel` 同点触发，见 pixelfx 技能。
- 引擎无关核心（`juice.ts`）也可用于非 Phaser 游戏（Canvas 直绘、Three.js UI 层）。