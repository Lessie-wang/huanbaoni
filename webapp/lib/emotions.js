/**
 * emotions.js — 16 种情绪分类（搬自 知愈 pages/main/main.js emotionsData）
 * 每种：中文名 / 英文关键词(生图用) / 主色 / 浅色 / 6个衍生词
 * 戒指测"波动强度"，用户用这些补录"具体情绪"，共同决定心灵画像的色彩。
 */
(function (global) {
  'use strict';

  const EMOTIONS = [
    { name: '开心', en: 'joyful',            color: '#FFD4D8', light: '#FFE8EB', sub: ['愉悦','欣喜','高兴','喜悦','欢快','欣喜若狂'] },
    { name: '平静', en: 'serene calm',       color: '#C8E0F0', light: '#E0F0F8', sub: ['安宁','放松','淡然','宁静','超然','空明'] },
    { name: '难过', en: 'sorrowful',         color: '#A8B5C8', light: '#C8D5E8', sub: ['失落','沮丧','忧伤','悲痛','心碎','哀恸'] },
    { name: '焦虑', en: 'anxious',           color: '#D4C5E8', light: '#E8DDF8', sub: ['担忧','不安','紧张','焦灼','恐慌','惊惧'] },
    { name: '幸福', en: 'blissful content',  color: '#FFE5CC', light: '#FFF5E8', sub: ['满足','舒心','幸福','美满','圆满','至福'] },
    { name: '自豪', en: 'proud',             color: '#E8D4A8', light: '#F8E8D0', sub: ['满意','欣慰','自豪','骄傲','荣耀','无比荣光'] },
    { name: '孤独', en: 'lonely',            color: '#B8C5D8', light: '#D8E0E8', sub: ['孤单','寂寞','孤独','孤寂','孤立无援','与世隔绝'] },
    { name: '愤怒', en: 'angry',             color: '#E8B0B0', light: '#F8D0D0', sub: ['不满','生气','恼怒','愤恨','暴怒','狂怒'] },
    { name: '兴奋', en: 'excited',           color: '#FFC9CE', light: '#FFE8EB', sub: ['期待','激动','兴奋','亢奋','狂热','热血沸腾'] },
    { name: '感动', en: 'moved and warm',    color: '#FFE0D0', light: '#FFF0E8', sub: ['温暖','触动','感动','感激','感恩戴德','涕泗横流'] },
    { name: '失望', en: 'disappointed',      color: '#9FB0C4', light: '#C8D5E8', sub: ['不满意','遗憾','失望','心寒','心灰意冷','绝望'] },
    { name: '恐惧', en: 'fearful',           color: '#C9B8E0', light: '#E8DDF8', sub: ['害怕','畏惧','恐惧','惊恐','恐怖','胆战心惊'] },
    { name: '累',   en: 'weary',             color: '#E0D5C0', light: '#F0E5D8', sub: ['疲倦','困乏','疲惫','劳累','精疲力竭','身心俱疲'] },
    { name: '困惑', en: 'confused',          color: '#D4E0C8', light: '#E8F0E0', sub: ['疑惑','迷茫','困惑','茫然','迷失','不知所措'] },
    { name: '尴尬', en: 'awkward',           color: '#F0C8D0', light: '#F8E0E8', sub: ['不自在','局促','尴尬','窘迫','难堪','无地自容'] },
    { name: '不知道', en: 'indescribable',   color: '#D0D0D0', light: '#E8E8E8', sub: ['模糊','混沌','混乱','复杂','矛盾','无以名状'] },
  ];

  global.Emotions = EMOTIONS;
  global.EmotionBy = (name) => EMOTIONS.find(e => e.name === name) || null;
  if (typeof module !== 'undefined' && module.exports) module.exports = { EMOTIONS };
})(typeof window !== 'undefined' ? window : globalThis);
