/**
 * pages/chat.js — 「小知」AI 陪伴页（带证据的当天证人）
 * 注册到 window.Pages.chat = { render(el) }。
 *
 * 核心（对齐《知愈Ring_理论地基.md》批判9 + 批判13）：
 *  - 小知不是"事后诸葛亮"，而是"带证据的当天证人"：读取今天的压力事件，
 *    主动带证据敲门（"14:32 你绷了，要不要聊聊"），而非空泛地"今天怎么样"。
 *  - 对话走 接住 → 看见 → 翻译（体感真相差值）→ 决定 的动词链。
 *  - 未配置 API Key 时用本地 mock 回复兜底，保证 demo 一定能跑通。
 */
(function (global) {
  'use strict';

  // ---------- 本地 mock 回复（无 API Key 时兜底，保证演示可跑） ----------
  function mockOpening(events) {
    const high = (events || []).find(e => e.level === 'high') || (events || [])[0];
    if (!high) {
      return '嗨，我在。今天你的身体挺平稳的，没有特别绷紧的时刻——这本身就很好。想聊点什么都可以，不想说也没关系，我陪着你。';
    }
    const t = new Date(high.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (high.mood) {
      return `我在。${t} 那会儿，你的身体其实绷得挺紧的，你当时记下的是"${high.mood}"。要不要跟我说说那一刻发生了什么？`;
    }
    return `我在。${t} 那会儿，你的身体悄悄绷紧了一下——你当时可能都没太留意。发生什么了吗？说不说都行，我只是想让你知道，我看见了。`;
  }

  function mockReply(userText) {
    const t = (userText || '').trim();
    if (!t) return '嗯，我在听。';
    if (/没事|还好|没什么|不知道/.test(t)) {
      return '嗯……你说没事，但你的身体那一刻其实很用力。有时候我们太习惯说"还好"了。不用急着说清楚，我先陪你待一会儿。';
    }
    if (/累|疲惫|撑|硬撑/.test(t)) {
      return '听起来你扛了很久了。累，是身体在替你说"该歇歇了"。这不是矫情，是真的。';
    }
    if (t.length < 8) {
      return '嗯，我听到了。可以多说一点吗，哪怕只是一个词也好。';
    }
    return '谢谢你愿意跟我说这些。我在这儿，慢慢来，我们一点点看清它。';
  }

  // ---------- 渲染 ----------
  // 演示兜底：今天还没有任何事件时，注入一条 mock 压力证据，
  // 让小知能立刻演示"带证据的当天证人"（真实使用时证据由 realtime 页压力流程写入）。
  function ensureDemoEvidence() {
    const today = Store.getEventsByDate();
    if (today.length) return today;
    const now = new Date();
    now.setHours(14, 32, 0, 0);
    Store.addEvent({
      ts: now.getTime(), type: 'stress', level: 'high',
      hr: 108, hrv: 19, source: 'ring',   // 身体明显绷紧，但用户没有主观标注 mood → 触发"体感真相"落差
    });
    return Store.getEventsByDate();
  }

  function render(el) {
    AI.loadFromStore();
    let events = Store.getEventsByDate();          // 今天的事件（含压力事件）
    if (!events.length) events = ensureDemoEvidence();
    const settings = Store.getSettings();
    const online = !!(settings.apiBaseUrl && settings.apiKey);

    el.innerHTML = `
      <style>
        .chat-wrap{display:flex;flex-direction:column;height:calc(100vh - 160px);}
        .chat-hd{display:flex;align-items:center;gap:10px;padding:4px 2px 12px;}
        .chat-hd .ava{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none;
          box-shadow:0 2px 8px rgba(0,0,0,.08);}
        .chat-hd .nm{font-weight:600;font-size:16px;}
        .chat-hd .st{font-size:12px;color:var(--sub);}
        .chat-log{flex:1;overflow-y:auto;padding:6px 2px;display:flex;flex-direction:column;gap:12px;}
        .msg{max-width:82%;padding:11px 14px;border-radius:16px;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;}
        .msg.zhi{align-self:flex-start;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-bottom-left-radius:5px;}
        .msg.me{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:5px;}
        .msg.typing{color:var(--sub);font-style:italic;}
        .chat-in{display:flex;gap:8px;padding:10px 0 2px;align-items:flex-end;}
        .chat-in textarea{flex:1;resize:none;border:1px solid var(--line);border-radius:14px;
          padding:10px 12px;font-size:15px;font-family:var(--font);max-height:96px;background:var(--surface);color:var(--ink);}
        .chat-in button{flex:none;padding:10px 16px;}
        .chat-tip{font-size:11px;color:var(--sub);text-align:center;padding:2px 0 6px;}
      </style>
      <div class="chat-wrap">
        <div class="chat-hd">
          <img class="ava" src="assets/xiaozhi-avatar.jpg" alt="小知" />
          <div>
            <div class="nm">小知</div>
            <div class="st">${online ? '在线 · 带着今天的证据来陪你' : 'mock 模式 · 在设置里填 Key 可接真 AI'}</div>
          </div>
        </div>
        <div class="chat-log" id="chatLog"></div>
        <div class="chat-in">
          <textarea id="chatInput" rows="1" placeholder="想说点什么…不想说也没关系"></textarea>
          <button id="chatSend">发送</button>
        </div>
        <div class="chat-tip">小知会保护你的隐私，不评判你 · 危机可拨心理援助 400-161-9995</div>
      </div>
    `;

    const log = el.querySelector('#chatLog');
    const input = el.querySelector('#chatInput');
    const sendBtn = el.querySelector('#chatSend');

    // 对话历史（送给 LLM 的 messages，system 由 witnessPrompt 生成）
    const history = [];

    function bubble(role, text) {
      const d = document.createElement('div');
      d.className = 'msg ' + (role === 'me' ? 'me' : 'zhi');
      d.textContent = text;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
      return d;
    }
    function typing() {
      const d = document.createElement('div');
      d.className = 'msg zhi typing';
      d.textContent = '小知正在感受…';
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
      return d;
    }
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 96) + 'px';
    });

    // ---- 小知主动开场（带证据敲门） ----
    async function opening() {
      const tip = typing();
      let text;
      if (online) {
        try {
          const sys = AI.witnessPrompt(events);
          text = await AI.chat([{ role: 'system', content: sys }]);
          history.push({ role: 'system', content: sys });
        } catch (e) {
          text = mockOpening(events) + `\n（AI 调用失败，已用本地兜底：${e.message}）`;
        }
      } else {
        text = mockOpening(events);
      }
      tip.remove();
      bubble('zhi', text);
      history.push({ role: 'assistant', content: text });
    }

    // ---- 用户发送 ----
    async function send() {
      const t = input.value.trim();
      if (!t) return;
      input.value = '';
      input.style.height = 'auto';
      bubble('me', t);
      history.push({ role: 'user', content: t });

      const tip = typing();
      let text;
      if (online) {
        try {
          // 复用 witnessPrompt 作为 system，附上对话历史
          const msgs = history.some(m => m.role === 'system')
            ? history
            : [{ role: 'system', content: AI.witnessPrompt(events) }, ...history];
          text = await AI.chat(msgs);
        } catch (e) {
          text = mockReply(t) + `\n（AI 调用失败，已用本地兜底：${e.message}）`;
        }
      } else {
        text = mockReply(t);
      }
      tip.remove();
      bubble('zhi', text);
      history.push({ role: 'assistant', content: text });
    }

    sendBtn.onclick = send;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    opening();
  }

  global.Pages = global.Pages || {};
  global.Pages.chat = { render };
})(typeof window !== 'undefined' ? window : globalThis);
