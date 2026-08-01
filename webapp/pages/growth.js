/**
 * growth.js — 心迹（成长轨迹）P1 ✿
 * 长期"被理解"的可视化：温柔回访 + 陪伴印记 + 画像画廊(色调演变) + 情绪月历 + 情感粒度档案。
 * 只读聚合，不生成/不采样——生成画像在 portrait 页，实时趋势在 realtime 页，本页只回望长期。
 * 依赖：Store（只读）、ImageStore、Emotions/EmotionBy、tokens.css
 * 注册到 window.Pages['growth']
 *
 * HSP 安全约束（产品文档 批判12）：绝不做打卡施压/断签焦虑。
 * streakDays 只以"温柔回访"正向呈现，永不出现"你已 N 天没来""连续中断"等施压文案。
 */
(function () {
  'use strict';

  let el;
  let calCursor = null;         // 月历当前查看的月份（Date，指向某月1号）
  let sessionGap = undefined;   // 本次会话进入心迹时距上次的天数（只在首次进入时定格，避免再渲染时被清零）

  const LEVEL_COLOR = { low: 'var(--calm)', mid: 'var(--mid)', high: 'var(--high)', crit: 'var(--high)' };

  // ---- 小工具 ----
  const $ = (sel) => el && el.querySelector(sel);
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function ymd(ts) { const d = new Date(ts); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
  // 月历一律走 UTC，与 store 的 ymd（toISOString）对齐，避免 UTC+8 跨零点错位
  function fmtMonthCn(d) { return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`; }
  function daysBetween(a, b) { return Math.round((b - a) / 86400e3); }

  // 一个事件的代表色：优先用户主观情绪色，否则退到客观压力档位色
  function eventColor(ev) {
    if (ev.mood) { const e = window.EmotionBy(ev.mood); if (e) return e.color; }
    return LEVEL_COLOR[ev.level] || 'var(--line)';
  }

  // ============================================================
  // 渲染主入口
  // ============================================================
  function render(container) {
    el = container;
    injectStyle();

    const events = Store.getEvents();
    const portraits = Store.getPortraits();

    // 完全空的新用户：给一个温柔空态 + 载入演示数据入口（演示用，不污染契约）
    if (!events.length && !portraits.length) {
      el.innerHTML = `
        <div class="gr-wrap">
          ${revisitHtml()}
          <div class="gr-empty card">
            <div class="gr-empty-em">✿</div>
            <div class="gr-empty-title">你的心迹还是一张白纸</div>
            <div class="gr-empty-sub muted">
              戴上伙伴去感受，或去「心灵画像」炼一幅画——<br>
              这里会慢慢长出属于你的色彩与轨迹。
            </div>
            <button class="ghost gr-demo-btn" id="grDemo">载入一段演示心迹</button>
          </div>
        </div>`;
      const b = $('#grDemo');
      if (b) b.onclick = () => { seedDemo(); render(el); };
      return;
    }

    if (!calCursor) { const t = new Date(); calCursor = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)); }

    el.innerHTML = `
      <div class="gr-wrap">
        ${revisitHtml()}
        <div id="grCompanion"></div>
        <div id="grGallery"></div>
        <div id="grCalendar"></div>
        <div id="grGranularity"></div>
      </div>`;

    renderCompanion();
    renderGallery();
    renderCalendar();
    renderGranularity();
  }

  // ============================================================
  // ① 温柔回访（顶部一句话，永远是拥抱不是施压）
  // ============================================================
  // 首次进入本页时：读上次活跃日算出"隔了几天"，然后把今天写回 lastActive。
  // 只算一次并缓存在 sessionGap，避免同一会话内多次 render 把间隔清成 0。
  function touchVisit() {
    if (sessionGap !== undefined) return sessionGap;
    const g = Store.getGrowth();
    const today = Store._today();
    if (g.lastActive) {
      const a = new Date(g.lastActive + 'T00:00:00Z').getTime();
      const b = new Date(today + 'T00:00:00Z').getTime();
      sessionGap = isNaN(a) ? null : Math.max(0, daysBetween(a, b));
    } else {
      sessionGap = null;   // 从没来过
    }
    if (g.lastActive !== today) { g.lastActive = today; Store.setGrowth(g); }
    return sessionGap;
  }

  function revisitHtml() {
    const gap = touchVisit();

    let line;
    if (gap == null) line = '很高兴你来到这里';
    else if (gap <= 0) line = '你又回来了，真好';
    else if (gap === 1) line = '昨天的心情，今天也被好好收着';
    else if (gap <= 7) line = `${gap} 天没见，你回来了，真好`;
    else line = '好久不见，无论去了哪里，这里一直都在';

    return `
      <div class="gr-revisit">
        <div class="gr-revisit-line">${escapeHtml(line)}</div>
        <div class="gr-revisit-sub muted">心迹 · 你被理解的轨迹</div>
      </div>`;
  }

  // ============================================================
  // ② 陪伴印记（被环抱 N 次 / 一起度过 N 个绷紧的时刻）
  // ============================================================
  function renderCompanion() {
    const box = $('#grCompanion');
    if (!box) return;
    const g = Store.getGrowth();
    const events = Store.getEvents();

    const hugs = g.ringHugCount || 0;
    const tense = events.filter(e => e.level === 'high' || e.level === 'crit').length;
    // 陪伴天数：有任何记录的不同日期数
    const days = new Set(events.map(e => ymd(e.ts))).size;

    box.innerHTML = `
      <div class="gr-companion card">
        <div class="gr-sec-title">陪伴印记</div>
        <div class="gr-stats">
          <div class="gr-stat">
            <div class="gr-stat-num">${hugs}</div>
            <div class="gr-stat-label muted">被环抱</div>
          </div>
          <div class="gr-stat">
            <div class="gr-stat-num">${tense}</div>
            <div class="gr-stat-label muted">一起走过的<br>绷紧时刻</div>
          </div>
          <div class="gr-stat">
            <div class="gr-stat-num">${days}</div>
            <div class="gr-stat-label muted">相伴天数</div>
          </div>
        </div>
        <div class="gr-companion-note muted">
          ${companionNote(hugs, tense)}
        </div>
      </div>`;
  }

  function companionNote(hugs, tense) {
    if (!hugs && !tense) return '还没有一起经历波动——不急，我在这里等你。';
    if (tense) return `我们一起度过了 ${tense} 个身体绷紧的时刻，每一次，你都没有独自扛。`;
    return `伙伴环抱了你 ${hugs} 次，那是身体替你说的"我在"。`;
  }

  // ============================================================
  // ③ 画像画廊（色调演变：灰蓝 → 暖金 一眼可见）
  // ============================================================
  function renderGallery() {
    const box = $('#grGallery');
    if (!box) return;
    // 旧 → 新，让色调演变从左到右读出来
    const list = Store.getPortraits().slice().reverse();

    if (!list.length) {
      box.innerHTML = `
        <div class="gr-gallery card">
          <div class="gr-sec-title">画像画廊</div>
          <div class="gr-gallery-empty muted">
            还没有心灵画像。去「心灵画像」把某天的情绪炼成一幅画，<br>
            它们会在这里连成一条会变暖的色带。
          </div>
        </div>`;
      return;
    }

    // 色带：每幅画取主色，拼成一条演变条
    const ribbon = list.map(p => {
      const c = (p.palette && p.palette[0]) || 'var(--line)';
      return `<span class="gr-ribbon-seg" style="background:${escapeHtml(c)}"></span>`;
    }).join('');

    const cards = list.map((p, i) => `
      <button class="gr-thumb" data-i="${i}" style="--pc:${escapeHtml((p.palette && p.palette[0]) || 'var(--line)')}">
        <span class="gr-thumb-img" data-key="${escapeHtml(p.imgKey || '')}"
          style="background:${escapeHtml((p.palette && p.palette[0]) || 'var(--line)')}">
          ${p.imgUrl ? `<img src="${escapeHtml(p.imgUrl)}" alt=""/>` : ''}
        </span>
        <span class="gr-thumb-date muted">${escapeHtml((p.date || '').slice(5))}</span>
      </button>`).join('');

    box.innerHTML = `
      <div class="gr-gallery card">
        <div class="gr-sec-title">画像画廊 <span class="gr-sec-hint muted">色调演变 · 从左到右</span></div>
        <div class="gr-ribbon">${ribbon}</div>
        <div class="gr-ribbon-axis muted"><span>更早</span><span>最近</span></div>
        <div class="gr-thumbs">${cards}</div>
      </div>`;

    // 异步补齐缩略图（存在 IndexedDB 里的图，只有 imgKey）
    box.querySelectorAll('.gr-thumb-img[data-key]').forEach(span => {
      const key = span.dataset.key;
      if (key && !span.querySelector('img')) {
        ImageStore.get(key).then(url => {
          if (url) span.innerHTML = `<img src="${url}" alt=""/>`;
        }).catch(() => {});
      }
    });

    box.querySelectorAll('.gr-thumb').forEach(btn => {
      btn.onclick = () => openPortrait(list[+btn.dataset.i]);
    });
  }

  // 画像详情弹层（只读回看，不提供重新生成——那是 portrait 页的职责）
  function openPortrait(p) {
    let dlg = document.getElementById('grDlg');
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.id = 'grDlg';
      dlg.className = 'gr-dlg';
      document.body.appendChild(dlg);
    }
    const poem = (p.interpretation || p.moodSummary || '')
      .split(/\n+/).map(s => s.trim()).filter(Boolean)
      .map(l => `<div class="gr-dlg-line">${escapeHtml(l)}</div>`).join('');
    const tags = (p.emoNames || []).map(n => {
      const e = window.EmotionBy(n);
      return `<span class="gr-dlg-tag" style="background:${e ? e.light : 'var(--line)'};color:${e ? e.color : 'var(--sub)'}">${escapeHtml(n)}</span>`;
    }).join('');

    dlg.innerHTML = `
      <div class="gr-dlg-mask"></div>
      <div class="gr-dlg-card card">
        <div class="gr-dlg-date muted">${escapeHtml(p.date || '')}</div>
        <div class="gr-dlg-canvas" style="background:${escapeHtml((p.palette && p.palette[0]) || 'var(--line)')}">
          ${p.imgUrl ? `<img src="${escapeHtml(p.imgUrl)}" alt=""/>` : '<span class="gr-dlg-imgph"></span>'}
        </div>
        ${tags ? `<div class="gr-dlg-tags">${tags}</div>` : ''}
        ${poem ? `<div class="gr-dlg-poem">${poem}</div>` : ''}
        <button class="ghost gr-dlg-close">合上</button>
      </div>`;
    dlg.style.display = 'flex';

    // 弹层里若只有 imgKey，异步取回大图
    if (!p.imgUrl && p.imgKey) {
      ImageStore.get(p.imgKey).then(url => {
        const c = dlg.querySelector('.gr-dlg-canvas');
        if (url && c) c.innerHTML = `<img src="${url}" alt=""/>`;
      }).catch(() => {});
    }
    const close = () => { dlg.style.display = 'none'; };
    dlg.querySelector('.gr-dlg-mask').onclick = close;
    dlg.querySelector('.gr-dlg-close').onclick = close;
  }

  // ============================================================
  // ④ 情绪月历（移植知愈"日历按当天主色着色"的概念，原生 H5 重写）
  //    这是"多天趋势"视图，区别于 realtime 页的 24h 当日趋势，不冲突
  // ============================================================
  function renderCalendar() {
    const box = $('#grCalendar');
    if (!box) return;

    const year = calCursor.getUTCFullYear();
    const month = calCursor.getUTCMonth();
    const startDow = new Date(Date.UTC(year, month, 1)).getUTCDay();   // 0=周日
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    // 聚合该月每天的事件 → 当天代表色（取当天最强档位的那条事件的颜色）
    const byDate = {};
    Store.getEvents().forEach(ev => {
      const k = ymd(ev.ts);
      if (!k) return;                       // 跳过缺失/非法 ts 的坏记录，不让一条脏数据拖垮整页
      (byDate[k] = byDate[k] || []).push(ev);
    });

    const rank = { low: 0, mid: 1, high: 2, crit: 3 };
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div class="gr-cal-cell gr-cal-blank"></div>');
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const evs = byDate[key] || [];
      let cell;
      if (evs.length) {
        // 取当天档位最高的一条作代表色
        const rep = evs.slice().sort((a, b) => (rank[b.level] || 0) - (rank[a.level] || 0))[0];
        const color = eventColor(rep);
        const dot = evs.length > 1 ? `<span class="gr-cal-count">${evs.length}</span>` : '';
        cell = `<div class="gr-cal-cell gr-cal-on" data-date="${key}" style="--dc:${escapeHtml(color)}">
          <span class="gr-cal-day">${d}</span>${dot}</div>`;
      } else {
        cell = `<div class="gr-cal-cell"><span class="gr-cal-day muted">${d}</span></div>`;
      }
      cells.push(cell);
    }

    // 是否允许翻到下个月：不超过本月
    const now = new Date();
    const atCurrent = year === now.getUTCFullYear() && month === now.getUTCMonth();

    box.innerHTML = `
      <div class="gr-cal card">
        <div class="gr-cal-head">
          <button class="gr-cal-nav" id="grCalPrev">‹</button>
          <div class="gr-cal-title">${fmtMonthCn(calCursor)}</div>
          <button class="gr-cal-nav" id="grCalNext" ${atCurrent ? 'disabled' : ''}>›</button>
        </div>
        <div class="gr-cal-week">
          ${['日', '一', '二', '三', '四', '五', '六'].map(w => `<span>${w}</span>`).join('')}
        </div>
        <div class="gr-cal-grid">${cells.join('')}</div>
        <div class="gr-cal-legend muted">
          <span><i style="background:var(--calm)"></i>平静</span>
          <span><i style="background:var(--mid)"></i>微澜</span>
          <span><i style="background:var(--high)"></i>起伏</span>
          <span class="gr-cal-legend-note">· 有情绪色的天以你当天心情着色</span>
        </div>
        <div id="grDay"></div>
      </div>`;

    $('#grCalPrev').onclick = () => { calCursor = new Date(Date.UTC(year, month - 1, 1)); renderCalendar(); };
    const nx = $('#grCalNext');
    if (nx && !nx.disabled) nx.onclick = () => { calCursor = new Date(Date.UTC(year, month + 1, 1)); renderCalendar(); };
    box.querySelectorAll('.gr-cal-on').forEach(c => {
      c.onclick = () => showDay(c.dataset.date, byDate[c.dataset.date] || []);
    });
  }

  // 点某天 → 展开当天的情绪时刻（回看，不可编辑）
  function showDay(date, evs) {
    const box = $('#grDay');
    if (!box) return;
    const rows = evs.slice().sort((a, b) => a.ts - b.ts).map(e => {
      const t = new Date(e.ts).toTimeString().slice(0, 5);
      const emo = e.mood ? window.EmotionBy(e.mood) : null;
      const label = emo ? emo.name : ({ low: '平静', mid: '微澜', high: '起伏', crit: '强烈' }[e.level] || '');
      return `<div class="gr-day-row">
        <span class="gr-day-time muted">${t}</span>
        <span class="gr-day-dot" style="background:${eventColor(e)}"></span>
        <span class="gr-day-text">${escapeHtml(e.note || (label + ' 时刻'))}</span>
      </div>`;
    }).join('');
    box.innerHTML = `
      <div class="gr-day">
        <div class="gr-day-head muted">${escapeHtml(date)} · ${evs.length} 个时刻</div>
        ${rows}
      </div>`;
  }

  // ============================================================
  // ⑤ 情感粒度档案（用过多少种情绪词 = 命名能力成长）
  // ============================================================
  function renderGranularity() {
    const box = $('#grGranularity');
    if (!box) return;

    // 统计每种情绪被"主观命名"的次数。
    // 主观命名有两个来源，都算数（见 docs：情感粒度=用户为感受命名的能力）：
    //   1) events.mood —— 手动补录/未来任何带 mood 的事件
    //   2) portraits.emoNames —— 心灵画像页手选的情绪（同为 16 主类 name，同命名空间）
    // 环抱页/小知页的压力事件只有 level、无 mood，是"体感真相"而非"主观命名"，故不计入。
    // 只统计"合法的 16 主类"名字，其它一律忽略（先按主类上线；将来接 sub 词再放开）
    const valid = new Set(window.Emotions.map(e => e.name));
    const count = {};
    const tally = n => { if (valid.has(n)) count[n] = (count[n] || 0) + 1; };
    Store.getEvents().forEach(e => { if (e.mood) tally(e.mood); });
    Store.getPortraits().forEach(p => (p.emoNames || []).forEach(tally));
    const used = Object.keys(count);
    const total = window.Emotions.length;

    const chips = window.Emotions.map(e => {
      const n = count[e.name] || 0;
      const on = n > 0;
      return `<span class="gr-gran-chip${on ? ' on' : ''}"
        style="${on ? `background:${e.light};color:${e.color};border-color:${e.color}` : ''}">
        ${escapeHtml(e.name)}${on ? `<b>·${n}</b>` : ''}</span>`;
    }).join('');

    box.innerHTML = `
      <div class="gr-gran card">
        <div class="gr-sec-title">情感粒度档案</div>
        <div class="gr-gran-progress">
          <div class="gr-gran-bar"><span style="width:${Math.round(used.length / total * 100)}%"></span></div>
          <div class="gr-gran-count muted">已能命名 <b>${used.length}</b> / ${total} 种心情</div>
        </div>
        <div class="gr-gran-note muted">${granularityNote(used.length)}</div>
        <div class="gr-gran-chips">${chips}</div>
      </div>`;
  }

  function granularityNote(n) {
    if (n === 0) return '当你开始为感受命名，这里会记下你越来越清晰的语言。';
    if (n <= 3) return '你已经开始为模糊的感受，找到名字了。';
    if (n <= 8) return '从"只是不舒服"到能分辨委屈、失落、疲惫——你的感受正在被听懂。';
    return '你已经能相当精细地命名内心的天气，这是很珍贵的能力。';
  }

  // ============================================================
  // 演示数据（仅空态手动触发；走标准 Store 接口，不改契约）
  // ============================================================
  function seedDemo() {
    const DAY = 86400e3;
    const now = Date.now();
    // 一段两周的心迹：色调从灰蓝(负向) → 暖金(正向)，情绪词由粗到细
    const script = [
      { d: 13, mood: '不知道', level: 'high', note: '说不清哪里不对，就是很紧' },
      { d: 12, mood: '累',     level: 'high' },
      { d: 11, mood: '难过',   level: 'mid' },
      { d: 10, mood: '孤独',   level: 'high', note: '好像只有我看见了' },
      { d: 8,  mood: '焦虑',   level: 'mid' },
      { d: 7,  mood: '失望',   level: 'mid' },
      { d: 5,  mood: '平静',   level: 'low' },
      { d: 4,  mood: '感动',   level: 'low', note: '被接住的一刻' },
      { d: 2,  mood: '幸福',   level: 'low' },
      { d: 1,  mood: '开心',   level: 'low' },
      { d: 0,  mood: '平静',   level: 'low' },
    ];
    script.forEach(s => {
      const emo = window.EmotionBy(s.mood);
      Store.addEvent({
        ts: now - s.d * DAY + 14 * 3600e3,   // 当天下午
        type: 'manual', level: s.level, source: 'user',
        mood: s.mood, note: s.note,
        hr: 70 + (s.level === 'high' ? 22 : s.level === 'mid' ? 10 : 0),
        hrv: s.level === 'high' ? 22 : s.level === 'mid' ? 38 : 55,
      });
      // 每隔几天留一幅画像，色板用该情绪主色 → 画廊色带演变
      if ([13, 10, 7, 4, 1].includes(s.d) && emo) {
        Store.addPortrait({
          date: ymd(now - s.d * DAY),
          palette: [emo.color, emo.light],
          moodSummary: `那天的心情里，有「${emo.name}」`,
          interpretation: `那天有些${emo.name}\n身体先替我记下了\n此刻回看\n它已经成了我的一部分`,
          emoNames: [emo.name],
        });
      }
    });
    // 陪伴印记 + 温柔回访
    const g = Store.getGrowth();
    g.ringHugCount = (g.ringHugCount || 0) + 12;
    g.streakDays = Math.max(g.streakDays || 0, 5);
    g.lastActive = ymd(now - 2 * DAY);
    Store.setGrowth(g);
    sessionGap = undefined;   // 让演示重新计算"隔了几天"，回访问候能演示出来
  }

  // ============================================================
  // 样式（全部 .gr- 前缀，隔离，不污染其它页）
  // ============================================================
  function injectStyle() {
    if (document.getElementById('gr-style')) return;
    const s = document.createElement('style');
    s.id = 'gr-style';
    s.textContent = `
      .gr-wrap{display:flex;flex-direction:column;gap:14px;}
      .gr-sec-title{font-size:16px;font-weight:700;margin-bottom:12px;display:flex;align-items:baseline;gap:8px;}
      .gr-sec-hint{font-size:12px;font-weight:400;}

      /* 温柔回访 */
      .gr-revisit{text-align:center;padding:6px 0 2px;}
      .gr-revisit-line{font-size:18px;font-weight:700;letter-spacing:1px;}
      .gr-revisit-sub{font-size:12px;margin-top:4px;letter-spacing:2px;}

      /* 陪伴印记 */
      .gr-stats{display:flex;justify-content:space-around;text-align:center;gap:8px;}
      .gr-stat-num{font-size:30px;font-weight:800;color:var(--accent-deep);line-height:1.1;}
      .gr-stat-label{font-size:12px;margin-top:6px;line-height:1.35;}
      .gr-companion-note{font-size:13px;line-height:1.7;margin-top:16px;text-align:center;
        border-top:1px solid var(--line);padding-top:14px;}

      /* 画像画廊 */
      .gr-ribbon{display:flex;height:18px;border-radius:999px;overflow:hidden;box-shadow:var(--shadow);}
      .gr-ribbon-seg{flex:1;}
      .gr-ribbon-axis{display:flex;justify-content:space-between;font-size:11px;margin:6px 2px 14px;}
      .gr-thumbs{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;}
      .gr-thumb{flex:none;background:transparent;padding:0;display:flex;flex-direction:column;
        align-items:center;gap:5px;width:72px;}
      .gr-thumb-img{width:72px;height:72px;border-radius:14px;overflow:hidden;display:block;
        box-shadow:var(--shadow);}
      .gr-thumb-img img{width:100%;height:100%;object-fit:cover;display:block;}
      .gr-thumb-date{font-size:11px;}
      .gr-gallery-empty,.gr-cal-blank{font-size:13px;line-height:1.7;}
      .gr-gallery-empty{text-align:center;padding:12px 0 4px;}

      /* 情绪月历 */
      .gr-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
      .gr-cal-title{font-size:16px;font-weight:700;}
      .gr-cal-nav{background:transparent;color:var(--accent-deep);font-size:22px;padding:2px 12px;line-height:1;}
      .gr-cal-nav:disabled{color:var(--line);}
      .gr-cal-week{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;
        font-size:12px;color:var(--sub);margin-bottom:6px;}
      .gr-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}
      .gr-cal-cell{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;
        position:relative;border-radius:10px;}
      .gr-cal-blank{background:transparent;}
      .gr-cal-day{font-size:13px;}
      .gr-cal-on{background:color-mix(in srgb, var(--dc) 32%, var(--surface));cursor:pointer;}
      .gr-cal-on .gr-cal-day{color:var(--ink);font-weight:600;}
      .gr-cal-count{position:absolute;top:3px;right:4px;font-size:9px;color:var(--sub);
        background:var(--surface);border-radius:999px;padding:0 4px;min-width:12px;text-align:center;}
      .gr-cal-legend{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:11px;margin-top:12px;}
      .gr-cal-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:-1px;}
      .gr-cal-legend-note{opacity:.85;}

      /* 某天详情 */
      .gr-day{margin-top:14px;border-top:1px solid var(--line);padding-top:12px;
        display:flex;flex-direction:column;gap:9px;}
      .gr-day-head{font-size:12px;}
      .gr-day-row{display:flex;align-items:center;gap:10px;}
      .gr-day-time{font-size:12px;width:38px;flex:none;}
      .gr-day-dot{width:9px;height:9px;border-radius:50%;flex:none;}
      .gr-day-text{font-size:13px;}

      /* 情感粒度 */
      .gr-gran-progress{margin-bottom:8px;}
      .gr-gran-bar{height:8px;border-radius:999px;background:var(--line);overflow:hidden;}
      .gr-gran-bar span{display:block;height:100%;border-radius:999px;
        background:linear-gradient(90deg,var(--calm),var(--accent));transition:width .4s ease;}
      .gr-gran-count{font-size:12px;margin-top:6px;}
      .gr-gran-count b,.gr-stat-num b{color:var(--accent-deep);}
      .gr-gran-note{font-size:13px;line-height:1.7;margin:4px 0 14px;}
      .gr-gran-chips{display:flex;flex-wrap:wrap;gap:7px;}
      .gr-gran-chip{font-size:12px;padding:5px 11px;border-radius:999px;
        border:1.5px solid var(--line);color:var(--sub);background:var(--surface);}
      .gr-gran-chip.on{font-weight:600;}
      .gr-gran-chip b{font-weight:700;margin-left:2px;}

      /* 空态 */
      .gr-empty{text-align:center;padding:40px 24px;display:flex;flex-direction:column;gap:12px;align-items:center;}
      .gr-empty-em{font-size:46px;color:var(--accent);}
      .gr-empty-title{font-size:16px;font-weight:700;}
      .gr-empty-sub{font-size:13px;line-height:1.8;}
      .gr-demo-btn{margin-top:6px;}

      /* 画像详情弹层 */
      .gr-dlg{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;padding:24px;}
      .gr-dlg-mask{position:absolute;inset:0;background:color-mix(in srgb, var(--ink) 42%, transparent);}
      .gr-dlg-card{position:relative;width:100%;max-width:340px;max-height:88vh;overflow:auto;
        display:flex;flex-direction:column;gap:12px;text-align:center;}
      .gr-dlg-date{font-size:12px;}
      .gr-dlg-canvas{width:100%;aspect-ratio:1/1;border-radius:16px;overflow:hidden;
        display:flex;align-items:center;justify-content:center;}
      .gr-dlg-canvas img{width:100%;height:100%;object-fit:cover;}
      .gr-dlg-tags{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;}
      .gr-dlg-tag{font-size:12px;padding:4px 11px;border-radius:999px;font-weight:600;}
      .gr-dlg-poem{display:flex;flex-direction:column;gap:10px;padding:6px 0;
        font-family:"STKaiti","Kaiti SC","KaiTi","楷体","Songti SC",serif;}
      .gr-dlg-line{font-size:16px;line-height:1.8;letter-spacing:2px;color:var(--ink);}
    `;
    document.head.appendChild(s);
  }

  window.Pages = window.Pages || {};
  window.Pages['growth'] = { render };
})();
