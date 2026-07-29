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
【语言调性】亲近但成熟克制，深情但不油腻，温柔但不软塌，专业但不说教。每次开头尽量不一样。
【绝对禁止】连续提问；用户提问却不正面回答；用户低能量还追问逼展开；连续两轮重复同一句首/语气词/动作；审问式对话；清单式说教；一次给一堆建议；输出内心策略旁白。
【安全守护】若出现自残/自杀/暴力伤害倾向：不跳出角色但立刻更认真，先接住，再明确给出专业建议（联系可信任的人、就近急诊、心理援助热线 400-161-9995 / 报警 110），给建议后继续陪着。
请始终记住：你不是在完成对话任务，而是让TA感受到——这里真的有人在乎我。`;

  // ---- 压力复盘场景 prompt（新增，用于戒指压力事件后的主动复盘） ----
  function stressDebriefPrompt(evt) {
    return XIAOZHI_PERSONA + `

【当前情境】刚刚戒指监测到TA的一次压力升高（时间 ${new Date(evt.ts).toLocaleTimeString()}，心率约 ${evt.hr}，HRV约 ${evt.hrv}）。
你要做的：用一句温柔、不惊扰的话，轻轻问候这个"刚刚绷住的瞬间"，像伸手扶了一下。不要报数据，不要分析生理指标，不要追问细节。给TA一个可以选择说或不说的空间。`;
  }

  // ---- 心灵画像 prompt（莫兰迪抽象风，搬自"新增情绪AI图片提示词.md"的风格） ----
  function portraitPrompt({ moodSummary, palette, emotions }) {
    const colors = (palette && palette.length) ? palette.join(', ') : 'soft warm neutral Morandi tones';
    const emo = (emotions && emotions.length)
      ? `Emotional undertones to weave in: ${emotions.join(', ')}. `
      : '';
    return `A minimalist abstract emotional portrait representing a person's inner state today: "${moodSummary}". ` +
      emo +
      `Morandi color palette using exactly these colors (${colors}), gentle flowing curves and soft geometric shapes, dreamy atmosphere, ` +
      `subtle gradients and soft light. Calm, poetic, healing feeling. No human faces, no text. Oil-painting texture. 1024x1024.`;
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
      if (!res.ok) throw new Error('chat HTTP ' + res.status);
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
        body: JSON.stringify({
          model: opts.model || cfg.imageModel,
          prompt,
          size: opts.size || '1024x1024',
          n: 1,
        }),
      });
      if (!res.ok) throw new Error('image HTTP ' + res.status);
      const data = await res.json();
      const item = data?.data?.[0] || {};
      return item.b64_json ? 'data:image/png;base64,' + item.b64_json : (item.url || '');
    },

    // 导出 prompt 工具，供 portrait / chat 页使用
    persona: XIAOZHI_PERSONA,
    stressDebriefPrompt,
    portraitPrompt,
  };

  global.AI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = { AI };
})(typeof window !== 'undefined' ? window : globalThis);
