/**
 * imagestore.js — 心灵画像图片本地存储（IndexedDB，纯前端）
 * gpt-image-2 返回的图是 ~1-2MB 的 base64 dataURL，塞 localStorage 会 QuotaExceeded；
 * 所以图存这里，localStorage（经 store.js）只存画像元数据 + imgKey 引用。
 *
 * 用法：
 *   await ImageStore.save(key, dataUrl)   // 存一张画像
 *   const dataUrl = await ImageStore.get(key)
 *   await ImageStore.remove(key)
 */
(function (global) {
  'use strict';

  const DB_NAME = 'hbn-images';
  const STORE = 'portraits';
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

  const ImageStore = {
    async save(key, dataUrl) {
      const store = await tx('readwrite');
      return new Promise((resolve, reject) => {
        const r = store.put(dataUrl, key);
        r.onsuccess = () => resolve(key);
        r.onerror = () => reject(r.error);
      });
    },
    async get(key) {
      const store = await tx('readonly');
      return new Promise((resolve, reject) => {
        const r = store.get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    },
    async remove(key) {
      const store = await tx('readwrite');
      return new Promise((resolve, reject) => {
        const r = store.delete(key);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      });
    },
  };

  global.ImageStore = ImageStore;
  if (typeof module !== 'undefined' && module.exports) module.exports = { ImageStore };
})(typeof window !== 'undefined' ? window : globalThis);
