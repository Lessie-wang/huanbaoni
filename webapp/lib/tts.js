/**
 * tts.js — 小知「开口说话」语音合成层（Qwen3-TTS realtime，流式低延迟）
 *
 * 为什么存在：戒指不会发声，小知的声音从手机/电脑扬声器出。
 *   敲戒指说话 → 转写 → 小知思考出文字 → 这里把文字念出来 → 形成 live 语音问答闭环。
 *
 * 链路（实测通过，见接入文档 §4.1）：
 *   连 wss → 发 session.config → 发 input.text → 发 input.done
 *   服务端回：文本事件(audio.start/audio.done/session.done/error) + 二进制帧(PCM16 24k mono)
 *   首音频延迟实测 ~0.11s，边收边播贴这个低延迟。
 *
 * 播放：Web Audio API 把流式 PCM16 边收边解码成 AudioBuffer 排队无缝播，
 *   playbackRate=1.1 提速（去拖沓，略升调让 aiden 更清润），队列衔接避免"忽停忽赶"。
 *
 * 兜底：wss 连不上/超时/报错 → 自动降级浏览器 speechSynthesis，保证现场不哑火。
 *
 * 用法：
 *   TTS.setEnabled(true/false)          // 总开关（chat 页顶部按钮 + localStorage 记忆）
 *   await TTS.speak(text, {onStart, onEnd, onError})
 *   TTS.stop()                          // 立刻噤声（用户开始录音时打断小知）
 *   TTS.isEnabled() / TTS.isSpeaking()
 */
