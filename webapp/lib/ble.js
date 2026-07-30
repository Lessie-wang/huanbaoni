/**
 * ble.js — 真戒指 Web Bluetooth 实现（见 docs/接口契约.md §2）
 * 实现与 MockRing 完全相同的接口签名，可无缝互换：
 *   connect() / disconnect() / vibrate(mode) / onData(cb) / onStatus(cb)
 * 用法：window.ring = new BleRing();
 *
 * 仅在 Chrome/Edge(桌面) 或 Android Chrome 可用；iOS Safari 不支持。
 * 需 localhost 或 HTTPS，且 connect() 必须由用户手势(点击)触发。
 */
(function (global) {
  'use strict';

  // —— BLE 契约 UUID（必须与固件完全一致，全小写）——
  const SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
  const HR_UUID      = '19b10003-e8f2-537e-4f6c-d104768a1214';
  const HRV_UUID     = '19b10005-e8f2-537e-4f6c-d104768a1214';
  const GSR_UUID     = '19b10006-e8f2-537e-4f6c-d104768a1214';
  const MOTION_UUID  = '19b10007-e8f2-537e-4f6c-d104768a1214';   // 运动量上行(六轴)
  const CMD_UUID     = '19b10008-e8f2-537e-4f6c-d104768a1214';
  const GESTURE_UUID = '19b10009-e8f2-537e-4f6c-d104768a1214';   // 手势上行(敲击唤醒)
  const DEVICE_NAME  = 'HuanbaoNi';

  class BleRing {
    constructor() {
      this._dataCbs = [];
      this._statusCbs = [];
      this._gestureCbs = [];
      this._device = null;
      this._server = null;
      this._cmdCh = null;
      this._status = 'idle';
      this._dec = new TextDecoder();
      this._enc = new TextEncoder();
      // 最近一次各通道值，任一通道更新即合并上报
      this._last = { hr: 0, hrv: 0, gsr: undefined, motion: undefined, ts: 0 };
      this._onDisc = this._onDisc.bind(this);
    }

    static get supported() {
      return typeof navigator !== 'undefined' && !!navigator.bluetooth;
    }

    // ---- 契约接口 ----
    async connect() {
      if (!BleRing.supported) {
        const msg = '此浏览器不支持 Web Bluetooth（请用桌面 Chrome / Android Chrome）';
        this._setStatus('unsupported');
        throw new Error(msg);
      }
      this._setStatus('connecting');
      try {
        this._device = await navigator.bluetooth.requestDevice({
          filters: [{ name: DEVICE_NAME }],
          optionalServices: [SERVICE_UUID],
        });
        this._device.addEventListener('gattserverdisconnected', this._onDisc);

        this._server = await this._device.gatt.connect();
        this._setStatus('connected');

        const svc = await this._server.getPrimaryService(SERVICE_UUID);

        // 心率 Notify（必有）
        const hrCh = await svc.getCharacteristic(HR_UUID);
        hrCh.addEventListener('characteristicvaluechanged', (e) => {
          this._last.hr = parseInt(this._dec.decode(e.target.value), 10) || this._last.hr;
          this._emit();
        });
        await hrCh.startNotifications();

        // HRV Notify（可选，容错）
        try {
          const hrvCh = await svc.getCharacteristic(HRV_UUID);
          hrvCh.addEventListener('characteristicvaluechanged', (e) => {
            this._last.hrv = parseFloat(this._dec.decode(e.target.value)) || this._last.hrv;
            this._emit();
          });
          await hrvCh.startNotifications();
        } catch (_) { /* 固件未提供 HRV，跳过 */ }

        // GSR Notify（P1，可选）
        try {
          const gsrCh = await svc.getCharacteristic(GSR_UUID);
          gsrCh.addEventListener('characteristicvaluechanged', (e) => {
            this._last.gsr = parseFloat(this._dec.decode(e.target.value));
            this._emit();
          });
          await gsrCh.startNotifications();
        } catch (_) { /* 无 GSR，跳过 */ }

        // MOTION Notify（六轴运动量，可选）
        try {
          const mCh = await svc.getCharacteristic(MOTION_UUID);
          mCh.addEventListener('characteristicvaluechanged', (e) => {
            this._last.motion = parseFloat(this._dec.decode(e.target.value));
            this._emit();
          });
          await mCh.startNotifications();
        } catch (_) { /* 无 MOTION，跳过 */ }

        // GESTURE Notify（敲击唤醒，可选）
        try {
          const gCh = await svc.getCharacteristic(GESTURE_UUID);
          gCh.addEventListener('characteristicvaluechanged', (e) => {
            const g = this._dec.decode(e.target.value).trim();
            this._gestureCbs.forEach((cb) => cb(g));
            global.dispatchEvent(new CustomEvent('ring:gesture', { detail: { gesture: g } }));
          });
          await gCh.startNotifications();
        } catch (_) { /* 无 GESTURE，跳过 */ }

        // 指令下行（震动）
        try { this._cmdCh = await svc.getCharacteristic(CMD_UUID); }
        catch (_) { this._cmdCh = null; }

        // 与 mock 一致的状态流：采基线 → 监测
        this._setStatus('baseline');
        setTimeout(() => this._setStatus('monitoring'), 5000);
      } catch (e) {
        this._setStatus('disconnected');
        throw e;
      }
    }

    disconnect() {
      try {
        if (this._device && this._device.gatt.connected) this._device.gatt.disconnect();
      } catch (_) {}
      this._setStatus('disconnected');
    }

    // 三档干预触觉（见 docs/接口契约.md §1）
    //   intercept → 档三·早期拦截（单次轻促短震）
    //   anchor    → 档二·实时锚点（共振呼吸 吸4·呼6，渐强渐弱 x3）
    //   retreat   → 档一·撤退许可（两下长震）
    async vibrate(mode = 'anchor') {
      if (!this._cmdCh) { console.warn('[BleRing] 无 CMD 通道，无法震动'); return; }
      const CMD = {
        intercept: 'VIBRATE:INTERCEPT',
        anchor:    'VIBRATE:ANCHOR',
        retreat:   'VIBRATE:RETREAT',
      };
      const cmd = CMD[mode] || 'VIBRATE'; // 未知/无参 → 兼容旧固件，等同 ANCHOR
      try {
        await this._cmdCh.writeValue(this._enc.encode(cmd));
        global.dispatchEvent(new CustomEvent('ring:vibrate', { detail: { mode } }));
      } catch (e) {
        console.warn('[BleRing] 震动指令失败', e);
      }
    }

    onData(cb) { if (typeof cb === 'function') this._dataCbs.push(cb); }
    onStatus(cb) { if (typeof cb === 'function') this._statusCbs.push(cb); }
    onGesture(cb) { if (typeof cb === 'function') this._gestureCbs.push(cb); }

    // ---- 内部 ----
    _emit() {
      this._last.ts = Date.now();
      const d = { hr: this._last.hr, hrv: this._last.hrv, gsr: this._last.gsr, motion: this._last.motion, ts: this._last.ts };
      this._dataCbs.forEach((cb) => cb(d));
    }
    _setStatus(s) { this._status = s; this._statusCbs.forEach((cb) => cb(s)); }
    _onDisc() { this._setStatus('disconnected'); }
  }

  global.BleRing = BleRing;
  if (typeof module !== 'undefined' && module.exports) module.exports = { BleRing };
})(typeof window !== 'undefined' ? window : globalThis);
