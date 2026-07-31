# 「修习」页设计（环抱你 H5 · Agent F）

> 2026-07-31。落地 index.html 第 6 个 tab `training`（label「修习」），目前为占位。
> 对应 [分工清单.md](../分工清单.md) Agent F：`pages/training.js`，「表达训练 + 感官写作，搬知愈 subpages/training 内容与流程」。

## 目标

在 `huanbaoni/webapp` 里实现「修习」页，把知愈小程序两个成熟训练玩法搬成 vanilla-JS：
1. **模拟对话训练** — 情景对话，AI 同时演 NPC 与「小知教练」，逐轮点评打分，几轮后结算。
2. **感官写作** — 选情绪场景 → 逐个感官（视/听/触/嗅/味）引导写作 + 词语卡片 → 拼成成品段落 → 存档。

范围：**核心闭环**（不搬知愈的游戏化关卡地图/徽章/经验系统，符合分工表 P2 演示级定位）。

## 约束（项目"宪法"，不可破）

- 纯 HTML+CSS+vanilla JS，无框架、无构建，localhost 直接跑。
- 注册为 `window.Pages.training = { render(el) }`（同 chat.js/portrait.js）。
- 数据只经 `Store`；AI 只调 `AI.chat`；颜色只用 `tokens.css` 变量。
- **只新增/编辑 `pages/training.js`**，不动 `lib/`、不动其他页面、不改 index.html（它已引用本文件）。
- 无 API Key 时用本地 mock 兜底，保证 demo 全程可跑（同 chat.js 模式）。

## 文件改动

- **新增**：`huanbaoni/webapp/pages/training.js`（样式内联，同 chat.js，避免改 index.html 多引 css）。
- 其余文件：**零改动**。

## 页面结构（单文件状态机，学 chat.js）

```
render(el)
 ├─ view: 'home'      两张大卡「模拟对话」「感官写作」＋「修习记录」入口
 ├─ view: 'dialogue'  模拟对话流程
 ├─ view: 'writing'   感官写作流程
 └─ view: 'records'   历史存档列表 + 详情
```

内部用一个 `state` 对象 + `paint()` 重渲染当前 view，事件用委托绑定。

### A. 模拟对话训练

- **预置 4 场景**（搬知愈 pages/training.js dialogueScenarios）：日常沟通 / 表达拒绝 / 处理冲突 / 安慰他人；＋自定义场景输入。
- **流程**：选场景 → intro（背景+对方开场白）→ 逐轮对话 → 4–6 轮后结算。
- **每轮**：用户输入后 `AI.chat` 返回严格 JSON `{npc, coach, score, end}`（prompt 逻辑搬知愈 `generateTrainingPrompt`，因 ai.js 冻结，prompt 内置于 training.js）。渲染：NPC 气泡 + 小知教练点评 + 分数徽标。
- **结算**：`AI.chat` 返回 `{totalScore, rating, highlights, improvements, insight, tip}`（搬 `generateTrainingSummaryPrompt`），渲染结算卡，可存档。
- **mock 兜底**：无 Key 时用本地规则生成 NPC 回应/点评/分数与结算，保证闭环。

### B. 感官写作

- **预置场景**（搬知愈 sensory-writing.js）：雨天的忧伤 / 收到好消息 / 深夜的孤独 / 春天的期待 / 被误解的愤怒 / 安静的早晨 ＋ 自定义。
- **五感**：视/听/触/嗅/味，每感官带引导语 + 预置**词语卡片**（点选快速填入）+ 示例模板。
- **流程**：选场景 → 逐感官写（可选快速3感/完整5感）→ 拼成成品段落（本地拼接，可选 `AI.chat` 润色）→ 存档。
- **mock 兜底**：引导语用本地 `localGuides`，成品用本地拼接，无 Key 也完整。

### C. 戒指呼应（可选亮点）

对话/写作开始时，若戒指已连，触发一次 `ring.vibrate('anchor')`（吸4·呼6 共振呼吸）作为"静心入场"仪式，让修习长在硬件产品上，而非纯搬运。降级：无戒指静默跳过。

## 数据（决策：自建 `hbn.training`）

不改 store.js 冻结接口。training.js 内部封装一组小函数读写 localStorage key `hbn.training`：

```js
hbn.training  // 修习存档
[{ id, ts, kind:'dialogue'|'writing',
   title,                     // 场景标题
   // dialogue:
   score, rating, summary,    // 结算数据
   // writing:
   scenario, piece,           // 场景 + 成品段落
}]
```

读写封装在 training.js 内（`loadRecords / addRecord / delRecord`），不污染 Store 命名空间以外，不动契约。

## 错误处理

- `AI.chat` 抛错（无 Key / 网络 / 非法 JSON）→ 落到 mock 兜底路径，toast 提示"当前为离线示例"，绝不白屏。
- JSON 解析失败 → try/catch 后用降级默认值（同知愈原版做法）。
- 整页 render 出错由 index.html 的 route try/catch 兜住，不影响其他 tab。

## 验收

1. 打开 index.html → 点「修习」→ 出两张训练卡（非占位）。
2. 模拟对话：选场景→逐轮→看到 NPC+教练+分数→结算卡。
3. 感官写作：选场景→五感写作（含词语卡片）→成品段落→存档。
4. 记录页能看到存档、可查看/删除。
5. **不填 Key 全程可跑**（mock）；填 Key 用真 AI。
6. 控制台无红色报错；其他 5 个 tab 功能不受影响。

## 明确不做（YAGNI）

- 游戏化关卡地图、10 关解锁、徽章、经验条（知愈原版有，此处不搬）。
- 云函数 / 微信 API（H5 环境用 localStorage + AI.chat 替代）。
- 修改 lib/ 任何契约接口。
