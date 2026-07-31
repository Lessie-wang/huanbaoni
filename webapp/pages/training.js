/**
 * pages/training.js — 「修习」训练页（表达训练 + 感官写作）
 * 注册到 window.Pages.training = { render(el) }。
 *
 * 搬自知愈小程序 subpages/training 的两个成熟玩法，改写为 vanilla-JS：
 *  1. 模拟对话训练：AI 同演 NPC 与「小知教练」，逐轮点评打分，几轮后结算。
 *  2. 感官写作：选情绪场景 → 逐个感官引导 + 词语卡片 → 拼成成品段落 → 存档。
 *
 * 契约遵守：数据只经 Store / 自建 hbn.training；AI 只调 AI.chat；颜色只用 tokens.css 变量。
 * 无 API Key 时全程用本地 mock 兜底，保证 demo 一定跑通（同 chat.js 模式）。
 * 只编辑本文件，不动 lib/ 与其他页面。
 */
(function (global) {
  'use strict';

  // ============================================================
  // 内容数据（搬自知愈 pages/training.js / sensory-writing.js）
  // ============================================================

  // ---- 模拟对话：预置场景 ----
  const DIALOGUE_SCENARIOS = [
    { id: 'daily',   icon: '❝', title: '日常沟通', difficulty: '初级',
      npcName: '小林', focus: '倾听与共情表达',
      background: '朋友最近情绪低落，约你出来。练习倾听和共情，别急着给建议。',
      firstLine: '唉……最近真的好累，感觉做什么都没意思。' },
    { id: 'refuse',  icon: '⊘', title: '表达拒绝', difficulty: '中级',
      npcName: '同事阿May', focus: '温和而坚定的边界表达',
      background: '同事又一次把她的活推给你，而你自己也很忙。练习温和而坚定地说"不"。',
      firstLine: '这个报表你帮我做一下呗，你比我熟啦，就这一次～' },
    { id: 'conflict', icon: '◈', title: '处理冲突', difficulty: '中级',
      npcName: '室友', focus: '非暴力沟通',
      background: '室友总是很晚还大声打游戏影响你休息。练习不指责地表达感受和需求。',
      firstLine: '怎么了？我在自己房间玩游戏也有错？声音又不大。' },
    { id: 'comfort', icon: '♡', title: '安慰他人', difficulty: '初级',
      npcName: '好友小雨', focus: '陪伴与情感支持',
      background: '好友刚经历分手，很难过地找你倾诉。练习陪伴，而不是评判或说教。',
      firstLine: '我们……分手了。我是不是真的很失败啊。' }
  ];

  // ---- 感官写作：情绪场景 ----
  const WRITING_SCENARIOS = [
    { id: 'rainy_sadness',    icon: '❋', title: '雨天的忧伤', desc: '窗外下着雨，心里有些沉重' },
    { id: 'good_news_joy',    icon: '✦', title: '收到好消息', desc: '期待已久的好消息终于来了' },
    { id: 'late_night_lonely', icon: '✧', title: '深夜的孤独', desc: '夜深了，只有自己还醒着' },
    { id: 'spring_hope',      icon: '✿', title: '春天的期待', desc: '万物复苏，心中涌起希望' },
    { id: 'anger_moment',     icon: '✺', title: '被误解的愤怒', desc: '明明不是那样，却没人理解' },
    { id: 'peaceful_morning', icon: '❍', title: '安静的早晨', desc: '一个人的清晨，世界很安静' }
  ];

  // ---- 五感定义 ----
  const SENSES = [
    { key: 'sight',   label: '视觉', hint: '描述你看到的画面…' },
    { key: 'hearing', label: '听觉', hint: '描述你听到的声音…' },
    { key: 'touch',   label: '触觉', hint: '描述你触碰到的感觉…' },
    { key: 'smell',   label: '嗅觉', hint: '描述你闻到的气味…' },
    { key: 'taste',   label: '味觉', hint: '描述你尝到的味道…' }
  ];

  // ---- 词语卡片池：按场景×感官预置（搬自知愈 senseChips）----
  const SENSE_CHIPS = {
    rainy_sadness: {
      sight: ['灰蒙蒙的天', '窗上的水珠', '昏黄的路灯', '模糊的远方', '积水的倒影'],
      hearing: ['雨滴敲窗', '远处的雷声', '屋檐滴水', '车轮溅水声', '安静的叹息'],
      touch: ['冰凉的玻璃', '潮湿的空气', '湿透的衣角', '手心的温热', '被子的温暖'],
      smell: ['泥土的清新', '潮湿的味道', '雨后青草味', '窗台的霉味', '咖啡的香气'],
      taste: ['嘴唇的涩', '热茶的苦甘', '眼泪的咸', '雨水的清淡', '糖果的甜']
    },
    good_news_joy: {
      sight: ['手机屏幕的光', '窗外的阳光', '眼眶的泪花', '嘴角上扬', '周围的色彩'],
      hearing: ['心跳加速', '自己的笑声', '消息提示音', '远处的音乐', '朋友的祝贺'],
      touch: ['心口的悸动', '紧握的拳头', '发烫的脸颊', '拥抱的温度', '跳跃的双脚'],
      smell: ['空气变甜了', '花香飘来了', '阳光的味道', '蛋糕的甜香', '清晨的空气'],
      taste: ['嘴里发甜', '庆祝的饮料', '开心的巧克力', '微笑的味道', '甜甜的滋味']
    },
    late_night_lonely: {
      sight: ['台灯的光晕', '手机的蓝光', '天花板的阴影', '空荡的房间', '时钟的指针'],
      hearing: ['时钟的滴答', '冰箱的嗡鸣', '远处的车声', '自己的呼吸', '风吹过窗缝'],
      touch: ['冰凉的床单', '枕头的柔软', '蜷缩的身体', '被子裹紧', '眼皮的沉重'],
      smell: ['夜的清冷', '洗衣液的残香', '泡面的味道', '深夜的空气', '枕头的味道'],
      taste: ['嘴里的干涩', '最后一口水', '牙膏的薄荷', '说不出的苦', '深夜的空']
    },
    spring_hope: {
      sight: ['嫩绿的芽', '湛蓝的天', '粉色的花瓣', '飞舞的蝴蝶', '透过叶的光'],
      hearing: ['鸟鸣声', '风吹树叶', '孩子的笑', '流水声', '蜜蜂的嗡嗡'],
      touch: ['暖风拂面', '草地的柔软', '花瓣的丝滑', '阳光的温热', '泥土的松软'],
      smell: ['花香阵阵', '青草味', '泥土的芬芳', '春雨的气息', '树木的清香'],
      taste: ['春茶的清甜', '草莓的酸甜', '嘴唇的润', '新芽的清苦', '蜂蜜的甜']
    },
    anger_moment: {
      sight: ['发红的眼眶', '攥紧的手', '模糊的视线', '对方的表情', '颤抖的手指'],
      hearing: ['心跳擂鼓', '刺耳的话语', '嗡嗡的耳鸣', '自己的喘息', '沉默更响'],
      touch: ['发烫的脸', '绷紧的肩膀', '咬紧的牙', '胸口的压迫', '后背的僵硬'],
      smell: ['空气在燃烧', '呛人的气氛', '汗水的味道', '烟的刺鼻', '闷热的空气'],
      taste: ['嘴里发苦', '咬破的嘴唇', '咽下去的话', '铁锈的味道', '不甘的酸']
    },
    peaceful_morning: {
      sight: ['窗帘缝的光', '杯中的热气', '安静的街道', '绿植的叶子', '桌上的摆设'],
      hearing: ['鸟叫声', '水壶的咕噜', '翻书的沙沙', '猫咪的呼噜', '自己的呼吸'],
      touch: ['温热的杯子', '柔软的拖鞋', '微凉的空气', '伸懒腰的舒展', '阳光晒手背'],
      smell: ['咖啡的香', '面包的焦香', '清晨的空气', '窗外的草味', '干净衣服的味'],
      taste: ['第一口水', '牙膏的薄荷', '早餐的温热', '咖啡的微苦', '蜂蜜的甜润']
    }
  };

  // 本地引导语兜底（无 Key / AI 失败时用）
  const LOCAL_GUIDES = {
    sight: (t) => `想象"${t}"的画面——你看到了什么？光线是明是暗，周围有什么颜色，远处近处各有什么。`,
    hearing: (t) => `在"${t}"的场景里，你听到了什么？可以是人声、风声、雨声，甚至是安静本身。`,
    touch: (t) => `"${t}"的时候，你的身体有什么感觉？手心的温度、衣服的触感、风吹过皮肤。`,
    smell: (t) => `"${t}"的空气里有什么味道？雨后的泥土味、咖啡香，或者某个熟悉的气味。`,
    taste: (t) => `"${t}"的时候嘴里有什么味道？刚喝的水、嘴唇的干涩，或者某种说不清的滋味。`
  };

  // ============================================================
  // 存档：自建 hbn.training（不改 store.js 冻结接口）
  // ============================================================
  const REC_KEY = 'hbn.training';
  function loadRecords() {
    try { const v = localStorage.getItem(REC_KEY); return v ? JSON.parse(v) : []; }
    catch (e) { console.warn('[training] read fail', e); return []; }
  }
  function addRecord(rec) {
    const list = loadRecords();
    const full = Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now() }, rec);
    list.unshift(full);
    try { localStorage.setItem(REC_KEY, JSON.stringify(list)); } catch (e) { console.warn('[training] write fail', e); }
    return full;
  }
  function delRecord(id) {
    const list = loadRecords().filter(r => r.id !== id);
    try { localStorage.setItem(REC_KEY, JSON.stringify(list)); } catch (e) {}
    return list;
  }

  // ============================================================
  // 工具
  // ============================================================
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function isOnline() { const s = Store.getSettings(); return !!(s.apiBaseUrl && s.apiKey); }

  let _toastTimer = null;
  function toast(msg) {
    let t = document.getElementById('tnToast');
    if (!t) { t = document.createElement('div'); t.id = 'tnToast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.className = ''; }, 2200);
  }

  // 开场"静心"仪式：戒指已连时轻触一次共振呼吸（吸4·呼6），无戒指静默跳过
  function gentleAnchor() {
    try {
      const r = global.ring;
      if (r && typeof r.vibrate === 'function' && (r._status === 'monitoring' || r._status === 'baseline' || r._status === 'connected')) {
        r.vibrate('anchor');
      }
    } catch (e) {}
  }

  // 解析 AI 返回的 JSON（容错去掉 ```json 包裹）
  function parseJSON(text) {
    try { return JSON.parse(String(text).replace(/```json\n?|\n?```/g, '').trim()); }
    catch (e) { return null; }
  }

  // ============================================================
  // 页面状态
  // ============================================================
  let rootEl = null;
  const state = {
    view: 'home',     // home | dialogue | writing | records
    // dialogue
    dScenario: null, dPhase: 'intro', dRound: 0, dMsgs: [], dRoundData: [], dThinking: false, dSummary: null,
    // writing
    wScenario: null, wPhase: 'select', wSenseIdx: 0, wInput: '', wWritings: {}, wGuide: '', wThinking: false, wPiece: '',
    // records
    viewingRec: null
  };

  function go(view) { state.view = view; paint(); }

  // ============================================================
  // 渲染主入口
  // ============================================================
  function render(el) {
    AI.loadFromStore();
    rootEl = el;
    injectStyle();
    state.view = 'home';
    state.viewingRec = null;
    paint();
  }

  function paint() {
    if (!rootEl) return;
    let html = '';
    if (state.view === 'home') html = viewHome();
    else if (state.view === 'dialogue') html = viewDialogue();
    else if (state.view === 'writing') html = viewWriting();
    else if (state.view === 'records') html = viewRecords();
    rootEl.innerHTML = `<div class="tn-wrap">${html}</div>`;
    wire();
  }

  // ---------- 首页 ----------
  function viewHome() {
    const n = loadRecords().length;
    return `
      <div class="tn-hero">
        <div class="tn-hero-t">修习</div>
        <div class="tn-hero-s">在安全的练习里，把说不出口的，慢慢练成说得出口的。</div>
      </div>
      <div class="tn-cards">
        <button class="tn-big" data-go="dialogue">
          <div class="tn-big-ic">❝</div>
          <div class="tn-big-t">模拟对话</div>
          <div class="tn-big-d">在情景里练表达：倾听、拒绝、化解冲突、安慰。小知当教练，逐轮陪练。</div>
        </button>
        <button class="tn-big" data-go="writing">
          <div class="tn-big-ic">✎</div>
          <div class="tn-big-t">感官写作</div>
          <div class="tn-big-d">用五感把模糊的情绪写清楚——看见、听见、触到、闻到、尝到。</div>
        </button>
      </div>
      <button class="tn-records-entry" data-go="records">
        <span>修习记录</span><span class="tn-badge">${n}</span>
      </button>
    `;
  }

  // ============================================================
  // 模拟对话
  // ============================================================
  function viewDialogue() {
    const s = state.dScenario;
    if (state.dPhase === 'pick' || !s) return dialoguePick();
    if (state.dPhase === 'intro') return dialogueIntro();
    if (state.dPhase === 'summary') return dialogueSummary();
    return dialogueChat();
  }

  function dialoguePick() {
    const cards = DIALOGUE_SCENARIOS.map(sc => `
      <button class="tn-sc" data-dpick="${sc.id}">
        <span class="tn-sc-ic">${sc.icon}</span>
        <span class="tn-sc-body">
          <span class="tn-sc-t">${esc(sc.title)}<span class="tn-diff">${esc(sc.difficulty)}</span></span>
          <span class="tn-sc-d">${esc(sc.description || sc.background)}</span>
        </span>
      </button>`).join('');
    return `
      ${topbar('模拟对话')}
      <div class="tn-sec-hint">选一个场景，开始练习</div>
      <div class="tn-sc-list">${cards}</div>
    `;
  }

  function dialogueIntro() {
    const s = state.dScenario;
    return `
      ${topbar('模拟对话', 'dialoguePick')}
      <div class="card tn-intro">
        <div class="tn-intro-ava">${esc((s.npcName || '·').slice(-1))}</div>
        <div class="tn-intro-name">${esc(s.npcName || '')}</div>
        <div class="tn-intro-t">${esc(s.title)}</div>
        <div class="tn-intro-bg">${esc(s.background)}</div>
        <div class="tn-intro-focus">训练重点 · ${esc(s.focus)}</div>
        <button class="tn-primary" data-dstart="1">开始练习</button>
      </div>
    `;
  }

  function dialogueChat() {
    const s = state.dScenario;
    const bubbles = state.dMsgs.map(m => {
      if (m.role === 'user') return `<div class="tn-b tn-b-user">${esc(m.text)}</div>`;
      if (m.role === 'coach') return `<div class="tn-coach"><span class="tn-coach-tag">小知教练</span>${esc(m.text)}${m.score ? `<span class="tn-score">${m.score}/5</span>` : ''}</div>`;
      return `<div class="tn-b-npc"><span class="tn-npc-name">${esc(m.name || s.npcName)}</span><div class="tn-b tn-b-other">${esc(m.text)}</div></div>`;
    }).join('');
    const thinking = state.dThinking ? `<div class="tn-b-npc"><div class="tn-b tn-b-other tn-typing"><span></span><span></span><span></span></div></div>` : '';
    return `
      ${topbar(s.title, 'dialoguePick')}
      <div class="tn-round">第 ${state.dRound} 轮</div>
      <div class="tn-log" id="tnLog">${bubbles}${thinking}</div>
      <div class="tn-inputbar">
        <textarea id="tnInput" class="tn-ta" rows="1" placeholder="轮到你了，说点什么…" ${state.dThinking ? 'disabled' : ''}>${esc(state.dInput || '')}</textarea>
        <button class="tn-send" id="tnSend" ${state.dThinking ? 'disabled' : ''}>发送</button>
      </div>
      <button class="tn-ghost-sm" data-dfinish="1">结束并看总结</button>
    `;
  }

  function dialogueSummary() {
    const sm = state.dSummary || {};
    const hl = (sm.highlights || []).map(h => `<li>${esc(h)}</li>`).join('');
    const im = (sm.improvements || []).map(h => `<li>${esc(h)}</li>`).join('');
    return `
      ${topbar('训练总结')}
      <div class="card tn-summary">
        <div class="tn-sum-score">${sm.totalScore != null ? sm.totalScore : '—'}<span>分</span></div>
        <div class="tn-sum-rating">${esc(sm.rating || '完成练习')}</div>
        ${hl ? `<div class="tn-sum-block"><div class="tn-sum-h">亮点</div><ul>${hl}</ul></div>` : ''}
        ${im ? `<div class="tn-sum-block"><div class="tn-sum-h">可以更好</div><ul>${im}</ul></div>` : ''}
        ${sm.insight ? `<div class="tn-sum-insight">${esc(sm.insight)}</div>` : ''}
        ${sm.tip ? `<div class="tn-sum-tip">${esc(sm.tip)}</div>` : ''}
      </div>
      <div class="tn-two-btn">
        <button class="tn-ghost" data-go="home">回修习</button>
        <button class="tn-primary" data-dpick="again">再练一个</button>
      </div>
    `;
  }

  // ---- 对话逻辑 ----
  function startDialogue(sc) {
    state.dScenario = sc; state.dPhase = 'intro';
    state.dRound = 0; state.dMsgs = []; state.dRoundData = []; state.dSummary = null; state.dInput = '';
    paint();
  }

  function beginChat() {
    const s = state.dScenario;
    state.dPhase = 'dialogue';
    state.dRound = 1;
    state.dMsgs = [{ role: 'npc', text: s.firstLine, name: s.npcName }];
    gentleAnchor();
    paint();
    scrollLog();
  }

  async function sendTurn() {
    const ta = document.getElementById('tnInput');
    const text = (ta ? ta.value : '').trim();
    if (!text || state.dThinking) return;
    state.dInput = '';
    state.dMsgs.push({ role: 'user', text });
    state.dThinking = true;
    paint(); scrollLog();

    const s = state.dScenario;
    let res = null;
    if (isOnline()) {
      try {
        const sys = dialogueSystemPrompt(s);
        const convo = state.dMsgs.filter(m => m.role !== 'coach')
          .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
        const reply = await AI.chat([{ role: 'system', content: sys }].concat(convo), { maxTokens: 400 });
        res = parseJSON(reply);
      } catch (e) { console.warn('[training] dialogue AI fail', e); }
    }
    if (!res) res = mockTurn(text, state.dRound);

    state.dThinking = false;
    state.dMsgs.push({ role: 'npc', text: res.npc || '……', name: s.npcName });
    if (res.coach) state.dMsgs.push({ role: 'coach', text: res.coach, score: res.score });
    state.dRoundData.push({ user: text, score: res.score || 3 });
    state.dRound += 1;

    if (res.end || state.dRound > 6) { finishDialogue(); return; }
    paint(); scrollLog();
  }

  async function finishDialogue() {
    if (!state.dRoundData.length) { toast('先聊几句再看总结吧'); return; }
    state.dPhase = 'summary'; state.dSummary = null; paint();

    let sm = null;
    if (isOnline()) {
      try {
        const prompt = dialogueSummaryPrompt(state.dScenario, state.dRoundData);
        const reply = await AI.chat([{ role: 'system', content: prompt }, { role: 'user', content: '请给出总结JSON。' }], { maxTokens: 500 });
        sm = parseJSON(reply);
      } catch (e) { console.warn('[training] summary AI fail', e); }
    }
    if (!sm) sm = mockSummary(state.dRoundData);

    state.dSummary = sm;
    addRecord({ kind: 'dialogue', title: state.dScenario.title, score: sm.totalScore, rating: sm.rating, summary: sm });
    paint();
  }

  // ---- 对话 prompt（搬知愈 generateTrainingPrompt / SummaryPrompt）----
  function dialogueSystemPrompt(s) {
    return `你是一个表达模拟训练AI，同时扮演两个角色。
角色1：${s.npcName}（对话对象）。场景：${s.background}。性格真实有情绪，根据用户回应自然反应，说话口语化，1-3句。
角色2：小知（旁白教练）。每轮给1-2句温和鼓励的教学点评。训练重点：${s.focus}。
你必须只返回JSON，不要任何其他文字，格式：
{"npc":"对方的回应","coach":"小知点评","score":3,"end":false}
score是1-5分（用户这轮表达的质量）；对话进行到第4-6轮时把end设为true表示自然结束。`;
  }

  function dialogueSummaryPrompt(s, roundData) {
    const lines = roundData.map((r, i) => `第${i + 1}轮：用户说"${r.user}"，得分${r.score}/5`).join('\n');
    return `你是表达训练教练。用户完成了"${s.title}"训练。
场景：${s.background}
训练重点：${s.focus}

${lines}

请只返回JSON，不要其他文字：
{"totalScore":85,"rating":"称号","highlights":["亮点1","亮点2"],"improvements":["建议1"],"insight":"对用户表达模式的一句观察","tip":"一条核心学习建议"}
totalScore 0-100；rating：90+共情达人 / 70-89稳步成长 / <70初学探索。`;
  }

  // ---- 对话 mock 兜底 ----
  function mockTurn(userText, round) {
    const t = userText;
    let score = 3, coach = '', npc = '';
    if (/[?？]/.test(t) || /你(觉得|呢|会不会|是不是)/.test(t)) { score = 4; coach = '很好，你在用提问把话语权交回给对方——这就是倾听。'; }
    else if (/我(理解|懂|明白|感觉到|知道)|辛苦|不容易|难受/.test(t)) { score = 5; coach = '你先接住了对方的情绪，而不是急着解决问题，做得很棒。'; }
    else if (t.length < 6) { score = 2; coach = '可以再多说一点，让对方感到你真的在认真回应。'; }
    else { score = 3; coach = '表达清楚了。试试在里面加一句对方感受的确认，会更有温度。'; }
    const npcPool = [
      '嗯……你这么说，我心里好像松了一点。',
      '真的吗？我还以为你会觉得我小题大做。',
      '谢谢你愿意听我说这些。',
      '我也不知道该怎么办，就是很难受。',
      '被你这么一说，好像没那么糟了。'
    ];
    npc = npcPool[(round - 1) % npcPool.length];
    const end = round >= 4;
    return { npc, coach, score, end };
  }

  function mockSummary(roundData) {
    const avg = roundData.reduce((a, r) => a + (r.score || 3), 0) / roundData.length;
    const total = Math.round(avg / 5 * 100);
    const rating = total >= 90 ? '共情达人' : total >= 70 ? '稳步成长' : '初学探索';
    return {
      totalScore: total, rating,
      highlights: ['愿意认真回应对方', avg >= 4 ? '能先接住情绪再表达' : '表达清晰直接'],
      improvements: [avg < 4 ? '多确认对方的感受，再表达自己' : '可以尝试更主动地引导对话'],
      insight: '你在练习里更倾向于稳妥地表达——这是很好的基础。',
      tip: '记住：先接住，再看见，最后才是解决。'
    };
  }

  // ============================================================
  // 感官写作
  // ============================================================
  function viewWriting() {
    if (state.wPhase === 'select') return writingSelect();
    if (state.wPhase === 'result') return writingResult();
    return writingCompose();
  }

  function writingSelect() {
    const cards = WRITING_SCENARIOS.map(sc => `
      <button class="tn-wsc" data-wpick="${sc.id}">
        <span class="tn-wsc-ic">${sc.icon}</span>
        <span class="tn-wsc-t">${esc(sc.title)}</span>
        <span class="tn-wsc-d">${esc(sc.desc)}</span>
      </button>`).join('');
    return `
      ${topbar('感官写作')}
      <div class="tn-sec-hint">选一个场景，用五感把它写清楚</div>
      <div class="tn-wsc-grid">${cards}</div>
    `;
  }

  function writingCompose() {
    const s = state.wScenario;
    const sense = SENSES[state.wSenseIdx];
    const chips = ((SENSE_CHIPS[s.id] || {})[sense.key] || []);
    const chipHtml = chips.map(c => `<button class="tn-chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('');
    const dots = SENSES.map((se, i) => `<span class="tn-dot ${i === state.wSenseIdx ? 'on' : ''} ${state.wWritings[se.key] ? 'done' : ''}"></span>`).join('');
    return `
      ${topbar(s.title, 'writingSelect')}
      <div class="tn-progress"><div class="tn-dots">${dots}</div><div class="tn-progress-t">${sense.label}（${state.wSenseIdx + 1}/${SENSES.length}）</div></div>
      <div class="card tn-guide">${state.wThinking ? '<span class="tn-muted">小知正在想引导语…</span>' : esc(state.wGuide || LOCAL_GUIDES[sense.key](s.title))}</div>
      ${chipHtml ? `<div class="tn-chips">${chipHtml}</div>` : ''}
      <textarea id="tnWInput" class="tn-wta" rows="4" placeholder="${esc(sense.hint)}">${esc(state.wInput || '')}</textarea>
      <div class="tn-two-btn">
        ${state.wSenseIdx > 0 ? '<button class="tn-ghost" data-wprev="1">上一感官</button>' : '<button class="tn-ghost" data-wskip="1">跳过</button>'}
        <button class="tn-primary" data-wnext="1">${state.wSenseIdx < SENSES.length - 1 ? '下一感官' : '生成作品'}</button>
      </div>
    `;
  }

  function writingResult() {
    return `
      ${topbar('你的作品')}
      <div class="card tn-piece">${esc(state.wPiece).replace(/\n/g, '<br>')}</div>
      <div class="tn-two-btn">
        <button class="tn-ghost" data-go="home">回修习</button>
        <button class="tn-primary" data-wsave="1">${state.wSaved ? '已保存' : '保存作品'}</button>
      </div>
    `;
  }

  // ---- 写作逻辑 ----
  function startWriting(sc) {
    state.wScenario = sc; state.wPhase = 'compose'; state.wSenseIdx = 0;
    state.wInput = ''; state.wWritings = {}; state.wPiece = ''; state.wSaved = false;
    gentleAnchor();
    loadGuide();
    paint();
  }

  async function loadGuide() {
    const s = state.wScenario;
    const sense = SENSES[state.wSenseIdx];
    state.wGuide = LOCAL_GUIDES[sense.key](s.title);   // 先给本地引导，秒出
    if (!isOnline()) { paint(); return; }
    state.wThinking = true; paint();
    try {
      const reply = await AI.chat([
        { role: 'system', content: `你是温柔的写作向导小知。用户在写"${s.title}"的${sense.label}描写。给一句15-30字、具体可操作的引导语，帮TA打开这个感官。只输出引导语本身，不要引号、不要多余的话。` },
        { role: 'user', content: `${s.title} - ${sense.label}` }
      ], { maxTokens: 120 });
      if (reply && reply.trim()) state.wGuide = reply.trim();
    } catch (e) { console.warn('[training] guide AI fail', e); }
    state.wThinking = false; paint();
  }

  function saveCurrentSense() {
    const ta = document.getElementById('tnWInput');
    if (ta) state.wWritings[SENSES[state.wSenseIdx].key] = ta.value.trim();
    state.wInput = '';
  }

  function nextSense() {
    saveCurrentSense();
    if (state.wSenseIdx < SENSES.length - 1) {
      state.wSenseIdx += 1;
      state.wInput = state.wWritings[SENSES[state.wSenseIdx].key] || '';  // 回访已写过的感官时恢复文本
      loadGuide();
      paint();
    } else {
      composePiece();
    }
  }

  function prevSense() {
    saveCurrentSense();
    if (state.wSenseIdx > 0) {
      state.wSenseIdx -= 1;
      state.wInput = state.wWritings[SENSES[state.wSenseIdx].key] || '';
      loadGuide();
      paint();
    }
  }

  async function composePiece() {
    const s = state.wScenario;
    const parts = SENSES.map(se => state.wWritings[se.key]).filter(Boolean);
    if (!parts.length) { toast('至少写一个感官吧'); return; }

    // 本地拼接兜底（秒出，一定有结果）
    let piece = parts.join('，') + '。';
    state.wPhase = 'result'; state.wPiece = piece; state.wSaved = false; paint();

    // 有 Key 时用 AI 润色成更连贯的一段
    if (isOnline()) {
      try {
        const detail = SENSES.filter(se => state.wWritings[se.key]).map(se => `${se.label}：${state.wWritings[se.key]}`).join('；');
        const reply = await AI.chat([
          { role: 'system', content: '你是温柔细腻的写作助手。把用户零散的五感碎片，串成一段流畅、有画面感的短文（80-150字），忠于原意，不要添加用户没写的核心事实，不要说教。只输出短文本身。' },
          { role: 'user', content: `场景「${s.title}」。感官碎片——${detail}` }
        ], { maxTokens: 400 });
        if (reply && reply.trim()) { state.wPiece = reply.trim(); paint(); }
      } catch (e) { console.warn('[training] compose AI fail', e); }
    }
  }

  // ============================================================
  // 修习记录
  // ============================================================
  function viewRecords() {
    if (state.viewingRec) return recordDetail(state.viewingRec);
    const list = loadRecords();
    if (!list.length) {
      return `${topbar('修习记录')}<div class="tn-empty"><div class="tn-empty-ic">❋</div>还没有修习记录<br><span class="tn-muted">练一次对话或写一段文字，就会留在这里。</span></div>`;
    }
    const items = list.map(r => {
      const d = new Date(r.ts);
      const date = `${d.getMonth() + 1}月${d.getDate()}日`;
      const meta = r.kind === 'dialogue'
        ? `模拟对话 · ${r.score != null ? r.score + '分' : ''} ${esc(r.rating || '')}`
        : `感官写作`;
      return `<button class="tn-rec" data-rec="${r.id}">
        <span class="tn-rec-ic">${r.kind === 'dialogue' ? '❝' : '✎'}</span>
        <span class="tn-rec-t">${esc(r.title)}</span>
        <span class="tn-rec-m">${meta}</span>
        <span class="tn-rec-date">${date}</span>
      </button>`;
    }).join('');
    return `${topbar('修习记录')}<div class="tn-rec-list">${items}</div>`;
  }

  function recordDetail(r) {
    let body = '';
    if (r.kind === 'dialogue') {
      const sm = r.summary || {};
      const hl = (sm.highlights || []).map(h => `<li>${esc(h)}</li>`).join('');
      body = `
        <div class="tn-sum-score">${r.score != null ? r.score : '—'}<span>分</span></div>
        <div class="tn-sum-rating">${esc(r.rating || '')}</div>
        ${hl ? `<div class="tn-sum-block"><div class="tn-sum-h">亮点</div><ul>${hl}</ul></div>` : ''}
        ${sm.tip ? `<div class="tn-sum-tip">${esc(sm.tip)}</div>` : ''}`;
    } else {
      body = `<div class="tn-piece">${esc(r.piece || '').replace(/\n/g, '<br>')}</div>`;
    }
    return `
      ${topbar(r.title, 'recordsBack')}
      <div class="card tn-summary">${body}</div>
      <button class="tn-ghost-sm" data-del="${r.id}">删除这条记录</button>
    `;
  }

  // ============================================================
  // 顶部返回条
  // ============================================================
  function topbar(title, back) {
    const b = back ? `<button class="tn-back" data-back="${back}">‹</button>` : `<button class="tn-back" data-go="home">‹</button>`;
    return `<div class="tn-top">${b}<span class="tn-top-t">${esc(title)}</span><span class="tn-top-sp"></span></div>`;
  }

  // ============================================================
  // 事件绑定（每次 paint 后重绑）
  // ============================================================
  function wire() {
    if (!rootEl) return;

    rootEl.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));

    rootEl.querySelectorAll('[data-back]').forEach(b => b.onclick = () => {
      const k = b.dataset.back;
      if (k === 'dialoguePick') { state.dPhase = 'pick'; paint(); }
      else if (k === 'writingSelect') { state.wPhase = 'select'; paint(); }
      else if (k === 'recordsBack') { state.viewingRec = null; paint(); }
      else go('home');
    });

    // ---- 对话 ----
    rootEl.querySelectorAll('[data-dpick]').forEach(b => b.onclick = () => {
      const id = b.dataset.dpick;
      if (id === 'again') { state.dScenario = null; state.dPhase = 'pick'; paint(); return; }
      const sc = DIALOGUE_SCENARIOS.find(x => x.id === id);
      if (sc) startDialogue(sc);
    });
    const dstart = rootEl.querySelector('[data-dstart]'); if (dstart) dstart.onclick = beginChat;
    const dsend = rootEl.querySelector('#tnSend'); if (dsend) dsend.onclick = sendTurn;
    const dinput = rootEl.querySelector('#tnInput');
    if (dinput) {
      dinput.oninput = (e) => { state.dInput = e.target.value; };
      dinput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTurn(); } };
    }
    const dfin = rootEl.querySelector('[data-dfinish]'); if (dfin) dfin.onclick = finishDialogue;

    // ---- 写作 ----
    rootEl.querySelectorAll('[data-wpick]').forEach(b => b.onclick = () => {
      const sc = WRITING_SCENARIOS.find(x => x.id === b.dataset.wpick);
      if (sc) startWriting(sc);
    });
    rootEl.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => {
      const ta = rootEl.querySelector('#tnWInput');
      if (ta) { ta.value = (ta.value ? ta.value + '，' : '') + b.dataset.chip; state.wInput = ta.value; ta.focus(); }
    });
    const wta = rootEl.querySelector('#tnWInput'); if (wta) wta.oninput = (e) => { state.wInput = e.target.value; };
    const wnext = rootEl.querySelector('[data-wnext]'); if (wnext) wnext.onclick = nextSense;
    const wprev = rootEl.querySelector('[data-wprev]'); if (wprev) wprev.onclick = prevSense;
    const wskip = rootEl.querySelector('[data-wskip]'); if (wskip) wskip.onclick = nextSense;
    const wsave = rootEl.querySelector('[data-wsave]'); if (wsave) wsave.onclick = () => {
      if (state.wSaved) return;
      addRecord({ kind: 'writing', title: state.wScenario.title, scenario: state.wScenario.id, piece: state.wPiece });
      state.wSaved = true; toast('作品已保存到修习记录'); paint();
    };

    // ---- 记录 ----
    rootEl.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => {
      const r = loadRecords().find(x => x.id === b.dataset.rec);
      if (r) { state.viewingRec = r; paint(); }
    });
    const del = rootEl.querySelector('[data-del]'); if (del) del.onclick = () => {
      delRecord(del.dataset.del); state.viewingRec = null; toast('已删除'); paint();
    };
  }

  function scrollLog() {
    requestAnimationFrame(() => { const l = document.getElementById('tnLog'); if (l) l.scrollTop = l.scrollHeight; });
  }

  // ============================================================
  // 样式（内联注入，只用 tokens.css 变量）
  // ============================================================
  function injectStyle() {
    if (document.getElementById('tn-style')) return;
    const s = document.createElement('style');
    s.id = 'tn-style';
    s.textContent = `
      .tn-wrap{display:flex;flex-direction:column;gap:var(--gap);}
      .tn-hero{text-align:center;padding:8px 8px 2px;}
      .tn-hero-t{font-size:26px;font-weight:700;letter-spacing:2px;}
      .tn-hero-s{font-size:13px;color:var(--sub);margin-top:6px;line-height:1.7;}
      .tn-cards{display:flex;flex-direction:column;gap:var(--gap);}
      .tn-big{background:var(--surface);color:var(--ink);border-radius:var(--radius);box-shadow:var(--shadow);
        padding:22px 20px;text-align:left;display:flex;flex-direction:column;gap:6px;align-items:flex-start;}
      .tn-big-ic{font-size:30px;line-height:1;color:var(--accent-deep);}
      .tn-big-t{font-size:19px;font-weight:700;}
      .tn-big-d{font-size:13px;color:var(--sub);line-height:1.7;}
      .tn-records-entry{background:transparent;color:var(--accent-deep);border:1px solid var(--line);
        border-radius:var(--radius-sm);padding:12px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;}
      .tn-badge{background:var(--accent);color:#fff;border-radius:999px;font-size:11px;padding:1px 8px;min-width:20px;}

      .tn-top{display:flex;align-items:center;gap:8px;padding:2px 0 4px;}
      .tn-back{background:transparent;color:var(--ink);font-size:26px;line-height:1;padding:2px 10px 6px;border-radius:12px;}
      .tn-top-t{font-size:17px;font-weight:600;}
      .tn-top-sp{flex:1;}
      .tn-sec-hint{font-size:13px;color:var(--sub);text-align:center;}

      .tn-sc-list{display:flex;flex-direction:column;gap:10px;}
      .tn-sc{background:var(--surface);color:var(--ink);border-radius:var(--radius);box-shadow:var(--shadow);
        padding:16px;display:flex;gap:14px;align-items:center;text-align:left;}
      .tn-sc-ic{font-size:22px;flex:none;width:44px;height:44px;border-radius:50%;background:var(--bg);
        color:var(--accent-deep);display:flex;align-items:center;justify-content:center;}
      .tn-sc-body{display:flex;flex-direction:column;gap:4px;}
      .tn-sc-t{font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;}
      .tn-diff{font-size:11px;color:var(--accent-deep);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:1px 8px;font-weight:400;}
      .tn-sc-d{font-size:12px;color:var(--sub);line-height:1.6;}

      .tn-intro{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:26px 20px;}
      .tn-intro-ava{width:60px;height:60px;border-radius:50%;background:var(--accent);color:#fff;
        font-size:24px;font-weight:600;display:flex;align-items:center;justify-content:center;margin-bottom:2px;}
      .tn-intro-name{font-size:13px;color:var(--sub);}
      .tn-intro-t{font-size:19px;font-weight:700;}
      .tn-intro-bg{font-size:14px;color:var(--sub);line-height:1.8;}
      .tn-intro-focus{font-size:13px;color:var(--accent-deep);background:var(--bg);border-radius:var(--radius-sm);padding:8px 14px;}

      .tn-primary{background:var(--accent);color:#fff;border-radius:var(--radius-sm);padding:13px 20px;font-size:15px;width:100%;margin-top:6px;}
      .tn-ghost{background:transparent;color:var(--accent-deep);border:1px solid var(--accent);border-radius:var(--radius-sm);padding:13px 20px;font-size:15px;flex:1;}
      .tn-ghost-sm{background:transparent;color:var(--sub);font-size:13px;padding:8px;align-self:center;}
      .tn-two-btn{display:flex;gap:10px;}
      .tn-two-btn .tn-primary{flex:1;width:auto;margin-top:0;}

      .tn-round{font-size:12px;color:var(--sub);text-align:center;}
      .tn-log{display:flex;flex-direction:column;gap:12px;max-height:calc(100vh - 340px);overflow-y:auto;padding:4px 2px;}
      .tn-b{border-radius:16px;padding:11px 14px;font-size:14px;line-height:1.6;max-width:82%;word-break:break-word;}
      .tn-b-user{background:var(--accent);color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}
      .tn-b-npc{display:flex;flex-direction:column;gap:3px;align-self:flex-start;max-width:88%;}
      .tn-npc-name{font-size:11px;color:var(--sub);padding-left:4px;}
      .tn-b-other{background:var(--surface);color:var(--ink);box-shadow:var(--shadow);border-bottom-left-radius:4px;}
      .tn-coach{background:var(--bg);border:1px dashed var(--accent);border-radius:14px;padding:9px 12px;font-size:12.5px;
        color:var(--accent-deep);line-height:1.6;align-self:stretch;position:relative;}
      .tn-coach-tag{display:inline-block;font-size:10px;background:var(--accent);color:#fff;border-radius:999px;padding:1px 7px;margin-right:6px;vertical-align:middle;}
      .tn-score{position:absolute;right:12px;top:9px;font-size:12px;font-weight:700;color:var(--accent-deep);}
      .tn-typing{display:flex;gap:4px;align-items:center;}
      .tn-typing span{width:6px;height:6px;border-radius:50%;background:var(--sub);opacity:.5;animation:tnBlink 1.2s infinite;}
      .tn-typing span:nth-child(2){animation-delay:.2s;} .tn-typing span:nth-child(3){animation-delay:.4s;}
      @keyframes tnBlink{0%,60%,100%{opacity:.3;transform:translateY(0);}30%{opacity:1;transform:translateY(-3px);}}

      .tn-inputbar{display:flex;gap:8px;align-items:flex-end;}
      .tn-ta{flex:1;border:1px solid var(--line);border-radius:14px;padding:10px 12px;font-size:14px;font-family:inherit;
        resize:none;background:var(--surface);color:var(--ink);line-height:1.5;max-height:100px;}
      .tn-send{background:var(--accent);color:#fff;border-radius:14px;padding:10px 16px;font-size:14px;flex:none;}
      .tn-send:disabled,.tn-ta:disabled{opacity:.5;}

      .tn-summary{display:flex;flex-direction:column;gap:12px;text-align:center;padding:26px 20px;}
      .tn-sum-score{font-size:52px;font-weight:800;color:var(--accent-deep);line-height:1;}
      .tn-sum-score span{font-size:16px;font-weight:400;color:var(--sub);margin-left:4px;}
      .tn-sum-rating{font-size:17px;font-weight:600;}
      .tn-sum-block{text-align:left;background:var(--bg);border-radius:var(--radius-sm);padding:12px 14px;}
      .tn-sum-h{font-size:13px;font-weight:600;margin-bottom:6px;}
      .tn-sum-block ul{margin:0;padding-left:18px;font-size:13px;color:var(--sub);line-height:1.8;}
      .tn-sum-insight{font-size:13px;color:var(--sub);line-height:1.8;font-style:italic;}
      .tn-sum-tip{font-size:13px;color:var(--accent-deep);background:var(--bg);border-radius:var(--radius-sm);padding:10px 14px;line-height:1.7;}

      .tn-wsc-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
      .tn-wsc{background:var(--surface);color:var(--ink);border-radius:var(--radius);box-shadow:var(--shadow);
        padding:18px 14px;display:flex;flex-direction:column;gap:6px;align-items:flex-start;text-align:left;}
      .tn-wsc-ic{font-size:24px;color:var(--accent-deep);line-height:1;}
      .tn-wsc-t{font-size:15px;font-weight:600;}
      .tn-wsc-d{font-size:12px;color:var(--sub);line-height:1.6;}

      .tn-progress{display:flex;flex-direction:column;align-items:center;gap:8px;}
      .tn-dots{display:flex;gap:8px;}
      .tn-dot{width:9px;height:9px;border-radius:50%;background:var(--line);}
      .tn-dot.done{background:var(--calm);}
      .tn-dot.on{background:var(--accent);transform:scale(1.3);}
      .tn-progress-t{font-size:14px;font-weight:600;}
      .tn-guide{font-size:14px;line-height:1.8;color:var(--ink);padding:16px 18px;}
      .tn-chips{display:flex;flex-wrap:wrap;gap:8px;}
      .tn-chip{background:var(--surface);color:var(--accent-deep);border:1px solid var(--line);border-radius:999px;padding:7px 13px;font-size:13px;}
      .tn-wta{width:100%;border:1px solid var(--line);border-radius:var(--radius-sm);padding:12px;font-size:15px;font-family:inherit;
        resize:none;background:var(--surface);color:var(--ink);line-height:1.7;}
      .tn-piece{font-size:15px;line-height:2;letter-spacing:.5px;
        font-family:"STKaiti","Kaiti SC","KaiTi",var(--font);}
      .tn-muted{color:var(--sub);}

      .tn-rec-list{display:flex;flex-direction:column;gap:10px;}
      .tn-rec{background:var(--surface);color:var(--ink);border-radius:var(--radius-sm);box-shadow:var(--shadow);
        padding:14px 16px 14px 14px;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;
        column-gap:12px;row-gap:3px;text-align:left;position:relative;align-items:center;}
      .tn-rec-ic{grid-row:1 / span 2;width:40px;height:40px;border-radius:50%;background:var(--bg);
        color:var(--accent-deep);font-size:18px;display:flex;align-items:center;justify-content:center;}
      .tn-rec-t{font-size:15px;font-weight:600;align-self:end;}
      .tn-rec-m{font-size:12px;color:var(--sub);align-self:start;}
      .tn-rec-date{position:absolute;right:16px;top:16px;font-size:12px;color:var(--sub);}
      .tn-empty{text-align:center;color:var(--sub);padding:60px 20px;font-size:14px;line-height:2;}
      .tn-empty-ic{font-size:36px;color:var(--accent);}

      #tnToast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%) translateY(10px);
        background:rgba(58,53,47,.92);color:#fff;font-size:13px;padding:9px 16px;border-radius:999px;
        opacity:0;pointer-events:none;transition:all .3s ease;z-index:999;max-width:80%;text-align:center;}
      #tnToast.show{opacity:1;transform:translateX(-50%) translateY(0);}
    `;
    document.head.appendChild(s);
  }

  global.Pages = global.Pages || {};
  global.Pages['training'] = { render };
})(typeof window !== 'undefined' ? window : globalThis);
