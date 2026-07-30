/**
 * audiostore.js — 录音原件本地存储（IndexedDB，纯前端，无需后端）
 * 语音文字稿存 localStorage（经 store.js），音频 Blob 存这里，按 id 关联。
 * 隐私叙事：原始录音只躺在你自己设备里，从不上传服务器。
 *
 * 用法：
 *   await AudioStore.save(id, blob)   // 存一段录音
 *   const blob = await AudioStore.get(id)  // 取回（用于回放）
 *   const url  = await AudioStore.url(id)   // 取回并转成可播放的 objectURL
 *   await AudioStore.remove(id)
 */
(function (global) {
  'use strict';

  const DB_NAME = 'hbn-audio';
  const STORE = 'recordings';
  let _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error('此浏览器不支持 IndexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function tx(mode) {
    return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
  }

  const AudioStore = {
    async save(id, blob) {
      const store = await tx('readwrite');
      return new Promise((resolve, reject) => {
        const r = store.put(blob, id);
        r.onsuccess = () => resolve(id);
        r.onerror = () => reject(r.error);
      });
    },
    async get(id) {
      const store = await tx('readonly');
      return new Promise((resolve, reject) => {
        const r = store.get(id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    },
    async url(id) {
      const blob = await AudioStore.get(id);
      return blob ? URL.createObjectURL(blob) : null;
    },
    async remove(id) {
      const store = await tx('readwrite');
      return new Promise((resolve, reject) => {
        const r = store.delete(id);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      });
    },
  };

  global.AudioStore = AudioStore;
  if (typeof module !== 'undefined' && module.exports) module.exports = { AudioStore };
})(typeof window !== 'undefined' ? window : globalThis);
