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

  // ---------- 敲击手势 → 语音录音 toggle（全局只挂一次监听，避免每次进页面重复叠加）----------
  // ble/mock 都会派发 window 'ring:gesture' 事件；这里 800ms 去抖，指向当前活动录音器。
  let activeVoiceToggle = null;
  let _gestureWired = false;
  let _lastGestureAt = 0;

  // ---------- 对话沉淀到心迹（轻量版）----------
  // 离开小知页时，把这次对话摘成一条「情绪小结」事件存进 Store，心迹页零改动即可显示
  // （日历着色读 ev.mood，点开某天显示 ev.note，见 pages/growth.js）。
  // activeSummarize 指向「当前这次对话的落盘函数」；离开页(hashchange)时调用一次即置空，避免重复入库。
  let activeSummarize = null;

  // 情绪主类词表（须与 lib/emotions.js 的 name 一致，否则 EmotionBy 取不到颜色）
  const MOOD_SET = ['开心', '平静', '难过', '焦虑', '幸福', '自豪', '孤独', '愤怒',
                    '兴奋', '感动', '失望', '恐惧', '累', '困惑', '尴尬', '不知道'];

  // 兜底：AI 摘要失败时，从用户原话里粗扫一个情绪词（命中主类或其近义子词即可）
  function guessMood(text) {
    const t = text || '';
    const SUBS = {
      焦虑: ['担忧', '不安', '紧张', '焦灼', '恐慌', '压力', '烦'],
      难过: ['失落', '沮丧', '忧伤', '悲', '心碎', '哭', '委屈'],
      孤独: ['孤单', '寂寞', '一个人', '没人'],
      愤怒: ['生气', '恼', '愤', '气死', '烦躁'],
      累:   ['疲', '困', '累', '撑不住', '精疲'],
      开心: ['开心', '高兴', '愉悦', '喜悦', '欢'],
      感动: ['温暖', '触动', '感激', '感恩', '被接住'],
      困惑: ['迷茫', '困惑', '茫然', '不知道该', '纠结', '矛盾'],
      失望: ['遗憾', '失望', '心寒', '心灰'],
      恐惧: ['害怕', '畏惧', '恐惧', '惊恐', '怕'],
      平静: ['平静', '放松', '安宁', '淡然', '还好'],
    };
    for (const mood in SUBS) {
      if (SUBS[mood].some(w => t.indexOf(w) >= 0)) return mood;
    }
    return '不知道';
  }

  // 把一次对话摘成一条心迹事件并落盘。history: [{role,content}...]；只在有真实用户发言时存，只存一次。
  async function saveChatSummary(history) {
    const userTurns = (history || []).filter(m => m.role === 'user' && (m.content || '').trim());
    if (!userTurns.length) return;                       // 纯看开场白没说话 → 不产生心迹

    const lastUser = userTurns[userTurns.length - 1].content.trim();
    let mood = '', note = '';

    // 首选：让小知读整段对话，选一个情绪 + 写一句第一人称小结
    // online 判定与 render 保持一致（读 Store settings；ai.js 未导出 cfg）。
    const _s = Store.getSettings();
    const online = !!(_s.apiBaseUrl && _s.apiKey);
    if (online) {
      try {
        const convo = (history || [])
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => (m.role === 'user' ? '我' : '小知') + '：' + m.content)
          .join('\n');
        const sys = '你是情绪记录助手。读下面用户与「小知」的对话，只关注用户的情绪状态，'
          + '输出严格 JSON：{"mood":情绪词,"note":一句话小结}。'
          + 'mood 必须从这些词中选一个最贴切的：' + MOOD_SET.join('、') + '。'
          + 'note 用第一人称、20 字以内、温柔不评判地概括用户这次聊了什么/什么心情，不加引号。'
          + '只输出 JSON，不要多余文字。';
        const raw = await AI.chat([
          { role: 'system', content: sys },
          { role: 'user', content: convo },
        ]);
        const j = JSON.parse(raw.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
        if (j && typeof j.mood === 'string') mood = j.mood.trim();
        if (j && typeof j.note === 'string') note = j.note.trim().replace(/^["“]|["”]$/g, '');
      } catch (_) { /* 落到下面的兜底 */ }
    }

    if (!MOOD_SET.includes(mood)) mood = guessMood(lastUser);
    if (!note) note = lastUser.slice(0, 20);
    else note = note.slice(0, 24);

    try {
      Store.addEvent({
        type: 'chat', level: 'low', mood, note,
        source: 'xiaozhi',                               // 标记来自小知对话，便于日后区分
      });
      // AI 摘要是异步的（await 了几秒），用户很可能已经切到心迹页、而心迹页在写库之前就渲染过了。
      // 若此刻正停在心迹页，主动重渲染一次，让这条新记录立即可见（否则要等下次进页面才刷新）。
      const hash = (location.hash.replace('#', '') || 'realtime');
      if (hash === 'growth' && global.Pages && global.Pages.growth) {
        const view = document.getElementById('view');
        if (view) { try { global.Pages.growth.render(view); } catch (_) {} }
      }
    } catch (_) {}
  }

  // 离开小知页时让语音立刻停（切 tab / 返回都会 hashchange）——只挂一次
  let _leaveWired = false;
  function wireLeaveOnce() {
    if (_leaveWired) return;
    _leaveWired = true;
    global.addEventListener('hashchange', () => {
      const key = (location.hash.replace('#', '') || 'realtime');
      if (key !== 'chat') {
        if (global.TTS) { try { global.TTS.stop(); } catch (_) {} }
        // 离开小知页 → 把这次对话摘成一条心迹（只摘一次，摘完置空）
        if (activeSummarize) { const fn = activeSummarize; activeSummarize = null; try { fn(); } catch (_) {} }
      }
    });
  }
  function wireGestureOnce() {
    if (_gestureWired) return;
    _gestureWired = true;
    global.addEventListener('ring:gesture', (e) => {
      const s = ((e.detail && e.detail.gesture) || '').toUpperCase();
      if (s.indexOf('TAP') < 0) return;
      // 只在「已经在小知页」时由这里 toggle 当前录音器；
      // 不在小知页时的「敲伙伴→跳转唤起」由 index.html 的全局路由负责，避免双触发。
      const key = (location.hash.replace('#', '') || 'realtime');
      if (key !== 'chat') return;
      const now = Date.now();
      if (now - _lastGestureAt < 800) return;
      _lastGestureAt = now;
      if (activeVoiceToggle) activeVoiceToggle();
    });
  }

  // ---------- 本地 mock 回复（无 API Key 时兜底，保证演示可跑） ----------
  // 兜底话术（无 API Key 时用）：温柔文雅·引导型，双音节动词，收尾落在开放邀请上。
  function mockOpening(events) {
    const high = (events || []).find(e => e.level === 'high') || (events || [])[0];
    if (!high) {
      return '今天的你，身体一直很平稳，没有明显绷紧的时刻。如果此刻心里有什么想停留一会儿的，我都在。';
    }
    const t = new Date(high.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (high.mood) {
      return `我在。${t} 那会儿，伙伴记录到身体一度绷得很紧，你当时留意到的是"${high.mood}"。如果愿意，能和我说说那一刻，正在发生什么吗？`;
    }
    return `我在。${t} 那会儿，伙伴记录到身体一度绷得很紧。不必急着回答——如果愿意，能和我说说那时候，你正在忙着什么吗？`;
  }

  function mockReply(userText) {
    const t = (userText || '').trim();
    if (!t) return '我在听着，你慢慢说。';
    // 无 API Key 时也能演示知识库：命中就用知识卡的话术直接接地气讲一段
    if (global.KB) {
      const hit = global.KB.retrieve(t, 1)[0];
      if (hit) return hit.oneLine + '\n\n' + hit.plain;
    }
    if (/没事|还好|没什么|不知道/.test(t)) {
      return '你说"还好"，可你说这两个字的时候，好像有点用力。如果愿意，能多和我说一点吗？';
    }
    if (/累|疲惫|撑|硬撑/.test(t)) {
      return '这份累，你已经扛了有一阵子了吧。能和我说说，是从什么时候开始变沉的吗？';
    }
    if (t.length < 8) {
      return '我留意到了。能顺着这个，再往下多讲一点吗？';
    }
    return '你说的这些，我都收到了。如果愿意，我们可以从最让你在意的那一处，慢慢往下看。';
  }

  // ---------- 渲染 ----------
  // 演示兜底：今天还没有任何事件时，注入一条 mock 压力证据，
  // 让小知能立刻演示"带证据的当天证人"（真实使用时证据由 realtime 页压力流程写入）。
  function ensureDemoEvidence() {
    const today = Store.getEventsByDate();
    if (today.length) return today;
    // 证据时间取"今天早些时候的一个随机时刻"，避免每次开场都固定在 14:32，也不会落到未来
    const now = new Date();
    const evt = new Date(now);
    const minMs = 30 * 60e3;                 // 至少 30 分钟前
    const sinceMidnight = now - new Date(now).setHours(0, 0, 0, 0);
    if (sinceMidnight <= minMs) {
      evt.setTime(now.getTime() - minMs);    // 一大早就进来：就取半小时前
    } else {
      // 在「今天0点+30分」到「此刻30分钟前」之间随机取一个整分钟
      const span = (now.getTime() - minMs) - (new Date(now).setHours(0, 0, 0, 0) + minMs);
      const back = minMs + Math.floor(Math.random() * Math.max(span, 0));
      evt.setTime(now.getTime() - back);
      evt.setSeconds(0, 0);
    }
    Store.addEvent({
      ts: evt.getTime(), type: 'stress', level: 'high',
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
        .chat-wrap{display:flex;flex-direction:column;height:100%;min-height:0;}
        /* 沉浸对话顶栏：返回 + 头像 + 名字状态 */
        .chat-hd{display:flex;align-items:center;gap:10px;padding:12px 16px;flex:none;
          border-bottom:1px solid var(--line);background:rgba(255,255,255,.72);backdrop-filter:blur(12px);}
        .chat-hd .back{background:transparent;color:var(--ink);padding:6px;margin:-6px 2px -6px -6px;display:flex;flex:none;}
        .chat-hd .ava{width:38px;height:38px;border-radius:50%;object-fit:cover;flex:none;
          box-shadow:0 2px 8px rgba(0,0,0,.08);}
        .chat-hd .nm{font-family:var(--font-serif);font-weight:600;font-size:17px;letter-spacing:1px;}
        .chat-hd .st{font-size:12px;color:var(--sub);}
        /* 语音开关：小知开口说话的总开关（默认开，localStorage 记忆）*/
        .chat-hd .voi{margin-left:auto;flex:none;display:flex;align-items:center;gap:5px;
          font-size:12px;color:var(--sub);background:var(--surface);border:1px solid var(--line);
          border-radius:20px;padding:6px 11px;cursor:pointer;transition:all .15s ease;}
        .chat-hd .voi.on{color:#fff;background:var(--accent);border-color:var(--accent);}
        .chat-hd .voi svg{width:15px;height:15px;flex:none;}
        /* 小知气泡正在朗读时的轻微"说话中"呼吸动效 */
        .msg.zhi.speaking{animation:zhiSpeak 1.3s ease-in-out infinite;}
        @keyframes zhiSpeak{0%,100%{box-shadow:0 0 0 0 rgba(212,184,165,0)}
          50%{box-shadow:0 0 0 4px rgba(212,184,165,.30)}}
        .chat-log{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px;}
        .msg{max-width:86%;padding:10px 13px;border-radius:16px;font-size:15px;line-height:1.5;white-space:pre-wrap;word-break:break-word;}
        /* 纯语音气泡：宽度跟着语音条走，不被强行撑肥 */
        .msg.voice-only{max-width:100%;width:fit-content;padding:8px;}
        .msg.zhi{align-self:flex-start;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-bottom-left-radius:5px;}
        .msg.me{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:5px;}
        .msg.typing{color:var(--sub);font-style:italic;}
        .rec-bar{margin:4px 16px;}
        .chat-in{display:flex;gap:8px;padding:10px 16px 2px;align-items:flex-end;}
        .chat-in textarea{flex:1;resize:none;border:1px solid var(--line);border-radius:14px;
          padding:10px 12px;font-size:15px;font-family:var(--font);max-height:96px;background:var(--surface);color:var(--ink);
          outline:none;transition:border-color .2s var(--ease-calm);}
        .chat-in textarea:focus{border-color:var(--accent);}
        .chat-in button{flex:none;padding:10px 16px;}
        .chat-mic{width:44px;height:44px;padding:0!important;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          background:var(--surface);color:var(--accent);border:1px solid var(--line);}
        .chat-mic.rec{background:var(--high);color:#fff;border-color:var(--high);animation:micPulse 1s infinite;}
        @keyframes micPulse{0%{box-shadow:0 0 0 0 rgba(216,160,140,.6)}70%{box-shadow:0 0 0 10px rgba(216,160,140,0)}100%{box-shadow:0 0 0 0 rgba(216,160,140,0)}}
        .rec-bar{display:none;align-items:center;gap:10px;background:var(--high);color:#fff;
          border-radius:14px;padding:9px 14px;font-size:14px;margin:4px 0;}
        .rec-bar.on{display:flex;}
        .rec-bar .rec-dot{width:9px;height:9px;border-radius:50%;background:#fff;animation:micPulse 1s infinite;flex:none;}
        .rec-bar .rec-hint{margin-left:auto;font-size:12px;opacity:.85;}
        /* 自定义波形语音条（替换原生 audio 控件，紧凑、贴莫兰迪调性） */
        .voice{display:flex;align-items:center;gap:9px;margin-top:8px;padding:7px 11px;
          border-radius:13px;background:rgba(0,0,0,.05);width:fit-content;max-width:100%;cursor:pointer;
          user-select:none;-webkit-user-select:none;}
        .msg.me .voice{background:rgba(255,255,255,.22);}
        .voice .vp{flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;
          justify-content:center;background:var(--accent);color:#fff;font-size:11px;line-height:1;padding:0;}
        .msg.me .voice .vp{background:rgba(255,255,255,.9);color:var(--accent-deep);}
        .voice .vwave{display:flex;align-items:center;gap:2px;height:22px;flex:none;}
        .voice .vwave i{display:block;width:2.5px;border-radius:2px;background:var(--accent);opacity:.32;
          transition:opacity .12s ease;}
        .msg.me .voice .vwave i{background:#fff;}
        .voice .vwave i.on{opacity:.95;}
        .voice .vtime{flex:none;font-size:12px;color:var(--sub);font-variant-numeric:tabular-nums;min-width:30px;}
        .msg.me .voice .vtime{color:rgba(255,255,255,.85);}
        .voice-cap{font-size:14px;line-height:1.5;margin-top:6px;opacity:.92;}
        /* 小知回复的 Markdown 富文本样式 */
        .msg.md{white-space:normal;}
        .msg.md>:first-child{margin-top:0;}
        .msg.md>:last-child{margin-bottom:0;}
        .msg.md .md-p{margin:0 0 8px;}
        .msg.md strong{font-weight:700;}
        .msg.md em{font-style:italic;}
        .msg.md code.md-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;
          background:rgba(0,0,0,.06);border-radius:5px;padding:1px 5px;}
        .msg.md a{color:var(--accent-deep,var(--accent));text-decoration:underline;}
        .msg.md .md-h{font-weight:700;margin:10px 0 6px;line-height:1.35;}
        .msg.md .md-h1{font-size:1.22em;}
        .msg.md .md-h2{font-size:1.14em;}
        .msg.md .md-h3{font-size:1.06em;}
        .msg.md .md-h4,.msg.md .md-h5,.msg.md .md-h6{font-size:1em;}
        .msg.md .md-ul,.msg.md .md-ol{margin:6px 0;padding-left:22px;}
        .msg.md .md-ul li,.msg.md .md-ol li{margin:3px 0;line-height:1.55;}
        .msg.md .md-quote{margin:8px 0;padding:6px 12px;border-left:3px solid var(--line);
          color:var(--sub);background:rgba(0,0,0,.03);border-radius:0 8px 8px 0;}
        .msg.md .md-table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13.5px;}
        .msg.md .md-table th,.msg.md .md-table td{border:1px solid var(--line);padding:6px 9px;text-align:left;}
        .msg.md .md-table th{background:rgba(0,0,0,.04);font-weight:600;}
        .chat-tip{font-size:11px;color:var(--sub);text-align:center;padding:2px 16px calc(14px + env(safe-area-inset-bottom,0));}
      </style>
      <div class="chat-wrap">
        <div class="chat-hd">
          <button class="back" onclick="location.hash='realtime'" aria-label="返回">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
          </button>
          <img class="ava" src="assets/xiaozhi-avatar.jpg" alt="小知" />
          <div>
            <div class="nm">小知</div>
            <div class="st">${online ? '在线 · 陪你说说今天' : 'mock 模式 · 在设置里填 Key 可接真 AI'}</div>
          </div>
          <button class="voi" id="voiToggle" title="小知语音回复开关" aria-label="语音回复开关">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"></path><path class="voi-wave" d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"></path></svg>
            <span class="voi-lb">语音</span>
          </button>
        </div>
        <div class="chat-log" id="chatLog"></div>
        <div class="rec-bar" id="recBar">
          <span class="rec-dot"></span>
          <span id="recText">正在聆听你说…</span>
          <span class="rec-hint">再敲两下伙伴 / 点麦克风 结束</span>
        </div>
        <div class="chat-in">
          <button class="chat-mic" id="chatMic" title="敲两下伙伴或点这里开始说话" aria-label="语音输入">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3"></rect>
              <path d="M5 11a7 7 0 0 0 14 0"></path>
              <line x1="12" y1="18" x2="12" y2="21"></line>
            </svg>
          </button>
          <textarea id="chatInput" rows="1" placeholder="和小知说说此刻的心情…"></textarea>
          <button id="chatSend">发送</button>
        </div>
        <div class="chat-tip">敲两下伙伴即可开口对小知说话 · 录音只存在你本机，不上传 · 危机可拨 400-161-9995</div>
      </div>
    `;

    const log = el.querySelector('#chatLog');
    const input = el.querySelector('#chatInput');
    const sendBtn = el.querySelector('#chatSend');

    // 对话历史（送给 LLM 的 messages，system 由 witnessPrompt 生成）
    const history = [];

    function bubble(role, text, opts) {
      const d = document.createElement('div');
      d.className = 'msg ' + (role === 'me' ? 'me' : 'zhi');
      const hasAudio = !!(opts && opts.audioId);
      // 判断是否"占位转写文案"（转写失败兜底那句），这类不当正文，只作语音附注小字
      const isPlaceholder = hasAudio && /转写没成功/.test(text || '');

      if (hasAudio) {
        // 纯语音气泡：波形语音条 +（转写文字稿作小字附注）
        d.classList.add('voice-only');
        d.appendChild(voiceBar(opts.audioId, role));
        const capText = (text || '').trim();
        if (capText && !isPlaceholder) {
          const cap = document.createElement('div');
          cap.className = 'voice-cap';
          cap.textContent = capText;
          d.appendChild(cap);
        }
      } else if (role === 'me' || !global.MD) {
        // 用户纯文本，杜绝 XSS
        d.textContent = text;
      } else {
        // 小知回复走 Markdown 富文本
        d.classList.add('md');
        d.innerHTML = global.MD.toHtml(text);
      }
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
      return d;
    }

    // ---- 波形语音条组件：播放键 + 波形 + 时长，点击整条播放/暂停 ----
    const WAVE_BARS = 26;
    function voiceBar(audioId, role) {
      const wrap = document.createElement('div');
      wrap.className = 'voice';
      wrap.setAttribute('role', 'button');
      wrap.setAttribute('aria-label', '播放语音');

      const playBtn = document.createElement('span');
      playBtn.className = 'vp';
      playBtn.textContent = '▶';

      const wave = document.createElement('span');
      wave.className = 'vwave';
      // 先用柔和静态波形占位，抽取到真实峰值后再覆盖（失败也好看，绝不空白）
      let peaks = fallbackPeaks();
      renderWave(wave, peaks, 0);

      const time = document.createElement('span');
      time.className = 'vtime';
      time.textContent = '0:00';

      wrap.appendChild(playBtn);
      wrap.appendChild(wave);
      wrap.appendChild(time);

      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      AudioStore.get(audioId).then(async (blob) => {
        if (!blob) return;
        audio.src = URL.createObjectURL(blob);
        try {
          const real = await extractPeaks(blob, WAVE_BARS);
          if (real) { peaks = real; renderWave(wave, peaks, audio.duration ? audio.currentTime / audio.duration : 0); }
        } catch (_) { /* 抽取失败保留静态波形 */ }
      });

      audio.addEventListener('loadedmetadata', () => {
        if (isFinite(audio.duration)) time.textContent = fmtTime(audio.duration);
      });
      audio.addEventListener('timeupdate', () => {
        const p = audio.duration ? audio.currentTime / audio.duration : 0;
        renderWave(wave, peaks, p);
        if (isFinite(audio.duration)) time.textContent = fmtTime(audio.duration - audio.currentTime);
      });
      const reset = () => {
        playBtn.textContent = '▶';
        renderWave(wave, peaks, 0);
        if (isFinite(audio.duration)) time.textContent = fmtTime(audio.duration);
      };
      audio.addEventListener('ended', reset);
      audio.addEventListener('pause', () => { playBtn.textContent = '▶'; });
      audio.addEventListener('play', () => { playBtn.textContent = '❚❚'; });

      wrap.addEventListener('click', () => {
        if (audio.paused) {
          // 同页只允许一个语音在放
          log.querySelectorAll('audio').forEach(a => { if (a !== audio) a.pause(); });
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      });

      wrap.appendChild(audio);
      return wrap;
    }

    function renderWave(wave, peaks, progress) {
      const onCount = Math.round((peaks.length) * (progress || 0));
      let html = '';
      for (let i = 0; i < peaks.length; i++) {
        const h = Math.max(3, Math.round(peaks[i] * 22)); // 3..22px
        html += `<i class="${i < onCount ? 'on' : ''}" style="height:${h}px"></i>`;
      }
      wave.innerHTML = html;
    }

    // 柔和静态波形（对称起伏，纯装饰，抽取失败时兜底）
    function fallbackPeaks() {
      const a = [];
      for (let i = 0; i < WAVE_BARS; i++) {
        const t = i / (WAVE_BARS - 1);
        a.push(0.3 + 0.55 * Math.sin(Math.PI * t) * (0.7 + 0.3 * Math.sin(t * 9)));
      }
      return a;
    }

    // 从音频 blob 抽取 N 个振幅峰值（0..1）；用 AudioContext 解码
    async function extractPeaks(blob, n) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      const buf = await blob.arrayBuffer();
      const ctx = new AC();
      try {
        const audioBuf = await ctx.decodeAudioData(buf);
        const data = audioBuf.getChannelData(0);
        const block = Math.floor(data.length / n) || 1;
        const peaks = [];
        let max = 0.0001;
        for (let i = 0; i < n; i++) {
          let sum = 0;
          const start = i * block;
          for (let j = 0; j < block; j++) { const v = data[start + j] || 0; sum += v * v; }
          const rms = Math.sqrt(sum / block);
          peaks.push(rms);
          if (rms > max) max = rms;
        }
        return peaks.map(v => Math.min(1, v / max));   // 归一化到 0..1
      } finally {
        try { ctx.close(); } catch (_) {}
      }
    }

    function fmtTime(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
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

    // ---- 小知开口说话：把回复念出来，气泡加"说话中"动效 ----
    // TTS 走 Qwen3 realtime（aiden 音色 1.1×），失败自动降级浏览器语音，见 lib/tts.js。
    const TTS = global.TTS;
    function speakZhi(text, bubbleEl) {
      if (!TTS || !TTS.isEnabled()) return;
      // 朗读时移除 Markdown 记号，念起来才干净（去掉 #/*/`/链接等）
      const speakText = (text || '')
        .replace(/```[\s\S]*?```/g, '')          // 代码块不念
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')     // 图片
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // 链接留文字
        .replace(/[#>*_~|-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!speakText) return;
      TTS.speak(speakText, {
        onStart: () => { if (bubbleEl) bubbleEl.classList.add('speaking'); },
        onEnd:   () => { if (bubbleEl) bubbleEl.classList.remove('speaking'); },
        onError: (e) => {
          if (bubbleEl) bubbleEl.classList.remove('speaking');
          // 把失败原因显出来，别再静默——方便定位"没声"是权限还是连接还是播放被挡
          console.warn('[TTS] speak failed:', e);
          toastChat('语音没出声：' + (e && e.message ? e.message : e));
        },
      });
    }

    // ---- 顶部语音开关（默认开，localStorage 记忆）----
    const voiToggle = el.querySelector('#voiToggle');
    function syncVoiBtn() {
      const on = TTS ? TTS.isEnabled() : false;
      voiToggle.classList.toggle('on', on);
      const lb = voiToggle.querySelector('.voi-lb');
      if (lb) lb.textContent = on ? '语音' : '静音';
      voiToggle.title = on ? '小知语音回复：开（点击静音）' : '小知语音回复：关（点击开启）';
    }
    if (!TTS) { voiToggle.style.display = 'none'; }
    else {
      syncVoiBtn();
      voiToggle.onclick = () => { TTS.toggle(); if (!TTS.isEnabled()) TTS.stop(); syncVoiBtn(); };
    }

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
      const b = bubble('zhi', text);
      history.push({ role: 'assistant', content: text });
      // 开场白是"进页面自动出现"，此刻用户还没手势 → 直接念会被浏览器自动播放策略掐掉
      // （报 "AudioContext was not allowed to start"）。等首次交互解锁后再念。
      if (TTS && TTS.whenReady) TTS.whenReady(() => speakZhi(text, b));
      else speakZhi(text, b);
    }

    // ---- 用户发送（文字或语音转写共用）----
    async function respond(userText, opts) {
      bubble('me', userText, opts);
      history.push({ role: 'user', content: userText });

      const tip = typing();
      let text;
      if (online) {
        try {
          const msgs = history.some(m => m.role === 'system')
            ? history.slice()
            : [{ role: 'system', content: AI.witnessPrompt(events) }, ...history];
          // 知识库：命中用户这句话里的概念（HRV/内感受/躯体先于意识…）就临时注入，
          // 让小知讲得又准又接地气。只进本次请求，不落 history，不污染后续对话。
          const kb = global.KB ? global.KB.buildInjection(userText) : '';
          if (kb) msgs.push({ role: 'system', content: kb });
          text = await AI.chat(msgs);
        } catch (e) {
          text = mockReply(userText) + `\n（AI 调用失败，已用本地兜底：${e.message}）`;
        }
      } else {
        text = mockReply(userText);
      }
      tip.remove();
      const b = bubble('zhi', text);
      history.push({ role: 'assistant', content: text });
      speakZhi(text, b);
    }

    function send() {
      const t = input.value.trim();
      if (!t) return;
      input.value = '';
      input.style.height = 'auto';
      respond(t);
    }

    sendBtn.onclick = send;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    // ================= 语音输入：敲两下伙伴开始 / 再敲两下结束 =================
    // 原始音频用 MediaRecorder 录（停顿随意，存 IndexedDB）；
    // 文字稿用 Web Speech 连续识别，静音断了就自动重启，把停顿缝过去；
    // 结束条件：双击 toggle 或点麦克风；只有 5 分钟硬上限做保险，不做静音自动停。
    const micBtn = el.querySelector('#chatMic');
    const recBar = el.querySelector('#recBar');
    const recText = el.querySelector('#recText');
    const MAX_MS = 5 * 60 * 1000;

    const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    const voice = {
      recording: false,
      mediaRecorder: null,
      chunks: [],
      stream: null,
      recog: null,
      finalText: '',
      interimText: '',    // 当前 session 尚未 finalize 的临时文本（关键：不能丢）
      capTimer: null,
      lastErr: '',        // 诊断：记录最近一次 SpeechRecognition 错误码
      resultCount: 0,     // 诊断：收到过多少次 onresult
      // —— 自动重启熔断（关键：连不到识别后端时，若无限重启会打满主线程、整页卡死）——
      recogFails: 0,      // 连续"秒退"失败计数
      recogDead: false,   // 熔断后不再重启识别，仅保留录音
      recogStartAt: 0,    // 本段 session 的启动时刻，用于判定"是否秒退"
      restartTimer: null, // 节流重启的定时器句柄

      async start() {
        if (this.recording) return;
        // live 同频：用户一开口，小知立刻噤声开始听（打断正在念的语音）
        if (global.TTS) { try { global.TTS.stop(); } catch (_) {} }
        el.querySelectorAll('.msg.zhi.speaking').forEach(m => m.classList.remove('speaking'));
        // 1) 拿麦克风 + 录原始音频
        // 安全上下文检查：http://IP 访问时浏览器会把 mediaDevices 变 undefined，
        // 麦克风/蓝牙/语音识别全废、TTS 也连不上——这才是"被拒"的真正原因。
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          toastChat(location.protocol === 'https:'
            ? '此浏览器不支持麦克风'
            : '请用 localhost 或 https 打开（当前地址不安全，麦克风/语音都会失效）');
          return;
        }
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          const map = {
            NotAllowedError: '麦克风权限被拒绝，请在浏览器地址栏允许麦克风',
            NotFoundError: '没检测到麦克风设备',
            NotReadableError: '麦克风被其它程序占用了',
          };
          toastChat(map[e && e.name] || ('麦克风打不开：' + (e && e.name || e)));
          return;
        }
        this.chunks = [];
        try {
          this.mediaRecorder = new MediaRecorder(this.stream);
          this.mediaRecorder.ondataavailable = (ev) => { if (ev.data.size) this.chunks.push(ev.data); };
          this.mediaRecorder.start();
        } catch (e) { /* 某些环境不支持指定 mime，忽略 */ }

        // 2) 连续语音识别（拿文字稿；静音断开自动重启，缝合停顿）
        this.finalText = '';
        this.interimText = '';
        this.resultCount = 0;
        this.lastErr = '';
        this.recogFails = 0;      // 每次新录音重置熔断状态
        this.recogDead = false;
        clearTimeout(this.restartTimer);
        if (SR) {
          this._startRecog();
        }

        this.recording = true;
        micBtn.classList.add('rec');
        recBar.classList.add('on');
        recText.textContent = SR ? '正在聆听你说…' : '正在录音…(此浏览器不支持转写，仅存音频)';
        this.capTimer = setTimeout(() => this.stop(), MAX_MS);
      },

      _startRecog() {
        const r = new SR();
        r.lang = 'zh-CN';
        r.continuous = true;
        r.interimResults = true;
        this.recogStartAt = Date.now();
        let sessionGotResult = false;   // 本段 session 是否出过结果（判定"秒退失败"用）
        r.onresult = (ev) => {
          this.resultCount++;
          sessionGotResult = true;
          this.recogFails = 0;   // 出过结果 → 识别是好的，清零熔断计数
          let interim = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const res = ev.results[i];
            if (res.isFinal) this.finalText += res[0].transcript;
            else interim += res[0].transcript;
          }
          // 关键修复：把当前未 finalize 的 interim 也留住。很多情况下（连续识别 +
          // 静音重启 + 用户点结束太快）isFinal 一直不来，若只认 final 会整句丢失。
          this.interimText = interim;
          recText.textContent = (this.finalText + interim).slice(-40) || '正在聆听你说…';
        };
        r.onend = () => {
          // 一段 session 结束：把这段的 interim 落袋为 final，避免重启时被清空丢失。
          if (this.interimText) { this.finalText += this.interimText; this.interimText = ''; }
          // 用户已点结束（recording=false）→ 这是收尾的那次 onend，通知 stop() 可以读文字了。
          if (!this.recording) {
            if (this._onRecogEnd) { const cb = this._onRecogEnd; this._onRecogEnd = null; cb(); }
            return;
          }
          if (this.recogDead) return;   // 已熔断：只录音，不再重启识别
          // 根因修复：连不到识别后端时会"一启动就 end"，若同步立即 r.start() 会形成
          // start→error→end→start 的高频风暴，打满主线程 → 整页卡死、伙伴手势也被拖垮。
          // 对策：① 秒退（<1.2s 就结束且这段没出过结果）计一次失败，累计到阈值即熔断；
          //       ② 重启一律用 setTimeout 让出主线程（哪怕正常静音重启，也不再同步递归）。
          const lived = Date.now() - this.recogStartAt;
          if (lived < 1200 && !sessionGotResult) {
            this.recogFails++;   // 启动后 <1.2s 就结束且没出过结果 → 判为一次"秒退失败"
          }
          if (this.recogFails >= 3) {
            this.recogDead = true;
            recText.textContent = '此环境无法实时转写，仍在为你录音…';
            return;
          }
          // 秒退时退避重启（越连续失败等越久），正常静音结束则很快续上
          const backoff = this.recogFails > 0 ? Math.min(1500, 300 * this.recogFails) : 120;
          clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            if (this.recording && !this.recogDead) { try { r.start(); } catch (_) {} }
          }, backoff);
        };
        r.onerror = (ev) => {
          // 诊断：记录并打印错误码（原来这里被吞掉了，导致无法定位转写失败原因）
          this.lastErr = (ev && ev.error) || 'unknown';
          // 致命错误直接熔断，别再重启（服务不可用 / 权限被拒）
          if (this.lastErr === 'not-allowed' || this.lastErr === 'service-not-allowed' || this.lastErr === 'network') {
            this.recogFails = 99;
          }
          // 只在首次出错时打印一条，避免熔断前的几次重试刷屏（开着 DevTools 时 console 很贵）
          if (this.recogFails <= 1) console.warn('[voice] SpeechRecognition error:', this.lastErr, ev && ev.message);
        };
        this.recog = r;
        try { r.start(); } catch (_) {}
      },

      async stop() {
        if (!this.recording) return;
        this.recording = false;
        clearTimeout(this.capTimer);
        clearTimeout(this.restartTimer);   // 防止已排期的重启在收尾后又启一个识别
        micBtn.classList.remove('rec');
        recBar.classList.remove('on');

        // 等语音识别真正结束再读文字：SpeechRecognition.stop() 是异步的，
        // 最后一批结果和 onend 会稍后到达。短句尤其容易在这个窗口里丢字，
        // 所以这里 await onend（或 700ms 超时兜底），确保 interim 已落袋。
        await new Promise((resolve) => {
          if (!this.recog) { resolve(); return; }
          let done = false;
          const fin = () => { if (done) return; done = true; resolve(); };
          this._onRecogEnd = fin;
          try { this.recog.stop(); } catch (_) { fin(); }
          setTimeout(fin, 700);   // 兜底：个别浏览器 onend 不触发也不卡死
        });
        this.recog = null;

        // 收尾音频 → Blob → 存 IndexedDB
        const finish = async () => {
          let audioId = null;
          if (this.chunks.length) {
            const blob = new Blob(this.chunks, { type: (this.mediaRecorder && this.mediaRecorder.mimeType) || 'audio/webm' });
            audioId = 'rec_' + Date.now();
            try { await AudioStore.save(audioId, blob); } catch (_) { audioId = null; }
          }
          if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }

          // 收尾：把还没 finalize 的 interim 也并进来（用户可能在 onend 前就点了结束）
          const said = (this.finalText + this.interimText).trim();
          this.interimText = '';
          if (said) {
            respond(said, audioId ? { audioId } : undefined);
          } else if (audioId) {
            respond('（我说了一段话，转写没成功，但录音留下了）', { audioId });
          } else {
            toastChat('没录到内容');
          }
        };

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.onstop = finish;
          try { this.mediaRecorder.stop(); } catch (_) { finish(); }
        } else {
          finish();
        }
      },

      toggle() { this.recording ? this.stop() : this.start(); },
    };

    micBtn.onclick = () => voice.toggle();

    // 敲两下伙伴 → 收到 DBLTAP 手势 → toggle 录音（wireGestureOnce 只挂一次全局监听，指向当前录音器）
    activeVoiceToggle = () => voice.toggle();
    // 离开小知页时把「本次对话」摘进心迹（history 是本次 render 的对话历史）
    activeSummarize = () => saveChatSummary(history);
    wireGestureOnce();
    wireLeaveOnce();

    function toastChat(msg) { recText.textContent = msg; recBar.classList.add('on'); setTimeout(() => recBar.classList.remove('on'), 1600); }

    // 敲伙伴从别的页面跳进来的 → 用户主动想说话，直接开录。
    // 标记由 index.html 全局路由写入；这里消费一次即清掉（避免手动进小知页也误触）。
    let fromRing = false;
    try {
      if (sessionStorage.getItem('hbn.ring.autorecord') === '1') {
        sessionStorage.removeItem('hbn.ring.autorecord');
        fromRing = true;
      }
    } catch (_) {}

    // 用户敲伙伴主动进来是「我有话要说」，此时小知的证据开场白会打断分享 → 跳过开场，直接开录。
    // 手动点进来（非敲击）才由小知带证据主动开场。
    if (fromRing) {
      // 稍等一拍，让页面 DOM 先就位，再唤起录音（内含 getUserMedia + 解锁 TTS）
      setTimeout(() => { try { voice.start(); } catch (_) {} }, 350);
    } else {
      opening();
    }
  }

  global.Pages = global.Pages || {};
  global.Pages.chat = { render };
})(typeof window !== 'undefined' ? window : globalThis);
