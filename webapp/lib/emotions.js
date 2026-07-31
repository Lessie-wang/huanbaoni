/**
 * emotions.js — 16 种情绪分类（搬自 知愈 pages/main/main.js emotionsData）
 * 每种：中文名 / 英文关键词(生图用) / 主色 / 浅色 / 6个衍生词 / valence 效价 / visual 视觉词库
 * 戒指测"波动强度"，用户用这些补录"具体情绪"，共同决定心灵画像的色彩与画面。
 *
 * valence: 'pos' 正向 | 'calm' 平静中性 | 'neg' 负向 —— 决定画像整体基调是舒展还是沉郁。
 * visual: 一段英文"画面词库"，用构图/光线/重量/动势/氛围诚实承载这种情绪，
 *         而不是靠把笔触画丑。心灵画像页主打"真实可视化"，不美化负面情绪。
 */
(function (global) {
  'use strict';

  const EMOTIONS = [
    { name: '开心', en: 'joyful',            color: '#FFD4D8', light: '#FFE8EB', valence: 'pos',  sub: ['愉悦','欣喜','高兴','喜悦','欢快','欣喜若狂'],
      visual: 'buoyant round orbs floating and rising upward, bright warm radiant light spilling across the canvas, airy open composition full of breathing space, light and effervescent' },
    { name: '平静', en: 'serene calm',       color: '#C8E0F0', light: '#E0F0F8', valence: 'calm', sub: ['安宁','放松','淡然','宁静','超然','空明'],
      visual: 'wide horizontal bands settling into stillness, soft even diffused light, balanced symmetrical composition, smooth unbroken gradients, quiet and spacious' },
    { name: '难过', en: 'sorrowful',         color: '#A8B5C8', light: '#C8D5E8', valence: 'neg',  sub: ['失落','沮丧','忧伤','悲痛','心碎','哀恸'],
      visual: 'heavy forms sinking and pooling toward the bottom, dim overcast grey-blue light, strong downward gravity, faint rain-like vertical streaks, muted and low, a sense of quiet weight pressing down' },
    { name: '焦虑', en: 'anxious',           color: '#D4C5E8', light: '#E8DDF8', valence: 'neg',  sub: ['担忧','不安','紧张','焦灼','恐慌','惊惧'],
      visual: 'tangled restless coils and knotted threads winding tightly, off-balance crowded composition with no room to rest, jittery uneven flickering light, taut nervous energy pulling in many directions' },
    { name: '幸福', en: 'blissful content',  color: '#FFE5CC', light: '#FFF5E8', valence: 'pos',  sub: ['满足','舒心','幸福','美满','圆满','至福'],
      visual: 'a soft glowing core radiating gentle golden warmth outward, enveloping rounded forms like a warm embrace, tender apricot light, full and settled, deeply content' },
    { name: '自豪', en: 'proud',             color: '#E8D4A8', light: '#F8E8D0', valence: 'pos',  sub: ['满意','欣慰','自豪','骄傲','荣耀','无比荣光'],
      visual: 'upward rising forms reaching toward a bright zenith, dignified vertical composition, warm golden glow crowning the top, steady and self-assured, uplifting' },
    { name: '孤独', en: 'lonely',            color: '#B8C5D8', light: '#D8E0E8', valence: 'neg',  sub: ['孤单','寂寞','孤独','孤寂','孤立无援','与世隔绝'],
      visual: 'a single small form adrift in a vast cold empty space, wide margins of void and fog around it, distant faint light, immense negative space, isolated and far away' },
    { name: '愤怒', en: 'angry',             color: '#E8B0B0', light: '#F8D0D0', valence: 'neg',  sub: ['不满','生气','恼怒','愤恨','暴怒','狂怒'],
      visual: 'jagged fractured shards clashing and colliding, high harsh contrast, hot red-orange intrusions violently breaking through, turbulent explosive diagonal energy, sharp and ruptured' },
    { name: '兴奋', en: 'excited',           color: '#FFC9CE', light: '#FFE8EB', valence: 'pos',  sub: ['期待','激动','兴奋','亢奋','狂热','热血沸腾'],
      visual: 'bright bursting bubbles scattering outward in every direction, vivid energetic swirls, dynamic radiating composition, sparkling lively light, electric and buzzing with anticipation' },
    { name: '感动', en: 'moved and warm',    color: '#FFE0D0', light: '#FFF0E8', valence: 'pos',  sub: ['温暖','触动','感动','感激','感恩戴德','涕泗横流'],
      visual: 'gentle waves of warm light washing over soft forms, a tender swell rising from within, glistening translucent layers like held-back tears, warm and moved, quietly overflowing' },
    { name: '失望', en: 'disappointed',      color: '#9FB0C4', light: '#C8D5E8', valence: 'neg',  sub: ['不满意','遗憾','失望','心寒','心灰意冷','绝望'],
      visual: 'forms deflating and drooping, a light that has dimmed and cooled, sagging droopy shapes losing their shape, faded desaturated grey-blue, the flatness of something that has let go' },
    { name: '恐惧', en: 'fearful',           color: '#C9B8E0', light: '#E8DDF8', valence: 'neg',  sub: ['害怕','畏惧','恐惧','惊恐','恐怖','胆战心惊'],
      visual: 'looming dark shapes pressing inward from the edges, a small form shrinking away from encroaching shadow, cold dim light with deep murky corners, tense claustrophobic composition, unsettling' },
    { name: '累',   en: 'weary',             color: '#E0D5C0', light: '#F0E5D8', valence: 'neg',  sub: ['疲倦','困乏','疲惫','劳累','精疲力竭','身心俱疲'],
      visual: 'slack forms slumping and settling downward under their own weight, hazy dim light with the day fading out, muted washed-out earthy tones, heavy soft blur, drained and running low on energy' },
    { name: '困惑', en: 'confused',          color: '#D4E0C8', light: '#E8F0E0', valence: 'neg',  sub: ['疑惑','迷茫','困惑','茫然','迷失','不知所措'],
      visual: 'shapes overlapping and blurring into one another with no clear edges, misty foggy haze obscuring the way, scattered fragmentary composition pointing nowhere, dim uncertain light, lost and searching' },
    { name: '尴尬', en: 'awkward',           color: '#F0C8D0', light: '#F8E0E8', valence: 'neg',  sub: ['不自在','局促','尴尬','窘迫','难堪','无地自容'],
      visual: 'overlapping translucent forms crowding awkwardly, uneasy wavy distorted lines, a flushed pink heat rising in patches, cramped self-conscious composition wanting to shrink away, hesitant and uncomfortable' },
    { name: '不知道', en: 'indescribable',   color: '#D0D0D0', light: '#E8E8E8', valence: 'neg',  sub: ['模糊','混沌','混乱','复杂','矛盾','无以名状'],
      visual: 'formless shifting grey mist with no fixed shape, contradictory currents pulling gently against each other, muted neutral colorless haze, ambiguous and hard to name, an unresolved blur' },
  ];

  global.Emotions = EMOTIONS;
  global.EmotionBy = (name) => EMOTIONS.find(e => e.name === name) || null;
  if (typeof module !== 'undefined' && module.exports) module.exports = { EMOTIONS };
})(typeof window !== 'undefined' ? window : globalThis);
