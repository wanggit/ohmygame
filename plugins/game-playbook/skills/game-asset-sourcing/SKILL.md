---
name: game-asset-sourcing
description: >
  Source free game assets (sprites, tilesets, icons, textures, UI, 3D models, audio) from
  CC0/CC-BY libraries with a license gate that keeps NC/copyleft assets out of monetized
  builds. Use when asked for game assets, 游戏素材, free assets, sprites, tilesets, pixel
  art, icons, UI pack, 3D models, textures, sound effects, 音效, BGM, or names a source:
  Kenney, OpenGameArt, itch.io, ambientCG, Poly Haven, Quaternius, Openverse. Also use for
  license checks, credits/署名, or a pre-ship asset audit.
---

# game-asset-sourcing — 免费游戏素材获取与许可把关

**工具环境**：下面的工具调用基于两台 MCP——**`game-assets`**（ASSETMCP，图形/3D/许可/下载）与 **`game-audio`**（音频搜索/下载）。若当前环境未接入这两台 MCP（可通过 OhMyGame 插件的 `mcp.json` 声明它们），工具名作为流程参考：按同样的步骤手动执行（在源站点人工搜索、逐条核验许可、登记 CREDITS）。素材库根目录 `~/mcp-game-assets`，音频库 `~/mcp-audio`。

## 最高优先级：许可门禁决定能不能用

用户做的是**海外商业发行**，素材许可出错会直接毁掉一个上架产品。判定状态（`get_asset_details` / `download_asset` 返回的 `license_check.status`）：

| status | 含义 | 处置 |
|---|---|---|
| `allowed_public_domain` | CC0 / Public Domain | 直接用，无需署名。**首选** |
| `allowed_with_attribution` | CC-BY | 可用，**必须**写入 CREDITS |
| `allowed_open_source` | MIT/Apache/BSD | 代码许可，需确认它覆盖素材文件本身 |
| `allowed_copyleft_review_required` | CC-BY-SA / GPL | ⚠️ 衍生品须同许可开放，与闭源商业游戏冲突。**默认换掉** |
| `blocked_noncommercial` | NC | ❌ 付费下载/IAP/广告/订阅一律禁止 |
| `blocked_no_derivatives` | ND | ❌ 禁止改色、切片、重编码 |
| `blocked_paid_asset` / `blocked_unclear_license` | 付费 / 许可不明 | ❌ 不要下载 |

多许可 `A OR B` 由使用者任选其一：检查器会挑最宽松的那个，并在 warnings 里提示"elect the non-copyleft option"。**选了就必须在 CREDITS 里记明选的是哪个**，不要默认落到 SA/GPL 那一项。

## 核心陷阱：`license_policy="safe"` 会藏掉 OpenGameArt 和 itch.io

OGA 和 itch.io 的**搜索列表页不含许可字段**（OGA 列表只有标题+缩略图），许可只在详情页。所以默认 `safe` 策略下这两源的结果会被全部过滤掉，看起来像"没搜到"。

正确姿势是两步：

```
search_assets(query="dungeon tileset", sources=["opengameart","itch"],
              max_results_per_source=10, license_policy="all")
# 再对每条候选逐个确认
get_asset_details(asset_url="https://opengameart.org/content/dungeon-tileset")
# → title / author / license="CC0" / license_url / files[] / 门禁状态
```

`get_asset_details` 对 OGA 会解析详情页，返回真实许可、作者、标题和可下载文件列表。只有 `license_check.allowed == true` 的才继续下载。

带许可的源（Kenney CC0、ambientCG CC0、Poly Haven CC0、Quaternius CC0）可以直接用 `safe`，一步到位。

## 参数名坑

参数是 **`max_results_per_source`**（`search_assets`）和 **`max_results`**（单源工具），**不是 `limit`**。传错不报错，静默用默认值。下载类：`download_kenney_asset` 收 **`asset_url`**，`download_ambientcg_asset` 收 **`asset_id`**，`extract_archive` 收 **`archive_path`**。

