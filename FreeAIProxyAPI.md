# FreeAiProxy API 文档

版本：`0.2.0`

FreeAiProxy 把 DeepSeek 与腾讯元宝网页版包装成 OpenAI 兼容 API。本文档面向 API 使用方，
描述当前实际可用的接口、模型、会话语义、错误格式与限制。

- 默认 Base URL：`http://127.0.0.1:8000`
- OpenAPI/Swagger：`GET /docs`、`GET /openapi.json`
- 这是一个 **OpenAI 兼容子集**，不是完整 OpenAI API。

---

## 目录

1. [鉴权](#1-鉴权)
2. [快速开始](#2-快速开始)
3. [模型](#3-模型)
4. [Chat Completions](#4-chat-completions)
5. [Images](#5-images)
6. [Videos](#6-videos)
7. [Music](#7-music)
8. [生成文件](#8-生成文件)
9. [模型列表](#9-模型列表)
10. [健康检查与管理接口](#10-健康检查与管理接口)
11. [会话机制](#11-会话机制)
12. [附件与多模态](#12-附件与多模态)
13. [流式响应](#13-流式响应)
14. [错误格式](#14-错误格式)
15. [并发与队列](#15-并发与队列)
16. [配置项](#16-配置项)
17. [兼容性与限制](#17-兼容性与限制)

---

## 1. 鉴权

是否鉴权由 `config.toml` 的 `server.api_key` 决定：

- `api_key = ""`：关闭鉴权。
- `api_key = "sk-xxx"`：下列接口要求：

```http
Authorization: Bearer sk-xxx
```

需要鉴权的接口：

- `POST /v1/chat/completions`
- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `POST /v1/music/generations`
- `GET /v1/models`
- `GET /admin/status`
- `POST /admin/relogin`

**不需要**鉴权的接口：

- `GET /healthz`
- `GET /v1/files/{name}`（随机文件名的生成文件）
- `GET /`

鉴权失败返回 HTTP 401，错误类型见[错误格式](#14-错误格式)。

---

## 2. 快速开始

### 2.1 curl

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

> Windows Git Bash 会把命令行中的中文按系统代码页（通常是 GBK）传给原生 `curl`。
> 网关在请求体不是合法 UTF-8 时会自动按 GB18030 兼容解码，因此上面的写法可直接使用。
> 其他客户端仍应发送 UTF-8；如需完全显式，可把 JSON 写入 UTF-8 文件后使用
> `--data-binary @body.json`。

### 2.2 OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8000/v1",
    api_key="not-needed",  # server.api_key 非空时填真实值
)

resp = client.chat.completions.create(
    model="yuanbao-hunyuan",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)
print(resp.model_extra.get("session_id"))  # 可选：读取网关扩展字段
```

### 2.3 指定会话

```python
resp = client.chat.completions.create(
    model="yuanbao-hunyuan",
    messages=[...],
    extra_headers={"X-Session-Id": "conv_8fa2c1"},  # 方式一
    # extra_body={"session_id": "conv_8fa2c1"},      # 方式二
)
```

请求头优先于请求体；响应头与响应体都会返回 `session_id`。

---

## 3. 模型

模型可用性取决于当前启用的 provider。`GET /v1/models` 只返回已启用 provider 的模型。

| model | Provider | 网页能力 | 类型 |
|---|---|---|---|
| `deepseek-chat` | DeepSeek | 普通对话 | chat |
| `deepseek-reasoner` | DeepSeek | DeepThink | chat |
| `yuanbao-hunyuan` | 元宝 | Hy4 preview + Expert | chat |
| `yuanbao-hunyuan-thinking` | 元宝 | Hy3 + Thinking | chat |
| `yuanbao-hunyuan-instant` | 元宝 | Hy3 + Instant | chat |
| `yuanbao-hunyuan-search` | 元宝 | Hy3 + Instant + 强制联网搜索 | chat |
| `yuanbao-writing` | 元宝 | Writing（专业写作） | chat |
| `yuanbao-image` | 元宝 | AI Image | image（也支持 chat） |
| `yuanbao-ppt` | 元宝 | Presentation Maker | chat + artifact |
| `wenxin-image` | 文心 | 图片生成 | image（也支持 chat） |
| `wenxin-writing` | 文心 | 帮我写作 | chat |
| `wenxin-music` | 文心 | 音乐生成（曲风/音色/歌词） | music（也支持 chat） |
| `chatglm-glm5.3` | 智谱清言 | GLM-5.3 深度思考 | chat |
| `chatglm-image` | 智谱清言 | AI画图（GLM Image） | image（也支持 chat） |
| `doubao-chat` | 豆包 | 普通对话 | chat |
| `doubao-image` | 豆包 | 图像生成（Seedream，比例/风格/模型） | image（也支持 chat） |
| `doubao-video` | 豆包 | 视频生成（Seedance，比例/时长） | video |
| `doubao-music` | 豆包 | 音乐生成（曲风/情绪/音色/歌词模式） | music（也支持 chat） |

### 3.1 模型行为说明

- **DeepSeek**：`deepseek-reasoner` 的思考过程不会返回，只返回最终答案。
- **元宝 Hy4/Expert**：`yuanbao-hunyuan` 对应网页 Hy4 preview；选择 Hy4 会自动切 Expert。
- **Thinking**：`yuanbao-hunyuan-thinking` 使用 Hy3 + Thinking，思考过程不返回。
- **Search**：`yuanbao-hunyuan-search` 使用 Hy3 + Instant 并强制打开 Search。
  - 元宝 Expert 模式的 Add 菜单没有 Search 入口，因此 Expert 模型不带强制搜索。
  - 普通元宝模型可能根据问题自动联网（网页的 smart search），只有 `-search` 是强制搜索。
- **Writing**：`yuanbao-writing` 使用 Writing agent，返回 markdown；未提供模板选择，默认 General。
- **Image**：`yuanbao-image` 一次生成 4 张图；可以用 Images 接口或 Chat 接口。
- **PPT**：`yuanbao-ppt` 返回摘要 + 本地 `.pptx` 链接；生成可能耗时数分钟。
- **Music**：`wenxin-music` 返回本地音频链接（实测为 FLAC）；网页端生成约 2–3 分钟。
  曲风 / 音色 / 歌词三个选项仅 Music 接口支持，Chat 接口按网页默认值生成。
- **Doubao 图像**：`doubao-image` 一次生成 1 张图；`size` 为比例（`1:1`/`16:9`/`9:16`/
  `4:3`/`3:4`/`3:2`/`2:3`，默认 `auto`），`style` 支持 30 种风格（见 DOUBAO.md）。
  返回的图片带有“豆包AI生成”水印——网页端没有免水印下载入口，这是已知限制。
- **Doubao 视频**：`doubao-video` 走 `POST /v1/videos/generations`；网页端是两轮
  代理流程（先出参数确认，网关自动回“确认”后才开始渲染），单次 1 条，可能耗时数分钟。
- **Doubao 音乐**：`doubao-music` 额外支持 `mood`（情绪）；产出实际是封面+音轨的
  MP4（网页播放器调用 `get_video` 取流），按内容魔数落盘为 `.mp4`。

每个请求都会显式对齐网页上的模型/模式，因此可以在同一会话中切换模型。

---

## 4. Chat Completions

### 4.1 Endpoint

```http
POST /v1/chat/completions
Content-Type: application/json
```

### 4.2 请求体

```json
{
  "model": "yuanbao-hunyuan",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "你好"}
  ],
  "stream": false,
  "session_id": "conv_optional"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | 是 | 见[模型](#3-模型) |
| `messages` | array | 是 | 消息数组，不能为空 |
| `stream` | boolean | 否 | 默认 `false`；`true` 时返回 SSE |
| `session_id` | string | 否 | 会话 ID；也可用 `X-Session-Id` 请求头 |

未列出的 OpenAI 字段（如 `temperature`、`top_p`、`max_tokens`、`stop`、`n`、
`tools`、`tool_choice`、`response_format`、`stream_options` 等）会被**静默忽略**。
本网关不会因这些字段报错。

### 4.3 messages

支持的角色：

| role | 行为 |
|---|---|
| `system` | 仅新会话使用；开头的 system 文本会并入首条 user 消息 |
| `user` | 对话消息；至少需要一条 |
| `assistant` | 历史消息；不发送给网页，仅用于客户端回传历史 |
| `developer` | 等同 `system` |
| `tool` / `function` | 不支持，返回 400 |

规则：

- `messages` 不能为空。
- 新建会话时最后一条必须是 `user`。
- 每条 user 消息的 `content` 可以是字符串或内容片段数组。
- 已存在会话中，system 消息一律忽略。
- 新会话中，开头连续的 system 文本会以 `\n\n` 拼接并并入首条 user 文本。
- assistant 文本不参与会话匹配，客户端可以裁剪、改写或省略历史 assistant 内容。

### 4.4 content 片段

```json
[
  {"type": "text", "text": "这张图是什么颜色？"},
  {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}},
  {"type": "file", "file": {"filename": "a.txt", "file_data": "<base64>"}}
]
```

| type | 说明 |
|---|---|
| `text` | 文本，多个 text 片段用换行拼接 |
| `image_url` | 图片；支持 data URL 或 http(s) URL |
| `file` | 文件；`filename` + base64 `file_data`（也接受 `data`） |
| `input_audio` | 当前不支持，内容被忽略 |
| 其他 | 返回 400 |

附件细节见[附件与多模态](#12-附件与多模态)。

### 4.5 非流式响应

```json
{
  "id": "chatcmpl-3b88008129be",
  "object": "chat.completion",
  "created": 1792637775,
  "model": "yuanbao-hunyuan",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "你好，有什么可以帮你？"},
      "finish_reason": "stop"
    }
  ],
  "session_id": "conv_2bfe94b5586d"
}
```

响应头同时包含：

```http
X-Session-Id: conv_2bfe94b5586d
```

说明：

- 当前始终只有一个 choice，`index` 为 0。
- `finish_reason` 当前固定为 `"stop"`。
- 不返回 `usage`。
- `session_id` 是网关扩展字段；OpenAI SDK 会忽略未知字段。

### 4.6 示例：DeepSeek

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "用一句话介绍杭州"}]
  }'
```

DeepThink：

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-reasoner",
    "messages": [{"role": "user", "content": "9.11 和 9.9 哪个大？"}]
  }'
```

### 4.7 示例：元宝 Hy4 / Expert

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "yuanbao-hunyuan",
    "messages": [{"role": "user", "content": "帮我分析一下城市夜跑的策划思路"}]
  }'
```

### 4.8 示例：Thinking

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "yuanbao-hunyuan-thinking",
    "messages": [{"role": "user", "content": "9.11 和 9.9 哪个大？"}]
  }'
```

只返回最终答案；思考过程不会出现在 `content` 中。

### 4.9 示例：强制联网搜索

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "yuanbao-hunyuan-search",
    "messages": [{"role": "user", "content": "今天杭州天气怎么样？"}]
  }'
```

搜索答案会包含来源名称，但当前不返回来源 URL。

### 4.10 示例：专业写作

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "yuanbao-writing",
    "messages": [{"role": "user", "content": "写一份城市夜跑活动策划文案，约 400 字"}]
  }'
```

### 4.11 示例：聊天生图

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "yuanbao-image",
    "messages": [{"role": "user", "content": "一只戴红围巾的猫，水彩风格"}]
  }'
```

返回 4 个 markdown 图片链接：

```markdown
![generated image 1](http://127.0.0.1:8000/v1/files/<name>.png)
...
```

需要结构化响应请使用 [Images 接口](#5-images)。

### 4.12 示例：PPT 生成

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "yuanbao-ppt",
    "messages": [{"role": "user", "content": "制作一份关于城市夜跑的 3 页 PPT，简洁商务风格"}]
  }'
```

响应内容包含摘要和本地 PPTX 链接：

```markdown
已经做好了，共 3 页……

[城市夜跑_PPT.pptx](http://127.0.0.1:8000/v1/files/<name>.pptx)
```

PPT 生成可能耗时数分钟。建议客户端把超时设置为 10 分钟以上。

---

## 5. Images

### 5.1 Endpoint

```http
POST /v1/images/generations
Content-Type: application/json
```

无水印取图按 provider 不同：元宝悬停图片点击右下角下载图标捕获 Playwright 下载
（需在元宝设置开启“无水印保存”），失败回退直链；文心直接去掉图片 URL 的 `wm`/`wmo`
水印参数下载原图；智谱清言在生成前打开“去水印”开关，CDN 直链本身即无水印。
`size` 宽高比目前仅元宝支持（文心无比例控件，清言比例弹层未校准，均接受并忽略）。

### 5.2 请求体

```json
{
  "model": "yuanbao-image",
  "prompt": "一只戴红围巾的猫，水彩风格，简洁背景",
  "n": 1,
  "size": "1:1",
  "response_format": "url"
}
```

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `model` | string | `yuanbao-image` | 必须是 image 类型模型 |
| `prompt` | string | 必填 | 非空 |
| `n` | integer | 4 | 1–4；元宝实际一次生成 4 张，按 n 截取 |
| `response_format` | string | `url` | `url` 或 `b64_json` |
| `size` | string | null | 宽高比（仅元宝支持）：`1:1` / `4:3` / `3:4` / `16:9` / `9:16`；`auto` 或不传为 Smart Ratio |
| `quality` | string | null | 接受但忽略 |
| `style` | string | null | 接受但忽略 |
| `image` | string \| string[] | null | 参考图（data URL 或 http(s) URL），见 [5.7 参考图](#57-参考图图生图) |
| `images` | string[] | null | `image` 的数组别名，两者会合并 |

### 5.3 URL 响应

```json
{
  "created": 1792637909,
  "data": [
    {"url": "http://127.0.0.1:8000/v1/files/42d0c6dcaa7c4e9580c2e02c1cef7809.png"}
  ]
}
```

- 文件已下载到 `data/generated/`。
- 返回的 URL 是网关本地文件地址，不包含第三方签名链接。
- `size` / `quality` / `style` 不影响元宝网页生成参数。

### 5.4 base64 响应

```json
{
  "created": 1792637909,
  "data": [
    {"b64_json": "iVBORw0KGgoAAAANSUhEUg..."}
  ]
}
```

### 5.5 OpenAI SDK

```python
resp = client.images.generate(
    model="yuanbao-image",
    prompt="一只戴红围巾的猫，水彩风格",
    n=1,
)
print(resp.data[0].url)
```

### 5.6 行为与限制

- 元宝网页始终一次生成 4 张图片；`n` 只决定返回/下载前几张。
- 单张原图约 2–3MB，返回 `b64_json` 时体积会明显变大。
- 图片生成约 15–30 秒，不含队列等待。
- 生成文件不会自动清理。
- 文件下载接口不需要 API Key，但文件名是随机 32 位 hex，不可枚举。

### 5.7 参考图（图生图）

除纯文生图外，元宝、豆包、智谱清言的图片生成页支持上传参考图（图生图）。
网关提供两种等价入口：

**方式一：`/v1/images/generations` 携带 `image` 字段**

```json
{
  "model": "doubao-image",
  "prompt": "把参考图变成纯蓝色，保持构图",
  "n": 1,
  "image": "data:image/png;base64,iVBORw0KGgo..."
}
```

`image` 可以是单个字符串或字符串数组，值支持 `data:` URL 或 `http(s)` URL
（远程下载受 `attach.download_remote_urls` 控制）。`images` 是数组别名，两者会合并。

**方式二：标准 `/v1/images/edits`（multipart，兼容 OpenAI SDK `client.images.edit`）**

```http
POST /v1/images/edits
Content-Type: multipart/form-data

model=doubao-image
prompt=把参考图变成纯绿色
n=1
image[]=@ref.png
```

字段与 `generations` 一致（`model` / `prompt` / `n` / `size` / `style` /
`response_format`），参考图通过 `image` 或 `image[]` 文件字段上传；`mask`
接受但忽略（网页端无遮罩入口）。

```python
with open("ref.png", "rb") as f:
    resp = client.images.edit(
        model="doubao-image",
        image=f,
        prompt="把参考图变成纯蓝色，保持构图",
        n=1,
    )
print(resp.data[0].url)
```

**支持矩阵与限制**

| 模型 | 参考图 | 说明 |
|---|---|---|
| `doubao-image` | ✅ | 网页图像生成技能内置 `upload-file-input`，直接注入文件 |
| `yuanbao-image` | ✅ | AI Image 模式 composer 的 `Upload Image` 按钮（Escape 会退出该模式，故上传路径不能按 Escape） |
| `chatglm-image` | ✅ | AI画图 composer 的 `.ai-draw-upload input[type=file]`，缩略图渲染在 `.ai-draw-upload` 内 |
| `wenxin-image` | ❌ | 网页图片生成 composer 无参考图上传入口（`ci-upload-panel` 为空壳），传图返回 400 |

- 每次请求最多 **1 张**参考图（已端到端标定的上限；网页本身可接受更多，但网关目前只校准了单图）。
- 参考图必须是图片（`image/*`，扩展名 `.png/.jpg/.jpeg/.webp/.gif/.bmp`），受 `[attach]` 的
  `max_size_mb`、`download_remote_urls` 等约束；`attach.enabled = false` 时拒绝所有参考图。
- 上传的参考图仅用于触发网页的图生图，落盘到临时目录，请求结束即清理，不写入 `data/generated/`。
- 实测（2026-10-24）：传入纯红参考图 + “变成纯蓝色”指令，三家返回结果主色均为蓝色，确认参考图生效。

---

## 6. Videos

### 6.1 Endpoint

```http
POST /v1/videos/generations
```

### 6.2 请求体

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `model` | string | `doubao-video` | `doubao-video`（目前仅豆包支持） |
| `prompt` | string | 必填 | 视频画面描述 |
| `n` | int | 1 | 1–4；网页端单次实际只生成 1 条 |
| `size` | string | 网页默认 | 宽高比：`auto` / `3:4` / `4:3` / `9:16` / `16:9` / `1:1` / `21:9` |
| `duration` | int | 网页默认 | 秒数 4–15（等价字段 `seconds`） |
| `response_format` | string | `url` | `url` 或 `b64_json` |

非法 `size` / `duration` 返回 `invalid_request_error`。

### 6.3 响应

```json
{
  "created": 1792769601,
  "data": [{"url": "http://127.0.0.1:8000/v1/files/53c1f509….mp4"}]
}
```

### 6.4 行为与限制

- 走网页端两轮代理流程：先出参数确认文案，网关自动回「确认」后才开始渲染。
- 实测 Seedance 2.0 Mini 10s 约 8–15 分钟，接口同步等待（占用该 provider 队列，
  `timeout_completion_s` 需足够大）。
- 产出 MP4（带签名 URL，网关拿到后立即下载并按内容魔数落盘），通过
  `/v1/files/<name>.mp4` 下载。
- 视频可能带动态水印（网页端无免水印下载入口），这是已知限制。

---

## 7. Music

### 7.1 Endpoint

```http
POST /v1/music/generations
```

### 7.2 请求体

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `model` | string | `wenxin-music` | `wenxin-music` 或 `doubao-music` |
| `prompt` | string | 必填* | 音乐主题描述（*与 `lyrics` 至少给一个） |
| `style` | string | 网页默认 | 曲风：`默认` / `摇滚` / `电子` / `R&B` / `嘻哈` / `金属` / `蓝调` / `流行` / `民谣` / `爵士` / `说唱` / `拉丁` / `朋克` |
| `voice` | string | 智能匹配 | 音色：`智能匹配` / `深情男声` / `甜美女声` |
| `mood` | string | 网页默认 | 情绪（仅 `doubao-music`）：`快乐` / `放松` / `活力` / `兴奋` / `忧郁` / `鼓舞` / `伤感` / `怀旧` / `浪漫` |
| `lyrics` | string | 无 | 提供后自动切到「自定义歌词」并以此作为歌词；否则用「AI写歌词」按 `prompt` 生成 |

非法 `style` / `voice` 返回 `invalid_request_error`。
`doubao-music` 的 `style` 词表为：`流行` / `嘻哈` / `国风` / `DJ` / `摇滚` / `民谣` /
`R&B` / `雷鬼` / `朋克` / `电音` / `爵士`；`voice` 为 `男声` / `女声`。

### 7.3 响应

```json
{
  "created": 1792737258,
  "data": [{"url": "http://127.0.0.1:8000/v1/files/b869df25….flac"}]
}
```

### 7.4 行为与限制

- 每次生成 1 首；网页端约 2–3 分钟，接口同步等待（占用该 provider 队列）。
- 实测音频为 FLAC 编码（对象名虽为 `.mp3`），网关按内容魔数落盘为 `.flac`。
- 生成文件不会自动清理；文件下载接口不需要 API Key。

---

## 8. 生成文件

```http
GET /v1/files/{name}
```

用途：下载 `data/generated/` 中的生图、PPTX、音乐或视频。

- 文件名格式：32 位小写 hex + 扩展名。
- 允许扩展名：`.png`、`.webp`、`.jpg`、`.pptx`、`.mp3`、`.wav`、`.flac`、`.mp4`、`.webm`。
- 不存在或名字非法返回 404。
- 图片以 `Cache-Control: public, max-age=86400` 返回。
- `.pptx` 以附件形式返回。

示例：

```bash
curl -O http://127.0.0.1:8000/v1/files/42d0c6dcaa7c4e9580c2e02c1cef7809.png
```

> 聊天模型返回的图片/PPT 链接基于 `server.host` + `server.port`；
> 远程部署时请把 `server.host` 配置成客户端可访问的地址。
> Images 接口返回的 URL 基于当前请求的 Base URL。

---

## 9. 模型列表

```http
GET /v1/models
```

响应：

```json
{
  "object": "list",
  "data": [
    {
      "id": "yuanbao-hunyuan",
      "object": "model",
      "created": 1735689600,
      "owned_by": "yuanbao"
    }
  ]
}
```

- 只列出当前已启用 provider 的模型。
- `owned_by` 为 `deepseek` 或 `yuanbao`。
- `created` 是固定占位值。

---

## 10. 健康检查与管理接口

### 10.1 GET /healthz

无需鉴权。

```json
{
  "status": "ok",
  "logged_in": true,
  "providers": {
    "deepseek": {
      "logged_in": true,
      "state": "ready",
      "active_requests": 0,
      "waiting_requests": 0
    },
    "yuanbao": {
      "logged_in": true,
      "state": "ready",
      "active_requests": 0,
      "waiting_requests": 0
    }
  }
}
```

- 顶层 `logged_in` 仅在所有已启用 provider 都登录时为 `true`。
- `state` 可能为 `stopped`、`starting`、`ready`、`login_required`。
- 可用于健康探测和登录态轮询。

### 10.2 GET /admin/status

需要鉴权（若配置了 api_key）。

```json
{
  "state": "ready",
  "logged_in": true,
  "active_requests": 0,
  "waiting_requests": 0,
  "queue": {
    "waiting": 0,
    "running": 0,
    "processed": 12,
    "max_queue_len": 20,
    "max_wait_ms": 0
  },
  "providers": {
    "deepseek": {
      "state": "ready",
      "logged_in": true,
      "active_requests": 0,
      "waiting_requests": 0,
      "max_queue_len": 20,
      "active_conversations": 3,
      "queue": {
        "waiting": 0,
        "running": 0,
        "processed": 12,
        "max_queue_len": 20,
        "max_wait_ms": 0
      }
    },
    "yuanbao": {
      "state": "ready",
      "logged_in": true,
      "active_requests": 0,
      "waiting_requests": 0,
      "max_queue_len": 20,
      "active_conversations": 5,
      "queue": {
        "waiting": 0,
        "running": 0,
        "processed": 4,
        "max_queue_len": 20,
        "max_wait_ms": 0
      }
    }
  },
  "active_conversations": 8,
  "max_queue_len": 20,
  "browser_headed": true,
  "api_key_enabled": false
}
```

顶层字段 `state` / `logged_in` / `queue` 等与第一个 provider 保持一致，仅用于兼容旧客户端；
请优先使用 `providers`。

### 10.3 POST /admin/relogin

需要鉴权（若配置了 api_key）。

```http
POST /admin/relogin?provider=yuanbao
```

| 参数 | 位置 | 默认 | 说明 |
|---|---|---|---|
| `provider` | query | `deepseek` | `deepseek` 或 `yuanbao` |

响应示例：

```json
{"started": true, "provider": "yuanbao", "message": "complete login in the opened browser window"}
```

行为：

- 浏览器未运行时返回 503 `browser_down`。
- 已经处于登录等待状态时返回 `{"started":true,"already_waiting":true,...}`。
- 接口立即返回，登录完成状态请轮询 `/healthz`。
- 登录窗口是服务持有的有头浏览器；不要另开进程重复操作同一 profile。

---

## 11. 会话机制

### 11.1 session_id 的来源

按优先级：

1. 请求头 `X-Session-Id: conv_xxx`
2. 请求体 `session_id: "conv_xxx"`
3. 都不要：按用户消息自动匹配

响应中：

- 非流式：响应头 `X-Session-Id` + 响应体顶层 `session_id`。
- 流式：响应头 `X-Session-Id` + 首个/最后 SSE chunk 顶层 `session_id`。

### 11.2 显式 session_id

- 不存在、已失效或属于另一个 provider：404 `session_invalid`。
- 显式 session 可以在同一 provider 内切换模型/模式。
- 已存在会话中，system 消息忽略。

### 11.3 自动匹配

- 只在同一 provider + 同一 mode 的活跃会话中查找。
- 只比较 **user 轮次**；assistant 文本完全不参与比较。
- 计算客户端 user 消息与已存 user 消息的最长前缀。
- 如果某个会话匹配到 `k` 个 user 轮次，且后续有 0 或 1 条新 user 消息，则成为候选。
- 选择 `k` 最大的候选；`k` 相同优先“重复回放”而不是“发送新消息”。
- 没有候选时创建新会话。

### 11.4 历史 diff 规则

| 情况 | 行为 |
|---|---|
| 客户端回传的 assistant 文本被裁剪/改写 | 忽略，不影响匹配 |
| 客户端省略中间 assistant 消息 | 不影响 user 轮次对齐 |
| 0 条新 user 消息 | 回放该轮缓存的 assistant 回复 |
| 1 条新 user 消息 | 发送该消息到网页 |
| ≥2 条新 user 消息 | 400 `history_conflict` |
| 显式会话且首个 user 轮次完全对不上 | 400 `history_conflict` |
| 显式会话不存在/失效 | 404 `session_invalid` |

这意味着推荐用法是：

- 首次请求：只发当前 user 消息，或发送完整 messages。
- 后续请求：回传完整 messages（assistant 内容可以保持原样），并追加**一条**新的 user 消息。
- 使用 `session_id` 时，仍然需要带上会话首条 user 消息用于对齐；
  只发送一条全新的“继续”会因首轮 user 对不上而返回 400 `history_conflict`。
- 不要在一次请求里追加多条 user 消息。

### 11.5 模式与续接

- 会话记录 `provider` 和最近使用的 `mode`。
- 元宝页面刷新后会回到普通聊天；网关在续接时会重新进入目标模式
  （Search / Writing / AI Image / PPT）。
- 显式 session 切换模式会继续同一段网页会话；模式会被更新。
- 自动匹配不会跨 mode，例如 `yuanbao-hunyuan-instant` 的会话不会被
  `yuanbao-hunyuan-search` 自动匹配。

---

## 12. 附件与多模态

### 12.1 支持形式

- `image_url`：
  - data URL：`data:image/png;base64,...`
  - 远程 URL：`https://...`（受 `attach.download_remote_urls` 控制）
- `file`：
  - `filename`：显示名，建议保留扩展名
  - `file_data`：base64 字符串或 data URL
  - 也接受 `data` 字段作为 `file_data` 的别名

### 12.2 限制

由 `config.toml` 的 `[attach]` 控制，默认：

```toml
[attach]
enabled = true
max_size_mb = 20
max_files = 5
download_remote_urls = true
remote_timeout_s = 30
remote_max_bytes = 20971520
allowed_extensions = [".png", ".jpg", ..., ".pdf", ".docx", ...]
```

- 单条消息最多 5 个附件。
- 单文件默认 20MB。
- 扩展名必须在白名单内。
- 远程下载受超时与大小限制。
- 文件名会去路径穿越并截断到 120 字符。
- 附件只在**本次新增的 user 消息**中上传；历史消息中的附件不会重复上传。
- 附件内容不写入本地会话历史，历史只保存 user 文本和 assistant 文本；
  网页本身会保留附件上下文。

### 12.3 多模态示例

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "yuanbao-hunyuan-instant",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "这张图主要是什么颜色？只回答颜色。"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,<BASE64>"}}
      ]
    }]
  }'
```

文档附件：

```json
{
  "type": "file",
  "file": {
    "filename": "note.txt",
    "file_data": "<BASE64>"
  }
}
```

---

## 13. 流式响应

请求：

```json
{
  "model": "yuanbao-hunyuan-instant",
  "messages": [{"role": "user", "content": "用一句话介绍杭州"}],
  "stream": true
}
```

响应：

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Session-Id: conv_xxx
```

SSE 数据：

```text
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1792637775,"model":"yuanbao-hunyuan-instant","session_id":"conv_xxx","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1792637775,"model":"yuanbao-hunyuan-instant","choices":[{"index":0,"delta":{"content":"杭州"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1792637775,"model":"yuanbao-hunyuan-instant","choices":[{"index":0,"delta":{"content":"是..."},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1792637775,"model":"yuanbao-hunyuan-instant","session_id":"conv_xxx","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

说明：

- 首个 chunk 和最后一个 chunk 带 `session_id`；中间 content chunk 不带。
- 客户端应拼接所有 `choices[0].delta.content`。
- 结束后发送 `data: [DONE]`。
- 流已经开始后再发生业务错误，HTTP 状态仍是 200；错误会作为 SSE 数据发送：

```text
data: {"error":{"message":"...","type":"upstream_page_changed","param":null,"code":"page_changed"}}

data: [DONE]
```

- 客户端断开会话流后，服务端仍会继续完成当前网页回复并写入历史；
  不会因为客户端断开而丢弃会话上下文。
- 流式请求在整个 SSE 生命周期内占用该 provider 的队列名额。

### 13.1 OpenAI SDK 流式示例

```python
stream = client.chat.completions.create(
    model="yuanbao-hunyuan-instant",
    messages=[{"role": "user", "content": "数到 5，只输出数字"}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)
```

### 13.2 特殊模型的流式行为

- `yuanbao-image`（chat）：生成完成后返回一个包含 4 个 markdown 链接的 content chunk。
- `yuanbao-ppt`：摘要可能增量返回，完成后追加本地 PPTX 链接。
- 文档/图片附件仍在发送前处理，首字出现时间可能较长。

---

## 14. 错误格式

统一使用 OpenAI 风格：

```json
{
  "error": {
    "message": "human readable message",
    "type": "invalid_request_error",
    "param": null,
    "code": "history_conflict"
  }
}
```

### 14.1 业务错误

| HTTP | type | code | 触发场景 |
|---|---|---|---|
| 400 | `invalid_request_error` | `invalid_request` | 非法模型、空 messages、非法 role/content、附件非法、provider 未启用 |
| 401 | `invalid_request_error` | `invalid_api_key` | 缺少/错误 API Key |
| 404 | `invalid_request_error` | `session_invalid` | session 不存在、失效、跨 provider |
| 400 | `invalid_request_error` | `history_conflict` | 历史分叉、一次追加多条 user 消息 |
| 429 | `rate_limit_error` | `queue_full` | provider 队列已满 |
| 429 | `upstream_rate_limited` | `upstream_rate_limited` | 网页出现限流提示 |
| 502 | `upstream_error` | `upstream_error` | 上游通用错误 |
| 502 | `authentication_required` | `login_required` | 网页登录态失效 |
| 500 | `upstream_page_changed` | `page_changed` | 页面改版/关键选择器找不到/附件上传失败 |
| 404 | `invalid_request_error` | `session_dead` | 网页会话失效（预留） |
| 503 | `upstream_error` | `browser_down` | admin relogin 时浏览器未运行 |

请求体校验失败（FastAPI 层）也是 400，但 message 会说明缺失字段：

```json
{
  "error": {
    "message": "invalid request body: body.model: Field required",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_request"
  }
}
```

### 14.2 上游超时

- 首字/完成超时可能返回部分内容或空字符串，`finish_reason` 仍为 `stop`。
- 请检查 `content` 是否为空，不要只依赖 `finish_reason` 判断成功。
- 上游限流会返回 429 `upstream_rate_limited`。

---

## 15. 并发与队列

- 每个 provider 只有一个浏览器窗口，因此该 provider 内所有请求严格 FIFO 串行。
- 每个请求操作页面前都会检查该 provider 的浏览器；若已关闭、崩溃或无响应，
  网关会自动重启浏览器并沿用 profile 中的登录态。
- DeepSeek 与元宝是两个独立 provider，可以并行处理；互不占用对方队列。
- 队列上限默认 20（`worker.max_queue_len`）。
- 队列满时立即返回 429 `queue_full`，不会等待。
- 流式请求在整个响应期间占用一个队列名额。
- 队列统计：

```json
{
  "waiting": 0,
  "running": 0,
  "processed": 4,
  "max_queue_len": 20,
  "max_wait_ms": 0
}
```

- `waiting`：等待中的请求数。
- `running`：正在使用浏览器的请求数。
- `processed`：该进程内已完成的请求数。
- `max_wait_ms`：观察到的最长排队时间。

---

## 16. 配置项

与 API 行为相关的配置：

```toml
[server]
host = "127.0.0.1"
port = 8000
api_key = ""              # 为空则关闭鉴权

[debug]
headed = false            # true 强制有头；false 强制无头；不写则由 worker.headless 决定

[worker]
headless = false          # 仅在 debug.headed 未设置时生效
poll_interval_ms = 500    # DOM 轮询间隔
timeout_first_token_s = 120
timeout_completion_s = 600
max_queue_len = 20

[attach]
enabled = true
max_size_mb = 20
max_files = 5
download_remote_urls = true
remote_timeout_s = 30
remote_max_bytes = 20971520

[providers.deepseek]
enabled = true
profile = "data/profile"

[providers.yuanbao]
enabled = true
profile = "data/profiles/yuanbao"
```

无头模式下遇到未登录时，网关会临时启动有头浏览器供人工登录；登录成功后自动关闭该
窗口并切回无头模式。`/admin/status` 的 `browser_headed` 表示当前实际模式。

环境变量覆盖：

```bash
FREEAIPROXY__SERVER__API_KEY=sk-xxx
FREEAIPROXY__WORKER__MAX_QUEUE_LEN=10
FREEAIPROXY__PROVIDERS__YUANBAO__ENABLED=false
```

优先级：环境变量 > `config.toml` > 默认值。

### 16.1 生成文件目录

- 图片和 PPT 保存在 `data/generated/`。
- 通过 `/v1/files/{name}` 提供下载。
- 不会自动清理；需要时手动清理旧文件。

### 16.2 远程部署提示

- 聊天模型返回的图片/PPT 链接使用 `server.host:server.port` 构造；
  若 `server.host` 为 `0.0.0.0` 或 `::`，会回退到 `127.0.0.1`。
- Images 接口返回的 URL 使用当前请求的 Base URL。
- 如果服务不是只在本机使用，请把 `server.host` 设为客户端可访问的地址，
  并自行评估文件接口无鉴权的风险。
- 默认绑定 `127.0.0.1`，不要直接暴露到公网。

---

## 17. 兼容性与限制

### 17.1 支持的 OpenAI 能力

- Chat Completions（非流式 + SSE）
- Images Generations（`url` / `b64_json`）
- Videos Generations（`POST /v1/videos/generations`，`url` / `b64_json`）
- Music Generations（`POST /v1/music/generations`）
- 多模态 content parts（图片 + 文件）
- `GET /v1/models`
- OpenAI 错误格式
- `X-Session-Id` 扩展会话

### 17.2 不支持/忽略的能力

- `tools` / `function calling`
- `response_format`
- `temperature`、`top_p`、`max_tokens`、`stop`、`n`（chat）、`presence_penalty` 等采样参数
- `usage` 统计
- 多个 choices
- `input_audio`
- OpenAI Files API / file_id 复用
- 多模态 assistant 消息

这些字段不会导致请求失败，但不会生效。

### 17.3 网页侧行为与限制

- 免费网页版有账号额度/限流；网关只做串行排队，不放大请求。
- 自动化操作可能违反 DeepSeek / 元宝服务条款，请使用非主力账号。
- 豆包生成的图片带“豆包AI生成”水印、视频疑似带动态水印，网页端均无免水印入口。
- 思考过程（DeepSeek reasoner、元宝 Thinking/Expert）默认不返回。
- 元宝 Expert 模式没有显式 Search 开关；搜索使用 `yuanbao-hunyuan-search`（Hy3）。
- 元宝搜索暂不返回来源 URL。
- AI 生图固定一次生成 4 张；不能通过 API 指定模型细节、比例、分辨率。
- PPT 生成可能耗时数分钟，且文件由网页工作区导出后保存到本地。
- 元宝 UI 文案取决于账号/浏览器语言；当前按英文 UI 标定。
- 普通元宝对话可能由网页自动触发联网搜索，只有 `-search` 是强制搜索。
- 网页输出可能包含追问/建议，网关按网页原文返回，不会自动裁剪。

---

## 附录：最小调用速查

```bash
# 模型列表
curl http://127.0.0.1:8000/v1/models

# 普通对话
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"你好"}]}'

# 元宝 Hy4/Expert
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"yuanbao-hunyuan","messages":[{"role":"user","content":"你好"}]}'

# 生图
curl http://127.0.0.1:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"yuanbao-image","prompt":"一只猫，水彩风格","n":1}'

# 生视频（豆包 Seedance，耗时数分钟至十余分钟）
curl -m 1800 http://127.0.0.1:8000/v1/videos/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-video","prompt":"a paper boat sailing on a puddle","size":"16:9","duration":6}'

# 健康检查
curl http://127.0.0.1:8000/healthz

# 管理状态（如启用了 api_key，加 Authorization: Bearer <key>）
curl http://127.0.0.1:8000/admin/status
```
