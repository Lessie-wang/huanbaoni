/**
 * portrait.js — 今日心灵画像 P0 ⭐
 * 用当天情绪数据 → gpt-image-2 生成莫兰迪抽象画 + AI 解读
 * 依赖：AI.image / AI.chat / AI.portraitPrompt、Store、tokens.css
 * 注册到 window.Pages['portrait']
 */
(function () {
  'use strict';

  let el;

  // 依据当天事件推导情绪基调 → 文字概述 + 色板
  function deriveMood() {
    const events = Store.getEventsByDate();
    const g = Store.getGrowth();
    let low = 0, mid = 0, high = 0;
    events.forEach(e => { if (e.level === 'high') high++; else if (e.level === 'mid') mid++; else low++; });

    let tone, palette;
    if (high >= 2) {
      tone = '今天有几次明显的情绪起伏，内心经历了一些波澜，但也一次次被温柔地接住';
      palette = ['#D8A08C', '#E8D4A8', '#C9B8A8'];
    } else if (mid >= 2 || high === 1) {
      tone = '今天有一些细微的波动，整体在平稳与起伏之间轻轻摇摆';
      palette = ['#E8D4A8', '#A8C0B0', '#D4B8A5'];
    } else {
      tone = '今天大体是安稳平静的一天，内心像被柔光包裹';
      palette = ['#A8C0B0', '#C9D6C4', '#D4B8A5'];
    }
    const hugs = g.ringHugCount || 0;
    const moodSummary = tone + (hugs ? `，戒指今天环抱了你 ${hugs} 次` : '');
    return { moodSummary, palette, stats: { low, mid, high, hugs } };
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
      <button id="ptGen" style="width:100%;margin-top:16px">生成今日画像</button>
      <div class="pt-note muted">用 gpt-image-2 生成 · 需先在 ⚙︎ 设置里填官方 API</div>
    `;
    document.getElementById('ptGen').onclick = generate;
  }

  async function generate() {
    const btn = document.getElementById('ptGen');
    const mood = deriveMood();

    btn.disabled = true;
    document.getElementById('ptBody').querySelector('.pt-canvas').innerHTML =
      `<div class="pt-loading"><div class="pt-spin"></div><div class="muted">正在为你炼一幅画…（约 10-30 秒）</div></div>`;

    try {
      AI.loadFromStore();
      const prompt = AI.portraitPrompt({ moodSummary: mood.moodSummary, palette: mood.palette });
      const imgUrl = await AI.image(prompt, { size: '1024x1024' });
      if (!imgUrl) throw new Error('未返回图片');

      // 解读文字（小知口吻，诗意 2-3 句）
      let interpretation = '';
      try {
        interpretation = await AI.chat([
          { role: 'system', content: '你是"小知"，一个温柔克制、诗意的陪伴者。用户今天的情绪概述会给你，请用 2-3 句温柔的话解读这幅由TA情绪生成的抽象画，像在轻声念一首小诗。不要报数据，不要说"这幅画"太多次，重在情感共鸣。' },
          { role: 'user', content: `今天的情绪：${mood.moodSummary}。请为这幅画写一段温柔的解读。` },
        ], { maxTokens: 200 });
      } catch (e) { interpretation = mood.moodSummary; }

      const rec = Store.addPortrait({
        imgUrl, palette: mood.palette, interpretation, moodSummary: mood.moodSummary,
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
    document.getElementById('ptBody').innerHTML = `
      <div class="pt-canvas card">
        <img src="${rec.imgUrl}" alt="今日心灵画像" class="pt-img"/>
      </div>
      <div class="pt-palette">
        ${(rec.palette || []).map(c => `<span class="pt-sw" style="background:${c}"></span>`).join('')}
      </div>
      <div class="pt-interp card">${rec.interpretation || rec.moodSummary || ''}</div>
      <button class="ghost" id="ptRegen" style="width:100%;margin-top:14px">重新生成</button>
    `;
    const rb = document.getElementById('ptRegen');
    if (rb) rb.onclick = () => { removeToday(rec.date); showEmpty(); };
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
      .pt-loading{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:30px;}
      .pt-spin{width:34px;height:34px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:ptSpin 1s linear infinite;}
      @keyframes ptSpin{to{transform:rotate(360deg)}}
      .pt-palette{display:flex;gap:8px;justify-content:center;}
      .pt-sw{width:28px;height:28px;border-radius:50%;box-shadow:var(--shadow);}
      .pt-interp{font-size:15px;line-height:1.8;color:var(--ink);text-align:center;}
    `;
    document.head.appendChild(s);
  }

  window.Pages = window.Pages || {};
  window.Pages['portrait'] = { render };
})();