## 八个源实测状态

| source | 许可来源 | 内容 | 备注 |
|---|---|---|---|
| `kenney` | 列表即带 CC0 | 2D/UI/3D/音频包，风格统一 | 质量最稳，**优先** |
| `ambientcg` | CC0 | PBR 材质、HDRI | 有 `1K/2K/4K/8K-JPG/PNG` 分级，默认取 1K |
| `polyhaven` | CC0 | PBR 材质、HDRI、模型 | 分辨率高、体积大 |
| `quaternius` | CC0 | 低模 3D，含绑定+动画 | 83 个 pack，隐藏标签可用于匹配 |
| `opengameart` | **仅详情页** | 量最大，2D/3D/音乐/音效 | 许可混杂（CC0/CC-BY/SA/GPL），必须逐条验 |
| `itch` | **仅详情页** | 精品 2D/像素包 | 免费版与付费版条款常不同，读页面正文 |
| `openverse` | 列表带 | Flickr 等 CC 图片聚合 | ⚠️ 常混入 NC/ND，务必看 `license` 字段 |
| `godot` | 列表带 | **几乎只有代码插件** | 找美术素材基本无结果，不是故障 |

`search_assets` 支持 `sources=["local", ...]`，`local` 会搜已下载到 `~/mcp-game-assets` 的文件——**先查本地再联网**。

## 网络与源可用性

本机 ASSETMCP 环境实测：代理只对 itch.io / api.openverse.org / quaternius.com 必要，其余源直连更快；Quaternius 直连易超时、走代理快。若某源突然全挂，先判断是网络还是解析问题。**craftpix / sonniss / musopen / zapsplat / rawpixel 一律 403（Cloudflare 反爬），代理也救不了，不要浪费时间。**

## 标准流程

```
1. library_info / find_local_assets        # 先看本地有没有
2. suggest_asset_plan(game_description=…)  # 让它按游戏类型给出搜索词组合
3. search_assets(…, license_policy="all")  # 多源并发，1.9~3.8s
4. get_asset_details(asset_url=…)          # OGA/itch 逐条验许可 ← 不可跳过
5. download_asset(url=…, license=…, author=…, source_url=…)   # 带上许可元数据，否则记账为空
6. extract_archive / inspect_asset         # 解压并看尺寸、透明通道、主色
7. slice_sprite_sheet                      # 雪碧图切帧
8. import_asset_to_project(asset_path=…, project_path=…)
9. generate_credits(project_path=…)        # 生成 CREDITS.md
10. audit_project_assets(project_path=…)   # 上架前体检
```

第 5 步**必须把 `license` / `author` / `source_url` 一起传**，否则 manifest 记不到署名信息，第 9 步生成的 CREDITS 会是空的（CC0 素材本来就不需要署名，所以空是正常的；CC-BY 素材空了就是漏了）。

第 10 步返回 `passed` / `blocked_or_unclear_license_count` / `missing_files` / `suspicious_files`，**上架前必须 `passed: true`**。

## 音频走 game-audio

```
search_audio(query="coin pickup", kind="sfx", commercial_only=true)
download_audio(source=…, id=…, direct_url=…, title=…, format=…)
```

`commercial_only=true` 是默认值，会剔除 NC/GPL。可用源共 5 个：opengameart、mixkit、ccmixter、kenney 免 key；freesound 需要 `FREESOUND_TOKEN`（静态 API key，取自 https://freesound.org/apiv2/apply 的 "Client secret/Api key" 列，永不过期——24h 过期的是 OAuth2 access token，本 MCP 用不到）。限流 60 次/分、2000 次/天。

Freesound 实测：preview 走 `cdn.freesound.org`，**无需 OAuth2 也无需代理**；`commercial_only=true` 能正确剔除 `by-nc` 素材（实测 "coin" 查询 6 条全是 CC by-nc/4.0，开启后返回 0 条）。

