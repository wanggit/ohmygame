# Juice Sort: Color Water Puzzle

休闲游戏量产管线（阶段 0）的第 1 款：经典水排序玩法 × 鲜榨果汁主题。
对应选题 `A1`（`ohmygame/config/casual-game-topics.json`），验收标准见
`ohmygame/docs/casual-game-pipeline.md` 的 DoD。

## 技术栈

- Vite + TypeScript + Phaser 3（竖屏 720×1280，Scale.FIT 响应式）
- Playgama Bridge（npm 打包，广告 / 云存档 / 埋点，本地 safe default）
- 纯代码绘制（无外部素材，包体最小）

## 命令

```bash
bun install        # 或 npm install
bun run dev        # 本地开发（广告走 safe default，本地直接发放奖励）
bun run build      # tsc 类型检查 + 产物到 dist/
bun run preview    # 预览构建产物
bun run verify     # 玩法/关卡生成批量验证（可解性、难度曲线、废关卡防线）
bun run measure    # 难度校准：实测解长分布，调难度参数前先跑
bun run smoke      # 运行时冒烟（Playwright）：渲染/交互/动画/布局，产出 docs/smoke/*.png
```

构建产物 `dist/` 即门户提交包内容（zip 后上传；资源全本地化，无外链）。

## 自测参数（URL query）

| 参数 | 作用 |
| --- | --- |
| `?level=N` | 指定关卡（查高关卡多行布局；L50 = 30 管盲盒盘面） |
| `?jungle=N` | jungle 无尽轮数（+2 管/轮，验证大管数盘面） |
| `?step=N` | 无动画快进 N 步 |
| `?anim=1` | 自动跑一次真实倒水动画 |
| `?win=1` | 直达胜利面板 |
| `?stream=1` | 持续粒子（可见性验证） |
| `?debug=1` | 暴露只读状态快照（smoke 断言用，生产不开启） |
| `?intro=0` | 关闭绞盘机开局演出 |
| `?cb=0` | 关闭色盲辅助纹样 |

## Playgama Bridge

- `src/bridge.ts` 为封装层：广告 Promise 化（事件 + 轮询双保险）、
  存档（cloud storage + localStorage 兜底）、埋点。
- `playgama-bridge-config.json` 当前为最小骨架，**提交前请用官方
  [config editor](https://playgama.github.io/bridge-config-editor/) 重新生成**，
  并填入各平台的 gameId。
- 许可证：Bridge 为 LGPL v3，以 npm 打包分发时须附带声明，见
  `PLAYGAMA_BRIDGE_LICENSE.txt`。

## 玩法与变现

- 点击源试管再点目标试管倒水；同色合并；全部归位过关。
- 绞盘机增量开局：新关卡的管子由摇柄"绞出"落位（2-4 根一批），固定随机种子可复现。
- ↩ 撤销：免费无限次（品类基本预期，误触不再毁局）。
- 💡 提示：每关先送 1 次免费，用完才走 rewarded（`hint` 位）；锁管锁定期提示不会指向锁管。
- ↻ 重置：还原**同一题**开局（par / 星级可比），不是换题。
- 👁 色盲辅助：每种果汁叠加专属几何纹样，颜色之外多一条区分通道（可关闭）。
- 卡关检测：无合法倒水时自动弹出口面板 —— 撤销 / 看广告 +1 空管（`add_tube` 位）/ 重置。
- 🌴 JUNGLE+（无尽模式）：胜利面板可选下一局 +2 管继续挑战，30 管封顶循环。
- banner 常驻底部（平台支持时）；每 3 关胜利后插一次 interstitial（`level_complete` 位，前 2 关保护不插）。
- 关卡随机生成且经求解器验证可解（含雾/锁/冰特殊管约束）；难度四维递进：
  色数 3→10、管数 5→30（分散度）、锁管 4→12 步、特殊管密度。
- 进度存档：云存档 + localStorage。

## 门户提交清单

1. `bun run build`，zip `dist/`（保证 `index.html` 在 zip 根）。
2. **itch.io**：新建 itch.io 项目，上传 zip，勾选 "This file will be played in the browser"，封面 16:9。
3. **Playgama**：developer.playgama.com 创建游戏 → 上传构建与封面 → sandbox 自测 → 提交审核（24h）。
4. **GameDistribution**（第二批）：注意 GD 包须与其他渠道最新版一致（协议 §2.6.4）。
