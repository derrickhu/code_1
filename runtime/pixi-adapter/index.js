/**
 * pixi-adapter 统一入口
 * 根据运行环境（真机/模拟器）将 DOM 模拟对象挂载到全局
 *
 * 关键：真机环境中 IIFE bundle 的自由变量（document、window 等）
 * 必须在 JS 引擎的全局作用域中可达，仅挂到 GameGlobal 不够——
 * GameGlobal 只是跨文件共享对象，不是全局作用域。
 * 因此真机需要挂到 globalThis / global 上。
 */

var platform, noop, Image, canvas, location, document, navigator, localStorage, XMLHttpRequest, registerTouchEvents;
var Element, HTMLCanvasElement, HTMLImageElement, HTMLVideoElement;

try { platform = require('./platform'); } catch(e) { console.error('[pixi-adapter] ✗ platform:', e); }
try { noop = require('./util').noop; } catch(e) { console.error('[pixi-adapter] ✗ util:', e); noop = function(){}; }
try { Image = require('./Image'); } catch(e) { console.error('[pixi-adapter] ✗ Image:', e); }
try { canvas = require('./canvas').canvas; } catch(e) { console.error('[pixi-adapter] ✗ canvas:', e); }
try { location = require('./location'); } catch(e) { console.error('[pixi-adapter] ✗ location:', e); location = {}; }
try { document = require('./document'); } catch(e) { console.error('[pixi-adapter] ✗ document:', e); }
try { navigator = require('./navigator'); } catch(e) { console.error('[pixi-adapter] ✗ navigator:', e); navigator = {}; }
try { localStorage = require('./localStorage'); } catch(e) { console.error('[pixi-adapter] ✗ localStorage:', e); localStorage = {}; }
try { XMLHttpRequest = require('./XMLHttpRequest'); } catch(e) { console.error('[pixi-adapter] ✗ XMLHttpRequest:', e); }
try {
  var _touchMod = require('./TouchEvent');
  registerTouchEvents = _touchMod.registerTouchEvents;
  var AdapterTouchEvent = _touchMod.TouchEvent;
} catch(e) { console.error('[pixi-adapter] ✗ TouchEvent:', e); registerTouchEvents = function(){}; AdapterTouchEvent = function(){}; }
try {
  var _elem = require('./element');
  Element = _elem.Element;
  HTMLCanvasElement = _elem.HTMLCanvasElement;
  HTMLImageElement = _elem.HTMLImageElement;
  HTMLVideoElement = _elem.HTMLVideoElement;
} catch(e) {
  console.error('[pixi-adapter] ✗ element:', e);
  Element = function() {};
  HTMLCanvasElement = Element;
  HTMLImageElement = Element;
  HTMLVideoElement = Element;
}

// ======== 获取真正的 JS 全局对象 ========
// 优先 globalThis（ES2020+），其次 global（Node/V8），最后 GameGlobal
const _realGlobal = (typeof globalThis !== 'undefined' && globalThis)
  || (typeof global !== 'undefined' && global)
  || GameGlobal;

function _forceInstallGlobal(name, value, targets) {
  for (var i = 0; i < targets.length; i++) {
    var target = targets[i];
    if (!target) continue;
    try {
      _origDefineProperty.call(Object, target, name, { value: value, configurable: true, writable: true });
    } catch (e) {
      try { target[name] = value; } catch (_) {}
    }
  }
}

// ======== Patch Object.defineProperty ========
const _origDefineProperty = Object.defineProperty;
Object.defineProperty = function safeDefineProperty(obj, prop, descriptor) {
  try {
    return _origDefineProperty.call(Object, obj, prop, descriptor);
  } catch (e) {
    if (e instanceof TypeError) return obj;
    throw e;
  }
};

const _origDefineProperties = Object.defineProperties;
Object.defineProperties = function safeDefineProperties(obj, props) {
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      try {
        _origDefineProperty.call(Object, obj, key, props[key]);
      } catch (e) {
        if (!(e instanceof TypeError)) throw e;
      }
    }
  }
  return obj;
};

// ======== 获取系统信息 ========
const sysInfo = platform.getSystemInfoSync();
const isDevtools = sysInfo.platform === 'devtools';

