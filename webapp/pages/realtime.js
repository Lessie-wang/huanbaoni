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
  };

  const STATUS_TEXT = {
    idle: '未连接', connecting: '连接中…', connected: '已连接',
    baseline: '正在采集基线…', monitoring: '监测中', disconnected: '已断开',
    unsupported: '浏览器不支持蓝牙',
  };

  // 页面级状态
  let el, ring;
  let baseHr = 0, baseSamples = [], monitoring = false;
  let lastLevel = 'low', highCooldownUntil = 0, highStreak = 0;
  let bound = false;

  function stressLevel(hr, hrv) {
    if (!baseHr) return 'low';
    const dHr = hr - baseHr;
    const dHrv = hrv ? Math.max(0, baseHrvRef() - hrv) : 0;
    const score = dHr * 3 + dHrv * 1.2;
    if (score > 60) return 'high';
    if (score > 28) return 'mid';
    return 'low';
  }
  let _baseHrv = 0;
  function baseHrvRef() { return _baseHrv || 50; }

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
        handleHighStress(lastData || { hr: baseHr, hrv: 0 }); // 真戒指：直接触发一次
      }
    };
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
    if (s === 'monitoring') { monitoring = true; if (btnC) btnC.textContent = '断开连接'; }
    if (s === 'baseline')  { baseHr = 0; baseSamples = []; _baseHrv = 0; }
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
    hrvEl.textContent = d.hrv ? d.hrv.toFixed ? d.hrv.toFixed(0) : d.hrv : '--';

    // 采基线（前若干个样本取均值）
    if (!monitoring && baseSamples.length < 5 && d.hr) {
      baseSamples.push(d.hr);
      baseHr = Math.round(baseSamples.reduce((a, b) => a + b, 0) / baseSamples.length);
      if (d.hrv) _baseHrv = d.hrv;
      return;
    }
    if (!baseHr && d.hr) baseHr = d.hr;

    const level = stressLevel(d.hr, d.hrv);
    updateRing(d.hr, level);

    // 高压去抖：连续 2 次为高 且 过了冷却期 → 触发环抱
    if (level === 'high') {
      highStreak++;
      if (highStreak >= 2 && Date.now() > highCooldownUntil) handleHighStress(d);
    } else {
      highStreak = 0;
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

  function handleHighStress(d) {
    highCooldownUntil = Date.now() + 20000; // 20s 冷却
    highStreak = 0;

    ring.vibrate('short');                    // 戒指私密震动
    pulseRing();

    Store.addEvent({
      type: 'stress', level: 'high',
      hr: d.hr, hrv: d.hrv, source: 'ring',
      note: '压力升高，戒指轻轻环抱了你一下',
    });
    Store.incRingHug();
    refreshTimeline();
    refreshHug();
    toast('🤍 戒指环抱了你一下');
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
