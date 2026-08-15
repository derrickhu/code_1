/**
 * 小游戏入口。微信与抖音共用这一份，宿主差异全部由 runtime.js 在运行时识别。
 *
 * 加载顺序不能改：runtime（宿主识别）→ pixi-adapter（补齐 canvas/document 等 DOM 垫片）
 * → game-bundle（游戏本体）。适配层没铺好之前 PIXI 起不来。
 */
var _runtime = require('./runtime.js');

// 启动诊断：小游戏真机拿不到控制台，启动失败时只能靠弹窗回捞
var _diagMsgs = [];
var _diagStart = Date.now();

function _diag(msg) {
  _diagMsgs.push('[' + (Date.now() - _diagStart) + 'ms] ' + msg);
}

function _showDiag() {
  try {
    var api = _runtime.getNativePlatformApi();
    if (api && api.showModal) {
      var tail = _diagMsgs.length > 28 ? _diagMsgs.slice(-28) : _diagMsgs.slice();
      api.showModal({ title: '启动失败', content: tail.join('\n'), showCancel: false });
    }
  } catch (_) {}
}

try {
  if (typeof GameGlobal !== 'undefined') {
    GameGlobal.onError = function (msg) {
      _diag('onError:' + msg);
      _showDiag();
    };
    GameGlobal.onUnhandledRejection = function (ev) {
      _diag('unhandledRej:' + ((ev && ev.reason) || ev));
      _showDiag();
    };
  }
} catch (_) {}

_diag('platform=' + _runtime.detectMinigamePlatform());

try {
  require('./pixi-adapter/index');
} catch (e) {
  _diag('pixi-adapter 失败:' + e);
  _showDiag();
}

// 部分小游戏运行时没有 Intl，PIXI 的文本测量链路会摸它
if (typeof Intl === 'undefined') {
  var _g =
    typeof GameGlobal !== 'undefined'
      ? GameGlobal
      : typeof globalThis !== 'undefined'
        ? globalThis
        : {};
  _g.Intl = {};
}

try {
  require('./game-bundle.js');
} catch (e) {
  _diag('game-bundle 失败:' + e);
  _showDiag();
}

setTimeout(function () {
  if (typeof GameGlobal !== 'undefined' && !GameGlobal.__gameRendered) {
    _diag('5 秒超时 - 游戏未渲染');
    _showDiag();
  }
}, 5000);
