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
  function wireGestureOnce() {
    if (_gestureWired) return;
    _gestureWired = true;
    global.addEventListener('ring:gesture', (e) => {
      const s = ((e.detail && e.detail.gesture) || '').toUpperCase();
      if (s.indexOf('TAP') < 0) return;
      const now = Date.now();
      if (now - _lastGestureAt < 800) return;
      _lastGestureAt = now;
      if (activeVoiceToggle) activeVoiceToggle();
    });
  }

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
    // 无 API Key 时也能演示知识库：命中就用知识卡的话术直接接地气讲一段
    if (global.KB) {
      const hit = global.KB.retrieve(t, 1)[0];
      if (hit) return hit.oneLine + '\n\n' + hit.plain;
    }
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
        .msg{max-width:86%;padding:10px 13px;border-radius:16px;font-size:15px;line-height:1.5;white-space:pre-wrap;word-break:break-word;}
        /* 纯语音气泡：宽度跟着语音条走，不被强行撑肥 */
        .msg.voice-only{max-width:100%;width:fit-content;padding:8px;}
        .msg.zhi{align-self:flex-start;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-bottom-left-radius:5px;}
        .msg.me{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:5px;}
        .msg.typing{color:var(--sub);font-style:italic;}
        .chat-in{display:flex;gap:8px;padding:10px 0 2px;align-items:flex-end;}
        .chat-in textarea{flex:1;resize:none;border:1px solid var(--line);border-radius:14px;
          padding:10px 12px;font-size:15px;font-family:var(--font);max-height:96px;background:var(--surface);color:var(--ink);}
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
        <div class="rec-bar" id="recBar">
          <span class="rec-dot"></span>
          <span id="recText">正在聆听你说…</span>
          <span class="rec-hint">再敲两下戒指 / 点麦克风 结束</span>
        </div>
        <div class="chat-in">
          <button class="chat-mic" id="chatMic" title="敲两下戒指或点这里开始说话" aria-label="语音输入">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3"></rect>
              <path d="M5 11a7 7 0 0 0 14 0"></path>
              <line x1="12" y1="18" x2="12" y2="21"></line>
            </svg>
          </button>
          <textarea id="chatInput" rows="1" placeholder="想说点什么…不想说也没关系"></textarea>
          <button id="chatSend">发送</button>
        </div>
        <div class="chat-tip">敲两下戒指即可开口对小知说话 · 录音只存在你本机，不上传 · 危机可拨 400-161-9995</div>
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
      bubble('zhi', text);
      history.push({ role: 'assistant', content: text });
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

    // ================= 语音输入：敲两下戒指开始 / 再敲两下结束 =================
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

      async start() {
        if (this.recording) return;
        // 1) 拿麦克风 + 录原始音频
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          toastChat('麦克风权限被拒绝，无法录音'); return;
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
        r.onresult = (ev) => {
          this.resultCount++;
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
          // 录音还在进行 → 静音导致的自然结束，自动重启把停顿缝过去
          try { r.start(); } catch (_) {}
        };
        r.onerror = (ev) => {
          // 诊断：记录并打印错误码（原来这里被吞掉了，导致无法定位转写失败原因）
          this.lastErr = (ev && ev.error) || 'unknown';
          console.warn('[voice] SpeechRecognition error:', this.lastErr, ev && ev.message);
        };
        this.recog = r;
        try { r.start(); } catch (_) {}
      },

      async stop() {
        if (!this.recording) return;
        this.recording = false;
        clearTimeout(this.capTimer);
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

    // 敲两下戒指 → 收到 DBLTAP 手势 → toggle 录音（wireGestureOnce 只挂一次全局监听，指向当前录音器）
    activeVoiceToggle = () => voice.toggle();
    wireGestureOnce();

    function toastChat(msg) { recText.textContent = msg; recBar.classList.add('on'); setTimeout(() => recBar.classList.remove('on'), 1600); }

    opening();
  }

  global.Pages = global.Pages || {};
  global.Pages.chat = { render };
})(typeof window !== 'undefined' ? window : globalThis);
