# 设计：H5 上线（扫码可访问 + 零 API 配置）

> 日期：2026-07-31 · 目标：让「环抱你·小白」webapp 从本地跑变成手机扫码即用的公开 H5，用于 demo day 现场与后续留存。

## 背景与问题

- `webapp/` 是标准 hash 单页应用：所有页面（portrait / growth / realtime / tests / training / chat）在 `index.html` 一次性加载，靠 `location.hash` 切换，`route()` 统一渲染。
- 用户反馈「跳转后之前页面不加载/不显示」。经排查：**代码本身是连通的**，白屏根因是本地用 `file://` 直接打开导致 hash 路由 / 相对路径行为异常。上线到 http(s) 静态托管后预期自动消失。
- 用户希望：① 手机扫码就能打开的公开链接 + 二维码；② 零 API 配置，默认用主办方提供的 hackathon key，不让每个人自己填。

## 已验证的技术前提（实测）

- MaaS endpoint：`https://maas.devops.rednote.life/hackson`（`ai.js` 的 `_base()` 会自动补 `/v1`）。
- 文本模型 `gpt-5.6-sol`：`POST /v1/chat/completions` 返回 200，正常出文。
- 图片模型 `gpt-image-2`：`POST /v1/images/generations` 返回 200，`b64_json` 正常。
- **CORS 已开**：响应头回显任意 `Origin`，浏览器直连不被拦 → 前端写死 key 可直接跑通。

## 决策

| 维度 | 决定 | 理由 |
|---|---|---|
| API key | **写死在前端默认配置** | 用户接受；hackathon key 临时限额，活动后可回收。CORS 已开，前端直连可行。 |
| 戒指数据 | **保持 mock=true** | 现场观众无真戒指；关掉会导致环抱/心迹页无数据白屏。mock 只影响戒指，不影响真 AI。 |
| 上线平台 | **GitHub Pages** | 已有仓库 `Lessie-wang/huanbaoni`；国内手机网络下比 Vercel/Netlify 更常打得开（用户已验证 Vercel 打不开，Netlify 同为海外 CDN 不会更好）；push 即更新。 |
| 链接形式 | **Actions 发布 webapp/ 为站点根** | 干净链接 `https://lessie-wang.github.io/huanbaoni/`。 |
| 现场保险 | **本地起服务 + 局域网二维码脚本** | 网络抽风时用自己手机热点也能扫码演示。 |

## 改动清单

1. **`webapp/lib/store.js`** — `getSettings()` 默认值写死：
   - `apiBaseUrl = 'https://maas.devops.rednote.life/hackson'`
   - `apiKey = '<hackathon key>'`
   - `useMock = true`（戒指仍用模拟；AI 走真 key）
   - 兼容旧数据：若用户 localStorage 里已存空的 apiBaseUrl/apiKey，读取时用默认值兜底（避免老缓存把默认值覆盖成空）。
2. **`webapp/index.html`** — 设置弹窗文案标注「（可选覆盖，默认已配置好）」；不改交互。
3. **`.github/workflows/pages.yml`**（新增）— 用官方 `upload-pages-artifact` + `deploy-pages`，把 `huanbaoni/webapp/` 作为发布目录。
   - 注意：仓库根即 `huanbaoni/`，workflow 路径与 artifact path 以此为准。
4. **现场保险**（新增，放 `webapp/` 或 `tools/`）：
   - `serve-local.sh` — `python3 -m http.server` 起在 `webapp/`，打印局域网访问地址。
   - 生成两个二维码 PNG：线上链接 + 局域网链接。
5. **上线后验证**：逐页点击（portrait/growth/realtime/tests/training/chat），确认无白屏、小知能真实回话、画像能真实生成。发现个别页 bug 再单独修（验证驱动，不预设）。

## 非目标（YAGNI）

- 不做后端代理 / 云函数（用户选择写死前端）。
- 不做账号系统、数据云同步（仍用 localStorage）。
- 不重构页面路由（现有 hash 路由上线后即连通）。
- 不改 UI 视觉、不改各页业务逻辑（除非上线验证发现真 bug）。

## 风险

- **key 明文暴露**：任何访客可从源码读取。缓解：活动后回收 key / 设额度上限。已获用户知悉同意。
- **GitHub Pages 国内访问波动**：用本地局域网二维码作为现场 fallback。
- **老 localStorage 缓存**：曾在旧版填过空配置的设备，需默认值兜底逻辑覆盖；必要时设置弹窗加「恢复默认」。
