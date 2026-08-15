/**
 * 小游戏宿主识别与原生 API 绑定（单一真源，对齐 src/core/PlatformService.ts）
 *
 * - 抖音宿主：注入 tt → 业务只走 tt（同时存在的 wx 仅为宿主兼容层，不可用）
 * - 微信宿主：注入 wx → 业务只走 wx
 */

function detectMinigamePlatform() {
  if (typeof tt !== 'undefined') return 'douyin';
  if (typeof wx !== 'undefined') return 'wechat';
  return 'unknown';
}

function getNativePlatformApi(platform) {
  var p = platform || detectMinigamePlatform();
  if (p === 'douyin') return typeof tt !== 'undefined' ? tt : null;
  if (p === 'wechat') return typeof wx !== 'undefined' ? wx : null;
  return null;
}

function canUsePrivacyApi(api, name) {
  if (!api) return false;
  if (typeof api.canIUse === 'function') {
    try { return !!api.canIUse(name); } catch (_) { /* ignore */ }
  }
  return typeof api[name] === 'function';
}

/** 原生 API 未注册时（devtools / 后台未配隐私政策）的 JS 层兜底，避免兼容层 stub 直接抛 unregistered */
function makePrivacyFallback(name) {
  return function (opts) {
    opts = opts || {};
    var res = {
      needAuthorization: false,
      privacyContractName: '',
      errMsg: name + ':ok (fallback)',
    };
    if (typeof opts.success === 'function') opts.success(res);
    if (typeof opts.complete === 'function') opts.complete(res);
  };
}

/**
 * 抖音隐私 API 启动兜底（业界常见组合）：
 * 1. 后台配置「小游戏隐私政策」→ 原生 API 才会注册（根治 INTERNAL_APPLY_NATIVE_ERROR）
 * 2. game.json usePrivacyCheck: true → 启用合规链路
 * 3. 不主动 register onNeedPrivacyAuthorization → 走抖音官方自动弹窗（Canvas 游戏常用）
 * 4. wx 兼容层 stub 代理到 tt；tt 也不可用时 JS 层 noop（仅消 devtools 噪音，不治 native）
 */
function initDouyinPrivacyBootstrap() {
  if (detectMinigamePlatform() !== 'douyin' || typeof tt === 'undefined') return;

  var privacyNames = [
    'getPrivacySetting',
    'requirePrivacyAuthorize',
    'openPrivacyContract',
    'onNeedPrivacyAuthorization',
  ];

  var ttReady = canUsePrivacyApi(tt, 'getPrivacySetting');
  if (!ttReady) {
    console.warn(
      '[Privacy] tt.getPrivacySetting 未注册。业界常规处理：'
      + '①抖音开放平台→设置→基础设置→小游戏隐私政策 填写并发布；'
      + '②开发者工具升级到 4.2.3+、真机扫码验证（工具内常报 unregistered）；'
      + '③调用前用 tt.canIUse("getPrivacySetting") 判断。',
    );
  }

  if (typeof wx === 'undefined') return;

  privacyNames.forEach(function (name) {
    if (name === 'onNeedPrivacyAuthorization') {
      if (typeof tt[name] === 'function') {
        wx[name] = function (cb) { return tt[name](cb); };
      }
      return;
    }
    if (canUsePrivacyApi(tt, name)) {
      wx[name] = function (opts) { return tt[name](opts); };
      return;
    }
    wx[name] = makePrivacyFallback(name);
  });
}

initDouyinPrivacyBootstrap();

module.exports = {
  detectMinigamePlatform: detectMinigamePlatform,
  getNativePlatformApi: getNativePlatformApi,
  /** @deprecated 使用 getNativePlatformApi */
  resolveMinigameApi: function () { return getNativePlatformApi(); },
  /** @deprecated 使用 detectMinigamePlatform */
  resolveMinigameName: detectMinigamePlatform,
};
