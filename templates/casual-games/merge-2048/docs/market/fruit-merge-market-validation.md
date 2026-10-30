# Fruit Merge: 2048 Harvest 盈利可行性评估

检索日期：2026-10-28 ｜ 结论：**PIVOT（双轨：现作上线收割自然量 + 主攻 Suika 物理合成）** ｜ 置信度：中

## 一、结论与理由

**决定性证据两条：**

1. **品类天花板已被实测数据钉死**：滑动式 2048 在 web 是彻底的红海——CrazyGames 2048 分类头部
   全是"2048 缝合品类"（Cubes 2048.io 多人 io、Man Runner 2048 跑酷），经典滑动 2048 评分仅 3.6
   且 2022 年后停止更新（来源：crazygames.com/t/2048，检索 2026-10-28）。本作的 50+ 关机制关是真
   差异化，但**玩家在缩略图阶段感知不到**，只看到"又一个 2048"。
2. **同主题存在一个已验证的高天花板赛道**："水果合成"主题天然属于 Suika（合成大西瓜）品类——
   单人开发者 Momo Games 的 Watermelon Suika Game 在 GameDistribution 网络拿到 **1.1M+ gameplays**
   （2023-11 ~ 2025-09），官方原版 Switch 版 **11M downloads**（2024-10），且 Phaser 技术栈有现成
   Box2D Suika 源码可参考（来源见附录）。改造成本 ≈ 2-4 周（复用本作的美术/桥接/变现层基建）。

**结论**：不建议在滑动 2048 上继续加内容（ROI 递减），也不建议直接废弃（P0 变现层已落地，
边际成本≈0）。走双轨：**现作立即上线吃自然量验证广告数据，同时把 Suika 物理合成作为主攻方向**。

## 二、Kill Criteria（可证伪）

- **轨道 A（Fruit Merge 2048）**：上线 60 天内 total gameplays < 10,000 或 实测收入 < €1 / 1,000 plays
  → 停止内容更新（保留在线吃长尾），资源全转轨道 B。
- **轨道 B（Suika 物理合成）**：原型 4 周内 web 内测 session 完成率 < 40% 或首月 gameplays < 5,000
  → 停止投入，不再做第三个水果合成变体。
- **总止损**：双轨合计 6 个月后月净收入 < $100 → 停止该题材全部投入，转向其他品类（不再沉没）。

## 三、付费意愿（广告模式：付费方 = 广告主，非玩家）

本作走 Web 平台广告变现（Playgama Bridge → CrazyGames / GameDistribution / Playgama / Poki），
玩家不直接付费。"付费意愿"转化为 **eCPM（广告主出价）× 玩家 session 数**：

| 平台 | 分成（开发者/平台） | 门槛 | 来源 |
|---|---|---|---|
| Playgama | 阶梯 70%（至 $1,000）→ 80% → 90%（partner-site） | — | playgama.com/blog/business-faqs（2026-10-28） |
| CrazyGames | 公开页写 70/30；开发者实测反馈 40–60% 区间 | €100 payout | contra.com 估算文 + playgama.com/blog（2026-10-28） |
| GameDistribution | **33% net revenue**（协议明示） | €100 payout | playgama.com/blog/business-faqs（2026-10-28） |
| Poki | 定制费率（偏独占/高质量） | 邀约制 | playgama.com/blog（2026-10-28） |

**eCPM 实测锚点**（这是全报告最关键的数字）：有开发者报告 8 款 CrazyGames 游戏平均
**€1.20 / 1,000 plays**（来源：contra.com/community/2BRsL3Yo，检索 2026-10-28）。
估算模型（同源）：低档 $2 eCPM → $1/1k plays；中档 $5 eCPM → $5/1k plays；高档 $10 eCPM → $15/1k plays。
非欧美流量单价更低（具体地区差异 `未验证`，需上线后自测）。

## 四、竞品盘点（web 平台，2026-10-28 检索）

| 竞品 | 平台 | 量级代理指标 | 制作规格 | 差异点 |
|---|---|---|---|---|
| Cubes 2048.io | CrazyGames | 2048 分类 #1（近 6 月评分 8.2） | 3D 多人 io | PvP 实时对战 + 排行榜 |
| Man Runner 2048 | CrazyGames | 分类 #2（评分 8.6，2026-04 仍更新） | Unity 6 3D | 跑酷缝合 + Boss 战 |
| 2048 Merge Blocks | CrazyGames | 分类 #3 | 2D | 物理掉落变体 |
| 经典 2048（Cirulli） | CrazyGames | 评分 **3.6**（2022-07 后未更新） | 纯数字滑动 | —（已死） |
| Watermelon Suika Game | GameDistribution | **1.1M gameplays**（单人开发者） | 2D 物理 | Suika 克隆 + 多平台分发 |
| Suika Game（官方） | Switch/iOS/Android | **11M downloads**（2024-10） | 2D 物理 | 品类开创者 + 直播传播 |

