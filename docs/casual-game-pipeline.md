# 休闲游戏量产管线 · 阶段 0 执行包

本档是"AI 量产休闲游戏 → 海外 Web 门户变现"路线的执行计划与任务清单。目标是用
最小成本回答一个问题：**AI 量产的休闲游戏在海外 Web 门户能否产生真实收入与数据？**
结论将决定是否投入 L1 模板产线（见[路线](#附录路线图回顾)）。

配套机器可读选题清单：[`config/casual-game-topics.json`](../config/casual-game-topics.json)。

## 目标与非目标

**目标（8 周）**

1. 产出 10 款低成本休闲游戏（每款 1–2 天），全部达到[最小验收标准](#二每款最小验收标准-dod)。
2. 发布到 itch.io（托管）+ Playgama / GameDistribution（流量与数据），
   收集 plays、时长、留存、收入、审核反馈等真实数据。
3. 沉淀 4 个游戏原型的模板基座，为 L1 量产做好准备。
4. 搭好轻量合集站骨架（长期资产，不背流量指标）。

**非目标（本阶段明确不做）**

- 不做 App Store / Google Play 上架（模板化批量上架有 4.3 / spam 封号风险）。
- 不做完整产线（batch runner、自动质量门是 L1，等数据成立再建）。
- 不冲 Poki（其测试漏斗与 AI 内容政策对批量不友好；Poki 是优化层的里程碑目标）。
- 不追求合集站流量（SEO 是 6–12 个月的事）。

## 〇、前置：账号与工具链

### 账号注册（第 1 周前 1–2 天，人工事项）

| 顺序 | 渠道 | 入址 | 角色 |
| --- | --- | --- | --- |
| 1 | itch.io | itch.io 注册并建 studio 页 | 第 0 发布位：零审核，永远有地方放 |
| 2 | Playgama | developer.playgama.com | 筛选位 A：24h 快审、analytics、多平台分发 |
| 3 | GameDistribution | developer.gamedistribution.com（Azerion Connect） | 筛选位 B：33% net 分成、4000+ 站点分发 |
| 4 | CrazyGames | developer 门户 | 优化层目标；QA feedback 作为免费质量标定 |
| — | 收款 | PayPal / Wise | 提现门槛 $100（Playgama）/ €50–100（GD） |

### SDK 决策：统一 Playgama Bridge

- 接入：CDN `<script src="https://bridge.playgama.com/v2/stable/playgama-bridge.js">`
  或 `npm i @playgama/bridge`；`playgama-bridge-config.json` 放 `index.html` 旁
  （官方 config editor 生成）；`bridge.initialize()` 先于游戏启动。
- 能力：interstitial / rewarded / banner 广告（含 AdBlock 检测）、云存档、排行榜、
  任务与每日奖励、remote config、analytics。
- **一次接入适配 20+ 平台**（Playgama / GameDistribution / CrazyGames / Poki /
  YouTube / TikTok / MSN / Y8 等），提交时选平台即可。
- 本地开发返回 safe defaults 而非报错，自动化验收友好。
- **许可证 LGPL v3**：一律用 CDN 引入（不构成衍生分发）；若 npm 打包需保留 LGPL 声明。
- **MCP 直通车**（第 1 周接线）：
  `claude mcp add --transport 'http' 'playgama-developer-cabinet' 'https://developer.playgama.com/api/mcp'`
  —— agent 可直接创建游戏、上传构建与封面、发布 sandbox 链接。OhMyGame 支持 MCP
  servers，接入后"制作 → 上传 → 发布"链路可自动化。

### 数据工具

- umami（Cloudflare Pages 自托管或云版）做页面与游戏事件分析。
- 游戏内事件埋点约定：`game_start / level_complete / fail / revive_rewarded / session_end`。
- Bridge analytics 与自建埋点并行，互为校验。

## 一、选题清单：10 款 = 4 原型 × 变奏

选品原则：机制极简（AI 一次实现可靠性高）、题材换皮空间大、门户长青类目、每款
1–2 天。**4 个原型即 L1 模板库雏形。** 完整字段见
[`config/casual-game-topics.json`](../config/casual-game-topics.json)。

| # | 原型 | 题材变奏 | 变现位 |
| --- | --- | --- | --- |
| A1–A3 | Water Sort 水排序 | 鲜榨果汁 / 实验室药剂 / 魔法珠宝 | rewarded 提示；每 5 关 interstitial |
| B1–B3 | Merge / 2048 类 | 合并水果 / 合并怪物进化 / 主题 2048 | rewarded 加速/撤销；每 3 分钟 interstitial |
| C1–C2 | Idle / Clicker | idle 咖啡店 / idle 太空站 | rewarded 离线收益加倍；自然停顿点 interstitial |
| D1–D2 | One-tap casual | 切削 ASMR / 堆叠平衡 | rewarded 复活；每局结束 interstitial |

## 二、每款最小验收标准（DoD）

**包体**

- 静态 build、`index.html` 入口、资源全本地化（门户禁止外链）。
- 首载 ≤ 50MB（按 CrazyGames 最严线执行）。
- `playgama-bridge-config.json` 就位，`bridge.initialize()` 先于游戏启动。

**玩法**

- core loop 完整：开始 → 进行 → 明确胜负 → 重开。
- 移动 + 桌面双输入；375px 与 1280px 双视口无横向溢出。
- 首屏到可玩 ≤ 3s（本地）。
- 进度存档（Bridge 云存档 + localStorage 兜底）。

**变现**

- rewarded ≥ 1 个自然位置（失败复活 / 结算加倍 / 提示）。
- interstitial 不打断进行中操作（每 3–5 关或 2–3 分钟）。
- 本地 safe default 下广告调用零报错。

**质量（自动化断言）**

- build 通过、boot 无 console error、首屏截图非空白。
- win / lose / reset 全链路可达（可用 OhMyGame `game_use` 试玩复核）。

**素材与元数据**

- 封面 16:9（≥ 1280×720）、3–5 张截图。
- 英文标题、描述、分类、标签（选题时定稿）。

**合规**

- 无 IP 侵权；美术全自生成（AI 生成可商用）；音乐音效 CC0 或生成式。

## 三、三层渠道策略

1. **筛选层（第 1–8 周）**：10 款 → itch.io（放）+ Playgama / GameDistribution（量与数据）。
2. **优化层**：数据过关的款（avg session ≥ 3 分钟、完局率或留存高于批次均值、
   revenue/1000 plays 高于 €1.2 基线）修一轮后上 CrazyGames 正式上架，冲 Poki。
   **被拒时归档拒绝理由原文**（见[数据记录](#四时间表与数据记录)），用 QA feedback
   修 DoD，不允许绕质量线。
3. **自建层（轻量合集站，≤ 2 小时/周）**：
   - Cloudflare Pages 静态站（海外合规、免费、免运维）。
   - 每款游戏一个独立落地页：英文标题、玩法说明、内嵌游戏 iframe、截图；
     目标是长尾词 `play [game] online free` 的 SEO 入口与玩家池。
   - umami 事件埋点回流选题；**KPI 是数据可回流，不是流量**。
   - 预期 6–12 个月才谈 SEO 流量；AdSense / GameDistribution publisher feed
     等月 PV 上万后再议。
   - 游戏同步挂 OhMyGame Community（publish 链接免费），双入口。

## 四、时间表与数据记录

| 周 | 内容 |
| --- | --- |
| 第 1 周 | 账号 + Bridge 模板 + MCP 接线 + A1 全链路跑通（制作 → SDK → itch.io → Playgama sandbox → 提交） |
| 第 2–4 周 | 其余 9 款（每款 1–2 天，同原型共用代码底座）；合集站骨架 |
| 第 5–8 周 | 数据迭代：有苗头的款做 1–2 轮调优进优化层；数据差的换皮再上，不硬修 |

**每款记录字段**：制作工时 / token 成本 / 各渠道提交→过审时长 / 7·30 日 plays /
avg session / 完局率 / rewarded 展示与转化 / revenue per 1000 plays /
**被拒理由原文归档**。

**第 8 周 Go/No-Go**：中位款 ≥ $0.1/天 且有 1–2 款进优化层 → 启动 L1 模板产线
（目标成本 $2–5/款）；否则停止矩阵，带着完整数据转投 OhMyGame 产品化方向。

## 五、任务清单

按序执行；每项的验收标准全满足才算完成。游戏与合集站是内容项目，
产出于仓库外独立目录（见[工作区布局](#六工作区布局)）。

| ID | 任务 | 产出 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- |
| T1 | 执行包文档与选题清单 | 本文件 + `config/casual-game-topics.json` | 内容与讨论定稿一致；JSON 可解析 | ✅ |
| T2 | A1《Juice Sort》全链路跑通 | `~/projects/casual-games/juice-sort/` | 满足全部 DoD；itch.io 可玩链接；Playgama sandbox 提交；Bridge 接入 | 🔄 质量线修复版完成（build/verify/headless 截图验收通过），待人工浏览器手感验收与门户提交 |
| T3 | 轻量合集站骨架 | `~/projects/casual-site/` | Cloudflare Pages 可部署；落地页模板（游戏 iframe + 截图 + 英文文案）；umami 埋点接入 | ⬜ |
| T4 | 数据记录与归档结构 | `~/projects/casual-site/data/` 或表格模板 | 每款一记录；含拒绝理由原文归档字段；第 8 周可出批次汇总 | ⬜ |
| T5 | Playgama MCP 接线 | OhMyGame MCP 配置 | agent 可经 MCP 创建游戏/上传构建/发 sandbox | ⬜ |
| T6 | A2《Potion Sort》与 A3《Gem Sort》 | 2 个游戏项目 | 复用 A1 底座；各自满足 DoD | ⬜ |
| T7 | B 组 3 款（Merge/2048 类） | 3 个游戏项目 | 满足 DoD | ⬜ |
| T8 | C 组 2 款（Idle 类） | 2 个游戏项目 | 满足 DoD | ⬜ |
| T9 | D 组 2 款（One-tap 类） | 2 个游戏项目 | 满足 DoD | ⬜ |
| T10 | 游戏模板基座沉淀 | Bridge 集成 + 通用结构抽象 | 新款脚手架 ≤ 1 小时可跑通 DoD 骨架 | ⬜ |
| T11 | 第 8 周批次复盘 | 数据汇总 + Go/No-Go 结论 | 覆盖[数据记录](#四时间表与数据记录)全部字段 | ⬜ |

## 六、工作区布局

游戏与合集站是内容项目，**不进入 OhMyGame 产品仓库**：

```text
~/projects/casual-games/          # 独立 git 仓库：10 款游戏
├── juice-sort/                   # A1
├── potion-sort/                  # A2
└── ...
~/projects/casual-site/           # 独立 git 仓库：合集站（Cloudflare Pages）
├── public/games/<id>/index.html  # 各款静态构建产物
├── games/<id>/index.html         # 落地页
└── data/                         # 数据记录
```

游戏技术栈约定：**Vite + TypeScript + Phaser 3**（与 OhMyGame Web Game 默认一致，
便于日后用 OhMyGame agent 迭代这些项目；D 组小游戏允许退化为纯 Canvas）。

## 七、资产管线实测结论（2026-10-25，A1 重制时验证）

| 通道 | 状态 | 结论 |
| --- | --- | --- |
| AI 图片生成（bailian MCP） | ❌ 不可用 | MCP 进程未继承 `BAI_LIAN_TOKEN_PLAN_KEY`（shell `.zshrc` 有配但 IDE 启动的 MCP server 没带上）。**修复 MCP env 配置后重测**，这是资产管线的关键一环 |
| CC0 素材库检索（game-assets MCP） | ⚠️ 受限 | Kenney 目录抓取返回空、Openverse 多为实拍照片（风格不搭）。音效通道（freesound/opengameart CC0）良好：倒水/点击/胜利三件套已进项目 |
| 精细化代码绘制 | ✅ 主力 | 扁平卡通风（遮阳棚/玻璃管/液体渐变/气泡高光/木桌）质量可控、体积最小，当前基线 |
| Chrome headless 截图验收 | ✅ 可用 | `?step=N` / `?win=1` 自测模式 + headless 截图，实现了"浏览器实测"的自动化闭环（布局/状态/面板可视验收） |

**Bridge 集成的三个坑（已修复，量产模板必须带上）**：
1. npm 引入必须配 `@playgama/bridge/vite` 插件（否则 runtime 不加载）；
2. `bridge.initialize()` 在无平台适配器时可能**永不 resolve**，必须加超时（1.5s）；
3. `bridge.storage.get/set` 同样可能挂起，必须加超时（1.2s）+ localStorage 兜底；
   否则游戏启动流程被挂起，整屏空白。

## 八、风险备忘

1. 质量线是护身符：宁可少上不上烂的，门户对低质有隐性降权。
2. GameDistribution QA 最长 3 周且更新重审 2 周，快速试错走 Playgama；
   GD 版本须与他处最新版一致（开发者协议 §2.6.4）。
3. Bridge 用 CDN 引入规避 LGPL 分发义务。
4. 合集站每周时间盒 2 小时，超时即停——它是资产不是主业。
5. 平台政策会变：若某门户收紧 AI 内容政策，调整渠道权重而不是降低质量线。

## 附录：路线图回顾

- **阶段 0（本档）**：手工验证销路。10 款、8 周、真实数据、Go/No-Go。
- **阶段 1（L1 模板产线）**：模板库 + batch runner + 自动质量门 + 门户打包脚本，
  单款成本压到 $2–5。自动质量门替代人工确认门（设计门 autopilot 通道、
  资产规则校验、确定性 playtest 断言、成本熔断）。
- **阶段 2（产品化）**：把跑通的流程做成 OhMyGame 的 autopilot / 量产能力。
  注意 Apache 2.0 开源无代码壁垒，差异化在数据、模板质量与云端能力。