// ======== 定时器 & 动画帧 polyfill ========
// 真机 IIFE bundle 可能无法以自由变量访问这些 API，
// 在 adapter 模块作用域中它们可用，挂到真正的全局对象。
;(function _patchTimers() {
  var pairs = {};
  if (typeof setTimeout !== 'undefined')              pairs.setTimeout = setTimeout;
  if (typeof clearTimeout !== 'undefined')             pairs.clearTimeout = clearTimeout;
  if (typeof setInterval !== 'undefined')              pairs.setInterval = setInterval;
  if (typeof clearInterval !== 'undefined')            pairs.clearInterval = clearInterval;
  if (typeof requestAnimationFrame !== 'undefined')    pairs.requestAnimationFrame = requestAnimationFrame;
  if (typeof cancelAnimationFrame !== 'undefined')     pairs.cancelAnimationFrame = cancelAnimationFrame;
  for (var k in pairs) {
    if (typeof _realGlobal[k] === 'undefined') _realGlobal[k] = pairs[k];
    if (typeof GameGlobal[k] === 'undefined')  GameGlobal[k] = pairs[k];
  }
})();

// ======== 禁用 OffscreenCanvas ========
if (typeof GameGlobal !== 'undefined') {
  GameGlobal.OffscreenCanvas = undefined;
  _realGlobal.OffscreenCanvas = undefined;
}

// ======== WebGL / Canvas2D 上下文构造函数 ========
// 对齐 game2D_huahua：用临时 canvas 探测 + patch（勿碰主 canvas）
let _WebGLRenderingContext = {};
try {
  const _tmpCanvas = platform.createCanvas();
  if (_tmpCanvas && typeof _tmpCanvas.getContext === 'function') {
    var _tmpGl = _tmpCanvas.getContext('webgl', {
      stencil: true,
      antialias: true,
      alpha: true,
      depth: true,
      preserveDrawingBuffer: true,
    });
    if (_tmpGl) {
      _WebGLRenderingContext = _tmpGl.constructor || {};

      try {
        var _origGetCtxAttr = _tmpGl.getContextAttributes;
        if (_origGetCtxAttr) {
          var _patchProto = Object.getPrototypeOf(_tmpGl);
          if (_patchProto) {
            _patchProto.getContextAttributes = function() {
              var attr = _origGetCtxAttr.call(this);
              if (attr) {
                attr.stencil = !!attr.stencil;
                attr.antialias = !!attr.antialias;
                attr.alpha = !!attr.alpha;
                attr.depth = !!attr.depth;
                attr.preserveDrawingBuffer = !!attr.preserveDrawingBuffer;
              }
              return attr;
            };
          }
        }
      } catch (e3) {
        console.warn('[pixi-adapter] patch getContextAttributes 失败:', e3);
      }

      try {
        var _vaoExt = _tmpGl.getExtension('OES_vertex_array_object');
        if (_vaoExt && typeof _vaoExt.createVertexArrayOES !== 'function') {
          var _origGetExt = _tmpGl.__proto__.getExtension;
          _tmpGl.__proto__.getExtension = function(name) {
            if (name === 'OES_vertex_array_object') return null;
            return _origGetExt.call(this, name);
          };
          console.warn('[pixi-adapter] OES_vertex_array_object 为假扩展，已禁用');
        }
      } catch (e4) { /* 忽略 */ }
    } else {
      console.warn('[pixi-adapter] WebGL context 获取失败（getContext 返回 null）');
    }
  }
} catch (e) {
  console.warn('[pixi-adapter] WebGL 初始化异常:', e);
}

let _CanvasRenderingContext2D = {};
try {
  const _tmpCanvas2 = platform.createCanvas();
  if (_tmpCanvas2 && typeof _tmpCanvas2.getContext === 'function') {
    const _tmpCtx = _tmpCanvas2.getContext('2d');
    if (_tmpCtx) {
      _CanvasRenderingContext2D = _tmpCtx.constructor || {};
    } else {
      console.warn('[pixi-adapter] Canvas2D context 获取失败');
    }
  }
} catch (e) {
  console.warn('[pixi-adapter] Canvas2D 初始化异常:', e);
}

// ======== DOMParser ========
class DOMParser {
  parseFromString() {
    return { documentElement: new Element() };
  }
}

// ======== performance ========
const _performance = typeof performance !== 'undefined' ? performance : {
  now: Date.now.bind(Date),
};

