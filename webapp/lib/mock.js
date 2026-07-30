/**
 * mock.js — 假戒指数据源（让软件不等硬件即可开发/演示）
 * 实现《接口契约》§2 的统一 Ring 接口，可与真 ble.js 无缝互换。
 * 用法：const ring = new MockRing(); ring.onData(...); ring.onStatus(...); await ring.connect();
 */
(function (global) {
  'use strict';

  class MockRing {
    constructor() {
      this._dataCbs = [];
      this._statusCbs = [];
      this._gestureCbs = [];
      this._timer = null;
      this._status = 'idle';
      // 基线（静息）
      this._baseHr = 72;
      this._baseHrv = 50;
      this._baseGsr = 1200;
      this._baseMotion = 6;
      // 压力叠加量，simulateStress 时抬升，然后自然回落
      this._stress = 0;
      // 坐立不安(fidget)叠加量，simulateStress 时略增
      this._fidget = 0;
    }

    // ---- 契约接口 ----
    connect() {
      this._setStatus('connecting');
      return new Promise((resolve) => {
        setTimeout(() => {
          this._setStatus('connected');
          this._setStatus('baseline');
          // 5s 采基线后进入监测
          setTimeout(() => {
            this._setStatus('monitoring');
            this._start();
          }, 5000);
          resolve();
        }, 1500);
      });
    }

    disconnect() {
      this._stop();
      this._setStatus('disconnected');
    }

    // 三档干预触觉（见 docs/接口契约.md §1）；mock 只打印+派事件，供页面演示
    vibrate(mode = 'anchor') {
      const LABEL = {
        intercept: '档三·早期拦截（轻促短震 ~150ms）',
        anchor:    '档二·实时锚点（共振呼吸 吸4·呼6 渐强渐弱 x3）',
        retreat:   '档一·撤退许可（两下长震 长-停-长）',
      };
      const label = LABEL[mode] || LABEL.anchor;
      console.log('[MockRing] VIBRATE →', mode, '｜', label);
      // 页面可监听此事件做"戒指震动"提示动画（detail 带 mode + 中文档位标签）
      global.dispatchEvent(new CustomEvent('ring:vibrate', { detail: { mode, label } }));
      return Promise.resolve();
    }

    onData(cb) { if (typeof cb === 'function') this._dataCbs.push(cb); }
    onStatus(cb) { if (typeof cb === 'function') this._statusCbs.push(cb); }
    onGesture(cb) { if (typeof cb === 'function') this._gestureCbs.push(cb); }

    // ---- 仅 mock：手动触发一次压力冲高 ----
    simulateStress() {
      this._stress = 30; // 立刻抬升，之后每 tick 自然回落
      this._fidget = 10; // 压力时略微坐立不安
    }

    // ---- 仅 mock：手动触发一次"双击戒指"手势（演示敲一下说话）----
    simulateGesture(g = 'DBLTAP') {
      this._gestureCbs.forEach((cb) => cb(g));
      global.dispatchEvent(new CustomEvent('ring:gesture', { detail: { gesture: g } }));
    }

    // ---- 内部 ----
    _start() {
      this._stop();
      this._timer = setInterval(() => this._tick(), 1000);
    }
    _stop() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }

    _tick() {
      // 压力/坐立不安自然回落
      if (this._stress > 0) this._stress = Math.max(0, this._stress - 2);
      if (this._fidget > 0) this._fidget = Math.max(0, this._fidget - 1);

      const noise = (n) => (Math.random() * 2 - 1) * n;
      const hr = Math.round(this._baseHr + this._stress * 0.9 + noise(3));      // 高压时心率↑
      const hrv = Math.max(8, Math.round(this._baseHrv - this._stress * 1.1 + noise(4))); // 高压时HRV↓
      const gsr = Math.round(this._baseGsr + this._stress * 20 + noise(40));    // 高压时GSR↑
      // 运动量：静息小抖动；压力时叠加坐立不安 fidget（但不到"剧烈运动"程度）
      const motion = Math.max(0, Math.round(this._baseMotion + this._fidget + noise(3)));
      const ts = Date.now();

      this._emitData({ hr, hrv, gsr, motion, ts });
    }

    _emitData(d) { this._dataCbs.forEach((cb) => cb(d)); }
    _setStatus(s) { this._status = s; this._statusCbs.forEach((cb) => cb(s)); }
  }

  // 同时支持全局与 ES/CommonJS
  global.MockRing = MockRing;
  if (typeof module !== 'undefined' && module.exports) module.exports = { MockRing };
})(typeof window !== 'undefined' ? window : globalThis);
