/**
 * store.js — 统一数据层（见 docs/接口契约.md §3）
 * 所有页面读写数据只经这里，禁止各自直接操作 localStorage。
 */
(function (global) {
  'use strict';

  const K = {
    events: 'hbn.events',
    portraits: 'hbn.portraits',
    growth: 'hbn.growth',
    profile: 'hbn.profile',
    settings: 'hbn.settings',
    trend: 'hbn.trend',
  };

  // 写死默认 API（零配置即可跑通）——与 feature/h5-publish 上线版保持一致。
  // useMock=true 只影响"戒指"数据（现场无真戒指→模拟心率/HRV），不影响 AI 通道。
  //
  // baseUrl 分两种场景（现场手机无内网 VPN，到不了 maas 10.35.x）：
  //  · 局域网 IP 访问(经电脑代理跳板 serve-proxy.py) → 走同源 /hackson，由电脑转发到 maas；
  //    同源还顺带免掉 CORS 和自签证书二次信任。
  //  · 其它(github.io / localhost 桌面开发，本机有 VPN) → 直连 maas，保持原行为。
  const _isLanHost = (() => {
    try {
      const h = location.hostname || '';
      return /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h);
    } catch (e) { return false; }
  })();
  const DEFAULTS = {
    apiBaseUrl: _isLanHost
      ? (location.origin + '/hackson')
      : 'https://maas.devops.rednote.life/hackson',
    apiKey: 'MAAS373ad9ff7c544476a499e77c9479b07b',
    useMock: true,
  };

  const _read = (k, def) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
    catch (e) { console.warn('[store] read fail', k, e); return def; }
  };
  const _write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { console.warn('[store] write fail', k, e); return false; }
  };
  const _uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const _today = () => new Date().toISOString().slice(0, 10);

  const Store = {
    // ---- 事件时间线 ----
    getEvents() { return _read(K.events, []); },
    addEvent(ev) {
      const list = Store.getEvents();
      const rec = Object.assign(
        { id: _uid(), ts: Date.now(), type: 'manual', level: 'low', source: 'user' },
        ev
      );
      list.unshift(rec);
      _write(K.events, list);
      return rec;
    },
    getEventsByDate(date = _today()) {
      return Store.getEvents().filter(e => new Date(e.ts).toISOString().slice(0, 10) === date);
    },

    // ---- 心灵画像 ----
    getPortraits() { return _read(K.portraits, []); },
    addPortrait(p) {
      const list = Store.getPortraits();
      const rec = Object.assign({ id: _uid(), date: _today() }, p);
      list.unshift(rec);
      _write(K.portraits, list);
      return rec;
    },
    getPortraitByDate(date = _today()) {
      return Store.getPortraits().find(p => p.date === date) || null;
    },

    // ---- 成长系统 ----
    getGrowth() {
      return _read(K.growth, {
        level: 1, exp: 0, totalExp: 0, badges: [],
        streakDays: 0, lastActive: null, ringHugCount: 0,
      });
    },
    setGrowth(g) { return _write(K.growth, g); },
    incRingHug() {
      const g = Store.getGrowth();
      g.ringHugCount = (g.ringHugCount || 0) + 1;
      Store.setGrowth(g);
      return g.ringHugCount;
    },

    // ---- 用户画像 / 表达能力档案 ----
    getProfile() {
      return _read(K.profile, {
        onboarding: {},
        expressionProfile: { strengths: [], blocks: [], practicing: [], milestones: [] },
      });
    },
    setProfile(p) { return _write(K.profile, p); },

    // ---- 运行配置 ----
    // 对老缓存做兜底：之前存过的空 apiBaseUrl/apiKey（main 旧默认就是空）用写死默认值补上，
    // 否则清过缓存/存过空值的用户会一直"AI 未配置"，chat 与生图全失败。
    getSettings() {
      const saved = _read(K.settings, {});
      // 局域网(代理跳板)场景下，忽略可能残留的 maas 直连地址，强制走同源 /hackson，
      // 否则老缓存里存过的 10.35.x 直连会让手机继续 Failed to fetch。
      const base = _isLanHost
        ? DEFAULTS.apiBaseUrl
        : (saved.apiBaseUrl || DEFAULTS.apiBaseUrl);
      return {
        apiBaseUrl: base,
        apiKey: saved.apiKey || DEFAULTS.apiKey,
        useMock: (saved.useMock === undefined ? DEFAULTS.useMock : saved.useMock),
      };
    },
    setSettings(s) { return _write(K.settings, Object.assign(Store.getSettings(), s)); },
    resetSettings() { _write(K.settings, {}); return Store.getSettings(); },

    // ---- 压力指数时间序列（24h 折线图数据源；realtime 写，growth 可复用）----
    // 每条 { ts, z, level }：z 为 z-score 压力指数（可正可负），level 为分档
    getTrend(hours = 24) {
      const all = _read(K.trend, []);
      if (!hours) return all;
      const cut = Date.now() - hours * 3600e3;
      return all.filter(s => s.ts >= cut);
    },
    addTrendSample(s) {
      const all = _read(K.trend, []);
      all.push(Object.assign({ ts: Date.now() }, s));
      // 只保留最近 48h 且最多 4000 点，防止 localStorage 膨胀
      const cut = Date.now() - 48 * 3600e3;
      let trimmed = all.filter(x => x.ts >= cut);
      if (trimmed.length > 4000) trimmed = trimmed.slice(trimmed.length - 4000);
      _write(K.trend, trimmed);
      return trimmed.length;
    },

    // ---- 工具 ----
    _uid, _today,
    clearAll() { Object.values(K).forEach(k => localStorage.removeItem(k)); },
  };

  global.Store = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Store };
})(typeof window !== 'undefined' ? window : globalThis);
