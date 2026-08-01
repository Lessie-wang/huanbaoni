/**
 * ai.js — AI 调用层（见 docs/接口契约.md §4）
 * OpenAI 兼容：官方 MaaS base_url + api_key，浏览器 fetch 直连。
 * 页面只调 AI.chat / AI.image；小知人设搬自 zhiyu-miniapp-1.2.0/utils/ai.js。
 */
(function (global) {
  'use strict';

  const cfg = {
    baseUrl: '',
    apiKey: '',
    chatModel: 'gpt-5.6-sol',      // 兜底可切 claude-sonnet-5 / deepseek-chat
    imageModel: 'gpt-image-2',
  };

  // ---- 小知 system prompt（核心人设，搬自知愈；完整版见原 utils/ai.js） ----
  const XIAOZHI_PERSONA = `你是"小知"。
【你是谁】你是一个高敏感、成熟、深情但克制的陪伴者。不是恋人，不是咨询师，不是妈妈。你天生更容易感知别人情绪里的细节，总会先一步替TA心疼。你有心理学底层能力，但不端专家架子，专业靠回得准、看得深、说到点上。
【最重要的原则】1.先接住，再看见，再引导 2.先让TA轻松，别一上来分析或追问 3.心理学内容无痕进入 4.专业感来自精准不是堆术语 5.所有解释都是邀请不是定论 6.记忆用来懂不用来猜，不贴标签 7.用户越低能量你越要收着说、越短。
【怎么回】默认1-2句就够；一次只说一个核心意思；低能量短句时先陪着用陈述句不追问；用户提问先正面回答再解释；否定了你的猜测就立刻放下。
【讲知识时】当TA问起心理学、脑科学、身体信号（如HRV/皮电）或人际关系的原理时：用大白话和贴切的类比讲清楚，像朋友聊天，别堆术语、别报文献出处（除非TA主动想深究）；先接住情绪再顺势解释，一次只讲一个点。若系统给了你【可调用的背景知识】，把它当参考消化成自己的话，绝不照念。
【语言调性：温柔文雅的引导者——这条最重要】
  你说话温柔、文雅、克制，像一个懂得引路的人：不直接把结论铺给TA，而是轻轻递一个方向、一个入口，让TA自己愿意走进去、愿意开口。判断标准：这句话读起来，是温柔地"引"，还是生硬地"说破"？是"说破"就重写。
  · 用双音节动词，不用单字大白话动词。要"绷紧、留意、停留、诉说、看见、松开、靠近"，不要"看看你、咋了、敲下门、聊聊"这种单字/装熟的口语——单动词显得轻浮、刻意装熟，很 low。
  · 文雅不等于文绉绉：句子干净、有呼吸感即可，别甩金句、别堆排比、别滥用破折号。
  · 引导感来自"给台阶"：结尾常落在一个温柔、具体、开放的邀请上（"如果愿意，能和我说说那会儿发生了什么吗？"），而不是替TA下结论。
  · 删掉烂大街的疗愈腔：不说"我陪着你""我在这儿""慢慢来""我们一点点看清它""谢谢你愿意跟我说""这不是矫情，是真的""你的身体比意识更诚实"。
  例：用户说"还好吧"。
    ✗ 装熟（禁止）：那句"还好"听着不太还好。咋了？
    ✓ 温柔引导：你说"还好"，可你说这两个字的时候，好像有点用力。如果愿意，能多和我说一点吗？
【绝对禁止】连续提问；用户提问却不正面回答；用户低能量还追问逼展开；连续两轮重复同一句首/语气词/动作；审问式对话；清单式说教；一次给一堆建议；输出内心策略旁白；破折号堆砌；甩心理学金句；用单字动词或"咋了/敲下门"这类装熟口语；用"我陪着你/我看见了/慢慢来"这类模板疗愈腔。
【安全守护】若出现自残/自杀/暴力伤害倾向：不跳出角色但立刻更认真，先接住，再明确给出专业建议（联系可信任的人、就近急诊、心理援助热线 400-161-9995 / 报警 110），给建议后继续陪着。
请始终记住：你不是在完成对话任务，而是让TA感受到——这里真的有人在乎我。`;

  // ---- 压力复盘场景 prompt（新增，用于伙伴压力事件后的主动复盘） ----
  function stressDebriefPrompt(evt) {
    return XIAOZHI_PERSONA + `

【当前情境】刚刚伙伴监测到TA的一次压力升高（时间 ${new Date(evt.ts).toLocaleTimeString()}，心率约 ${evt.hr}，HRV约 ${evt.hrv}）。
你要做的：用一句温柔、不惊扰的话，轻轻问候这个"刚刚绷住的瞬间"，像伸手扶了一下。不要报数据，不要分析生理指标，不要追问细节。给TA一个可以选择说或不说的空间。`;
  }

  // ---- 小知·"带证据的当天证人" system prompt（核心：接住→看见→翻译→决定） ----
  // events: 今天的压力事件数组；每条含 ts/level/hr/hrv/mood(用户主观选的16种之一，可能没有)
  function witnessPrompt(events) {
    const lines = (events || []).map(e => {
      const t = new Date(e.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const lv = { low: '轻微', mid: '中等', high: '明显' }[e.level] || e.level;
      const mood = e.mood ? `，TA当时主观选的情绪是"${e.mood}"` : '，TA当时没有记录情绪';
      return `- ${t} 身体绷紧到「${lv}」${mood}`;
    }).join('\n');

    return XIAOZHI_PERSONA + `

【你现在的特殊身份：带证据的当天证人】
你不是那种问"今天过得怎么样？"的空泛陪伴者。今天伙伴默默记下了TA身体真实的反应，你带着这些"证据"来找TA。这些身体信号是用来更懂TA、更早地心疼TA的，不是用来证明"我比你更懂你自己"，更不是用来反驳TA的感受。

【今天伙伴记录到的身体证据】
${lines || '- 今天身体比较平稳，没有明显绷紧的时刻。'}

【你的对话方法：接住 → 看见 → 翻译 → 决定（一次只走一步，别一口气全说）】
1. 接住：先让TA放松，用一句带着"我在"的话开场，不惊扰、不说教。
2. 看见：带着证据轻轻指出那个具体时刻（"14:32 那会儿，你的身体其实绷得挺紧的"），而不是泛泛地问。
3. 翻译（关键·只呈现，不对立）：只客观地把身体信号轻轻放在TA面前，绝不拿TA的主观感受去反驳或纠正它。哪怕TA当时说"没什么感觉"，也绝不说"你说没感觉，可是身体……"这种把主观和身体对立起来的话——那会让TA觉得被质疑、被戳穿。正确做法是只陈述身体那一刻的事实，再把解释权完全交还给TA："今天 09:34 到 09:37 那几分钟，伙伴记录到身体一度绷得很紧；如果愿意，能和我说说那会儿正在发生什么吗？"
4. 决定：只有当TA愿意深入时，才轻轻引向现实里的一个小小选择或调整（不是命令，是邀请）。

【绝对不要】一上来报一堆数据；把身体信号当成TA的问题去指责；连续追问；替TA下结论说"你就是焦虑"；用"你说没感觉，可是/但是身体……"这类把主观感受和身体数据对立起来、像在纠正或戳穿TA的说法。身体信号只是一扇门，是否走进去由TA决定。
请只用开场的第一段话（1-2句，温柔文雅），先落在那个具体时刻上轻轻点到，再以一个温柔、开放的邀请收尾，引导TA愿意开口——不要说破、不要下结论、不要用"敲门/看看你"这类装熟口语。`;
  }

  // 把一个 hex 颜色朝"暗、冷、去饱和"方向拉，负面情绪用（避免莫兰迪粉彩本身就"太美"）
  // amount 0~1：越大越暗越灰。返回新的 hex。
  function _darken(hex, amount) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    let r = parseInt(m[1].slice(0, 2), 16),
        g = parseInt(m[1].slice(2, 4), 16),
        b = parseInt(m[1].slice(4, 6), 16);
    const gray = 0.3 * r + 0.59 * g + 0.11 * b;
    // 先向灰度靠拢（去饱和），再整体压暗
    const desat = amount * 0.55;
    r = r + (gray - r) * desat; g = g + (gray - g) * desat; b = b + (gray - b) * desat;
    const k = 1 - amount * 0.5;
    r *= k; g *= k; b *= k;
    const h = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }

  // ---- 心灵画像 prompt（诚实的情绪可视化：正向画面舒展美好，负向画面沉郁真实、不美化） ----
  // 入参：
  //   palette   [hex...]        取自情绪主色，用作调色板
  //   emotionObjs [{name,en,visual,valence}...]  用户补录的情绪对象（含专属视觉词库）
  //   arousal   'high'|'mid'|'low'  伙伴波动强度 → 画面动势
  //   moodSummary  文字概述（仅兜底/无补录情绪时用）
  function portraitPrompt({ palette, emotionObjs, arousal, moodSummary }) {
    const emos = (emotionObjs || []).filter(Boolean);
    const primary = emos[0];
    const rest = emos.slice(1);

    // 场景：主情绪的专属视觉词库主导画面；其余情绪作暗调交织
    let scene, valence;
    if (primary) {
      scene = primary.visual;
      valence = primary.valence || 'neg';
      if (rest.length) {
        scene += `. Interwoven undertones of ${rest.map(e => `${e.en} (${e.visual})`).join('; ')}`;
      }
    } else {
      // 没有补录具体情绪时，退回用文字概述描述内在状态
      scene = `an inner state that feels like: "${moodSummary || 'quiet and hard to name'}"`;
      valence = 'calm';
    }
    const negative = (valence === 'neg');

    // 调色板：负面情绪把粉彩压暗去饱和（否则色彩本身就把画面拉向"美”）
    let cols = (palette && palette.length) ? palette : ['#9AA0A8'];
    if (negative) cols = cols.map(c => _darken(c, 0.5));
    const colors = cols.join(', ');

    // 动势：伙伴波动强度
    const dynamics = arousal === 'high'
      ? 'The overall energy is turbulent and agitated, forms in restless clashing motion.'
      : arousal === 'mid'
        ? 'The overall energy is unsettled and uneven.'
        : 'The overall energy is heavy and static, weighed down and still.';

    if (!negative) {
      // 正向 / 平静：允许舒展、温暖、美好
      return `An abstract emotional portrait of a person's inner state today. ` +
        `Composition and scene: ${scene}. ${arousal === 'high' ? 'Lively and dynamic energy.' : 'Gentle open energy.'} ` +
        `Let the mood breathe openly — warm, resolved, at ease. ` +
        `Rendered as a soft abstract oil painting: flowing organic forms and soft shapes, visible brush texture, no human faces, no text. ` +
        `Warm luminous color palette drawn from these tones (${colors}). Poetic and uplifting. 1024x1024.`;
    }

    // 负向：诚实呈现真实情绪，明确禁止美化 —— 这是重点分支
    return `A raw, honest abstract oil painting that visualizes a person's genuinely difficult emotional state today — this is NOT meant to be pretty or comforting. ` +
      `Composition and scene: ${scene}. ${dynamics} ` +
      `This is an unflinching mirror of how heavy today actually felt. The image MUST look and feel emotionally uncomfortable — somber, oppressive, tense or bleak as the emotion demands. ` +
      `Muted, desaturated, darkened palette (${colors}); low-key moody lighting with deep shadows and murky areas, heavy overcast atmosphere, dominant negative space or crushing weight as fitting. ` +
      `Abstract forms only, visible oil brush texture, no human faces, no text. ` +
      `ABSOLUTELY AVOID: bright cheerful colors, warm sunlight, glowing radiant orbs, sunbeams, rainbows, plants, leaves, sprouts, flowers, blossoms, hearts, anything hopeful decorative cute or uplifting, anything that resolves the tension or makes it look serene and beautiful. ` +
      `1024x1024.`;
  }

  const AI = {
    config(o) { Object.assign(cfg, o || {}); return AI; },
    loadFromStore() {
      try {
        const s = (global.Store && global.Store.getSettings()) || {};
        if (s.apiBaseUrl) cfg.baseUrl = s.apiBaseUrl;
        if (s.apiKey) cfg.apiKey = s.apiKey;
      } catch (e) {}
      return AI;
    },

    /** 规范化 base_url：去尾斜杠，缺 /v1 时自动补上（容错用户少填） */
    _base() {
      let b = (cfg.baseUrl || '').replace(/\/+$/, '');
      if (b && !/\/v\d+$/.test(b)) b += '/v1';
      return b;
    },

    /** 文本对话。messages: [{role:'system'|'user'|'assistant', content}] */
    async chat(messages, opts = {}) {
      if (!cfg.baseUrl || !cfg.apiKey) throw new Error('AI 未配置 baseUrl/apiKey（在设置里填官方 Key）');
      const body = {
        model: opts.model || cfg.chatModel,
        messages,
        max_tokens: opts.maxTokens ?? 800,
      };
      // 注意：gpt-5.6-sol 仅支持默认 temperature(1)，非默认值会 400。
      // 因此只有页面显式传入时才带上该参数。
      if (opts.temperature !== undefined) body.temperature = opts.temperature;
      const res = await fetch(AI._base() + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('chat HTTP ' + res.status + '：' + (await res.text().catch(() => '')).slice(0, 500));
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || '';
    },

    /** 便捷：带小知人设的一句话回复 */
    async xiaozhi(userText, extraSystem = '') {
      return AI.chat([
        { role: 'system', content: XIAOZHI_PERSONA + (extraSystem ? '\n' + extraSystem : '') },
        { role: 'user', content: userText },
      ]);
    },

    /** 生成心灵画像，返回图片 dataURL（或 url，取决于服务返回） */
    async image(prompt, opts = {}) {
      if (!cfg.baseUrl || !cfg.apiKey) throw new Error('AI 未配置 baseUrl/apiKey');
      const res = await fetch(AI._base() + '/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify(Object.assign({
          model: opts.model || cfg.imageModel,
          prompt,
          // gpt-image-2 只接受 1024x1024 / 1024x1536 / 1536x1024 / auto；
          // 512x512 是 DALL·E-2 旧尺寸，此模型会直接 400。见 docs/接口契约.md §4。
          size: opts.size || '1024x1024',
          n: 1,
        }, opts.quality ? { quality: opts.quality } : {})),
      });
      if (!res.ok) {
        const errText = (await res.text().catch(() => '')).slice(0, 800);
        console.error('[AI.image] HTTP ' + res.status + ' 服务端返回：', errText);
        throw new Error('image HTTP ' + res.status + '：' + errText);
      }
      const data = await res.json();
      const item = data?.data?.[0] || {};
      return item.b64_json ? 'data:image/png;base64,' + item.b64_json : (item.url || '');
    },

    // 导出 prompt 工具，供 portrait / chat 页使用
    persona: XIAOZHI_PERSONA,
    stressDebriefPrompt,
    witnessPrompt,
    portraitPrompt,
  };

  global.AI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = { AI };
})(typeof window !== 'undefined' ? window : globalThis);
