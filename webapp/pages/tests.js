/**
 * pages/tests.js — 「探索自己(测试)」页（环抱你 H5 · Agent E）
 * 注册到 window.Pages.tests = { render(el) }。见 docs/specs/2026-07-31-tests-page-design.md。
 *
 * 铁律：题目必须来自已发表学术量表，不许编造。本页两套量表均逐字溯源：
 *   1) HSPS-12 高敏感自测 —— 取自 Aron & Aron (1997) JPSP 73(2) 原版 27 题子集
 *      （原版第 2/7/8/10/14/16/18/21/22/23/25/26 题；此 12 题短版见 Pluess & Boniwell 2015）。
 *      无权威 27 题官方中文译本，故中文译自英文原文，逐题保留 en 原文；7 点计分、无反向题。
 *   2) PSS-10 压力自测 —— 取自 Cohen et al. (1983) / Cohen & Williamson (1988)。
 *      0-4 计分；反向题第 4/5/7/8 题；总分 0-40。分级为广泛惯例，非官方诊断切点。
 *
 * 约束：纯 vanilla JS，无框架；数据只经自建 hbn.tests（不改 store.js 契约）；AI 只调 AI.chat；
 *       颜色只用 tokens.css；无 Key/AI 报错时本地兜底，绝不白屏。
 */
