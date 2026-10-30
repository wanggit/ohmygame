# 休闲游戏玩法库与模板库（Casual Game Playbooks & Templates）

> 来源：T0/T1 玩法调研（2026-10-30）+ `~/projects/casual-games` 已定稿母版的**冻结快照**。
> 用途：① 玩法知识库——每个玩法一个子目录，**不遗忘任何已评估玩法**；② 模板基座——已建母版供实例化新游戏（L1 模板产线，pipeline 任务 T10）。
> 玩法选型（T0/T1 矩阵）与质量线见 [`docs/casual-game-pipeline.md`](../../docs/casual-game-pipeline.md)。

## 目录约定

- **每个玩法一个子目录**，目录名 = 玩法英文名（kebab-case）。
- **`PLAYBOOK.md` 必有**：玩法手册（3 秒版规则 / 市场验证 / 实现要点 / 模板 ROI 判定 / IP 风险 / 变奏空间）。不做模板的玩法也必须有手册——这是"不遗忘玩法"的载体。
- **模板代码**（`src/`、`scripts/`、`public/` 等）仅已建母版的玩法才有。

## 玩法目录总表

判定符号：**✅ 母版已建** ｜ **⏳ 值得模板**（满足触发条件时建）｜ **💡 直接做游戏**（玩法核 1-2 小时可重写，不建模板，复用横切基建）｜ **🚫 不做/暂缓**（记录原因，防遗忘）。

### T0（10 年以上全球验证 / 10 亿级验证）

| 目录                                              | 玩法            | 判定                      | 对应选题/游戏                       |
| ------------------------------------------------- | --------------- | ------------------------- | ----------------------------------- |
| [`water-sort/`](water-sort/PLAYBOOK.md)           | 水排序/颜色分类 | ✅ 母版已建               | A1–A3（juice/potion/crayon-sort）   |
| [`merge-2048/`](merge-2048/PLAYBOOK.md)           | 合并/2048       | ✅ 母版已建               | B1–B2（fruit-merge/number-alchemy） |
| [`blast/`](blast/PLAYBOOK.md)                     | 两消/点击消除   | 💡 直接做游戏             | **G1（T0 缺口，优先补）**           |
| [`one-tap-timing/`](one-tap-timing/PLAYBOOK.md)   | 一键时机        | 💡 直接做游戏             | **G2（T0 缺口，优先补）**           |
| [`match-3/`](match-3/PLAYBOOK.md)                 | 三消            | 🚫 不做（巨头买量碾压）   | —                                   |
| [`falling-blocks/`](falling-blocks/PLAYBOOK.md)   | 俄罗斯方块类    | ⏳ 值得模板（⚠️ IP 红线） | —                                   |
| [`solitaire/`](solitaire/PLAYBOOK.md)             | 纸牌接龙        | ⏳ 值得模板               | —                                   |
| [`breakout/`](breakout/PLAYBOOK.md)               | 打砖块          | 💡 直接做游戏             | —                                   |
| [`snake/`](snake/PLAYBOOK.md)                     | 贪吃蛇          | 💡 直接做游戏             | —                                   |
| [`memory-match/`](memory-match/PLAYBOOK.md)       | 记忆翻牌        | 💡 直接做游戏             | —                                   |
| [`link-match/`](link-match/PLAYBOOK.md)           | 连连看/麻将接龙 | ⏳ 值得模板（关卡制）     | —                                   |
| [`spot-difference/`](spot-difference/PLAYBOOK.md) | 找不同          | 💡 直接做游戏             | —                                   |
| [`jigsaw/`](jigsaw/PLAYBOOK.md)                   | 拼图            | 💡 直接做游戏             | —                                   |
| [`color-by-number/`](color-by-number/PLAYBOOK.md) | 按数字填色      | 💡 直接做游戏             | —                                   |
| [`sudoku/`](sudoku/PLAYBOOK.md)                   | 数独            | 💡 直接做游戏（单局偏长） | —                                   |

### 近年新爆款（3-5 年内验证，2024-25 仍在上升）

