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
            <div class="rt-unit">BPM</div>
            <div class="rt-level" id="rtLevel">等待连接</div>
          </div>
        </div>

        <div class="rt-meta">
          <div class="rt-meta-item"><div class="v" id="rtHrv">--</div><div class="k">HRV (ms)</div></div>
          <div class="rt-meta-item"><div class="v" id="rtHug">0</div><div class="k">今日被环抱</div></div>
        </div>

        <div class="rt-actions">
          <button id="rtConnect">连接戒指</button>
          <button class="ghost" id="rtStress">模拟一次压力</button>
        </div>

        <div class="rt-haptics card">
          <div class="rt-tl-title">测试三档干预触觉</div>
          <div class="rt-haptic-btns">
            <button class="ghost" data-mode="intercept">档三·拦截<small>轻促短震</small></button>
            <button class="ghost" data-mode="anchor">档二·锚点<small>呼吸 吸4·呼6</small></button>
            <button class="ghost" data-mode="retreat">档一·撤退<small>两下长震</small></button>
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
      intercept: '· 档三·拦截：轻促短震',
      anchor:    '🌬️ 档二·锚点：跟着呼吸（吸4·呼6）',
      retreat:   '🫂 档一·撤退：你可以停下来了',
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
      if (btnC) btnC.textContent = '连接戒指';
      setLevelUI('low'); const hr = el && el.querySelector('#rtHr'); if (hr) hr.textContent = '--';
      const lv = el && el.querySelector('#rtLevel'); if (lv) lv.textContent = '已断开';
    }
  }

  function onData(d) {
    lastData = d;
    const hrEl = el && el.querySelector('#rtHr');
    const hrvEl = el && el.querySelector('#rtHrv');
    if (!hrEl) return;
    hrEl.textContent = d.hr || '--';
    hrvEl.textContent = d.hrv ? (d.hrv.toFixed ? d.hrv.toFixed(0) : d.hrv) : '--';

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

    // ── 三档干预触觉：按 z 分级递进（1σ/2σ/3σ，见 docs/科学依据.md）──
    const now = Date.now();
    if (level === 'high' || level === 'crit') {
      highStreak++; midStreak = 0;
      // 连续 2 次为高 且 过冷却 → 触发环抱；3σ(crit) 直接给最强的档一·撤退
      if (highStreak >= 2 && now > highCooldownUntil) {
        const mode = level === 'crit' ? 'retreat' : 'anchor';
        handleHighStress(d, mode);
      }
    } else if (level === 'mid') {
      midStreak++; highStreak = 0;
      // 压力刚有苗头(1σ)：连续 2 次 且 过冷却 → 档三·早期拦截(轻提醒)
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

  // 档二/档一：高压 → anchor(呼吸引导) 或 retreat(撤退许可)
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
    toast(mode === 'retreat' ? '🫂 戒指：你可以停下来了' : '🌬️ 戒指陪你呼吸（吸4·呼6）');
  }

  // 档三：中压苗头 → intercept(轻促短震)，只提醒不记为"高压环抱"
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

  function refreshTimeline() {
    const box = el && el.querySelector('#rtTimeline');
    if (!box) return;
    const list = Store.getEventsByDate();
    if (!list.length) {
      box.innerHTML = `<div class="rt-empty muted">今天还没有记录，戴上戒指开始感受吧</div>`;
      return;
    }
    box.innerHTML = list.slice(0, 20).map(e => {
      const t = new Date(e.ts).toTimeString().slice(0, 5);
      const info = LEVELS[e.level] || LEVELS.low;
      const icon = e.type === 'stress' ? '🤍' : '·';
      return `<div class="rt-tl-row">
        <span class="rt-tl-time muted">${t}</span>
        <span class="rt-tl-dot" style="background:${info.color}"></span>
        <span class="rt-tl-text">${e.note || (info.label + ' 时刻')}</span>
      </div>`;
    }).join('');
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
      .rt-wrap{display:flex;flex-direction:column;gap:var(--gap);}
      .rt-status{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--sub);justify-content:center;}
      .rt-status .dot{width:8px;height:8px;border-radius:50%;background:var(--sub);}
      .rt-status .dot.monitoring{background:var(--calm);}
      .rt-status .dot.baseline,.rt-status .dot.connecting{background:var(--mid);}
      .rt-status .dot.disconnected,.rt-status .dot.unsupported{background:var(--high);}
      .rt-ring{position:relative;display:flex;align-items:center;justify-content:center;padding:18px;}
      .rt-ring.pulse{animation:rtPulse .8s ease;}
      @keyframes rtPulse{0%{transform:scale(1)}30%{transform:scale(1.03)}100%{transform:scale(1)}}
      .rt-svg{width:240px;height:240px;}
      .rt-center{position:absolute;text-align:center;}
      .rt-hr{font-size:56px;font-weight:700;line-height:1;color:var(--ink);}
      .rt-unit{font-size:13px;color:var(--sub);margin-top:2px;letter-spacing:1px;}
      .rt-level{margin-top:10px;font-size:14px;font-weight:600;}
      .rt-meta{display:flex;gap:var(--gap);}
      .rt-meta-item{flex:1;background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow);padding:14px;text-align:center;}
      .rt-meta-item .v{font-size:24px;font-weight:700;}
      .rt-meta-item .k{font-size:12px;color:var(--sub);margin-top:2px;}
      .rt-actions{display:flex;gap:12px;}
      .rt-actions button{flex:1;}
      .rt-haptics{padding:16px;}
      .rt-haptic-btns{display:flex;gap:8px;margin-top:12px;}
      .rt-haptic-btns button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 4px;font-size:13px;font-weight:600;line-height:1.2;}
      .rt-haptic-btns button small{font-size:10px;font-weight:400;color:var(--sub);}
      .rt-tl-title{font-weight:600;margin-bottom:12px;}
      .rt-tl-row{display:flex;align-items:center;gap:10px;padding:7px 0;}
      .rt-tl-time{font-size:12px;width:38px;flex:none;}
      .rt-tl-dot{width:8px;height:8px;border-radius:50%;flex:none;}
      .rt-tl-text{font-size:14px;}
      .rt-empty{text-align:center;padding:16px;font-size:13px;}
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