(function (global) {
  'use strict';

  // ======================= 量表库（唯一题源，每套带出处） =======================
  const SCALES = [
    {
      id: 'hsps',
      title: '高敏感自测',
      subtitle: 'HSPS-12 · 看见你的感官敏感度',
      icon: '✦',
      source: 'Aron & Aron (1997), J. Pers. Soc. Psychol. 73(2), 345–368',
      note: '中文译自 Aron & Aron 1997 英文原文，仅供自我探索，不构成诊断。',
      scaleType: 'likert7',                       // 1..7
      anchors: ['完全不符合', '', '', '一般', '', '', '完全符合'],
      reverse: [],                                // 无反向题
      // 逐题取自 Aron 1997 原版 27 题（题号见每条注释），中文为对照翻译
      items: [
        { zh: '你常能敏锐察觉到周围环境里的细微之处。', en: 'Do you seem to be aware of subtleties in your environment?' }, // #2
        { zh: '强光、浓烈气味、粗糙布料或附近的警笛声，很容易让你感到难以承受。', en: 'Are you easily overwhelmed by things like bright lights, strong smells, coarse fabrics, or sirens close by?' }, // #7
        { zh: '你有着丰富而复杂的内心世界。', en: 'Do you have a rich, complex inner life?' }, // #8
        { zh: '你会被艺术或音乐深深打动。', en: 'Are you deeply moved by the arts or music?' }, // #10
        { zh: '短时间里要做很多事时，你会变得慌乱。', en: 'Do you get rattled when you have a lot to do in a short amount of time?' }, // #14
        { zh: '当别人想让你同时做很多事时，你会感到烦躁。', en: 'Are you annoyed when people try to get you to do too many things at once?' }, // #16
        { zh: '你会特意避开暴力的电影和电视节目。', en: 'Do you make a point to avoid violent movies and TV shows?' }, // #18
        { zh: '生活中的变化会让你深受影响、心神不宁。', en: 'Do changes in your life shake you up?' }, // #21
        { zh: '你能留意并享受细腻精致的气味、味道、声音和艺术作品。', en: 'Do you notice and enjoy delicate or fine scents, tastes, sounds, works of art?' }, // #22
        { zh: '同时有很多事情在进行时，你会觉得不舒服。', en: 'Do you find it unpleasant to have a lot going on at once?' }, // #23
        { zh: '强烈的刺激（如巨大的噪音、混乱的场面）会让你感到困扰。', en: 'Are you bothered by intense stimuli, like loud noises or chaotic scenes?' }, // #25
        { zh: '当你不得不与人竞争、或在被注视下完成任务时，会紧张到发挥失常。', en: 'When you must compete or be observed while performing a task, do you become so nervous or shaky that you do much worse than you would otherwise?' }, // #26
      ],
      // 分段按均分（raw/12 回到 1–7 锚点）；标注为"参考分段"
      bands: [
        { maxAvg: 3.5, label: '敏感度偏低', desc: '你对外界刺激的反应相对平稳，不太容易被环境的细节或强度牵动。这只是你与世界相处的一种方式，没有好坏。' },
        { maxAvg: 5.0, label: '中等敏感', desc: '你在很多时刻能敏锐地感知环境与他人，同时也保有自己的节奏。你既能被细腻的美好打动，也懂得在过载时给自己留白。' },
        { maxAvg: 7.1, label: '高敏感倾向', desc: '你很可能是一个高敏感的人——你接收世界的通道比多数人更宽，既更容易被美与情绪深深打动，也更容易在喧闹与仓促里感到消耗。这不是脆弱，而是一种需要被温柔对待的天赋。' },
      ],
    },
    {
      id: 'pss',
      title: '压力自测',
      subtitle: 'PSS-10 · 近一个月的知觉压力',
      icon: '❋',
      source: 'Cohen, Kamarck & Mermelstein (1983); Cohen & Williamson (1988)',
      note: '回想过去一个月。分级为广泛沿用的参考区间，作者未发布官方诊断切点，不构成诊断。',
      scaleType: 'likert5',                       // 0..4
      anchors: ['从不', '几乎没有', '有时', '经常', '总是'],
      reverse: [3, 4, 6, 7],                      // 0-based → 第 4/5/7/8 题
      items: [
        { zh: '因为一些出乎意料的事情发生而感到心烦意乱。', en: 'In the last month, how often have you been upset because of something that happened unexpectedly?' },
        { zh: '感到无法掌控自己生活中重要的事情。', en: '…felt that you were unable to control the important things in your life?' },
        { zh: '感到紧张，压力很大。', en: '…felt nervous and "stressed"?' },
        { zh: '对自己有能力处理个人的问题感到有信心。', en: '…felt confident about your ability to handle your personal problems?' }, // reverse
        { zh: '感到事情正朝着你希望的方向发展。', en: '…felt that things were going your way?' }, // reverse
        { zh: '发现自己无法应对所有必须要做的事情。', en: '…found that you could not cope with all the things that you had to do?' },
        { zh: '能够掌控生活中令你恼火的事情。', en: '…been able to control irritations in your life?' }, // reverse
        { zh: '感到自己掌握着一切、游刃有余。', en: '…felt that you were on top of things?' }, // reverse
        { zh: '因为一些超出你掌控范围的事情而感到愤怒。', en: '…been angered because of things that were outside of your control?' },
        { zh: '感到困难堆积如山，多到你无法克服。', en: '…felt difficulties were piling up so high that you could not overcome them?' },
      ],
      // 总分 0-40 分段（0-13 / 14-26 / 27-40）
      bands: [
        { maxScore: 13, label: '压力较低', desc: '过去一个月，你大体上能把生活握在自己手里。压力当然还在，但你有办法接住它。记得继续给自己留一些喘息的空隙。' },
        { maxScore: 26, label: '中等压力', desc: '过去一个月你承受了不少压力，有些时刻会觉得有点吃力。这很正常。也许可以挑一两件最耗你的事，看看能不能松一松。' },
        { maxScore: 40, label: '压力偏高', desc: '过去一个月，压力可能压得你有些喘不过气，感觉很多事情堆在一起、难以招架。你已经撑了很久了。请认真对待这份疲惫，也别一个人扛——找个信任的人说说，或给自己一段真正的休息。' },
      ],
    },
  ];

  const scaleById = (id) => SCALES.find(s => s.id === id) || null;

  // ======================= HBTI「环抱你人格测试」（原创,非诊断) =======================
  // 说明:这是环抱你原创的自我探索体验,灵感来自类型学的"维度→类型"形式,
  //       但四维、题目、16 型内容全部原创,不使用 MBTI® 名称或其官方题目。
  //       用连续强度条(而非硬二分)呈现,并明确标注"非科学诊断"。
  // 四维度:各自受一个独立、已发表的心理学构念启发,串成疗愈叙事线
  //   感知(你如何接收世界)→ 感受(情绪如何流动)→ 联结(从哪里获得安全感)→ 复原(受伤后怎么回来)
  //   跳出 MBTI 的 E/I·S/N·T/F·J/P 框架;两极皆被珍视,无优劣、无病理暗示。
  //   感知=感觉加工敏感性 SPS(Aron & Aron, 1997);感受=情绪表达/调节(Gross & John, 2003);
  //   联结=成人依恋(Brennan/Clark/Shaver, 1998);复原=自我关怀(Neff, 2003)。题目均为原创改写,不抄原量表。
  const HBTI_DIMS = [
    { key: 'perceive', neg: '敏', pos: '从', negLabel: '细腻的感知', posLabel: '从容的感知' },
    { key: 'feel',     neg: '蕴', pos: '露', negLabel: '内蕴的感受', posLabel: '流露的感受' },
    { key: 'connect',  neg: '足', pos: '偎', negLabel: '自足的联结', posLabel: '依偎的联结' },
    { key: 'recover',  neg: '柔', pos: '坚', negLabel: '温柔的复原', posLabel: '坚定的复原' },
  ];

  // 16 题李克特(1..5):dim=所属维度,dir=+1 表示"同意"偏右极[从/露/偎/坚],-1 偏左极[敏/蕴/足/柔]
  // 题目均为原创改写,仅受各维构念定义启发,不抄任何原量表;两极措辞刻意保持中性、无病理暗示。
  const HBTI_QUESTIONS = [
    // perceive 感知的强度(敏←→从)—— SPS
    { dim: 'perceive', dir: -1, zh: '环境里细微的变化——光线、声音、别人的情绪——我常常一下子就察觉到。' },
    { dim: 'perceive', dir: +1, zh: '就算周围有点吵、有点乱,我大多也能稳住,不太受影响。' },
    { dim: 'perceive', dir: -1, zh: '太多事情同时涌来时,我需要退出来缓一缓,让自己不至于被淹没。' },
    { dim: 'perceive', dir: +1, zh: '面对突发或强烈的刺激,我通常还能比较从容地应对。' },
    // feel 感受的流向(蕴←→露)—— 情绪表达/内在消化(非"压抑")
    { dim: 'feel', dir: +1, zh: '情绪来的时候,我倾向于自然地表达出来、让别人知道。' },
    { dim: 'feel', dir: -1, zh: '我更习惯把感受先放在心里慢慢消化,而不是马上说出口。' },
    { dim: 'feel', dir: +1, zh: '开心或难过,我的表情和语气常常藏不住。' },
    { dim: 'feel', dir: -1, zh: '遇到情绪起伏,我喜欢先自己想明白,再决定要不要说、怎么说。' },
    // connect 安全感的来源(足←→偎)—— 原创改写,受成人依恋启发,非依恋诊断
    { dim: 'connect', dir: +1, zh: '和亲近的人保持紧密的联系,会让我感到安心。' },
    { dim: 'connect', dir: -1, zh: '拥有属于自己的独处空间,对我同样重要、也让我恢复能量。' },
    { dim: 'connect', dir: +1, zh: '遇到难处时,我愿意主动靠近信任的人、寻求陪伴。' },
    { dim: 'connect', dir: -1, zh: '很多时候,我更享受靠自己把事情稳稳地安顿好。' },
    // recover 复原的姿态(柔←→坚)—— 自我关怀(柔) ←→ 行动/目标导向(坚),两极皆健康
    { dim: 'recover', dir: -1, zh: '搞砸了的时候,我会试着像安慰朋友那样,先善待自己。' },
    { dim: 'recover', dir: +1, zh: '跌倒之后,我更想尽快振作起来、把它做得更好。' },
    { dim: 'recover', dir: -1, zh: '我允许自己有脆弱、有做不到的时候,不苛责自己。' },
    { dim: 'recover', dir: +1, zh: '面对困难,我倾向于给自己定个目标,一步步把它推进下去。' },
  ];
  const HBTI_ANCHORS = ['很不同意', '不同意', '中立', '同意', '很同意']; // 1..5

  // 16 型内容:key=四字码,码序 perceive(敏/从)·feel(蕴/露)·connect(足/偎)·recover(柔/坚)
  // 每型:原型名 + 意象 + 描述 + 你最渴望被环抱的方式。所有型皆被珍视,无褒贬。
  const HBTI_TYPES = {
    '敏蕴足柔': { name: '林间的独修者', img: '在幽静林间,独自照料一方心田。',
      desc: '你感知细腻,习惯把丰盈的内心慢慢消化。你在独处里恢复能量,也懂得在跌倒时温柔地接住自己。你不喧哗,却有一个深邃而自洽的世界。',
      hug: '你需要"不被打扰的温柔"——有人远远守着,不催不问,让你按自己的节奏慢慢好起来。' },
    '敏蕴足坚': { name: '深谷的引泉人', img: '在深谷里,默默把清泉引向远方。',
      desc: '你感受敏锐却不张扬,喜欢先在心里想透,再一步步行动。你靠自己站稳,受挫时不耽溺,而是把它化成向前的力气。安静,却极有韧性。',
      hug: '你需要"被信任的坚持"——有人相信你能扛住,并在你默默用力时说一句"我看见了"。' },
    '敏蕴偎柔': { name: '烛旁的倾听者', img: '在暖烛旁,静静听一个人说完心事。',
      desc: '你细腻、深情,把感受收在心底慢慢体会。你在亲近的联结里感到安心,也总能温柔地善待自己和他人。你是那种让人愿意卸下防备的人。',
      hug: '你需要"被认真倾听"——有人愿意安静地听你把心里的话,一点点说出来。' },
    '敏蕴偎坚': { name: '灯塔的守信人', img: '在海边灯塔,为约定的人守一盏长明的灯。',
      desc: '你感知敏锐、情深不外露,重视与人的紧密联结。你在关系里全心投入,受挫时不退缩,而是更坚定地守住在乎的人和事。深情又可靠。',
      hug: '你需要"被稳稳回应"——有人在你默默守护时,同样认真地朝你走来。' },
    '敏露足柔': { name: '溪畔的拾光者', img: '沿着溪流,把散落的微光一颗颗拾起。',
      desc: '你感受细腻,情绪自然流露,像溪水一样透明。你享受独处的自由,也懂得温柔待己。你留意别人错过的小美好,并毫不掩饰地为之欢喜。',
      hug: '你需要"被看见的细腻"——有人注意到你注意到的那些小事,轻声说"我也看到了"。' },
    '敏露足坚': { name: '山径的探路人', img: '独自走过没有路标的山径,边走边把风景说给风听。',
      desc: '你敏锐、真诚,喜怒都写在脸上。你靠自己的节奏前行,也不怕表达。跌倒了,你会拍拍尘土、定个新目标继续走。自由而有劲。',
      hug: '你需要"被支持的独立"——有人相信你的选择,在你回头时始终都在。' },
    '敏露偎柔': { name: '花间的传信者', img: '像蝴蝶穿行花间,把温柔与心意传给每个人。',
      desc: '你共情力强,情感丰沛又乐于流露。你在亲密的陪伴里最有安全感,也总是温柔地接住别人和自己。你让身边的人感到被珍视。',
      hug: '你需要"被同样珍视"——有人在你付出温柔后,给你一个同样柔软的回抱。' },
    '敏露偎坚': { name: '篝火的召集人', img: '点起一堆篝火,把散落的人一个个唤到身边。',
      desc: '你敏锐热忱,情感外放,渴望与人紧密相连。你为在乎的人全力以赴,受挫时越挫越勇。你是把大家聚在一起、一起向前的那束火光。',
      hug: '你需要"被并肩支持"——有人在你带着大家往前冲时,坚定地站在你身旁。' },
    '从蕴足柔': { name: '山居的煮茶人', img: '在山间小屋,慢慢煮一壶给自己的茶。',
      desc: '你感知从容,不易被外界扰动,习惯把心事静静沉淀。你在独处里自得,受挫时温柔地善待自己。你活得舒缓而笃定,自成一方天地。',
      hug: '你需要"被允许慢下来"——有人陪你什么都不做,只是安静地待一会儿。' },
    '从蕴足坚': { name: '旷野的筑屋人', img: '在空旷的原野上,一砖一瓦盖起自己的屋。',
      desc: '你沉稳、内敛,遇事先想清楚再动手。你靠自己把生活安顿得踏实,受挫也不慌,只是默默把它做得更好。可靠得像大地一样。',
      hug: '你需要"被看见付出"——有人在你独自扛下一切后,认真地说一句"辛苦了"。' },
    '从蕴偎柔': { name: '炉边的守护者', img: '守着一炉暖火,让每个归来的人都有热汤喝。',
      desc: '你平和、体贴,把感受收在心里,却用行动温暖身边人。你在亲近的联结里感到踏实,也总记得善待自己。你是家一样让人安心的存在。',
      hug: '你需要"被反过来照顾"——有人在你忙着照顾所有人时,轻轻问你"那你呢"。' },
    '从蕴偎坚': { name: '城邦的筑造者', img: '一砖一瓦,把愿景建成人们可以栖居的城。',
      desc: '你沉稳可靠,重视与人的联结,习惯默默行动。你目标清晰、说到做到,受挫时更坚定。你是团队里可以托付大事、让人安心的那根梁。',
      hug: '你需要"被分担重量"——有人在你运筹一切时,主动接过一部分担子。' },
    '从露足柔': { name: '广场的暖阳', img: '像洒在广场上的阳光,让路过的人都暖了一下。',
      desc: '你从容开朗,情绪自然流露,不易被烦恼困住。你享受自在,也懂得温柔待己。你的善意直接而不设防,常常是人群里最先伸手的那个。',
      hug: '你需要"被真心回应"——有人在你付出热情后,给你同样真诚的回抱。' },
    '从露足坚': { name: '市集的弄潮儿', img: '在热闹的市集里,敏捷地捕捉每一个机会。',
      desc: '你稳得住又敢表达,喜欢行动、喜欢尝试。你独立自主,面对变化不慌反兴奋。跌倒了拍拍就起,定个新目标继续闯。生机勃勃。',
      hug: '你需要"被允许停下来"——有人在你不停向前时,拉住你说"歇会儿,我陪你"。' },
    '从露偎柔': { name: '巷口的暖灯', img: '在巷子口,为晚归的人留一盏温柔的灯。',
      desc: '你温和外向,情感自然流露,喜欢和人亲近。你在陪伴里安心,也总是柔软地对待自己和别人。你让身边的人觉得被接纳、被欢迎。',
      hug: '你需要"被温柔靠近"——有人主动走近你,给你一个不设防的拥抱。' },
    '从露偎坚': { name: '远行的引路人', img: '举着火把,带一群人走向想象中的远方。',
      desc: '你从容热忱,善于表达,又懂得联结人心。你带着大家往前走,受挫时更坚定。你的温暖里,藏着一份对更好未来的笃定期待。',
      hug: '你需要"被支持理想"——有人相信你描绘的远方,并说"我和你一起去"。' },
  };

  const HBTI_META = {
    id: 'hbti',
    title: 'HBTI 环抱型人格测试',
    subtitle: 'Huanbao Type Indicator · 看见你如何被世界拥抱',
    source: '「环抱你(HBTI)」原创自我探索体验,四维分别受 SPS、情绪表达、成人依恋、自我关怀等已发表研究启发。',
    // 终稿:非诊断、非验证、连续渐变(依核证报告的诚实性要求)
    note: '本测试是「环抱你(HBTI)环抱型人格测试」原创的自我探索体验,并非心理测评、诊断或临床评估。四个维度分别受已发表心理学研究启发(感知:Aron & Aron, 1997;感受:Gross & John, 2003;联结:Brennan 等, 1998;复原:Neff, 2003),但题目均为原创、未经科学效度验证,"类型"只是便于理解的比喻,并非科学分类。每个维度都是连续的光谱,没有"好/坏"或"正常/异常"之分,结果会随时间与状态变化。若你正为情绪困扰,请寻求专业帮助。',
    // 商标安全声明(依核证:HBTI 与 MBTI® 结构相似且同品类,需明确无关联)
    tmNote: '本体验与 MBTI®、Myers-Briggs® 及迈尔斯-布里格斯基金会无任何关联,维度与内容均为原创。',
  };

  // HBTI 计分:每维累计带符号的偏离,产出四字码 + 四条强度条
  function scoreHBTI(answers) {
    const raw = {}, cnt = {};
    HBTI_DIMS.forEach(d => { raw[d.key] = 0; cnt[d.key] = 0; });
    answers.forEach((a, i) => {
      const q = HBTI_QUESTIONS[i];
      raw[q.dim] += (Number(a) - 3) * q.dir;   // 以 3 为中点
      cnt[q.dim] += 1;
    });
    let code = '';
    const bars = HBTI_DIMS.map(d => {
      const max = cnt[d.key] * 2;               // 每题最大偏离 2
      const norm = max ? raw[d.key] / max : 0;  // [-1, 1]
      const isPos = norm >= 0;                  // 平局(=0)归右极(已在文档标注)
      const pole = isPos ? d.pos : d.neg;
      const label = isPos ? d.posLabel : d.negLabel;
      const pct = Math.round(50 + Math.abs(norm) * 50); // 主导极占比 [50,100]
      code += pole;
      return { dim: d.key, pole, label, pct };
    });
    return { code, bars, type: HBTI_TYPES[code] || null };
  }

  // ======================= 自建存档层（hbn.tests，不改 Store 契约） =======================
  const REC_KEY = 'hbn.tests';
  function loadRecords() {
    try { const v = localStorage.getItem(REC_KEY); return v ? JSON.parse(v) : []; }
    catch (e) { console.warn('[tests] read fail', e); return []; }
  }
  function saveRecords(list) {
    try { localStorage.setItem(REC_KEY, JSON.stringify(list)); return true; }
    catch (e) { console.warn('[tests] write fail', e); return false; }
  }
  function addRecord(rec) {
    const list = loadRecords();
    const full = Object.assign({ id: Store._uid(), ts: Date.now() }, rec);
    list.unshift(full);
    saveRecords(list);
    return full;
  }
  function updateRecordInterp(id, interpretation) {
    const list = loadRecords();
    const r = list.find(x => x.id === id);
    if (r) { r.interpretation = interpretation; saveRecords(list); }
  }
  function delRecord(id) {
    saveRecords(loadRecords().filter(r => r.id !== id));
  }
  function lastRecordOf(scaleId) {
    return loadRecords().find(r => r.scaleId === scaleId) || null;
  }

  // ======================= 计分 =======================
  // 返回 { score, maxScore, band }
  function scoreScale(scale, answers) {
    if (scale.scaleType === 'likert7') {
      // 1..7，无反向；用均分选 band
      const raw = answers.reduce((a, b) => a + b, 0);
      const avg = raw / scale.items.length;
      const band = scale.bands.find(b => avg < b.maxAvg) || scale.bands[scale.bands.length - 1];
      return { score: raw, maxScore: scale.items.length * 7, avg, band };
    }
    // likert5：0..4，反向题 4 - v
    const rev = new Set(scale.reverse || []);
    const score = answers.reduce((sum, v, i) => sum + (rev.has(i) ? (4 - v) : v), 0);
    const band = scale.bands.find(b => score <= b.maxScore) || scale.bands[scale.bands.length - 1];
    return { score, maxScore: scale.items.length * 4, band };
  }

  // ======================= 状态 & 渲染 =======================
  let el;
  const state = { view: 'home', scaleId: null, answers: [], idx: 0 };

  function render(container) {
    el = container;
    injectStyle();
    paint();
  }

  function paint() {
    if (state.view === 'quiz') return paintQuiz();
    if (state.view === 'result') return paintResult();
    if (state.view === 'records') return paintRecords();
    return paintHome();
  }

  // ---------- 首页：量表列表 ----------
  function paintHome() {
    const cards = SCALES.map(s => {
      const last = lastRecordOf(s.id);
      const lastLine = last
        ? `<div class="ts-last">上次：${last.bandLabel} · ${last.score} 分 · ${fmtDate(last.ts)}</div>`
        : `<div class="ts-last muted">还没测过，来认识一下自己</div>`;
      return `
        <button type="button" class="ts-card card" data-scale="${s.id}">
          <div class="ts-card-icon">${s.icon}</div>
          <div class="ts-card-main">
            <div class="ts-card-title">${s.title}</div>
            <div class="ts-card-sub muted">${s.subtitle}</div>
            ${lastLine}
          </div>
          <div class="ts-card-arrow">›</div>
        </button>`;
    }).join('');

    // 置顶招牌:HBTI 人格测试(比常规量表卡更突出)
    const lastHbti = lastRecordOf('hbti');
    const heroLast = lastHbti
      ? `<div class="ts-hero-last">上次：${lastHbti.typeName || ''} · ${fmtDate(lastHbti.ts)}</div>`
      : `<div class="ts-hero-last">测一测,看见你如何被世界拥抱 ›</div>`;
    const hero = `
      <button type="button" class="ts-hero" id="tsHero">
        <div class="ts-hero-badge">环抱你原创 · 环抱型人格测试</div>
        <div class="ts-hero-title">HBTI 环抱型人格测试</div>
        <div class="ts-hero-sub">感知 · 感受 · 联结 · 复原 —— 看看你如何与世界相处、又如何拥抱自己</div>
        ${heroLast}
      </button>`;

    el.innerHTML = `
      <div class="ts-wrap">
        <div class="ts-head">
          <div class="ts-title">探索自己</div>
          <div class="ts-desc muted">用有依据的测试，温柔地认识自己。<br>结果只存在你的手机里，仅供自我探索，不是诊断。</div>
        </div>
        ${hero}
        <div class="ts-list">${cards}</div>
        <button type="button" class="ghost ts-records-entry" id="tsRecords">查看测试记录 ›</button>
      </div>`;

    const hb = el.querySelector('#tsHero');
    if (hb) hb.onclick = () => startHBTI();
    el.querySelectorAll('.ts-card').forEach(btn => {
      btn.onclick = () => startQuiz(btn.dataset.scale);
    });
    const rb = el.querySelector('#tsRecords');
    if (rb) rb.onclick = () => { state.view = 'records'; paint(); };
  }

  function startQuiz(scaleId) {
    const scale = scaleById(scaleId);
    if (!scale) return;
    state.mode = 'scale';
    state.scaleId = scaleId;
    state.answers = new Array(scale.items.length).fill(null);
    state.idx = 0;
    state.view = 'quiz';
    paint();
  }

  function startHBTI() {
    state.mode = 'hbti';
    state.scaleId = 'hbti';
    state.answers = new Array(HBTI_QUESTIONS.length).fill(null);
    state.idx = 0;
    state.view = 'quiz';
    paint();
  }

  // 归一化的答题描述子:让答题壳对"量表"与"HBTI"通用,消除渲染层的类型分支。
  // 返回 { title, subRight, items:[{zh}], options:[{val,label}] }
  function quizDescriptor() {
    if (state.mode === 'hbti') {
      return {
        title: HBTI_META.title,
        subRight: '凭第一直觉',
        items: HBTI_QUESTIONS,
        options: HBTI_ANCHORS.map((label, v) => ({ val: v + 1, label })), // 1..5
      };
    }
    const scale = scaleById(state.scaleId);
    const is7 = scale.scaleType === 'likert7';
    return {
      title: scale.title,
      subRight: is7 ? '1–7 分' : '过去一个月',
      items: scale.items,
      // likert7 分值 1..7;likert5(PSS) 分值 0..4
      options: scale.anchors.map((label, v) => ({ val: is7 ? v + 1 : v, label })),
    };
  }

  // ---------- 答题(量表 & HBTI 共用) ----------
  function paintQuiz() {
    const q = quizDescriptor();
    const i = state.idx;
    const item = q.items[i];
    const total = q.items.length;
    const answered = state.answers[i];
    const pct = Math.round((i) / total * 100);

    const opts = q.options.map(o => {
      const on = answered === o.val;
      return `
        <button type="button" class="ts-opt${on ? ' on' : ''}" data-val="${o.val}">
          <span class="ts-opt-dot"></span>
          <span class="ts-opt-label">${o.label || '·'}</span>
        </button>`;
    }).join('');

    el.innerHTML = `
      <div class="ts-wrap">
        <div class="ts-quiz-top">
          <button type="button" class="ts-back" id="tsBack">‹</button>
          <div class="ts-progress"><div class="ts-progress-bar" style="width:${pct}%"></div></div>
          <div class="ts-qnum">${i + 1}/${total}</div>
        </div>
        <div class="ts-quiz-scale muted">${q.title} · ${q.subRight}</div>
        <div class="ts-question card">${item.zh}</div>
        <div class="ts-opts">${opts}</div>
      </div>`;

    el.querySelector('#tsBack').onclick = () => {
      if (state.idx > 0) { state.idx--; paint(); }
      else { state.view = 'home'; paint(); }
    };
    el.querySelectorAll('.ts-opt').forEach(btn => {
      btn.onclick = () => {
        state.answers[i] = Number(btn.dataset.val);
        // 轻触觉（浏览器支持时）
        try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
        // 稍等一下让选中态可见，再自动前进
        setTimeout(() => {
          if (state.idx < total - 1) { state.idx++; paint(); }
          else finishQuiz();
        }, 180);
      };
    });
  }

  // ---------- 完成 → 计分 → 结果(按 mode 分派) ----------
  function finishQuiz() {
    if (state.mode === 'hbti') return finishHBTI();
    const scale = scaleById(state.scaleId);
    const res = scoreScale(scale, state.answers);
    state._result = res;
    // 完成即用本地兜底解读存档一次（保证"无论 AI 是否可用都存档"，并消除异步竞态）；
    // AI 返回后按这条记录的 id 更新解读。这一步在离开答题态前完成，answers 尚未被下次测试覆盖。
    const rec = addRecord({
      kind: 'scale',
      scaleId: scale.id, title: scale.title,
      score: res.score, maxScore: res.maxScore,
      bandLabel: res.band.label, bandDesc: res.band.desc,
      answers: state.answers.slice(),
      interpretation: fallbackInterp(scale, res),
      source: scale.source,
    });
    state._recId = rec.id;
    state._answersSnapshot = state.answers.slice();
    state.view = 'result';
    paint();
  }

  // HBTI 完成:计分→存档(带类型码与强度条)→结果页。同样"先存档,AI 后更新"。
  function finishHBTI() {
    const res = scoreHBTI(state.answers);
    state._result = res;
    const t = res.type || { name: '独特的你', desc: '', hug: '' };
    const rec = addRecord({
      kind: 'hbti',
      scaleId: 'hbti', title: HBTI_META.title,
      code: res.code, typeName: t.name, bars: res.bars,
      typeDesc: t.desc, typeHug: t.hug,
      answers: state.answers.slice(),
      interpretation: fallbackHBTIInterp(res),
      source: HBTI_META.source,
    });
    state._recId = rec.id;
    state._answersSnapshot = state.answers.slice();
    state.view = 'result';
    paint();
  }

  // ---------- 结果页(按 mode 分派) ----------
  function paintResult() {
    if (state.mode === 'hbti') return paintHBTIResult();
    const scale = scaleById(state.scaleId);
    const res = state._result;
    const ringColor = pickRingColor(scale, res);
    const frac = res.score / res.maxScore;

    el.innerHTML = `
      <div class="ts-wrap">
        <div class="ts-head">
          <div class="ts-title">${scale.title} · 结果</div>
        </div>

        <div class="ts-result-card card">
          ${ringSVG(frac, res.score, ringColor)}
          <div class="ts-band" style="color:${ringColor}">${res.band.label}</div>
          <div class="ts-band-desc">${res.band.desc}</div>
        </div>

        <div class="ts-interp card">
          <div class="ts-interp-title"><span class="ts-xz">小知</span> 想对你说</div>
          <div class="ts-interp-body" id="tsInterp">
            <div class="ts-loading"><div class="ts-spin"></div><div class="muted">小知正在读你的答案…</div></div>
          </div>
        </div>

        <div class="ts-src muted">
          题目来源：${scale.source}。<br>${scale.note}
        </div>

        <div class="ts-actions">
          <button type="button" class="ghost" id="tsRetry">重新测一次</button>
          <button type="button" id="tsHome">完成</button>
        </div>
      </div>`;

    // 戒指呼应：结果页做一次"温柔收束"呼吸（无戒指静默跳过）
    tryRingAnchor();

    el.querySelector('#tsRetry').onclick = () => startQuiz(scale.id);
    el.querySelector('#tsHome').onclick = () => { state.view = 'home'; paint(); };

    // AI 解读（异步）。记录已在 finishQuiz 存好（带兜底解读），这里成功则更新那一条。
    const recId = state._recId;                 // 快照当前记录 id，避免回调时被下次测试覆盖
    generateInterpretation(scale, res, state._answersSnapshot).then(text => {
      // 仅当用户仍停留在这次结果页时才更新界面（用 recId 比对，防止串页）
      if (state.view === 'result' && state._recId === recId) {
        const box = document.getElementById('tsInterp');
        if (box) box.innerHTML = poemyText(text);
      }
      if (recId) updateRecordInterp(recId, text);
    });
  }

  function pickRingColor(scale, res) {
    if (scale.id === 'pss') {
      if (res.score <= 13) return 'var(--calm)';
      if (res.score <= 26) return 'var(--mid)';
      return 'var(--high)';
    }
    // hsps：高敏感倾向用主色强调，其余柔和
    return 'var(--accent-deep)';
  }

  // SVG 分数环
  function ringSVG(frac, centerText, color) {
    const R = 52, C = 2 * Math.PI * R;
    const off = C * (1 - Math.max(0, Math.min(1, frac)));
    return `
      <svg class="ts-ring" viewBox="0 0 130 130" width="130" height="130">
        <circle cx="65" cy="65" r="${R}" fill="none" stroke="var(--line)" stroke-width="10"/>
        <circle cx="65" cy="65" r="${R}" fill="none" stroke="${color}" stroke-width="10"
          stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
          transform="rotate(-90 65 65)"/>
        <text x="65" y="60" text-anchor="middle" class="ts-ring-num">${centerText}</text>
        <text x="65" y="82" text-anchor="middle" class="ts-ring-label">分</text>
      </svg>`;
  }

  // ======================= HBTI 结果页 =======================
  function paintHBTIResult() {
    const res = state._result;
    const t = res.type || { name: '独特的你', img: '', desc: '每个人都是独一无二的。', hug: '' };

    const bars = res.bars.map(b => `
      <div class="hb-bar-row">
        <div class="hb-bar-label">${b.label}</div>
        <div class="hb-bar-track"><div class="hb-bar-fill" style="width:${b.pct}%"></div></div>
        <div class="hb-bar-pct">${b.pct}%</div>
      </div>`).join('');

    el.innerHTML = `
      <div class="ts-wrap">
        <div class="ts-head">
          <div class="ts-title">你的心灵样貌</div>
        </div>

        <div class="hb-card card">
          <div class="hb-portrait" id="hbPortrait">${hbtiImageSVG(res.code)}</div>
          <div class="hb-code">${res.code.split('').join(' · ')}</div>
          <div class="hb-name">${t.name}</div>
          ${t.img ? `<div class="hb-imgline muted">${t.img}</div>` : ''}
        </div>

        <div class="hb-bars card">${bars}</div>

        <div class="hb-desc card">
          <div class="hb-desc-body">${escapeHtml(t.desc)}</div>
          ${t.hug ? `<div class="hb-hug"><span class="hb-hug-tag">被环抱的方式</span>${escapeHtml(t.hug)}</div>` : ''}
        </div>

        <div class="ts-interp card">
          <div class="ts-interp-title"><span class="ts-xz">小知</span> 想对你说</div>
          <div class="ts-interp-body" id="tsInterp">
            <div class="ts-loading"><div class="ts-spin"></div><div class="muted">小知正在读你的答案…</div></div>
          </div>
        </div>

        <div class="ts-src muted">
          ${HBTI_META.note}<br>${HBTI_META.tmNote}
        </div>

        <div class="ts-actions">
          <button type="button" class="ghost" id="tsRetry">重新测一次</button>
          <button type="button" id="tsHome">完成</button>
        </div>
      </div>`;

    tryRingAnchor();

    el.querySelector('#tsRetry').onclick = () => startHBTI();
    el.querySelector('#tsHome').onclick = () => { state.mode = 'scale'; state.view = 'home'; paint(); };

    const recId = state._recId;
    generateHBTIInterp(res, state._answersSnapshot).then(text => {
      if (state.view === 'result' && state.mode === 'hbti' && state._recId === recId) {
        const box = document.getElementById('tsInterp');
        if (box) box.innerHTML = poemyText(text);
      }
      if (recId) updateRecordInterp(recId, text);
    });

    // 有 Key 时用 AI 生成人格意象图,替换 SVG 兜底;失败/无 Key 保持 SVG。
    enhanceHBTIPortrait(res, recId);
  }

  // 原创意象图(SVG 兜底,恒有):按类型码取莫兰迪色 + 图腾,无网络也精致。
  function hbtiImageSVG(code) {
    const sensitive = code[0] === '敏';   // 感知:敏=细腻深邃(冷) / 从=从容(暖)
    const express = code[1] === '露';     // 感受:露=向外流露(星点波纹) / 蕴=向内消化(同心圆)
    // 主色:敏偏冷静深邃,从偏暖;用 tokens.css 变量
    const c1 = sensitive ? 'var(--calm)' : 'var(--accent)';
    const c2 = sensitive ? 'var(--accent-deep)' : 'var(--mid)';
    // 由类型码派生一个稳定的旋转角,让 16 型可区分(不依赖随机)
    const seed = code.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const rot = seed % 360;
    // 露=星点/波纹(向外流露);蕴=同心圆(向内沉淀)
    const motif = express
      ? `<g opacity="0.85">
           <circle cx="70" cy="46" r="2.4" fill="#fff"/>
           <circle cx="98" cy="70" r="1.8" fill="#fff"/>
           <circle cx="52" cy="86" r="2" fill="#fff"/>
           <circle cx="86" cy="98" r="1.6" fill="#fff"/>
           <path d="M40 70 Q70 55 100 70 T160 70" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.5"/>
         </g>`
      : `<g fill="none" stroke="#fff" stroke-width="1.6" opacity="0.55">
           <circle cx="70" cy="70" r="16"/>
           <circle cx="70" cy="70" r="26"/>
           <circle cx="70" cy="70" r="36"/>
         </g>`;
    return `
      <svg viewBox="0 0 140 140" width="128" height="128" class="hb-svg" aria-hidden="true">
        <defs>
          <radialGradient id="hbg${seed}" cx="42%" cy="38%" r="72%">
            <stop offset="0%" stop-color="${c1}"/>
            <stop offset="100%" stop-color="${c2}"/>
          </radialGradient>
        </defs>
        <g transform="rotate(${rot} 70 70)">
          <circle cx="70" cy="70" r="60" fill="url(#hbg${seed})"/>
        </g>
        ${motif}
      </svg>`;
  }

  async function enhanceHBTIPortrait(res, recId) {
    const t = res.type; if (!t) return;
    try {
      AI.loadFromStore();
      // 复用 portrait 的"抽象、温暖、无人脸、无文字"风格,不传隐私,只传原型意象。
      const prompt = `An abstract, gentle emotional portrait representing a person's inner nature. ` +
        `Theme: "${t.name}" — ${t.img} ` +
        `Soft abstract oil painting, flowing organic shapes, visible brush texture, no human faces, no text. ` +
        `Warm Morandi color palette, poetic and comforting. 1024x1024.`;
      const url = await AI.image(prompt);
      if (url && state.view === 'result' && state.mode === 'hbti' && state._recId === recId) {
        const box = document.getElementById('hbPortrait');
        if (box) box.innerHTML = `<img class="hb-img" src="${url}" alt="${escapeHtml(t.name)}">`;
      }
    } catch (e) {
      // 保持 SVG 兜底,静默
    }
  }

  // ---------- AI 解读 + 本地兜底 ----------
  async function generateInterpretation(scale, res, answers) {
    // 组织答题摘要（给 AI 足够上下文，但不含隐私）；用快照 answers，避免异步期间被覆盖
    const ans = answers || state.answers;
    const summary = scale.items.map((it, i) => {
      return `「${it.zh}」→ ${ans[i]}`;
    }).join('；');

    try {
      AI.loadFromStore();
      const sys = AI.persona + `
【当前情境】用户刚完成了一份「${scale.title}」（${scale.source}）自测。
量表结果：总分 ${res.score}/${res.maxScore}，分段为「${res.band.label}」。
你的任务：以小知的口吻，温柔地解读这个结果。要求：
1. 先共鸣、接住这个人，不要一上来报数据、不要下"你有某某问题"的诊断；
2. 用 3-5 句短句，像在跟一个具体的人说话，不是念说明书；
3. 结尾轻轻给一个"可选的、小小的邀请"（不是命令、不是一堆建议）；
4. 明确这只是自我认识、不是诊断。不要用列表、不要用 emoji。`;
      const out = await AI.chat([
        { role: 'system', content: sys },
        { role: 'user', content: `我的作答（分值越高越符合）：${summary}。请用小知的口吻，温柔地跟我说说这个结果。` },
      ], { maxTokens: 320 });
      if (out && out.trim()) return out.trim();
    } catch (e) {
      // 落本地兜底
    }
    return fallbackInterp(scale, res);
  }

  // 本地兜底解读：以 band.desc 为主体 + 一句通用陪伴（AI 不可用时用，绝不白屏）
  function fallbackInterp(scale, res) {
    const tail = scale.id === 'pss'
      ? '（当前为离线示例解读。压力从来不是你的错，它只是提醒你需要被照顾了。）'
      : '（当前为离线示例解读。无论测出什么，这只是认识自己的一扇窗，不是一个标签。）';
    return res.band.desc + '\n\n' + tail;
  }

  // HBTI 的 AI 解读:以小知口吻,基于类型名与四维强度,温柔个性化;失败→本地兜底。
  async function generateHBTIInterp(res, answers) {
    const t = res.type; if (!t) return fallbackHBTIInterp(res);
    const barTxt = res.bars.map(b => `${b.label} ${b.pct}%`).join('、');
    try {
      AI.loadFromStore();
      const sys = AI.persona + `
【当前情境】用户刚完成「环抱你(HBTI)」原创人格测试(非诊断)。
结果类型:「${t.name}」(${res.code});四维强度:${barTxt}。
类型底稿:${t.desc}
你的任务:以小知的口吻,把这份结果温柔地读给这个具体的人听。要求:
1. 先接住 ta、给到共鸣,不要复述数据、不要下"你有某某问题"的诊断;
2. 用 3-5 句短句,像跟一个真实的人说话,突出这一型独有的可爱之处(不要说放到任何人身上都成立的空话);
3. 轻轻点一个温柔的成长边(把它说成"你的优点用力过猛时"),不是指责;
4. 结尾呼应「${t.name}」这个意象,给一个小小的、可选的邀请;
5. 明确这只是自我认识、不是诊断。不要用列表、不要用 emoji。`;
      const out = await AI.chat([
        { role: 'system', content: sys },
        { role: 'user', content: `我的 HBTI 结果是「${t.name}」,四维强度:${barTxt}。请用小知的口吻,温柔地跟我说说这个结果。` },
      ], { maxTokens: 340 });
      if (out && out.trim()) return out.trim();
    } catch (e) { /* 落兜底 */ }
    return fallbackHBTIInterp(res);
  }

  function fallbackHBTIInterp(res) {
    const t = res.type;
    if (!t) return '每个人都是独一无二的。这份结果只是认识自己的一扇窗,不是一个标签。\n\n（当前为离线示例解读。）';
    return `${t.desc}\n\n${t.hug}\n\n（当前为离线示例解读。HBTI 是原创的自我探索,不是诊断——每一种样貌都值得被温柔对待。）`;
  }

  // ---------- 历史记录 ----------
  function paintRecords() {
    const list = loadRecords();
    const body = list.length
      ? list.map(r => {
          // HBTI 记录没有分数,展示类型名;量表记录展示分数+分段
          const main = r.kind === 'hbti'
            ? `<div class="ts-rec-title">${r.title} · <b>${r.typeName || ''}</b></div>
               <div class="ts-rec-band muted">${(r.code || '').split('').join('·')} · ${fmtDate(r.ts)}</div>`
            : `<div class="ts-rec-title">${r.title} · <b>${r.score}</b>/${r.maxScore}</div>
               <div class="ts-rec-band muted">${r.bandLabel} · ${fmtDate(r.ts)}</div>`;
          return `
          <div class="ts-rec card" data-id="${r.id}">
            <div class="ts-rec-main">${main}</div>
            <button type="button" class="ts-rec-del" data-del="${r.id}">删除</button>
          </div>`;
        }).join('')
      : `<div class="ts-empty muted"><div class="ts-empty-em">🌱</div>还没有测试记录<br>回到探索页，认识一下自己吧</div>`;

    el.innerHTML = `
      <div class="ts-wrap">
        <div class="ts-quiz-top">
          <button type="button" class="ts-back" id="tsBack">‹</button>
          <div class="ts-title" style="flex:1;text-align:center">测试记录</div>
          <div style="width:32px"></div>
        </div>
        <div class="ts-reclist">${body}</div>
      </div>`;

    el.querySelector('#tsBack').onclick = () => { state.view = 'home'; paint(); };
    el.querySelectorAll('.ts-rec').forEach(row => {
      row.onclick = (e) => {
        if (e.target.dataset.del) return;
        const rec = list.find(x => x.id === row.dataset.id);
        if (rec) showRecordDetail(rec);
      };
    });
    el.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        delRecord(b.dataset.del);
        paint();
      };
    });
  }

  function showRecordDetail(rec) {
    // HBTI 记录:类型名 + 意象图 + 强度条;量表记录:分段 + 分数
    let head, fallbackInterpBody;
    if (rec.kind === 'hbti') {
      const bars = (rec.bars || []).map(b => `
        <div class="hb-bar-row">
          <div class="hb-bar-label">${b.label}</div>
          <div class="hb-bar-track"><div class="hb-bar-fill" style="width:${b.pct}%"></div></div>
          <div class="hb-bar-pct">${b.pct}%</div>
        </div>`).join('');
      head = `
        <div class="hb-card card">
          <div class="hb-portrait">${hbtiImageSVG(rec.code || '潜觉融岸')}</div>
          <div class="hb-code">${(rec.code || '').split('').join(' · ')}</div>
          <div class="hb-name">${rec.typeName || ''}</div>
          <div class="ts-rec-band muted">${fmtDate(rec.ts)}</div>
        </div>
        ${bars ? `<div class="hb-bars card">${bars}</div>` : ''}
        ${rec.typeDesc ? `<div class="hb-desc card"><div class="hb-desc-body">${escapeHtml(rec.typeDesc)}</div>${rec.typeHug ? `<div class="hb-hug"><span class="hb-hug-tag">被环抱的方式</span>${escapeHtml(rec.typeHug)}</div>` : ''}</div>` : ''}`;
      fallbackInterpBody = rec.typeDesc || '';
    } else {
      head = `
        <div class="ts-result-card card">
          <div class="ts-band-desc" style="font-size:15px;margin-top:0">
            <b>${rec.bandLabel}</b> · ${rec.score}/${rec.maxScore} 分 · ${fmtDate(rec.ts)}
          </div>
          <div class="ts-band-desc">${rec.bandDesc}</div>
        </div>`;
      fallbackInterpBody = rec.bandDesc || '';
    }

    el.innerHTML = `
      <div class="ts-wrap">
        <div class="ts-quiz-top">
          <button type="button" class="ts-back" id="tsBack">‹</button>
          <div class="ts-title" style="flex:1;text-align:center">${rec.title}</div>
          <div style="width:32px"></div>
        </div>
        ${head}
        <div class="ts-interp card">
          <div class="ts-interp-title"><span class="ts-xz">小知</span> 当时说</div>
          <div class="ts-interp-body">${poemyText(rec.interpretation || fallbackInterpBody)}</div>
        </div>
        <div class="ts-src muted">${rec.kind === 'hbti' ? (HBTI_META.note + '<br>' + HBTI_META.tmNote) : ('题目来源：' + (rec.source || '公开学术量表') + '。仅供自我探索，不构成诊断。')}</div>
      </div>`;
    el.querySelector('#tsBack').onclick = () => { state.view = 'records'; paint(); };
  }

  // ---------- 工具 ----------
  function tryRingAnchor() {
    try {
      const r = global.ring;
      if (r && typeof r.vibrate === 'function') {
        // 仅在已连接时呼应；mock 未连也安全（内部会 no-op 或 log）
        Promise.resolve(r.vibrate('anchor')).catch(() => {});
      }
    } catch (e) {}
  }

  function poemyText(text) {
    const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return '<div class="ts-p">…</div>';
    return lines.map(l => `<div class="ts-p">${escapeHtml(l)}</div>`).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }

  // ======================= 样式（内联，只用 tokens.css 变量） =======================
  function injectStyle() {
    if (document.getElementById('ts-style')) return;
    const s = document.createElement('style');
    s.id = 'ts-style';
    s.textContent = `
      .ts-wrap{display:flex;flex-direction:column;gap:16px;}
      .ts-head{text-align:center;padding-top:4px;}
      .ts-title{font-size:21px;font-weight:700;}
      .ts-desc{font-size:13px;line-height:1.7;margin-top:6px;}

      .ts-list{display:flex;flex-direction:column;gap:12px;}
      .ts-card{display:flex;align-items:center;gap:14px;text-align:left;width:100%;
        background:var(--surface);border:none;padding:18px 18px;}
      .ts-card-icon{width:46px;height:46px;flex:none;border-radius:50%;
        background:linear-gradient(135deg,var(--accent),var(--accent-deep));
        color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center;}
      .ts-card-main{flex:1;min-width:0;}
      .ts-card-title{font-size:16px;font-weight:600;color:var(--ink);}
      .ts-card-sub{font-size:12px;margin-top:2px;}
      .ts-last{font-size:12px;margin-top:6px;color:var(--accent-deep);}
      .ts-card-arrow{color:var(--sub);font-size:22px;flex:none;}
      .ts-records-entry{width:100%;}

      /* 答题 */
      .ts-quiz-top{display:flex;align-items:center;gap:12px;}
      .ts-back{background:transparent;color:var(--sub);font-size:24px;padding:2px 8px;width:32px;flex:none;}
      .ts-progress{flex:1;height:6px;background:var(--line);border-radius:999px;overflow:hidden;}
      .ts-progress-bar{height:100%;background:var(--accent);border-radius:999px;transition:width .3s ease;}
      .ts-qnum{font-size:13px;color:var(--sub);flex:none;min-width:40px;text-align:right;}
      .ts-quiz-scale{font-size:12px;text-align:center;}
      .ts-question{font-size:18px;line-height:1.7;text-align:center;padding:32px 22px;font-weight:500;
        min-height:120px;display:flex;align-items:center;justify-content:center;}
      .ts-opts{display:flex;flex-direction:column;gap:10px;}
      .ts-opt{display:flex;align-items:center;gap:12px;background:var(--surface);
        color:var(--ink);border:1.5px solid var(--line);border-radius:14px;
        padding:14px 16px;font-size:15px;text-align:left;transition:all .15s ease;}
      .ts-opt-dot{width:18px;height:18px;flex:none;border-radius:50%;border:2px solid var(--line);transition:all .15s ease;}
      .ts-opt-label{flex:1;}
      .ts-opt.on{border-color:var(--accent);background:#FBF6F1;font-weight:600;}
      .ts-opt.on .ts-opt-dot{border-color:var(--accent);background:var(--accent);
        box-shadow:inset 0 0 0 3px var(--surface);}

      /* 结果 */
      .ts-result-card{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding:28px 22px;}
      .ts-ring{display:block;}
      .ts-ring-num{font-size:30px;font-weight:700;fill:var(--ink);}
      .ts-ring-label{font-size:12px;fill:var(--sub);}
      .ts-band{font-size:18px;font-weight:700;}
      .ts-band-desc{font-size:14px;line-height:1.85;color:var(--ink);}
      .ts-interp{padding:20px 20px 22px;}
      .ts-interp-title{font-size:13px;color:var(--sub);margin-bottom:12px;}
      .ts-xz{background:var(--accent);color:#fff;font-size:12px;padding:2px 9px;border-radius:999px;font-weight:600;}
      .ts-interp-body{display:flex;flex-direction:column;gap:10px;}
      .ts-p{font-size:15px;line-height:1.95;color:var(--ink);letter-spacing:.3px;}
      .ts-loading{display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px;}
      .ts-spin{width:28px;height:28px;border:3px solid var(--line);border-top-color:var(--accent);
        border-radius:50%;animation:tsSpin 1s linear infinite;}
      @keyframes tsSpin{to{transform:rotate(360deg)}}
      .ts-src{font-size:11px;line-height:1.7;text-align:center;padding:0 8px;}
      .ts-actions{display:flex;gap:12px;}
      .ts-actions button{flex:1;}

      /* HBTI 置顶招牌卡 */
      .ts-hero{width:100%;text-align:left;border:none;color:#fff;padding:22px 20px;border-radius:var(--radius);
        background:linear-gradient(135deg,var(--accent-deep),var(--accent));box-shadow:var(--shadow);
        display:flex;flex-direction:column;gap:6px;position:relative;overflow:hidden;}
      .ts-hero::after{content:'';position:absolute;right:-30px;top:-30px;width:130px;height:130px;border-radius:50%;
        background:rgba(255,255,255,.14);}
      .ts-hero-badge{font-size:11px;background:rgba(255,255,255,.22);align-self:flex-start;
        padding:3px 10px;border-radius:999px;letter-spacing:.5px;}
      .ts-hero-title{font-size:22px;font-weight:700;margin-top:4px;}
      .ts-hero-sub{font-size:13px;opacity:.92;line-height:1.6;}
      .ts-hero-last{font-size:12px;opacity:.85;margin-top:6px;}

      /* HBTI 结果 */
      .hb-card{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:26px 22px;}
      .hb-portrait{width:128px;height:128px;display:flex;align-items:center;justify-content:center;}
      .hb-svg{display:block;border-radius:50%;box-shadow:var(--shadow);}
      .hb-img{width:128px;height:128px;border-radius:50%;object-fit:cover;box-shadow:var(--shadow);}
      .hb-code{font-size:13px;color:var(--sub);letter-spacing:2px;margin-top:6px;}
      .hb-name{font-size:22px;font-weight:700;color:var(--ink);}
      .hb-imgline{font-size:13px;line-height:1.6;}
      .hb-bars{display:flex;flex-direction:column;gap:14px;padding:20px 20px;}
      .hb-bar-row{display:flex;align-items:center;gap:10px;}
      .hb-bar-label{font-size:12px;color:var(--sub);width:76px;flex:none;}
      .hb-bar-track{flex:1;height:8px;background:var(--line);border-radius:999px;overflow:hidden;}
      .hb-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--accent),var(--accent-deep));}
      .hb-bar-pct{font-size:12px;color:var(--accent-deep);width:38px;text-align:right;flex:none;font-weight:600;}
      .hb-desc{padding:20px 20px;}
      .hb-desc-body{font-size:14px;line-height:1.9;color:var(--ink);}
      .hb-hug{margin-top:14px;padding:14px 16px;background:#FBF6F1;border-radius:14px;
        font-size:14px;line-height:1.85;color:var(--ink);}
      .hb-hug-tag{display:block;font-size:12px;color:var(--accent-deep);font-weight:600;margin-bottom:6px;}

      /* 记录 */
      .ts-reclist{display:flex;flex-direction:column;gap:10px;}
      .ts-rec{display:flex;align-items:center;gap:12px;padding:16px 18px;}
      .ts-rec-main{flex:1;min-width:0;}
      .ts-rec-title{font-size:15px;color:var(--ink);}
      .ts-rec-band{font-size:12px;margin-top:3px;}
      .ts-rec-del{background:transparent;color:var(--sub);font-size:13px;padding:6px 10px;flex:none;}
      .ts-empty{text-align:center;padding:56px 20px;line-height:1.9;}
      .ts-empty-em{font-size:40px;margin-bottom:8px;}
    `;
    document.head.appendChild(s);
  }

  global.Pages = global.Pages || {};
  global.Pages['tests'] = { render };
})(typeof window !== 'undefined' ? window : globalThis);