// ======== window 事件系统 ========
const _windowListeners = {};
function _windowAddEventListener(type, handler, options) {
  if (!_windowListeners[type]) _windowListeners[type] = [];
  _windowListeners[type].push(handler);
}
function _windowRemoveEventListener(type, handler) {
  if (!_windowListeners[type]) return;
  const idx = _windowListeners[type].indexOf(handler);
  if (idx !== -1) _windowListeners[type].splice(idx, 1);
}
function _windowDispatchEvent(type, event) {
  const queue = _windowListeners[type];
  if (queue) {
    const copy = queue.slice();
    copy.forEach(handler => {
      try { handler(event); } catch (e) { console.error('[window event]', type, e); }
    });
  }
}
GameGlobal.__windowDispatchEvent = _windowDispatchEvent;

// ======== 事件构造函数 ========
function _PointerEvent(type, opts) { this.type = type; Object.assign(this, opts || {}); }
function _TouchEventCtor(type, opts) { this.type = type; Object.assign(this, opts || {}); }
function _MouseEvent(type, opts) { this.type = type; Object.assign(this, opts || {}); }

// ======== URL / Blob ========
const _URL = {
  createObjectURL: function() { return ''; },
  revokeObjectURL: function() {},
};
function _Blob() {}

// ======== 所有需要挂载的全局属性 ========
const _allGlobals = {
  window: null,          // 下面特殊处理
  document: document,
  navigator: navigator,
  location: location,
  Image: Image,
  Element: Element,
  HTMLCanvasElement: HTMLCanvasElement,
  HTMLImageElement: HTMLImageElement,
  HTMLVideoElement: HTMLVideoElement,
  WebGLRenderingContext: _WebGLRenderingContext,
  CanvasRenderingContext2D: _CanvasRenderingContext2D,
  XMLHttpRequest: XMLHttpRequest,
  DOMParser: DOMParser,
  localStorage: localStorage,
  performance: _performance,
  canvas: canvas,
  ontouchstart: noop,
  addEventListener: _windowAddEventListener,
  removeEventListener: _windowRemoveEventListener,
  self: null,            // 下面特殊处理
  // 对齐 game2D_huahua：真机也 stub PointerEvent，让 Pixi 走 pointerdown(canvas)+pointerup(window)
  PointerEvent: _PointerEvent,
  TouchEvent: AdapterTouchEvent,
  MouseEvent: _MouseEvent,
  URL: _URL,
  Blob: _Blob,
};