**机会点**（竞品可切入缝隙）：
- 滑动 2048 缝合品类 = 红海，但**关卡制 + 机制格**（本作已有）在该分类无人做——问题是量小。
- Suika 品类克隆多但**美术同质化**（都是简笔水果），且少有人做"关卡制 Suika"（目标导向 + 机制格）。
  本作的 LevelGen/机制格/星级体系**可直接复用**到物理合成上 = 真差异化的路径。

## 五、单位经济（明示假设链，广告模式）

```
gameplays × 每 play 广告展示数 × eCPM / 1000 × 开发者分成 = 毛收入
```

| 档位 | 6 个月 gameplays | 广告/play | eCPM | 分成 | **6 个月毛收入** | 关键假设 |
|---|---|---|---|---|---|---|
| 保守 P90 | 20,000 | 1 | €1.2 | 33% | **≈ €8** | 无推荐位、仅 GameDistribution 自然量 |
| 现实 P50 | 150,000 | 2 | €2 | 70% | **≈ €420** | 进 CrazyGames 全量 + Playgama 阶梯 |
| 乐观 P10 | 600,000 | 3 | €5 | 80% | **≈ €7,200** | 被 Poki/CG 推荐 + Suika 转向成功 |

对比参照：Momo Games 单人案例 1.1M gameplays（2 年累计）——乐观档并非天方夜谭，但保守档才是
多数独立 web 游戏的真实落点。**买量路径不适用**（web 广告 eCPM 撑不起 CPI，LTV/CAC < 1），
只能走平台自然量 + ASO（商店内搜索/分类曝光）。

## 六、获客路径

| 渠道 | 可行性 | 具体动作 | 预期量级 |
|---|---|---|---|
| CrazyGames/GameDistribution 平台自然量 | **高**（唯一现实路径） | 按平台 QA checklist 提交（loading 快、mute-on-silent、SDK 已接）；标题带 "2048"/"Merge" 关键词 | 决定 80% 收入 |
| 平台分类搜索（ASO） | 中 | 标题《Fruit Merge: 2048 Harvest》已含双关键词；补 tag: puzzle/merge/2048/fruit | 长尾 |
| TikTok/Shorts | 低-中 | 滑动 2048 视觉钩子弱（不如物理合成"下落碰撞"有看头）；Suika 版可做 | 转向后可期 |
| Reddit/X | 低 | r/WebGames 允许自推；量小 | 辅助 |
| Product Hunt | **无效** | 休闲 web 游戏不适合 | 0 |
| 付费买量 | **关闭** | LTV/CAC < 1（eCPM 太低） | 0 |

## 七、风险与反证（最能推翻本结论的证据缺口）

1. **eCPM 地区差异未验证**：€1.20/1k 是单人开发者 8 款游戏均值，未分地区。若欧美流量占比高，
   中/乐观档可上修。→ 上线 30 天看后台地区分布即可验证。
2. **Suika 品类是否已过气**：热度由 2023 直播潮推动，2026 年是否仍有量 `未验证`。
   → 先花 3 天做 Suika 物理原型投放 GameDistribution 测 gameplays，再决定是否投入 2-4 周完整开发。
3. **本作关卡制差异化可能被低估**：若上线后 D7 留存显著高于分类均值（`未验证` 的分类基准），
   说明关卡制确实留人，轨道 A 应加注而非止损。→ Kill criteria 中的 gameplays/收入指标可捕捉此信号。

## 附录：数据来源

| 来源 | 支撑的数字 | 检索日期 |
|---|---|---|
| https://blog.gamedistribution.com/momo-games-reaches-1-1-million-plays-with-watermelon-suika-game-on-gamedistribution | Suika 克隆 1.1M gameplays（单人开发者） | 2026-10-28 |
| https://en.wikipedia.org/wiki/Suika_Game | Suika 官方 11M downloads（2024-10）、日本 eShop 最下载 | 2026-10-28 |
| https://playgama.com/blog/business-faqs/poki-vs-crazygames-vs-gamedistribution-revenue-share | GameDistribution 33% net、Playgama 70/80/90 阶梯、CrazyGames €100 门槛 | 2026-10-28 |
| https://playgama.com/blog/general/effective-strategies-for-monetizing-html5-games | 各平台分成表、bundle 买断 $5k–$50k | 2026-10-28 |
| https://contra.com/community/2BRsL3Yo-estimating-crazy-games-revenue-with-a-web-first | €1.20/1k plays 实测、eCPM 三档估算模型 | 2026-10-28 |
| https://www.crazygames.com/t/2048 | 2048 分类竞品排名、经典 2048 评分 3.6 | 2026-10-28 |
| https://phaser.io/news/2024/10/suika-watermelon-game-source | Phaser + Box2D Suika 源码存在（改造可行性） | 2026-10-28 |
