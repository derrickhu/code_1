/**
 * 平台抽象层 - 统一微信/抖音小游戏 API
 * 宿主识别与 src/core/PlatformService 一致：检测到哪个平台就用哪个原生 API
 */

const { detectMinigamePlatform, getNativePlatformApi } = require('../runtime.js');
const _platformName = detectMinigamePlatform();
const _api = getNativePlatformApi(_platformName);
const _isDouyin = _platformName === 'douyin';
const _isWechat = _platformName === 'wechat';

if (!_api) {
  console.error('[platform] 未检测到小游戏运行环境（wx/tt）');
}

// 安全调用包装：防止鸿蒙等环境中 API 缺失导致崩溃
function _safeCall(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    console.warn('[platform] API 调用失败:', e);
    return fallback;
  }
}

const noop = function() {};

function _sanitizeRequestOptions(opts) {
  const out = {
    url: String(opts && opts.url || ''),
    method: String(opts && opts.method || 'GET'),
  };
  if (opts && opts.header) {
    out.header = {};
    for (const k in opts.header) out.header[k] = String(opts.header[k]);
  }
  if (opts && opts.data !== undefined) {
    out.data = typeof opts.data === 'string' || opts.data instanceof ArrayBuffer
      ? opts.data
      : JSON.stringify(opts.data);
  }
  if (opts && opts.responseType) out.responseType = String(opts.responseType);
  if (opts && opts.dataType) out.dataType = String(opts.dataType);
  if (opts && opts.timeout) out.timeout = Number(opts.timeout);
  if (opts && typeof opts.success === 'function') out.success = opts.success;
  if (opts && typeof opts.fail === 'function') {
    out.fail = function(err) {
      const msg = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : String(err);
      opts.fail({ errMsg: msg });
    };
  }
  if (opts && typeof opts.complete === 'function') out.complete = opts.complete;
  return out;
}

const platform = {
  createCanvas: () => _api ? _api.createCanvas() : { width: 0, height: 0, getContext: function() { return null; } },
  createImage: () => _api ? _api.createImage() : { src: '', onload: null, onerror: null },

  getSystemInfoSync: () => _api ? _safeCall(() => _api.getSystemInfoSync(), { platform: 'unknown', screenWidth: 375, screenHeight: 667 }) : { platform: 'unknown', screenWidth: 375, screenHeight: 667 },

  getStorageSync: (key) => _api ? _safeCall(() => _api.getStorageSync(key), '') : '',
  setStorageSync: (key, data) => _api ? _safeCall(() => _api.setStorageSync(key, data)) : undefined,
  removeStorageSync: (key) => _api ? _safeCall(() => _api.removeStorageSync(key)) : undefined,

  request: (opts) => {
    if (!_api) return null;
    return _api.request(_sanitizeRequestOptions(opts || {}));
  },
  downloadFile: (opts) => {
    if (!_api || !_api.downloadFile) return null;
    const clean = {
      url: String(opts && opts.url || ''),
    };
    if (opts && typeof opts.success === 'function') clean.success = opts.success;
    if (opts && typeof opts.fail === 'function') {
      clean.fail = function(err) {
        const msg = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : String(err);
        opts.fail({ errMsg: msg });
      };
    }
    if (opts && typeof opts.complete === 'function') clean.complete = opts.complete;
    if (opts && opts.timeout) clean.timeout = Number(opts.timeout);
    return _api.downloadFile(clean);
  },
  getFileSystemManager: () => _api && _api.getFileSystemManager ? _api.getFileSystemManager() : null,
  connectSocket: (opts) => _api ? _api.connectSocket(opts) : null,

  onTouchStart: (cb) => _api && _api.onTouchStart ? _api.onTouchStart(cb) : noop,
  onTouchMove: (cb) => _api && _api.onTouchMove ? _api.onTouchMove(cb) : noop,
  onTouchEnd: (cb) => _api && _api.onTouchEnd ? _api.onTouchEnd(cb) : noop,
  onTouchCancel: (cb) => _api && _api.onTouchCancel ? _api.onTouchCancel(cb) : noop,
  offTouchStart: (cb) => _api && _api.offTouchStart ? _api.offTouchStart(cb) : noop,
  offTouchMove: (cb) => _api && _api.offTouchMove ? _api.offTouchMove(cb) : noop,
  offTouchEnd: (cb) => _api && _api.offTouchEnd ? _api.offTouchEnd(cb) : noop,
  offTouchCancel: (cb) => _api && _api.offTouchCancel ? _api.offTouchCancel(cb) : noop,

  createInnerAudioContext: () => _api && _api.createInnerAudioContext ? _api.createInnerAudioContext() : null,

  name: _platformName,
  api: _api,
};

module.exports = platform;