(function (global) {
  'use strict';

  const LS_KEY = 'hbn.tts.enabled';
  const LS_RATE = 'hbn.tts.rate';

  // playbackRate 提速会整体升调（服务端原生 speed 在流式下不支持，只能客户端提速）：
  // 1.10 升调轻；1.25 明显更快、升调仍在可接受范围；1.3+ 开始发尖发"电子"。
  // 默认取 1.25（用户要求更快）。可用 TTS.setRate() 实时微调，localStorage 记忆。
  // 注意：这些必须定义在 CFG 之前——CFG.rate 会立即调用 _loadRate()，
  // 而 const 有暂时性死区，提前访问 DEFAULT_RATE 会抛 ReferenceError。
  const DEFAULT_RATE = 1.25;
  function _loadRate() {
    try { const v = parseFloat(localStorage.getItem(LS_RATE)); return (v > 0.5 && v < 3) ? v : DEFAULT_RATE; }
    catch (_) { return DEFAULT_RATE; }
  }

  const CFG = {
    url: 'wss://joiagent.devops.beta.xiaohongshu.com/tts/qwen3cus/v1/audio/speech/stream',
    model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
    voice: 'aiden',        // 用户选定：温柔清润男声（女声备选 vivian）
    rate: _loadRate(),     // 语速倍速；持久化，可 TTS.setRate() 实时调
    sampleRate: 24000,     // 服务端固定 PCM16 24kHz mono
    connectTimeoutMs: 6000,
    firstAudioTimeoutMs: 8000,   // 首个音频帧最久等多久，超了就降级
  };

  const state = {
    enabled: _loadEnabled(),
    ws: null,
    ctx: null,          // AudioContext
    nextStartAt: 0,     // 下一帧应当开始播放的绝对时间（无缝衔接队列）
    sources: [],        // 已排期的 AudioBufferSourceNode，stop 时全部掐掉
    speaking: false,
    seq: 0,             // 每次 speak 自增，用于丢弃过期会话的回调
    synthUtter: null,   // speechSynthesis 兜底句柄
    unlocked: false,    // AudioContext 是否已被用户手势解锁（否则出不了声）
  };

  const readyCbs = [];   // 等解锁后要跑的回调（如：开场白等首次交互再念）

  function _loadEnabled() {
    try {
      const v = localStorage.getItem(LS_KEY);
      return v === null ? true : v === '1';   // 默认开
    } catch (_) { return true; }
  }

  function _ensureCtx() {
    if (!state.ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      state.ctx = new AC();
    }
    if (state.ctx.state === 'suspended') { try { state.ctx.resume(); } catch (_) {} }
    return state.ctx;
  }

  // 浏览器自动播放策略：AudioContext 必须在用户手势（点/摸/按）之后才能 resume 出声，
  // 否则报 "The AudioContext was not allowed to start"。这是"开场白没声"的根因。
  //
  // 做两件事：
  //   1) 首次交互时 resume AudioContext，标记 unlocked，并触发所有 whenReady 回调
  //      （开场白就挂在这里等——不再"进页面自动念"被浏览器掐掉）。
  //   2) resume() 是异步的，必须在它 resolve 之后才判定解锁成功、才摘监听。
  (function wireUnlock() {
    if (!global.addEventListener) return;
    const unlock = () => {
      const ctx = _ensureCtx();
      if (!ctx) { _markUnlocked(); return; }   // 没有 AudioContext（老浏览器）→ 走兜底也算 ready
      const finish = () => {
        if (ctx.state === 'running') {
          global.removeEventListener('pointerdown', unlock);
          global.removeEventListener('touchend', unlock);
          global.removeEventListener('keydown', unlock);
          _markUnlocked();
        }
      };
      // resume 是 Promise；等它真跑完再判定
      try { const p = ctx.resume(); if (p && p.then) p.then(finish, finish); else finish(); }
      catch (_) { finish(); }
    };
    global.addEventListener('pointerdown', unlock);
    global.addEventListener('touchend', unlock);
    global.addEventListener('keydown', unlock);
  })();

  function _markUnlocked() {
    if (state.unlocked) return;
    state.unlocked = true;
    while (readyCbs.length) { try { readyCbs.shift()(); } catch (_) {} }
  }

  // 注册"解锁后执行"的回调。已解锁则立刻跑（下一个微任务）。
  // 开场白用它：等用户第一次碰页面再念，绕过自动播放拦截。
  function whenReady(cb) {
    if (typeof cb !== 'function') return;
    if (state.unlocked) { Promise.resolve().then(cb); return; }
    readyCbs.push(cb);
  }

  // 把一块 PCM16-LE 转成 AudioBuffer 并排到播放队列末尾（无缝衔接）
  function _enqueuePCM(bytes) {
    const ctx = _ensureCtx();
    if (!ctx) return;
    // 半个样本对齐容错：字节数应为偶数
    const n = bytes.byteLength >> 1;
    if (n === 0) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const f32 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      f32[i] = view.getInt16(i * 2, true) / 32768;
    }
    const buf = ctx.createBuffer(1, n, CFG.sampleRate);
    buf.copyToChannel(f32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = CFG.rate;   // 1.1× 提速（升调让音色更清润）
    src.connect(ctx.destination);

    // 无缝衔接：从 max(now, 上一帧结束点) 开始排期
    const now = ctx.currentTime;
    const startAt = Math.max(now, state.nextStartAt);
    src.start(startAt);
    // 因为提速了，实际播放时长 = 原时长 / rate
    const playDur = buf.duration / CFG.rate;
    state.nextStartAt = startAt + playDur;

    state.sources.push(src);
    src.onended = () => {
      const idx = state.sources.indexOf(src);
      if (idx >= 0) state.sources.splice(idx, 1);
    };
  }

  // 停止所有正在播/已排期的音频 + 关连接 + 停兜底 TTS
  function stop() {
    state.seq++;   // 让当前会话的所有异步回调失效
    state.speaking = false;
    // 掐掉已排期的音源
    state.sources.forEach((s) => { try { s.stop(); } catch (_) {} try { s.disconnect(); } catch (_) {} });
    state.sources = [];
    state.nextStartAt = 0;
    // 关 ws
    if (state.ws) {
      try { state.ws.onmessage = state.ws.onerror = state.ws.onclose = null; } catch (_) {}
      try { state.ws.close(); } catch (_) {}
      state.ws = null;
    }
    // 关兜底
    if (global.speechSynthesis) { try { global.speechSynthesis.cancel(); } catch (_) {} }
    state.synthUtter = null;
  }

  // 浏览器自带兜底（wss 不可用时）：尽量挑个中文声，语速也跟随 CFG.rate
  function _speakFallback(text, opts, mySeq) {
    console.warn('[TTS] 走降级：浏览器自带语音（Qwen3 wss 未连上，音质会明显变差/变慢）');
    const synth = global.speechSynthesis;
    if (!synth || !global.SpeechSynthesisUtterance) {
      if (opts.onError) opts.onError(new Error('无可用 TTS'));
      if (opts.onEnd) opts.onEnd();
      return;
    }
    try { synth.cancel(); } catch (_) {}
    const u = new global.SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = Math.min(2, Math.max(1, CFG.rate + 0.15));   // 降级音本就偏慢，再补一点速
    const pick = () => {
      const vs = synth.getVoices() || [];
      const zh = vs.find(v => /zh|中文|Chinese/i.test(v.lang + ' ' + v.name));
      if (zh) u.voice = zh;
    };
    pick();
    if (!(synth.getVoices() || []).length) {
      // 有些浏览器 voices 异步加载
      synth.onvoiceschanged = () => { if (state.seq === mySeq) pick(); };
    }
    u.onend = () => { if (state.seq === mySeq) { state.speaking = false; if (opts.onEnd) opts.onEnd(); } };
    u.onerror = () => { if (state.seq === mySeq) { state.speaking = false; if (opts.onError) opts.onError(new Error('speechSynthesis error')); if (opts.onEnd) opts.onEnd(); } };
    state.synthUtter = u;
    synth.speak(u);
  }

  // 数字→中文读法：TTS 遇到阿拉伯数字有时按英文念（"14:32" 念成 one-four-three-two）。
  // 送合成前统一转成中文，避免现场蹦英文。只作用于合成文本，屏幕原文照旧显示阿拉伯数字。
  const _DIG = ['零','一','二','三','四','五','六','七','八','九'];
  function _digits(s) { return String(s).split('').map(c => (c >= '0' && c <= '9') ? _DIG[+c] : c).join(''); }
  // 两位数自然读法：14→十四，30→三十，5→五，09→九（时间里的分钟按整数读更自然）
  function _twoDigit(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) return '';
    if (n < 10) return _DIG[n];
    if (n < 20) return '十' + (n % 10 ? _DIG[n % 10] : '');
    const t = Math.floor(n / 10), o = n % 10;
    return _DIG[t] + '十' + (o ? _DIG[o] : '');
  }
  function _numToZh(text) {
    return String(text || '')
      // 时间 HH:MM → 十四点三十二（先处理，冒号才不会被后面误伤）
      .replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => _twoDigit(h) + '点' + (m === '00' ? '整' : _twoDigit(m)))
      // 电话/长串数字（含连字符，如 400-161-9995）→ 逐位中文，去掉连字符
      .replace(/\d[\d-]{4,}\d/g, (s) => _digits(s.replace(/-/g, '')))
      // 百分比 → 百分之X
      .replace(/(\d+)%/g, (_, n) => '百分之' + _digits(n))
      // 其余零散数字 → 逐位中文（简单稳妥，避免"一千零二"式歧义）
      .replace(/\d+/g, (s) => _digits(s));
  }

  /**
   * 合成文本规整：服务端 split_granularity='sentence' 按句末标点(。！？)分段，
   * 每段独立合成会让克隆音色 aiden 逐句"起调"→声线漂移（paragraph 选项已被服务端废弃）。
   * 解法：把句末标点替换成逗号，让整段回复被当作「一句」一次性合成，声线连成一条线。
   * 实测：无句末标点 → audio.start 只 1 段（等效老 paragraph），首音频还更快(~330ms)。
   * 另：数字统一转中文读法，避免 TTS 蹦英文。只作用于「送去合成的文本」，屏幕原文不受影响。
   */
  function _forOneShot(text) {
    return _numToZh(String(text || ''))
      .replace(/[。！？!?]+/g, '，')   // 句末终止符 → 逗号（保留自然停顿，不再分段）
      .replace(/[，、;；：:]*，/g, '，') // 连续标点收敛成单个逗号
      .replace(/，\s*$/,'')            // 去掉结尾多余逗号
      .trim();
  }

  /**
   * 念一段文字。返回 Promise，播放结束（或降级结束）时 resolve。
   * opts: { onStart(), onEnd(), onError(e) }
   */
  function speak(text, opts = {}) {
    text = (text || '').trim();
    if (!state.enabled || !text) { if (opts.onEnd) opts.onEnd(); return Promise.resolve(); }

    // 新一次朗读：先掐掉上一次
    stop();
    const mySeq = ++state.seq;
    state.speaking = true;

    return new Promise((resolve) => {
      const done = (err) => {
        if (state.seq !== mySeq) { resolve(); return; }   // 已被更新的会话取代
        state.speaking = false;
        if (err && opts.onError) opts.onError(err);
        if (opts.onEnd) opts.onEnd();
        resolve();
      };

      // 没有 WebSocket / AudioContext → 直接兜底
      if (!global.WebSocket || !(global.AudioContext || global.webkitAudioContext)) {
        _speakFallback(text, { ...opts, onEnd: () => done() }, mySeq);
        return;
      }

      let ws;
      try { ws = new global.WebSocket(CFG.url); }
      catch (_) { _speakFallback(text, { ...opts, onEnd: () => done() }, mySeq); return; }
      ws.binaryType = 'arraybuffer';
      state.ws = ws;
      _ensureCtx();

      console.log('[TTS] ⏳ 连接 Qwen3 wss …', CFG.url);
      let opened = false, gotFirstAudio = false, startedCb = false;
      const connectTimer = setTimeout(() => {
        if (!opened && state.seq === mySeq) { console.warn('[TTS] ✗ 降级原因：连接超时（' + CFG.connectTimeoutMs + 'ms 内未 onopen）'); try { ws.close(); } catch (_) {} _speakFallback(text, { ...opts, onEnd: () => done() }, mySeq); }
      }, CFG.connectTimeoutMs);
      const firstAudioTimer = setTimeout(() => {
        if (!gotFirstAudio && state.seq === mySeq) { console.warn('[TTS] ✗ 降级原因：已连上但 ' + CFG.firstAudioTimeoutMs + 'ms 内没收到音频帧（服务端没出声，多半是 config 参数不被接受）'); try { ws.close(); } catch (_) {} _speakFallback(text, { ...opts, onEnd: () => done() }, mySeq); }
      }, CFG.firstAudioTimeoutMs);

      ws.onopen = () => {
        opened = true; clearTimeout(connectTimer);
        console.log('[TTS] ✅ wss 已连上，发送 config/text …');
        if (state.seq !== mySeq) { try { ws.close(); } catch (_) {} return; }
        try {
          ws.send(JSON.stringify({
            type: 'session.config', model: CFG.model, voice: CFG.voice,
            task_type: 'CustomVoice', language: 'Auto', response_format: 'pcm',
            // ⚠️ split_granularity 服务端只接受 'sentence' | 'clause'（'paragraph' 已被拒，报 literal_error）。
            // 取 'sentence'：整句一次合成，比 'clause'（按短句/从句切，更碎）音色更连贯，
            // 是当前可选项里最接近"整段一致"的。小知回复本就 1-2 句，逐句漂移影响有限。
            stream_audio: true, split_granularity: 'sentence', max_new_tokens: 1024,
          }));
          ws.send(JSON.stringify({ type: 'input.text', text: _forOneShot(text) }));
          ws.send(JSON.stringify({ type: 'input.done' }));
        } catch (_) { try { ws.close(); } catch (_) {} _speakFallback(text, { ...opts, onEnd: () => done() }, mySeq); }
      };

      ws.onmessage = (ev) => {
        if (state.seq !== mySeq) return;   // 过期会话，丢弃
        if (ev.data instanceof ArrayBuffer) {
          if (!gotFirstAudio) {
            gotFirstAudio = true; clearTimeout(firstAudioTimer);
            console.log('[TTS] ✅ Qwen3 出声（' + CFG.voice + ' @ ' + CFG.rate + '×）');
            if (!startedCb) { startedCb = true; if (opts.onStart) opts.onStart(); }
          }
          _enqueuePCM(new Uint8Array(ev.data));
          return;
        }
        // 文本事件
        let e; try { e = JSON.parse(ev.data); } catch (_) { return; }
        const t = e && e.type;
        if (t === 'audio.start') {
          if (!startedCb) { startedCb = true; if (opts.onStart) opts.onStart(); }
        } else if (t === 'audio.done') {
          // ⚠️ audio.done 是"当前这一句"念完，不是整段结束！
          // 服务端按句分段：每句一对 audio.start/audio.done，最后才发 session.done。
          // 千万不能在这里 close，否则第一句一完就掐断，后面所有句子全丢（"掉最后一句"的真凶）。
          /* 忽略，继续接收后续句子的音频与事件 */
        } else if (t === 'error') {
          clearTimeout(firstAudioTimer);
          console.warn('[TTS] ✗ 服务端返回 error 事件：', ev.data);
          try { ws.close(); } catch (_) {}
          // 还没出过声才降级；已经在放了就当正常收尾
          if (!gotFirstAudio) _speakFallback(text, { ...opts, onEnd: () => done() }, mySeq);
          else _waitDrainThenDone(mySeq, done);
        } else if (t === 'session.done') {
          // 整段真正说完了；等播放队列排空再回调 onEnd
          try { ws.close(); } catch (_) {}
          state.ws = null;
          _waitDrainThenDone(mySeq, done);
        }
      };

      ws.onerror = (ev) => {
        if (state.seq !== mySeq) return;
        clearTimeout(connectTimer); clearTimeout(firstAudioTimer);
        console.warn('[TTS] ✗ 降级原因：wss onerror（连接握手失败/被拒/网络不通）', ev);
        if (!gotFirstAudio) { try { ws.close(); } catch (_) {} _speakFallback(text, { ...opts, onEnd: () => done() }, mySeq); }
      };
      ws.onclose = () => {
        if (state.seq !== mySeq) return;
        // 正常收尾走的是 session.done 分支；这里兜住"没收到 done 就断了但已出声"的情况
        if (gotFirstAudio) _waitDrainThenDone(mySeq, done);
      };
    });
  }

  // 等已排期的音频播完（nextStartAt 到点）再触发 onEnd，避免尾字被切
  function _waitDrainThenDone(mySeq, done) {
    const ctx = state.ctx;
    if (!ctx) { done(); return; }
    const remainMs = Math.max(0, (state.nextStartAt - ctx.currentTime) * 1000);
    setTimeout(() => {
      if (state.seq === mySeq) done();
    }, remainMs + 60);
  }

  const TTS = {
    speak, stop, whenReady,
    isUnlocked() { return state.unlocked; },
    isEnabled() { return state.enabled; },
    isSpeaking() { return state.speaking; },
    setEnabled(on) {
      state.enabled = !!on;
      try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch (_) {}
      if (!on) stop();
      return state.enabled;
    },
    toggle() { return TTS.setEnabled(!state.enabled); },
    setVoice(v) { if (v) CFG.voice = v; return CFG.voice; },
    setRate(r) {
      const n = parseFloat(r);
      if (n > 0.5 && n < 2.5) {
        CFG.rate = n;
        try { localStorage.setItem(LS_RATE, String(n)); } catch (_) {}
      }
      return CFG.rate;
    },
    get voice() { return CFG.voice; },
    get rate() { return CFG.rate; },
  };

  global.TTS = TTS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { TTS };
})(typeof window !== 'undefined' ? window : globalThis);
