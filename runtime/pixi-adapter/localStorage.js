/**
 * localStorage 模拟，基于平台 Storage API
 */

const platform = require('./platform');

const localStorage = {
  getItem(key) {
    try {
      return platform.getStorageSync(key) || null;
    } catch (e) {
      return null;
    }
  },
  setItem(key, value) {
    try {
      platform.setStorageSync(key, value);
    } catch (e) {
      console.warn('[localStorage] setItem failed:', key, e);
    }
  },
  removeItem(key) {
    try {
      platform.removeStorageSync(key);
    } catch (e) {
      console.warn('[localStorage] removeItem failed:', key, e);
    }
  },
  clear() {
    console.warn('[localStorage] clear() not implemented in minigame');
  },
  get length() {
    return 0;
  },
  key() {
    return null;
  },
};

module.exports = localStorage;