if (isDevtools) {
  // ======== 模拟器环境 ========
  // window 已存在（浏览器环境），用 defineProperty 补充/覆盖
  const _win = typeof window !== 'undefined' ? window : GameGlobal;
  const _forceDevtoolsOverwrite = ['XMLHttpRequest'];
  _forceInstallGlobal('XMLHttpRequest', XMLHttpRequest, [_win, _realGlobal, typeof GameGlobal !== 'undefined' ? GameGlobal : null]);

  for (const key in _allGlobals) {
    if (key === 'window' || key === 'self') continue;
    try {
      const desc = Object.getOwnPropertyDescriptor(_win, key);
      const force = _forceDevtoolsOverwrite.indexOf(key) !== -1;
      if (force || !desc || desc.configurable) {
        _origDefineProperty.call(Object, _win, key, { value: _allGlobals[key], configurable: true, writable: true });
      }
    } catch (e) {
      try {
        if (_forceDevtoolsOverwrite.indexOf(key) !== -1) _win[key] = _allGlobals[key];
      } catch (_) { /* 只读属性忽略 */ }
    }
    try {
      if (_forceDevtoolsOverwrite.indexOf(key) !== -1) GameGlobal[key] = _allGlobals[key];
    } catch (_) {}
  }
  _forceInstallGlobal('XMLHttpRequest', XMLHttpRequest, [_win, _realGlobal, typeof GameGlobal !== 'undefined' ? GameGlobal : null]);

  // 关键修复：包装 window.addEventListener / removeEventListener
  // PixiJS EventSystem 在 globalThis(window) 上注册 pointermove / pointerup，
  // 但 adapter 通过 _windowListeners 分发触摸事件——两个系统完全隔离。
  // 包装后 handler 会同时进入 _windowListeners，adapter 的 dispatchToWindow 就能触达 PixiJS。
  try {
    var _nativeWinAdd = _win.addEventListener.bind(_win);
    var _nativeWinRemove = _win.removeEventListener.bind(_win);
    var _adapterOnlyEvents = {
      pointerdown: true,
      pointermove: true,
      pointerup: true,
      pointercancel: true,
      pointerover: true,
      pointerout: true,
      pointerleave: true,
      touchstart: true,
      touchmove: true,
      touchend: true,
      touchcancel: true,
      wheel: true,
    };
    var _wrappedAdd = function(type, handler, options) {
      _windowAddEventListener(type, handler, options);
      if (_adapterOnlyEvents[type]) {
        return undefined;
      }
      return _nativeWinAdd(type, handler, options);
    };
    var _wrappedRemove = function(type, handler, options) {
      _windowRemoveEventListener(type, handler);
      if (_adapterOnlyEvents[type]) {
        return undefined;
      }
      return _nativeWinRemove(type, handler, options);
    };
    // 微信新版基础库 addEventListener 可能为只读，用 defineProperty 强制覆盖
    _origDefineProperty.call(Object, _win, 'addEventListener', {
      value: _wrappedAdd, configurable: true, writable: true
    });
    _origDefineProperty.call(Object, _win, 'removeEventListener', {
      value: _wrappedRemove, configurable: true, writable: true
    });
  } catch (e) {
    console.warn('[pixi-adapter] 包装 window.addEventListener 失败:', e);
  }

  // document 属性补充
  try {
    for (const key in document) {
      const desc = Object.getOwnPropertyDescriptor(_win.document, key);
      if (!desc || desc.configurable) {
        _origDefineProperty.call(Object, _win.document, key, { value: document[key], configurable: true });
      }
    }
  } catch (e) { /* 忽略 */ }

} else {
  // ======== 真机环境 ========
  // 关键：必须同时挂载到 _realGlobal（JS 引擎全局对象）和 GameGlobal（跨文件共享）
  // 这样 IIFE bundle 中的自由变量 document、window 等才能正确解析

  // window = 全局对象自身（模拟浏览器行为）
  try { _realGlobal.window = _realGlobal; } catch (e) { /* 只读忽略 */ }
  try { GameGlobal.window = _realGlobal; } catch (e) { /* 只读忽略 */ }

  // self = 全局对象自身
  try { _realGlobal.self = _realGlobal; } catch (e) { /* 只读忽略 */ }
  try { GameGlobal.self = _realGlobal; } catch (e) { /* 只读忽略 */ }

  // addEventListener/removeEventListener 必须强制覆盖：
  // 微信框架可能内置了无效版本，PixiJS EventSystem 在 self 上注册
  // pointermove/pointerup 依赖这些函数正确工作
  var _forceOverwrite = ['addEventListener', 'removeEventListener'];

  for (const key in _allGlobals) {
    if (key === 'window' || key === 'self') continue;
    var val = _allGlobals[key];
    var force = _forceOverwrite.indexOf(key) !== -1;
    // 挂到真正的全局作用域
    if (force || typeof _realGlobal[key] === 'undefined') {
      try {
        _origDefineProperty.call(Object, _realGlobal, key, { value: val, configurable: true, writable: true });
      } catch (e) {
        try { _realGlobal[key] = val; } catch (e2) { /* 忽略 */ }
      }
    }
    // 同时挂到 GameGlobal
    if (force || typeof GameGlobal[key] === 'undefined') {
      try {
        _origDefineProperty.call(Object, GameGlobal, key, { value: val, configurable: true, writable: true });
      } catch (e) {
        try { GameGlobal[key] = val; } catch (e2) { /* 忽略 */ }
      }
    }
  }
  _forceInstallGlobal('XMLHttpRequest', XMLHttpRequest, [_realGlobal, typeof GameGlobal !== 'undefined' ? GameGlobal : null]);
}

// ======== 全局 canvas（对齐 game2D_huahua）========
try {
  GameGlobal.canvas = canvas;
} catch (e) {
  console.warn('[pixi-adapter] GameGlobal.canvas 设置失败:', e);
}
try {
  _realGlobal.canvas = canvas;
} catch (e) { /* 只读属性忽略 */ }

// ======== navigator.userAgent ========
try {
  if (_realGlobal.window && _realGlobal.window.navigator) {
    _realGlobal.window.navigator.userAgent = navigator.userAgent;
  }
} catch (e) { /* 只读属性忽略 */ }

// ======== 注册触摸事件 ========
registerTouchEvents();
