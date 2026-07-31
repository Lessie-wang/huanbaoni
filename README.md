# 环抱你 · 知愈 Ring

> 一枚会「环抱你」的情绪陪伴戒指 —— 情绪实时感知、压力早期拦截、成长画像与温柔陪伴。
>
> Buildathon 2026 参赛项目。

戒指两端是一双抽象的手，共同托住可拆卸的六瓣「情绪核心」。它读你的心率与 HRV，识别压力的到来，在你还没意识到之前先用一次轻震「拦」住它；一天结束时，把你的情绪画成一幅画，让小知陪你复盘。

- **线上体验（GitHub Pages）**：https://lessie-wang.github.io/huanbaoni/
- **线上体验（Cowork）**：https://cowork.xiaohongshu.com/f/huanbaoni/
- 内置 demo 数据，扫码即用，无需连接真实硬件即可跑通全流程。

---

## 这是什么

「环抱你」= **一枚戒指硬件** + **一个 H5 App**。

- **戒指（输入端）**：MAX30102 采心率/HRV、MPU6050 采运动与「敲击」手势、GSR 采皮肤电，ESP32-S3 通过 BLE 上报，收到指令时用振动马达输出私密触觉。
- **H5（输出端）**：Web Bluetooth 直连戒指，实时显示压力状态；压力升高时分三档触觉干预（早期拦截 / 中期安抚 / 高压环抱）；当天情绪汇总成「心灵画像」，AI 管家「小知」陪你复盘、做量表自测和表达训练。

三档干预触觉的设计意图：**在压力形成早期就打断它**，而不是等崩溃后才安慰。

---

## 目录结构

| 目录 | 内容 |
|---|---|
| `webapp/` | 纯前端 H5 App（无框架、无构建，`index.html` 直接打开即跑）。5 个 Tab + 悬浮 AI 管家小知 |
| `firmware/` | ESP32-S3 Arduino 固件。`huanbaoni/` 是主固件，其余为各传感器 bringup 测试 sketch |
| `hardware/` | 演示外壳（OpenSCAD 源 + STL + 渲染图），容纳开发板与传感器托盘 |
| `cad/` | 戒指本体 3D 打印原型（Blender 源 + 多版本 STL + 预览图） |
| `docs/` | 接口契约、硬件规格、科学依据、分工清单 |
| `tools/` | 上线与现场保险工具（二维码生成、本地兜底服务） |
| `.github/workflows/` | GitHub Pages 自动部署 |

---

## H5 App（`webapp/`）

纯 HTML + CSS + vanilla JS，无框架、无构建步骤。5 个 Tab（环抱居中凸起），小知以悬浮窗常驻：

| 页面 | 文件 | 作用 |
|---|---|---|
| 环抱（主页） | `pages/realtime.js` | 连戒指 → 实时 HR/HRV → 三色压力环；压力升高自动分档震动 |
| 心灵画像 | `pages/portrait.js` | 汇总当日情绪 → AI 生成一幅画 + 解读，诚实呈现而非美化负面情绪 |
| 心迹 | `pages/growth.js` | 画像画廊（色调演变）+ 情绪/压力趋势 + 等级/徽章/连续天数 |
| 探索 | `pages/tests.js` | HSPS-12 / PSS-10 等学术量表自测 + AI 解读 |
| 修习 | `pages/training.js` | 表达训练 + 感官写作 |
| 小知（AI 管家） | `pages/chat.js` | 语音闭环对话；压力事件后主动发起复盘；**敲两下戒指**即可全局唤起并开录 |

共享层 `webapp/lib/`：`store.js`（localStorage）、`ble.js`（Web Bluetooth）、`mock.js`（假戒指数据）、`ai.js`（AI 调用）、`tts.js`（语音）、`tokens.css`（设计变量）等。

### 本地运行

直接用浏览器打开 `webapp/index.html` 即可（内置 mock 数据）。或起个静态服务：

```bash
cd webapp && python3 -m http.server 8080
# 打开 http://localhost:8080/
```

连接真实戒指需要支持 Web Bluetooth 的浏览器（Chrome / Edge），并通过 HTTPS 或 localhost 访问。

---

## 固件（`firmware/`）

- `huanbaoni/huanbaoni.ino` —— 主固件：MAX30102 算 HR/HRV、MPU6050 出运动量与双击手势、GSR 读皮肤电，全部通过 BLE Notify 上报；接收 `VIBRATE:*` 指令播放分档振动。
- 其余为分模块 bringup 测试：`i2c_scan/`（扫地址）、`hrtest/`、`gy521test/`、`gsrtest/`、`motortest/`、`mictest/`、`firstlight/`、`bringup_test/`。

BLE UUID、数据格式、下行指令等**接口契约见 [`docs/接口契约.md`](docs/接口契约.md)**（固件与 H5 必须字符串完全一致）。接线针脚与模块尺寸见 [`docs/硬件规格与外壳.md`](docs/硬件规格与外壳.md)。

---

## 部署与上线

**GitHub Pages**：push 到 `main` 后，`.github/workflows/pages.yml` 自动把 `webapp/` 发布为站点根。首次需在仓库 **Settings → Pages → Source = GitHub Actions** 开启一次。

**二维码与现场保险**（网络抽风时用本地热点兜底）见 [`tools/README.md`](tools/README.md)。

---

## 科学依据

压力检测的信号组合（心率 + HRV + 皮肤电 + 加速度）与学术界公认范式一致（WESAD 数据集），触觉干预亦有文献支撑。完整引用见 [`docs/科学依据.md`](docs/科学依据.md)。

---

## 技术栈

纯前端 H5（HTML/CSS/vanilla JS，零依赖零构建）· ESP32-S3 + Arduino · Web Bluetooth · OpenSCAD / Blender 建模。