| 目录                                        | 玩法          | 判定                          | 对应选题/游戏 |
| ------------------------------------------- | ------------- | ----------------------------- | ------------- |
| [`tap-away/`](tap-away/PLAYBOOK.md)         | 消箭头        | ⏳ 值得模板（关卡需 solver）  | —             |
| [`pull-the-pin/`](pull-the-pin/PLAYBOOK.md) | 拔针          | ⏳ 值得模板（关卡需可解生成） | —             |
| [`unblock/`](unblock/PLAYBOOK.md)           | 挪车/滑块让路 | ⏳ 值得模板（关卡制）         | —             |
| [`pipe-connect/`](pipe-connect/PLAYBOOK.md) | 管道接水      | 💡 直接做游戏                 | —             |
| [`one-line/`](one-line/PLAYBOOK.md)         | 一笔画        | 💡 直接做游戏                 | —             |
| [`peg-pop/`](peg-pop/PLAYBOOK.md)           | 弹球钉板      | ⏳ 值得模板（物理手感）       | —             |
| [`territory-io/`](territory-io/PLAYBOOK.md) | 圈地          | 🚫 暂缓（对手逻辑重）         | —             |

### T1（超休闲经典）

| 目录                                            | 玩法      | 判定                      | 对应选题/游戏                      |
| ----------------------------------------------- | --------- | ------------------------- | ---------------------------------- |
| [`stacking/`](stacking/PLAYBOOK.md)             | 堆叠/平衡 | ⏳（D2 定稿后可成母版）   | D2 tower-balance                   |
| [`slice/`](slice/PLAYBOOK.md)                   | 切割 ASMR | ⏳（D1 定稿后可成母版）   | D1 satisfying-slice                |
| [`chain-reaction/`](chain-reaction/PLAYBOOK.md) | 连锁反应  | ⏳（E1 定稿后可成母版）   | E1 chain-reaction                  |
| [`physics-flip/`](physics-flip/PLAYBOOK.md)     | 物理翻转  | 🚫 设计不合格（复合判定） | F1 flip-bottle（需砍单判定极简版） |
| [`runner/`](runner/PLAYBOOK.md)                 | 跑酷      | 🚫 暂缓（竞争红海）       | —                                  |
| [`aim-shoot/`](aim-shoot/PLAYBOOK.md)           | 弹射瞄准  | ⏳ 暂缓                   | —                                  |
| [`draw-line/`](draw-line/PLAYBOOK.md)           | 画线      | ⏳ 暂缓                   | —                                  |

## 模板 ROI 判定标准（三道门槛 + 公式）

入选模板 = **玩法母版 ∩ 已定稿（可冻结）∩ 基座质量达标**（实测迭代完成 + verify 全绿 + 标定/难度闭环）。本库是「起点库」不是「作品库」：派生款能从母版再生（A2 换皮实测约 40 分钟），不重复收录；派生款的机制创新与踩坑录留在各自 `casual-games/<game>/docs/DESIGN.md`。

**值得建模板 =（预期变奏数 − 1）× 每款节省工时 > 模板制作 + 维护成本。** 两个硬信号：

1. **高实现成本**：需要 solver / 关卡生成器 / 标定闭环（如水排序可解性验证、2048 beam 标定）；
2. **高复用**：题材换皮空间大、计划做 2+ 款。

玩法核 1-2 小时可重写的（两消、翻牌、打砖块等）标 💡：直接做游戏，复用横切基建，做 2-3 款变奏后再评估是否沉淀模板。**横切基建（Bridge 集成、verify 脚手架、自测模式、音效、打包规范）所有玩法通用**——已内置在各模板中，最终目标是抽成共享脚手架（pipeline T10）。

历史判定记录（2026-10-30）：A1 juice-sort ✅ 入选（全系列唯一标「模板定稿」，七轮实测）；B1 fruit-merge ✅ 入选（B 系列标杆，50 关 + beam 标定 + verify 41 项）；A2/A3/B2 ⏭️ 不收（A1/B1 派生款，冗余）；D1 satisfying-slice ⏳ 最近候选（未定稿，定稿后作为 Slice 母版收入）；D2/E1 ⏳ 未定稿；F1 flip-bottle 🚫 设计不合格（复合判定违反 DoD 禁令）。

入选 = **玩法母版** ∩ **已定稿（可冻结）** ∩ **基座质量达标**（实测迭代完成 + verify 全绿 + 标定/难度闭环）。本库是"起点库"不是"作品库"：派生款能从母版再生（A2 换皮实测约 40 分钟），不重复收录；派生款的机制创新与踩坑录留在各自 `casual-games/<game>/docs/DESIGN.md`。

