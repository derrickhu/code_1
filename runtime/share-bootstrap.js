/**
 * 转发尽早注册（须在 game-bundle 之前）。
 * 真机体验版若等 bundle 里再 onShareAppMessage，右上角有时点了没卡片。
 * bundle 起来后 ShareService.configureShareMenu 会换上同一句文案，并记经分。
 */
(function () {
  var runtime = require('./runtime.js');
  var api = runtime.getNativePlatformApi();
  if (!api) return;

  var g = typeof GameGlobal !== 'undefined' ? GameGlobal : {};
  g.__sharePayloadFn = g.__sharePayloadFn || null;

  var DEFAULT_TITLE = '外星人打到村口了，来守这一口';
  var DEFAULT_TIMELINE_TITLE = '村口大战外星人';
  var DEFAULT_IMAGE = 'images/share/share_default.jpg';
  var DEFAULT_QUERY = 'from=share&source=menu';
  var platform = runtime.detectMinigamePlatform();

  function resolvePayload(source, mode) {
    if (typeof g.__sharePayloadFn === 'function') {
      try {
        return g.__sharePayloadFn(source, mode);
      } catch (e) {
        console.warn('[Share] payload fn failed', e);
      }
    }
    return {
      title: mode === 'timeline' ? DEFAULT_TIMELINE_TITLE : DEFAULT_TITLE,
      imageUrl: DEFAULT_IMAGE,
      query: DEFAULT_QUERY,
    };
  }

  try {
    api.showShareMenu({
      withShareTicket: true,
      menus: platform === 'wechat'
        ? ['shareAppMessage', 'shareTimeline']
        : ['shareAppMessage'],
    });
  } catch (_) {}

  if (typeof api.onShareAppMessage === 'function') {
    api.onShareAppMessage(function () {
      return resolvePayload('menu', 'friend');
    });
  }

  if (platform === 'wechat' && typeof api.onShareTimeline === 'function') {
    api.onShareTimeline(function () {
      return resolvePayload('menu', 'timeline');
    });
  }
})();
