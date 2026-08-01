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

  // 伙伴波动(客观) + 用户补录情绪(主观) → 文字概述 + 色板 + 情绪关键词
  function deriveMood() {
    const events = Store.getEventsByDate();
    const g = Store.getGrowth();
    // 只统计伙伴压力事件 → 波动强度
    let mid = 0, high = 0;
    events.forEach(e => { if (e.type === 'stress') { if (e.level === 'high') high++; else if (e.level === 'mid') mid++; } });

    // 波动强度分级：客观动势(arousal)用于画面动势；arousalText 用于文字概述
    let arousal, arousalText, baseColor;
    if (high >= 2)              { arousal = 'high'; arousalText = '今天情绪波动比较明显，起伏了好几次，但也一次次被温柔接住'; baseColor = '#D8A08C'; }
    else if (mid >= 2 || high === 1) { arousal = 'mid'; arousalText = '今天有一些细微的波动，在平稳与起伏间轻轻摇摆';       baseColor = '#E8D4A8'; }
    else                       { arousal = 'low'; arousalText = '今天整体是平稳安静的一天，内心像被柔光包裹';           baseColor = '#A8C0B0'; }

    // 用户补录的具体情绪（保留完整对象，供画面场景/效价使用）
    const chosen = selected.map(n => window.EmotionBy(n)).filter(Boolean);
    const emoColors = chosen.map(e => e.color);
    const emoNames = chosen.map(e => e.name);
    const emoEn = chosen.map(e => e.en);

    let moodSummary = arousalText;
    if (emoNames.length) moodSummary += `。你说这一天的心情里，有「${emoNames.join('、')}」`;
    const hugs = g.ringHugCount || 0;
    if (hugs) moodSummary += `；伙伴今天环抱了你 ${hugs} 次`;

    // 色板：有补录情绪时以情绪色为主（更贴合真实心情），否则用波动基色兜底
    const palette = emoColors.length
      ? [...new Set(emoColors)].slice(0, 5)
      : [baseColor];
    return { moodSummary, palette, emotions: emoEn, emotionObjs: chosen, arousal, emoNames, stats: { mid, high, hugs } };
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
      <div class="pt-intro card">
        <span class="pt-em">❋</span>
        <div class="pt-intro-txt">
          <div class="pt-hint">把今天的情绪，炼成一幅只属于你的画</div>
          <div class="pt-mood muted">${mood.moodSummary}</div>
        </div>
      </div>

      <div class="pt-picker">
        <div class="pt-picker-title">再选几种此刻的心情，让颜色更贴合你 <span class="muted">（可多选）</span></div>
        <div class="pt-chips" id="ptChips"></div>
      </div>

      <button id="ptGen" class="pt-gen">生成今日画像</button>
      <div class="pt-note muted">gpt-image-2 生成 · 需先在 ⚙︎ 填官方 API</div>
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
    // ③ 用当天色板铺一张柔光渐变占位图，等待不再是空白转圈——像"画正在显影"
    document.getElementById('ptBody').innerHTML =
      `<div class="pt-canvas card pt-canvas-loading" style="background:${paletteGradient(mood.palette)}">
         <div class="pt-loading"><div class="pt-spin"></div><div class="muted">正在为你炼一幅画…</div></div>
       </div>`;

    try {
      AI.loadFromStore();
      const prompt = AI.portraitPrompt({
        palette: mood.palette,
        emotionObjs: mood.emotionObjs,
        arousal: mood.arousal,
        moodSummary: mood.moodSummary,
      });

      // ④ 图片与短诗并行请求：总时长 = 较慢的那个，而不是二者相加
      // 注：size 用 AI.image 默认的 1024x1024（gpt-image-2 不接受 512，会 400）
      const imgP = AI.image(prompt);
      const poemP = AI.chat([
        { role: 'system', content: '你是"小知"，一个高敏感、克制、诗意的陪伴者。请把用户今天的情绪，写成一首短诗，来映照这幅由TA情绪生成的抽象画。要求：4-6 行；每行一句、简短克制（每行尽量不超过 14 字）；行与行之间用换行符分隔；不要标题、不要引号、不要解释说明、不要报数据。诚实地贴着TA真实的情绪去写——如果今天是沉、是累、是孤独、是愤怒，就让诗也有那个重量与真实，不要强行转折成温暖或希望，不要说教安慰。只写出那份被看见的共鸣本身。只输出诗句。' },
        { role: 'user', content: `今天的情绪：${mood.moodSummary}。请为这幅画写一首诚实映照这份心情的小诗。` },
      ], { maxTokens: 220 }).catch(() => '');   // 诗失败不拖累图，落本地兜底

      const [imgUrl, poemOut] = await Promise.all([imgP, poemP]);
      if (!imgUrl) throw new Error('未返回图片');

      // AI 没出诗（模型不可用/返回空）时，用按情绪拼的本地兜底诗，而不是把数据概述当诗
      let interpretation = (poemOut && poemOut.trim()) ? poemOut.trim() : fallbackPoem(mood);

      // 图片存 IndexedDB（~1-2MB base64 会撑爆 localStorage），localStorage 只留 imgKey 引用
      const imgKey = 'pt-' + Store._uid();
      let stored = false;
      try { await ImageStore.save(imgKey, imgUrl); stored = true; } catch (e) { console.warn('[portrait] image save fail', e); }

      const rec = Store.addPortrait({
        imgKey: stored ? imgKey : undefined,
        imgUrl: stored ? undefined : imgUrl, // 存图失败才退回内联（本次会话可见，刷新后丢）
        palette: mood.palette, interpretation, moodSummary: mood.moodSummary,
        emoNames: mood.emoNames || [],
      });
      // 本次展示直接用内存里的 dataURL，省一次 IndexedDB 读取
      showPortrait(Object.assign({}, rec, { imgUrl }));
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
        <img alt="今日心灵画像" class="pt-img" id="ptImg" src="${rec.imgUrl || ''}"/>
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
    // 内存里没有 dataURL（如刷新后重进）→ 从 IndexedDB 按 imgKey 取回
    if (!rec.imgUrl && rec.imgKey) {
      ImageStore.get(rec.imgKey).then(url => {
        const img = document.getElementById('ptImg');
        if (img && url) img.src = url;
      }).catch(() => {});
    }
    const rb = document.getElementById('ptRegen');
    if (rb) rb.onclick = () => { removeToday(rec.date, rec.imgKey); showEmpty(); };
  }

  // 本地兜底诗：AI 不可用时按所选情绪拼出短诗，诚实映照而非安慰美化。
  // 绝不再把 moodSummary 数据概述当诗显示。
  const POEM_LINES = {
    '开心': '今天有光，落在心上',
    '平静': '风停了，水面很静',
    '难过': '有些重量，压在胸口',
    '焦虑': '心里有根线，绷得很紧',
    '幸福': '这一刻，觉得被填满',
    '自豪': '我做到了，值得记下',
    '孤独': '很大的空里，只有我一个',
    '愤怒': '有团火，在往外撞',
    '兴奋': '心跳快了半拍',
    '感动': '有什么，悄悄漫上来',
    '失望': '期待落了地，没有回声',
    '恐惧': '暗处有影子，靠得很近',
    '累':   '身体在说，我撑不住了',
    '困惑': '雾里走着，找不到路',
    '尴尬': '想找个地方，把自己收起来',
    '不知道': '说不清，只是有点乱',
  };
  function fallbackPoem(mood) {
    const names = (mood.emoNames || []).filter(n => POEM_LINES[n]);
    if (names.length) {
      const body = names.slice(0, 4).map(n => POEM_LINES[n]);
      return ['这一天，我看见你——', ...body].join('\n');
    }
    // 连情绪也没选：用波动强度给一句
    if (mood.arousal === 'high') return '心潮几次涨落\n都被悄悄记下';
    if (mood.arousal === 'mid')  return '在平稳与起伏之间\n轻轻摇摆着';
    return '今天很安静\n像被柔光收着';
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

  // 重新生成：移除当天旧记录（同时清掉 IndexedDB 里的旧图，避免占用）
  function removeToday(date, imgKey) {
    try {
      const list = Store.getPortraits().filter(p => p.date !== date);
      localStorage.setItem('hbn.portraits', JSON.stringify(list));
    } catch (e) {}
    if (imgKey) { try { ImageStore.remove(imgKey); } catch (e) {} }
  }

  function fmtDate(d) {
    const [y, m, day] = d.split('-');
    return `${y}年${m}月${day}日`;
  }

  // 用当天色板拼一张柔和径向渐变，作生成时的占位底（越像最终画，等待越安心）
  function paletteGradient(palette) {
    const cs = (palette && palette.length ? palette : ['#E8D6C7', '#D4B8A5']).slice(0, 4);
    if (cs.length === 1) return `radial-gradient(120% 120% at 30% 25%, ${cs[0]}, var(--accent-soft))`;
    const spots = [
      `radial-gradient(90% 90% at 25% 20%, ${cs[0]}, transparent 62%)`,
      `radial-gradient(85% 85% at 80% 30%, ${cs[1] || cs[0]}, transparent 60%)`,
      cs[2] && `radial-gradient(90% 90% at 70% 85%, ${cs[2]}, transparent 62%)`,
      cs[3] && `radial-gradient(80% 80% at 20% 80%, ${cs[3]}, transparent 60%)`,
    ].filter(Boolean);
    return spots.join(',') + `, ${cs[0]}`;
  }

  function injectStyle() {
    if (document.getElementById('pt-style')) return;
    const s = document.createElement('style');
    s.id = 'pt-style';
    s.textContent = `
      /* 整页填满固定屏，不滚动 */
      .pt-wrap{display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;}
      #ptBody{flex:1;min-height:0;display:flex;flex-direction:column;}
      .pt-head{text-align:center;flex:none;}
      .pt-date{font-size:12px;color:var(--sub);}
      .pt-title{font-family:var(--font-serif);font-size:19px;font-weight:600;letter-spacing:1px;margin-top:1px;}
      /* 结果态：画保持正方形、不拉伸；在剩余空间内自适应，画占多大位置就占多大 */
      .pt-canvas{padding:0;background:transparent;box-shadow:none;overflow:visible;
        flex:1;min-height:0;display:flex;align-items:center;justify-content:center;}
      .pt-img{max-width:100%;max-height:100%;width:auto;height:auto;aspect-ratio:1/1;object-fit:cover;
        display:block;border-radius:var(--radius);box-shadow:var(--shadow);animation:ptFadeIn 1s var(--ease-calm);}
      @keyframes ptFadeIn{from{opacity:0;transform:scale(1.02)}to{opacity:1;transform:scale(1)}}
      /* 生成中的色板渐变占位：柔和呼吸，像画在慢慢显影 */
      .pt-canvas-loading{aspect-ratio:1/1;flex:none;border-radius:var(--radius);
        animation:breathe 6s var(--ease-calm) infinite;}
      .pt-canvas-loading .pt-loading .muted{color:rgba(58,53,47,.6);}
      /* 空状态：介绍卡为主视觉——放大、近正方形、内容居中，吃掉多余留白 */
      .pt-intro{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:16px;padding:28px 26px;text-align:center;}
      .pt-intro .pt-em{font-size:64px;line-height:1;color:var(--accent);flex:none;}
      .pt-hint{font-size:16px;font-weight:600;line-height:1.5;}
      .pt-mood{font-size:13px;line-height:1.7;margin-top:2px;max-width:22em;}
      .pt-note{font-size:11px;text-align:center;margin-top:8px;flex:none;}
      .pt-gen{width:100%;margin-top:14px;flex:none;}
      .pt-picker{padding:2px 2px;flex:none;}
      .pt-palette,.pt-emotags{flex:none;}
      .pt-picker-title{font-size:13px;line-height:1.6;margin-bottom:12px;text-align:center;}
      .pt-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}
      .pt-chip{background:var(--surface);color:var(--ink);border:1.5px solid var(--line);
        border-radius:999px;padding:7px 13px;font-size:13px;display:flex;align-items:center;gap:6px;box-shadow:var(--shadow-soft);}
      .pt-chip .pt-chip-dot{width:10px;height:10px;border-radius:50%;background:var(--c);}
      .pt-chip.on{background:var(--cl);border-color:var(--c);color:var(--ink);font-weight:600;}
      .pt-emotags{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;}
      .pt-emotag{font-size:12px;padding:4px 11px;border-radius:999px;font-weight:600;}
      .pt-loading{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:30px;}
      .pt-spin{width:34px;height:34px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:ptSpin 1s linear infinite;}
      @keyframes ptSpin{to{transform:rotate(360deg)}}
      .pt-palette{display:flex;gap:8px;justify-content:center;}
      .pt-sw{width:28px;height:28px;border-radius:50%;box-shadow:var(--shadow);}
      .pt-interp{position:relative;text-align:center;padding:16px 22px 14px;flex:none;}
      .pt-quote{position:absolute;top:2px;left:16px;font-size:34px;line-height:1;color:var(--accent);opacity:.35;
        font-family:Georgia,"Songti SC",serif;}
      .pt-poem{display:flex;flex-direction:column;gap:5px;
        font-family:"STKaiti","Kaiti SC","KaiTi","楷体","Songti SC",serif;}
      .pt-line{font-size:14px;line-height:1.6;letter-spacing:1.5px;color:var(--ink);}
    `;
    document.head.appendChild(s);
  }

  window.Pages = window.Pages || {};
  window.Pages['portrait'] = { render };
})();