**Pixabay 已从 `mcp-game-audio` 移除**（2026-09）。原因：Pixabay 公开 API 只有 `/api/`（图片）和 `/api/videos/`（视频）两个端点，**没有音频端点**，也没有 `media_type` 参数（图片端点用的是 `image_type`）。原实现传了凭空的 `media_type=music`，即使配上有效 key，返回的图片结果里没有 `audio` 字段，会被 `.filter(x => x.direct_url)` 全部滤掉 → 永远返回空数组。别再试图申请 `PIXABAY_API_KEY`。

`download_audio` 返回的 `attribution` 文本要收进 CREDITS。

## 已知边界与坑（实测）

- **itch.io 只能搜不能下**：`get_asset_details` 对 itch 页面发现 0 个可下载文件——itch 的下载走 CSRF + POST 换签名 URL，不是静态链接。这是**有意为之**（itch 的免费包多是 "name your own price"，作者期望你考虑付费）。用法：搜到后把 `source_url` 给用户，让他在浏览器里手动下载，再用 `download_asset(local_user_provided=true)` 或 `import_asset_to_project(local_user_provided=true)` 入库。
  - 搜索端点必须用 **`https://itch.io/search?q=`**，不能用 `/game-assets/free?q=`——后者的 `q` 参数被服务端**完全忽略**，任何查询词都返回同一份默认热门列表（实测三个无关查询响应字节数完全相同）。已修复。
  - 免费判据：结果卡片 `.price_tag` **不存在**即免费；存在则是付费/"In bundle"/折扣。`free_only=true`（默认）会据此过滤，`extra.price` 给出 `free` 或实际价格。
  - `/search` 不限素材类目，会混入游戏和工具，`extra.search_note` 有提示——导入前确认页面是素材包。
- **`extract_archive` 的返回键是 `files_extracted`**（不是 `file_count`/`files`），另附 `kind_counts` 和 `files_sample`。默认解压到**素材库根下的同名目录**，不是压缩包所在目录。CraftPix 之类的包会带 `COUPON.pdf`、`Free Assets *.url`、`__MACOSX/` 营销垃圾，入库前清掉。
- **`inspect_asset` 实测返回 `width`/`height`/`dominant_colors`（含 hex 和占比）**，但 `has_alpha` 和 `content_bounds` 可能是 `null`，别依赖它们做判断。
- **`blender_*` 四个工具依赖本机 Blender**：未安装时 `blender_info` 返回 `available: false`（优雅降级）。要深度检查 3D 模型层级/骨骼/材质或渲染真实截图，需先装 Blender 并设 `ASSETMCP_BLENDER_PATH`。
- **路径类参数必须相对素材库根**：`make_image_contact_sheet` / `create_asset_gallery` / `index_library` 的 `folder`/`subfolder` 传绝对路径会**静默返回 0 文件**而不报错。用 `oga-dungeon-tileset` 而不是 `/Users/.../mcp-game-assets/oga-dungeon-tileset`。`inspect_asset`/`convert_assets` 的 `path`/`paths` 则用绝对路径。
- **`import_asset_to_project` 必须带许可元数据**：只传 `asset_path` 会因 `license=None` 被判 `blocked_unclear_license` 而拒绝导入。要么传 `asset={"title":…,"author":…,"license":"CC0","source_url":…}`，要么对本地已有素材传 `local_user_provided=true`。
- **`find_replacement_assets` 可能返回空**：它只在 CC0/公有域源里找替代品，冷门需求找不到属正常。
- **Poly Haven 响应时间抖动大**（实测 2.4s / 14.7s / 25s），8K 贴图体积也大；赶时间优先 ambientCG（同为 CC0，1K~8K 分级清晰，稳定 1~2s）。

## 找不到合适素材时

免费库覆盖不到的（特定角色、统一风格的一整套），改用本地生成管线（如 ComfyUI，或宿主自带的图像生成工具）生成。生成路径的好处是风格统一且无许可负担，成本是时间和 GPU。**不要为了省时间去用许可不明的素材。**
