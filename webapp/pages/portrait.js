/**
 * portrait.js — 今日心灵画像 P0 ⭐
 * 用当天情绪数据 → gpt-image-2 生成莫兰迪抽象画 + AI 解读
 * 依赖：AI.image / AI.chat / AI.portraitPrompt、Store、tokens.css
 * 注册到 window.Pages['portrait']
 */
(function () {
  'use strict';

  let el;
  let selected = [];   // 用户当天补录的情绪名（多选）

  // 戒指波动(客观) + 用户补录情绪(主观) → 文字概述 + 色板 + 情绪关键词
  function deriveMood() {
    const events = Store.getEventsByDate();
    const g = Store.getGrowth();
    // 只统计戒指压力事件 → 波动强度
    let mid = 0, high = 0;
    events.forEach(e => { if (e.type === 'stress') { if (e.level === 'high') high++; else if (e.level === 'mid') mid++; } });

    let arousal, baseColor;
    if (high >= 2)              { arousal = '今天情绪波动比较明显，起伏了好几次，但也一次次被温柔接住'; baseColor = '#D8A08C'; }
    else if (mid >= 2 || high === 1) { arousal = '今天有一些细微的波动，在平稳与起伏间轻轻摇摆';       baseColor = '#E8D4A8'; }
    else                       { arousal = '今天整体是平稳安静的一天，内心像被柔光包裹';           baseColor = '#A8C0B0'; }

    // 用户补录的具体情绪
    const chosen = selected.map(n => window.EmotionBy(n)).filter(Boolean);
    const emoColors = chosen.map(e => e.color);
    const emoNames = chosen.map(e => e.name);
    const emoEn = chosen.map(e => e.en);

    let moodSummary = arousal;
    if (emoNames.length) moodSummary += `。你说这一天的心情里，有「${emoNames.join('、')}」`;
    const hugs = g.ringHugCount || 0;
    if (hugs) moodSummary += `；戒指今天环抱了你 ${hugs} 次`;

    // 色板：戒指波动基色 + 用户情绪色，去重取前 5
    const palette = [...new Set([baseColor, ...emoColors])].slice(0, 5);
    return { moodSummary, palette, emotions: emoEn, emoNames, stats: { mid, high, hugs } };
  }

  function render(container) {
    el = container;
    injectStyle();

    const today = Store._today();
    const existing = Store.getPortraitByDate(today);

    el.innerHTML = `
      <div class="pt-wrap">
        <div class="pt-head">
          <div class="pt-date">${fmtDate(today)}</div>
          <div class="pt-title">今日心灵画像</div>
        </div>
        <div id="ptBody"></div>
      </div>
    `;

    if (existing) showPortrait(existing);
    else showEmpty();
  }

  function showEmpty() {
    const mood = deriveMood();
    document.getElementById('ptBody').innerHTML = `
      <div class="pt-canvas card pt-empty">
        <div class="pt-em">❋</div>
        <div class="pt-hint">把今天的情绪，炼成一幅只属于你的画</div>
        <div class="pt-mood muted">${mood.moodSummary}</div>
      </div>

      <div class="pt-picker card">
        <div class="pt-picker-title">戒指记录了今天的<b>波动</b>，再选几种此刻的心情<br>
          <span class="muted">让画像的颜色更贴合你（可选，可多选）</span>
        </div>
        <div class="pt-chips" id="ptChips"></div>
      </div>

      <button id="ptGen" style="width:100%;margin-top:16px">生成今日画像</button>
      <div class="pt-note muted">用 gpt-image-2 生成 · 需先在 ⚙︎ 设置里填官方 API</div>
    `;
    renderChips();
    document.getElementById('ptGen').onclick = generate;
  }

  function renderChips() {
    const box = document.getElementById('ptChips');
    if (!box) return;
    box.innerHTML = window.Emotions.map(e => {
      const on = selected.includes(e.name);
      return `<button type="button" class="pt-chip${on ? ' on' : ''}" data-name="${e.name}"
        style="--c:${e.color};--cl:${e.light}">
        <span class="pt-chip-dot"></span>${e.name}
      </button>`;
    }).join('');
    box.querySelectorAll('.pt-chip').forEach(btn => {
      btn.onclick = () => {
        const n = btn.dataset.name;
        const i = selected.indexOf(n);
        if (i >= 0) selected.splice(i, 1); else selected.push(n);
        renderChips();
        // 实时更新概述文字
        const m = document.querySelector('.pt-mood');
        if (m) m.textContent = deriveMood().moodSummary;
      };
    });
  }

  async function generate() {
    const btn = document.getElementById('ptGen');
    const mood = deriveMood();

    btn.disabled = true;
    document.getElementById('ptBody').querySelector('.pt-canvas').innerHTML =
      `<div class="pt-loading"><div class="pt-spin"></div><div class="muted">正在为你炼一幅画…（约 10-30 秒）</div></div>`;

    try {
      AI.loadFromStore();
      const prompt = AI.portraitPrompt({ moodSummary: mood.moodSummary, palette: mood.palette, emotions: mood.emotions });
      const imgUrl = await AI.image(prompt, { size: '1024x1024' });
      if (!imgUrl) throw new Error('未返回图片');

      // 解读文字（小知口吻，分行短诗）
      let interpretation = '';
      try {
        interpretation = await AI.chat([
          { role: 'system', content: '你是"小知"，一个温柔、克制、诗意的陪伴者。请把用户今天的情绪，写成一首温柔的短诗来解读这幅由TA情绪生成的抽象画。要求：4-6 行；每行一句、简短克制（每行尽量不超过 14 字）；行与行之间用换行符分隔；不要标题、不要引号、不要解释说明、不要报数据；只输出诗句本身，重在情感共鸣与被接住的温柔感。' },
          { role: 'user', content: `今天的情绪：${mood.moodSummary}。请为这幅画写一首温柔的小诗。` },
        ], { maxTokens: 220 });
      } catch (e) { interpretation = mood.moodSummary; }

      const rec = Store.addPortrait({
        imgUrl, palette: mood.palette, interpretation, moodSummary: mood.moodSummary,
        emoNames: mood.emoNames || [],
      });
      showPortrait(rec);
    } catch (e) {
      document.getElementById('ptBody').querySelector('.pt-canvas').innerHTML =
        `<div class="pt-loading"><div class="pt-em">⚠️</div><div class="muted">生成失败：${e.message}</div></div>`;
      const b = document.createElement('button');
      b.style.cssText = 'width:100%;margin-top:16px'; b.textContent = '重试';
      b.onclick = () => showEmpty();
      document.getElementById('ptBody').appendChild(b);
    }
  }

  function showPortrait(rec) {
    const emoTags = (rec.emoNames && rec.emoNames.length)
      ? `<div class="pt-emotags">${rec.emoNames.map(n => {
          const e = window.EmotionBy(n);
          return `<span class="pt-emotag" style="background:${e ? e.light : 'var(--line)'};color:${e ? e.color : 'var(--sub)'}">${n}</span>`;
        }).join('')}</div>`
      : '';
    document.getElementById('ptBody').innerHTML = `
      <div class="pt-canvas card">
        <img src="${rec.imgUrl}" alt="今日心灵画像" class="pt-img"/>
      </div>
      <div class="pt-palette">
        ${(rec.palette || []).map(c => `<span class="pt-sw" style="background:${c}"></span>`).join('')}
      </div>
      ${emoTags}
      <div class="pt-interp card">
        <div class="pt-quote">“</div>
        <div class="pt-poem">${poemLines(rec.interpretation || rec.moodSummary || '')}</div>
      </div>
      <button class="ghost" id="ptRegen" style="width:100%;margin-top:14px">重新生成</button>
    `;
    const rb = document.getElementById('ptRegen');
    if (rb) rb.onclick = () => { removeToday(rec.date); showEmpty(); };
  }

  // 把解读拆成诗句：优先按换行；没有换行则按中文标点切成短句
  function poemLines(text) {
    let lines;
    if (/\n/.test(text)) lines = text.split(/\n+/);
    else lines = text.split(/[，。！？；、]+/);
    lines = lines.map(s => s.trim().replace(/[，。！？；、]+$/, '')).filter(Boolean);
    if (!lines.length) lines = [text];
    return lines.map(l => `<div class="pt-line">${escapeHtml(l)}</div>`).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  // 重新生成：移除当天旧记录（简单实现：过滤掉今天的）
  function removeToday(date) {
    try {
      const list = Store.getPortraits().filter(p => p.date !== date);
      localStorage.setItem('hbn.portraits', JSON.stringify(list));
    } catch (e) {}
  }

  function fmtDate(d) {
    const [y, m, day] = d.split('-');
    return `${y}年${m}月${day}日`;
  }

  function injectStyle() {
    if (document.getElementById('pt-style')) return;
    const s = document.createElement('style');
    s.id = 'pt-style';
    s.textContent = `
      .pt-wrap{display:flex;flex-direction:column;gap:14px;}
      .pt-head{text-align:center;}
      .pt-date{font-size:13px;color:var(--sub);}
      .pt-title{font-size:20px;font-weight:700;margin-top:2px;}
      .pt-canvas{padding:0;overflow:hidden;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;}
      .pt-img{width:100%;height:100%;object-fit:cover;display:block;}
      .pt-empty{flex-direction:column;gap:10px;text-align:center;padding:40px 24px;}
      .pt-em{font-size:46px;color:var(--accent);}
      .pt-hint{font-size:15px;font-weight:600;}
      .pt-mood{font-size:13px;line-height:1.6;}
      .pt-note{font-size:12px;text-align:center;margin-top:8px;}
      .pt-picker{padding:16px 16px 18px;}
      .pt-picker-title{font-size:13px;line-height:1.7;margin-bottom:12px;text-align:center;}
      .pt-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}
      .pt-chip{background:var(--surface);color:var(--ink);border:1.5px solid var(--line);
        border-radius:999px;padding:7px 13px;font-size:13px;display:flex;align-items:center;gap:6px;}
      .pt-chip .pt-chip-dot{width:10px;height:10px;border-radius:50%;background:var(--c);}
      .pt-chip.on{background:var(--cl);border-color:var(--c);color:var(--ink);font-weight:600;}
      .pt-emotags{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;}
      .pt-emotag{font-size:12px;padding:4px 11px;border-radius:999px;font-weight:600;}
      .pt-loading{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:30px;}
      .pt-spin{width:34px;height:34px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:ptSpin 1s linear infinite;}
      @keyframes ptSpin{to{transform:rotate(360deg)}}
      .pt-palette{display:flex;gap:8px;justify-content:center;}
      .pt-sw{width:28px;height:28px;border-radius:50%;box-shadow:var(--shadow);}
      .pt-interp{position:relative;text-align:center;padding:30px 24px 26px;}
      .pt-quote{position:absolute;top:6px;left:18px;font-size:44px;line-height:1;color:var(--accent);opacity:.35;
        font-family:Georgia,"Songti SC",serif;}
      .pt-poem{display:flex;flex-direction:column;gap:12px;
        font-family:"STKaiti","Kaiti SC","KaiTi","楷体","Songti SC",serif;}
      .pt-line{font-size:17px;line-height:1.9;letter-spacing:2px;color:var(--ink);}
    `;
    document.head.appendChild(s);
  }

  window.Pages = window.Pages || {};
  window.Pages['portrait'] = { render };
})();
