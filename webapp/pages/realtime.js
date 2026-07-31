/**
 * realtime.js — 环抱(实时主页) P0
 * 依赖契约层：window.ring（mock 或 ble）、Store、tokens.css
 * 注册到 window.Pages['realtime']
 */
(function () {
  'use strict';

  const LEVELS = {
    low:  { color: 'var(--calm)', label: '平静', desc: '此刻很安稳' },
    mid:  { color: 'var(--mid)',  label: '微澜', desc: '有点小波动' },
    high: { color: 'var(--high)', label: '起伏', desc: '压力升高了' },
    crit: { color: 'var(--high)', label: '强烈', desc: '身体绷得很紧' },
  };

  const STATUS_TEXT = {
    idle: '未连接', connecting: '连接中…', connected: '已连接',
    baseline: '正在采集基线…', monitoring: '监测中', disconnected: '已断开',
    unsupported: '浏览器不支持蓝牙',
  };

  // 页面级状态
  let el, ring;
  let monitoring = false;
  let lastLevel = 'low';
  // 分档去抖 / 冷却
  let highStreak = 0, midStreak = 0;
  let highCooldownUntil = 0, midCooldownUntil = 0;
  let bound = false;

  // ── 个人基线统计（z-score 标准化的核心，见 docs/科学依据.md）──
  // 佩戴后采集静息基线的 均值μ + 标准差σ；之后把每路信号换算成
  // "偏离个人基线多少个标准差"，等权融合成压力指数（无量纲、无需拍权重）。
  let bHr = [], bHrv = [], bGsr = [];
  const base = { hr: { m: 0, s: 1 }, hrv: { m: 0, s: 1 }, gsr: { m: 0, s: 1 }, ready: false };

  // 运动量阈值（°/s 级，来自 gy521test 实测：静息~个位数，晃动数百）
  const MOTION_MID = 60, MOTION_HIGH = 200, FIDGET_LO = 25;

  function meanStd(arr, sFloor) {
    if (!arr.length) return { m: 0, s: sFloor };
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length;
    // 标准差设下限（传感器噪声地板），防止基线太平导致 z 爆炸
    return { m, s: Math.max(Math.sqrt(v), sFloor) };
  }

  function computeBaseline() {
    base.hr  = meanStd(bHr, 2);    // HR 噪声地板 ~2bpm
    base.hrv = meanStd(bHrv, 3);   // HRV 噪声地板 ~3ms
    base.gsr = meanStd(bGsr, 15);  // GSR 噪声地板 ~15
    base.ready = bHr.length >= 3;
  }

  // 压力指数：个人基线 z-score 等权融合 + 运动门控 + 坐立不安加分
  // 返回 { z, level }，level 按统计过程控制分级：1σ→mid 2σ→high 3σ→crit
  function stressIndex(d) {
    if (!base.ready) return { z: 0, level: 'low' };
    const zHr = (d.hr - base.hr.m) / base.hr.s;                 // 心率↑ = 正
    const zHrv = d.hrv ? (d.hrv - base.hrv.m) / base.hrv.s : 0; // HRV↓ = 压力，故取 -zHrv
    const parts = [zHr, -zHrv];
    if (d.gsr != null && !isNaN(d.gsr)) parts.push((d.gsr - base.gsr.m) / base.gsr.s); // 皮肤电↑ = 正
    let z = parts.reduce((a, b) => a + b, 0) / parts.length;

    const m = d.motion;
    if (m != null && !isNaN(m)) {
      // 坐立不安：静止下的小幅持续抖动，本身是焦虑信号 → 轻微加分
      if (m > FIDGET_LO && m < MOTION_HIGH) z += 0.3;
      // 运动门控：剧烈运动时心率升高多为体力活动而非情绪 → 衰减（情境感知）
      const act = m > MOTION_HIGH ? 0.3 : m > MOTION_MID ? 0.7 : 1.0;
      z *= act;
    }

    let level = 'low';
    if (z > 3) level = 'crit';        // 3σ SPC 报警线
    else if (z > 2) level = 'high';   // 2σ SPC 警戒线
    else if (z > 1) level = 'mid';    // 1σ 苗头（干预成本低，偏早发现）
    return { z, level };
  }

  function render(container) {
    el = container;
    ring = window.ring;

    el.innerHTML = `
      <div class="rt-wrap">
        <div class="rt-status">
          <span class="dot" id="rtDot"></span>
          <span id="rtStatus">未连接</span>
        </div>

        <div class="rt-ring card" id="rtRingCard">
          <svg viewBox="0 0 200 200" class="rt-svg">
            <circle cx="100" cy="100" r="86" fill="none" stroke="var(--line)" stroke-width="14"/>
            <circle cx="100" cy="100" r="86" fill="none" id="rtArc"
              stroke="var(--calm)" stroke-width="14" stroke-linecap="round"
              stroke-dasharray="540" stroke-dashoffset="540"
              transform="rotate(-90 100 100)" style="transition:stroke .6s ease,stroke-dashoffset .6s ease"/>
          </svg>
          <div class="rt-center">
            <div class="rt-hr" id="rtHr">--</div>
            <div class="rt-unit">BPM · 实时心率</div>
            <div class="rt-level" id="rtLevel">等待连接</div>
          </div>
        </div>

        <div class="rt-meta">
          <div class="rt-meta-item"><div class="v" id="rtHrv">--</div><div class="k">HRV (ms)</div><div class="d">心率变异性·越高越放松</div></div>
          <div class="rt-meta-item"><div class="v" id="rtGsr">--</div><div class="k">皮肤电</div><div class="d">情绪唤醒·先于意识升高</div></div>
          <div class="rt-meta-item"><div class="v" id="rtMotion">--</div><div class="k">运动 (°/s)</div><div class="d">手部活动·区分紧张与运动</div></div>
          <div class="rt-meta-item"><div class="v" id="rtHug">0</div><div class="k">今日被环抱</div></div>
        </div>

        <div class="rt-actions">
          <button id="rtConnect">连接伙伴</button>
          <button class="ghost" id="rtStress">模拟一次压力</button>
        </div>

        <div class="rt-haptics card">
          <div class="rt-tl-title">测试三档干预触觉</div>
          <div class="rt-haptic-btns">
            <button class="ghost" data-mode="intercept">档一·拦截<small>轻促短震</small></button>
            <button class="ghost" data-mode="anchor">档二·锚点<small>呼吸 吸4·呼6</small></button>
            <button class="ghost" data-mode="retreat">档三·撤退<small>两下长震</small></button>
          </div>
        </div>

        <div class="rt-trend card">
          <div class="rt-tl-title">今日情绪起伏 · 24h</div>
          <div id="rtTrend"></div>
          <div class="rt-trend-legend">
            <span><i class="hi"></i>压力升高</span>
            <span><i class="calm-band"></i>平静地带</span>
            <span><i class="lo"></i>越发平静</span>
          </div>
        </div>

        <div class="rt-timeline card">
          <div class="rt-tl-title">今日心迹</div>
          <div id="rtTimeline"></div>
        </div>
      </div>
    `;

    injectStyle();
    wire();
    refreshTimeline();
    refreshHug();
    renderTrend();
  }

  function wire() {
    const btnC = el.querySelector('#rtConnect');
    const btnS = el.querySelector('#rtStress');

    btnC.onclick = async () => {
      if (monitoring || ring._status === 'connecting') { ring.disconnect(); return; }
      btnC.disabled = true; btnC.textContent = '连接中…';
      try {
        bindRing();
        await ring.connect();
      } catch (e) {
        setStatus('disconnected');
        alert('连接失败：' + (e.message || e));
      } finally {
        btnC.disabled = false;
      }
    };

    btnS.onclick = () => {
      if (typeof ring.simulateStress === 'function') {
        ring.simulateStress();                 // mock：抬升心率，算法自然检测到
        toast('已注入压力，观察心率上升…');
      } else {
        handleHighStress(lastData || { hr: base.hr.m || 80, hrv: 0 }); // 真戒指：直接触发一次
      }
    };

    // 三档触觉手动测试：直接发对应档位指令（连接后可试真戒指的震动手感）
    const LABELS = {
      intercept: '· 档一·拦截：轻促短震',
      anchor:    '🌬️ 档二·锚点：跟着呼吸（吸4·呼6）',
      retreat:   '🫂 档三·撤退：你可以停下来了',
    };
    el.querySelectorAll('.rt-haptic-btns button').forEach(b => {
      b.onclick = () => {
        const mode = b.dataset.mode;
        ring.vibrate(mode);
        pulseRing();
        toast(LABELS[mode] || '戒指震动');
      };
    });
  }

  let lastData = null;
  let lastTrendTs = 0;
  let timelineExpanded = false;

  function bindRing() {
    if (bound) return; bound = true;
    ring.onStatus(setStatus);
    ring.onData(onData);
  }

  function setStatus(s) {
    const t = STATUS_TEXT[s] || s;
    const st = el && el.querySelector('#rtStatus');
    const dot = el && el.querySelector('#rtDot');
    if (st) st.textContent = t;
    if (dot) dot.className = 'dot ' + s;

    const btnC = el && el.querySelector('#rtConnect');
    if (s === 'monitoring') {
      monitoring = true;
      computeBaseline();                 // 基线期结束 → 结算 μ/σ
      if (btnC) btnC.textContent = '断开连接';
    }
    if (s === 'baseline')  { bHr = []; bHrv = []; bGsr = []; base.ready = false; }
    if (s === 'disconnected' || s === 'idle') {
      monitoring = false;
      if (btnC) btnC.textContent = '连接伙伴';
      setLevelUI('low'); const hr = el && el.querySelector('#rtHr'); if (hr) hr.textContent = '--';
      const lv = el && el.querySelector('#rtLevel'); if (lv) lv.textContent = '已断开';
    }
  }

  function onData(d) {
    lastData = d;
    const hrEl = el && el.querySelector('#rtHr');
    const hrvEl = el && el.querySelector('#rtHrv');
    const gsrEl = el && el.querySelector('#rtGsr');
    const motEl = el && el.querySelector('#rtMotion');
    if (!hrEl) return;
    hrEl.textContent = d.hr || '--';
    hrvEl.textContent = d.hrv ? (d.hrv.toFixed ? d.hrv.toFixed(0) : d.hrv) : '--';
    if (gsrEl) gsrEl.textContent = (d.gsr != null && !isNaN(d.gsr)) ? Math.round(d.gsr) : '--';
    if (motEl) motEl.textContent = (d.motion != null && !isNaN(d.motion)) ? Math.round(d.motion) : '--';

    // 采基线阶段：累积样本供结算 μ/σ（连接后 ~5s 的 baseline 状态期）
    if (!monitoring) {
      if (d.hr) bHr.push(d.hr);
      if (d.hrv) bHrv.push(d.hrv);
      if (d.gsr != null && !isNaN(d.gsr)) bGsr.push(d.gsr);
      return;
    }
    // 兜底：万一没经过 baseline 状态就进监测，用当前样本临时结算一次
    if (!base.ready) { if (d.hr) bHr.push(d.hr); if (d.hrv) bHrv.push(d.hrv); if (d.gsr != null) bGsr.push(d.gsr); computeBaseline(); }

    const { z, level } = stressIndex(d);
    updateRing(d.hr, level);

    // 记一条压力指数时间序列点（节流 ~30s），供 24h 折线图使用
    const nowT = Date.now();
    if (nowT - lastTrendTs > 30000) {
      lastTrendTs = nowT;
      Store.addTrendSample({ z: Math.round(z * 100) / 100, level });
      renderTrend();
    }

    // ── 三档干预触觉：按 z 分级递进（1σ/2σ/3σ，见 docs/科学依据.md）──
    const now = Date.now();
    if (level === 'high' || level === 'crit') {
      highStreak++; midStreak = 0;
      // 连续 2 次为高 且 过冷却 → 触发环抱；3σ(crit) 直接给最强的档三·撤退
      if (highStreak >= 2 && now > highCooldownUntil) {
        const mode = level === 'crit' ? 'retreat' : 'anchor';
        handleHighStress(d, mode);
      }
    } else if (level === 'mid') {
      midStreak++; highStreak = 0;
      // 压力刚有苗头(1σ)：连续 2 次 且 过冷却 → 档一·早期拦截(轻提醒)
      if (midStreak >= 2 && now > midCooldownUntil) handleMidStress(d);
    } else {
      highStreak = 0; midStreak = 0;
    }
    lastLevel = level;
  }

  function updateRing(hr, level) {
    setLevelUI(level);
    // 弧长按心率 60~110 映射到 0~540（纯视觉）
    const pct = Math.max(0, Math.min(1, (hr - 60) / 50));
    const arc = el.querySelector('#rtArc');
    if (arc) arc.setAttribute('stroke-dashoffset', String(Math.round(540 - 540 * pct)));
  }

  function setLevelUI(level) {
    const info = LEVELS[level] || LEVELS.low;
    const arc = el && el.querySelector('#rtArc');
    const lv = el && el.querySelector('#rtLevel');
    if (arc) arc.setAttribute('stroke', info.color);
    if (lv) { lv.textContent = info.label + ' · ' + info.desc; lv.style.color = info.color; }
  }

  // 档二/档三：高压 → anchor(呼吸引导) 或 retreat(撤退许可)
  function handleHighStress(d, mode = 'anchor') {
    highCooldownUntil = Date.now() + 20000; // 20s 冷却
    highStreak = 0;

    ring.vibrate(mode);                       // 戒指私密震动（三档触觉）
    pulseRing();

    const note = mode === 'retreat'
      ? '压力仍未缓解，戒指给你「撤退许可」——你可以停下来了'
      : '压力升高，戒指用呼吸节律轻轻锚住了你（吸4·呼6）';
    Store.addEvent({
      type: 'stress', level: 'high',
      hr: d.hr, hrv: d.hrv, source: 'ring', mode, note,
    });
    Store.incRingHug();
    refreshTimeline();
    refreshHug();
    Store.addTrendSample({ z: stressIndex(d).z, level: 'high' });
    renderTrend();
    toast(mode === 'retreat' ? '🫂 戒指：你可以停下来了' : '🌬️ 戒指陪你呼吸（吸4·呼6）');
  }

  // 档一：中压苗头 → intercept(轻促短震)，只提醒不记为"高压环抱"
  function handleMidStress(d) {
    midCooldownUntil = Date.now() + 25000; // 25s 冷却，避免频繁打扰
    midStreak = 0;

    ring.vibrate('intercept');
    pulseRing();

    Store.addEvent({
      type: 'stress', level: 'mid',
      hr: d.hr, hrv: d.hrv, source: 'ring', mode: 'intercept',
      note: '压力刚有苗头，戒指轻促地提醒了你一下',
    });
    Store.incRingHug();
    refreshTimeline();
    refreshHug();
    Store.addTrendSample({ z: stressIndex(d).z, level: 'mid' });
    renderTrend();
    toast('· 戒指轻轻碰了碰你');
  }

  function pulseRing() {
    const card = el && el.querySelector('#rtRingCard');
    if (!card) return;
    card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse');
  }

  function refreshHug() {
    const g = Store.getGrowth();
    const hug = el && el.querySelector('#rtHug');
    if (hug) hug.textContent = g.ringHugCount || 0;
  }

  // ── 24h 情绪起伏折线图（类股票K线的情绪版）──
  // 中间是"平静地带"(z≈0)；线在上=压力↑ 用红、越高越饱和；线在下=越平静 用绿、越低越淡。
  function renderTrend() {
    const box = el && el.querySelector('#rtTrend');
    if (!box) return;

    const W = 360, H = 120, PAD = 10;
    const midY = H / 2, half = midY - PAD, Z_MAX = 3;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const t0 = dayStart.getTime(), DAY = 24 * 3600e3, now = Date.now();

    const yOf = z => midY - (Math.max(-Z_MAX, Math.min(Z_MAX, z)) / Z_MAX) * half;
    const xOf = ts => Math.max(0, Math.min(1, (ts - t0) / DAY)) * W;

    const samples = Store.getTrend(0).filter(s => s.ts >= t0).sort((a, b) => a.ts - b.ts);
    const nowX = xOf(now);

    // 竖向渐变：顶部饱和红 → 中间平静(近透明) → 底部饱和绿
    const defs = `
      <defs>
        <linearGradient id="rtTrendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="#C75C4B" stop-opacity="0.92"/>
          <stop offset="34%" stop-color="#E0A99C" stop-opacity="0.55"/>
          <stop offset="48%" stop-color="#D4B8A5" stop-opacity="0.12"/>
          <stop offset="52%" stop-color="#B7CDBE" stop-opacity="0.12"/>
          <stop offset="66%" stop-color="#B7CDBE" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#6E9E82" stop-opacity="0.92"/>
        </linearGradient>
      </defs>`;

    // 平静地带：z∈[-1,1]（1σ 内）横向浅带
    const bandTop = yOf(1), bandBot = yOf(-1);
    const band = `<rect x="0" y="${bandTop.toFixed(1)}" width="${W}" height="${(bandBot - bandTop).toFixed(1)}"
        fill="var(--accent)" opacity="0.08"/>
      <line x1="0" y1="${midY}" x2="${W}" y2="${midY}" stroke="var(--sub)" stroke-width="1" stroke-dasharray="3 4" opacity="0.35"/>`;

    let content;
    if (samples.length < 2) {
      // 无数据：画一条平静基线到当前时刻
      content = `<line x1="0" y1="${midY}" x2="${nowX.toFixed(1)}" y2="${midY}"
          stroke="#B7CDBE" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="${nowX.toFixed(1)}" cy="${midY}" r="3.5" fill="#8FB39C"/>`;
    } else {
      const pts = samples.map(s => [xOf(s.ts), yOf(s.z)]);
      const lineD = 'M ' + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ');
      // 面积：沿折线走，再回到中线闭合 → 上方部分落在渐变红区、下方落在绿区
      const first = pts[0], last = pts[pts.length - 1];
      const areaD = `M ${first[0].toFixed(1)},${midY} L ` +
        pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ') +
        ` L ${last[0].toFixed(1)},${midY} Z`;
      content = `<path d="${areaD}" fill="url(#rtTrendGrad)"/>
        <path d="${lineD}" fill="none" stroke="var(--ink)" stroke-width="1.6"
          stroke-linejoin="round" stroke-linecap="round" opacity="0.55"/>
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5"
          fill="${last[1] < midY ? '#C75C4B' : '#6E9E82'}"/>`;
    }

    // 时间刻度 0/6/12/18/24
    const ticks = [0, 6, 12, 18, 24].map(h => {
      const x = (h / 24) * W;
      return `<text x="${Math.max(6, Math.min(W - 6, x)).toFixed(0)}" y="${H - 1}"
        font-size="8" fill="var(--sub)" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}">${h}:00</text>`;
    }).join('');

    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="rt-trend-svg" preserveAspectRatio="none">
      ${defs}${band}${content}${ticks}
    </svg>`;
  }

  function refreshTimeline() {
    const box = el && el.querySelector('#rtTimeline');
    if (!box) return;
    const list = Store.getEventsByDate();
    if (!list.length) {
      box.innerHTML = `<div class="rt-empty muted">今天还没有记录，戴上戒指开始感受吧</div>`;
      return;
    }
    const COLLAPSED = 5;
    const shown = timelineExpanded ? list : list.slice(0, COLLAPSED);
    const rows = shown.map(e => {
      const t = new Date(e.ts).toTimeString().slice(0, 5);
      const info = LEVELS[e.level] || LEVELS.low;
      return `<div class="rt-tl-row">
        <span class="rt-tl-time muted">${t}</span>
        <span class="rt-tl-dot" style="background:${info.color}"></span>
        <span class="rt-tl-text">${e.note || (info.label + ' 时刻')}</span>
      </div>`;
    }).join('');

    let toggle = '';
    if (list.length > COLLAPSED) {
      toggle = timelineExpanded
        ? `<button class="rt-tl-more" id="rtTlToggle">收起 ▲</button>`
        : `<button class="rt-tl-more" id="rtTlToggle">展开全部 ${list.length} 条 ▼</button>`;
    }
    box.innerHTML = rows + toggle;

    const btn = box.querySelector('#rtTlToggle');
    if (btn) btn.onclick = () => { timelineExpanded = !timelineExpanded; refreshTimeline(); };
  }

  let toastTimer;
  function toast(msg) {
    let t = document.getElementById('rtToast');
    if (!t) { t = document.createElement('div'); t.id = 'rtToast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 2200);
  }

  function injectStyle() {
    if (document.getElementById('rt-style')) return;
    const s = document.createElement('style');
    s.id = 'rt-style';
    s.textContent = `
      .rt-wrap{display:flex;flex-direction:column;gap:8px;}
      .rt-status{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--sub);justify-content:center;}
      .rt-status .dot{width:7px;height:7px;border-radius:50%;background:var(--sub);}
      .rt-status .dot.monitoring{background:var(--calm);}
      .rt-status .dot.baseline,.rt-status .dot.connecting{background:var(--mid);}
      .rt-status .dot.disconnected,.rt-status .dot.unsupported{background:var(--high);}
      .rt-ring{position:relative;display:flex;align-items:center;justify-content:center;padding:2px;box-shadow:none;background:transparent;}
      .rt-ring.pulse{animation:rtPulse .8s ease;}
      @keyframes rtPulse{0%{transform:scale(1)}30%{transform:scale(1.03)}100%{transform:scale(1)}}
      .rt-svg{width:142px;height:142px;animation:breathe 8s var(--ease-calm) infinite;}
      .rt-center{position:absolute;text-align:center;}
      .rt-hr{font-size:38px;font-weight:700;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums;}
      .rt-unit{font-size:11px;color:var(--sub);margin-top:3px;letter-spacing:.5px;}
      .rt-level{margin-top:7px;font-size:13px;font-weight:600;}
      .rt-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
      .rt-meta-item{background:var(--surface);border-radius:var(--radius-sm);box-shadow:var(--shadow-soft);padding:8px 10px;text-align:center;}
      .rt-meta-item .v{font-size:18px;font-weight:700;line-height:1.1;}
      .rt-meta-item .k{font-size:11px;color:var(--sub);margin-top:1px;}
      .rt-meta-item .d{font-size:9px;color:var(--sub);opacity:.72;margin-top:1px;line-height:1.2;}
      .rt-actions{display:flex;gap:10px;}
      .rt-actions button{flex:1;padding:11px 16px;font-size:14px;}
      .rt-haptics{padding:10px 14px;}
      .rt-haptic-btns{display:flex;gap:8px;margin-top:8px;}
      .rt-haptic-btns button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;font-size:12px;font-weight:600;line-height:1.2;}
      .rt-haptic-btns button small{font-size:9px;font-weight:400;color:var(--sub);}
      .rt-tl-title{font-weight:600;font-size:14px;margin-bottom:9px;}
      .rt-trend{padding:10px 14px;}
      .rt-trend-svg{width:100%;height:64px;display:block;}
      .rt-trend-legend{display:flex;gap:14px;justify-content:center;margin-top:7px;font-size:10px;color:var(--sub);}
      .rt-trend-legend span{display:flex;align-items:center;gap:5px;}
      .rt-trend-legend i{width:10px;height:10px;border-radius:3px;display:inline-block;}
      .rt-trend-legend i.hi{background:#C75C4B;}
      .rt-trend-legend i.calm-band{background:var(--accent);opacity:.35;}
      .rt-trend-legend i.lo{background:#6E9E82;}
      .rt-timeline{padding:12px 14px;}
      .rt-tl-row{display:flex;align-items:center;gap:10px;padding:5px 0;}
      .rt-tl-time{font-size:12px;width:38px;flex:none;}
      .rt-tl-dot{width:8px;height:8px;border-radius:50%;flex:none;}
      .rt-tl-text{font-size:13px;}
      .rt-tl-more{width:100%;margin-top:8px;padding:8px;background:transparent;border:none;
        color:var(--sub);font-size:13px;cursor:pointer;border-top:1px solid var(--line);}
      .rt-tl-more:active{opacity:.6;}
      .rt-empty{text-align:center;padding:8px;font-size:12px;}
      #rtToast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%) translateY(20px);
        background:var(--ink);color:#fff;padding:10px 18px;border-radius:999px;font-size:14px;
        opacity:0;pointer-events:none;transition:.3s;z-index:99;max-width:80%;}
      #rtToast.show{opacity:.95;transform:translateX(-50%) translateY(0);}
    `;
    document.head.appendChild(s);
  }

  window.Pages = window.Pages || {};
  window.Pages['realtime'] = { render };
})();
