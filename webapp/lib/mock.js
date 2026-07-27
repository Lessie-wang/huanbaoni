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
      this._timer = null;
      this._status = 'idle';
      // 基线（静息）
      this._baseHr = 72;
      this._baseHrv = 50;
      this._baseGsr = 1200;
      // 压力叠加量，simulateStress 时抬升，然后自然回落
      this._stress = 0;
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

    vibrate(mode = 'short') {
      console.log('[MockRing] VIBRATE:', mode);
      // 页面可监听此事件做"戒指震动"提示动画
      global.dispatchEvent(new CustomEvent('ring:vibrate', { detail: { mode } }));
      return Promise.resolve();
    }

    onData(cb) { if (typeof cb === 'function') this._dataCbs.push(cb); }
    onStatus(cb) { if (typeof cb === 'function') this._statusCbs.push(cb); }

    // ---- 仅 mock：手动触发一次压力冲高 ----
    simulateStress() {
      this._stress = 30; // 立刻抬升，之后每 tick 自然回落
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
      // 压力自然回落
      if (this._stress > 0) this._stress = Math.max(0, this._stress - 2);

      const noise = (n) => (Math.random() * 2 - 1) * n;
      const hr = Math.round(this._baseHr + this._stress * 0.9 + noise(3));      // 高压时心率↑
      const hrv = Math.max(8, Math.round(this._baseHrv - this._stress * 1.1 + noise(4))); // 高压时HRV↓
      const gsr = Math.round(this._baseGsr + this._stress * 20 + noise(40));    // 高压时GSR↑
      const ts = Date.now();

      this._emitData({ hr, hrv, gsr, ts });
    }

    _emitData(d) { this._dataCbs.forEach((cb) => cb(d)); }
    _setStatus(s) { this._status = s; this._statusCbs.forEach((cb) => cb(s)); }
  }

  // 同时支持全局与 ES/CommonJS
  global.MockRing = MockRing;
  if (typeof module !== 'undefined' && module.exports) module.exports = { MockRing };
})(typeof window !== 'undefined' ? window : globalThis);