| casual-games 游戏            | 状态        | 判定            | 原因                                                                                              |
| ---------------------------- | ----------- | --------------- | ------------------------------------------------------------------------------------------------- |
| A1 juice-sort                | ✅ 模板定稿 | ✅ 入选         | 全系列唯一标"模板定稿"（七轮实测 + verify 全绿）；A 系列母版                                      |
| B1 fruit-merge               | ✅ 完成     | ✅ 入选         | B 系列标杆；50 关 + beam search 标定 + verify 41 项全绿                                           |
| A2 potion-sort               | ✅ 完成     | ⏭️ 不收（冗余） | A1 派生款（配方变奏）；机制创新见其 DESIGN.md                                                     |
| A3 crayon-sort               | ✅ 完成     | ⏭️ 不收（冗余） | A1 派生款（换皮 + 工具差异）                                                                      |
| B2 number-alchemy            | ✅ 已完成   | ⏭️ 不收（冗余） | B1 派生款（跨代合并变奏）                                                                         |
| D1 satisfying-slice          | ✅ 进行中   | ⏳ 最近候选     | 未定稿（仍在迭代）；手感驱动型暂无标定范式沉淀；定稿后作为 T1 Slice 母版收入                      |
| D2 tower-balance             | ⏳ 待开发   | ⏳ 未定稿       | 未开发（物理手感高难度）                                                                          |
| E1 chain-reaction            | ⏳ 待开发   | ⏳ 未定稿       | 仅原型验证"能玩 + 爽点清晰"                                                                       |
| F1 flip-bottle               | ⏳ 待开发   | 🚫 设计不合格   | 复合判定（蓄力 + 翻转圈数 + 落点精度）违反 DoD 复合判定禁令，3 秒测试不过；砍到单判定极简版后重评 |
| G1 blast / G2 one-tap timing | ⬜ 待建     | —               | T0 缺口母版，建成后收入                                                                           |

## 与 casual-games 的关系（冻结快照原则）

- **这里是模板**：定稿即冻结，是新游戏的起点。升级模板 = 人工 review 后显式覆盖新快照。
- **casual-games 是内容**：发布游戏本体持续迭代、记录变现数据，不自动回流模板。
- 两份代码不自动同步：改模板不影响已发布游戏；已发布游戏的调参/踩坑经人工判断后再沉淀进模板。

## 实例化流程（新游戏 = 复制 + 换主题层 + 重标定）

1. **复制模板**到目标项目目录（如 `~/projects/casual-games/<new-game>/`）；`node_modules/`、`dist/` 不带。
2. **改名**：`package.json` 的 `name`、`index.html` 的 `<title>`、README 标题。
3. **换主题层**（唯一换皮位）：`src/config.ts` 配色/文案/主题绘制、`public/` 素材。
   变体质量线：美术焕新或玩法创新**至少占一样**，纯换色不算可发布产品。
4. **玩法变奏（可选）**：动玩法核前先做规则可行性验证（见 pipeline 踩坑录：solver 剪枝须逐条对照玩家规则、hash 不抹身份管）。
5. **关卡重标定**：`bun scripts/pregen.ts`（或模板等价生成器）重新生成关卡数据，保持"确定性可达闭环"（标定模拟与玩家消费同一序列）。
6. **verify 全绿**：`bun install && bun scripts/verify.ts`（build / console 零错误 / 胜负链路 / 截图非空白）。
7. **过质量门**（pipeline DoD 硬门）：3 秒测试（无文字说明 3 秒看懂玩法）+ 复合判定禁令（单局 1 种操作原语 tap/drag/swipe/timing + 至多 1 个风险回报维度）+ 新机制教学横幅。
8. **补 `CREDITS.md`**：新增素材逐条署名（Mixkit 商用免署名 / CC0 / AI 生成）。

参考工时：纯换皮约 40 分钟（A2 实测）；带玩法变奏 2–4 天。

## 模板内容约定

- 技术栈：Vite + TypeScript + Phaser（与 OhMyGame Web Game 默认一致）；Playgama Bridge 走 CDN（LGPL v3 声明见各模板 `PLAYGAMA_BRIDGE_LICENSE.txt`，不得改为 npm 打包分发）。
- `scripts/verify.ts`：自动化验收脚手架（headless 截图 + 断言），实例化后必须保留并按新玩法改断言。
- `?step/?win/?anim/?stream` 自测模式：浏览器实测闭环（详见各模板 README）。
- Bridge 三坑修复已内置（initialize/storage 超时兜底），**不要移除**。
- 素材全部可商用，禁止引入 IP 侵权素材；AI 生成美术保留生成记录。
- 发布打包遵循 pipeline DoD：静态 build、资源全本地化、首载 ≤ 50MB。
