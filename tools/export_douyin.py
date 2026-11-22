#!/usr/bin/env python3
"""将团结引擎导出的小游戏 WASM 产物打包为独立的抖音小游戏工程（douyin-minigame/）。

输入：
  wechat-minigame/minigame/   （WASM 代码分包 wasmcode/*.wasm.br、webgl.wasm.framework.unityweb.js、adapter、unity-sdk、封面图）
  wechat-minigame/webgl/      （校验 {md5}.webgl.data.unityweb.bin.txt 首包资源文件）

输出：
  douyin-minigame/            （可直接用「抖音开发者工具」导入预览、真机调试与提审上传的完整目录）

特点：
  1. 彻底移除微信专属插件（wxe5a48f1ed5f544b7 / requirePlugin('UnityPlugin')），使用纯 JS + TTWebAssembly 原生加载器。
  2. 顶层优先注入 tt-shim.js，将真实 tt 保存在 GameGlobal.__tt（供 MiniGameHost.jslib 精准识别抖音宿主），并把 wx API 安全桥接到 tt。
  3. 首包 .data 与 StreamingAssets 图包/音乐继续复用同一套 CloudBase CDN，并在 tt.env.USER_DATA_PATH/__GAME_FILE_CACHE 落盘缓存。
"""
import json
import os
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WX_MINI = ROOT / "wechat-minigame" / "minigame"
WX_WEBGL = ROOT / "wechat-minigame" / "webgl"
DY_OUT = ROOT / "douyin-minigame"

DOUYIN_APPID = "tt5b402dfdc53db6ff07"
DEFAULT_CDN = "https://726f-rosa-env-d7grf78r5dbd37323-1414200063.tcb.qcloud.la/cunkou"


def parse_wx_game_js(game_js_path: pathlib.Path) -> dict:
    txt = game_js_path.read_text(encoding="utf-8")

    def pick(key: str, default: str = "") -> str:
        m = re.search(rf"{key}\s*:\s*['\"]([^'\"]*)['\"]", txt)
        return m.group(1) if m else default

    ctx_m = re.search(r"contextType\s*:\s*(\d+)", txt)
    return {
        "DATA_FILE_MD5": pick("DATA_FILE_MD5"),
        "CODE_FILE_MD5": pick("CODE_FILE_MD5"),
        "GAME_NAME": pick("GAME_NAME", "webgl"),
        "DATA_FILE_SIZE": pick("DATA_FILE_SIZE", "0"),
        "DATA_CDN": pick("DATA_CDN", DEFAULT_CDN),
        "CONTEXT_TYPE": int(ctx_m.group(1)) if ctx_m else 1,
    }


TT_SHIM_JS = """// @ts-nocheck
/* 抖音小游戏宿主适配层（必须在 weapp-adapter 之前首个加载） */
const rootScope = typeof GameGlobal !== 'undefined'
  ? GameGlobal
  : (typeof window !== 'undefined' ? window : Function('return this')());
const realTt = typeof tt !== 'undefined' ? tt : (rootScope && rootScope.__tt ? rootScope.__tt : null);
if (typeof GameGlobal === 'undefined') {
  rootScope.GameGlobal = rootScope;
}
GameGlobal.__tt = realTt;

const browserWasm = typeof WebAssembly !== 'undefined' ? WebAssembly : undefined;
const nativeWasm = typeof TTWebAssembly !== 'undefined' ? TTWebAssembly : browserWasm;
GameGlobal.__DouyinBrowserWebAssembly = browserWasm;
GameGlobal.WXWebAssembly = nativeWasm;
// 开发者工具里 TTWebAssembly 在 wasm 调 JS 时会报 JS Function calls failed。
// 浏览器自带的 WebAssembly 留着，供模拟器解压后编译。真机没有它时才用 TTWebAssembly。
if (!browserWasm && nativeWasm) GameGlobal.WebAssembly = nativeWasm;

function safeSysInfo() {
  if (!realTt || typeof realTt.getSystemInfoSync !== 'function') {
    return {
      brand: 'douyin',
      model: 'Phone',
      pixelRatio: 2,
      screenWidth: 375,
      screenHeight: 812,
      windowWidth: 375,
      windowHeight: 812,
      statusBarHeight: 44,
      system: 'iOS 16.0',
      platform: 'devtools',
      SDKVersion: '3.7.0',
      version: '30.0.0',
      benchmarkLevel: 30,
      safeArea: { left: 0, right: 375, top: 44, bottom: 778, width: 375, height: 734 },
    };
  }
  try {
    const info = realTt.getSystemInfoSync() || {};
    const sw = info.screenWidth || info.windowWidth || 375;
    const sh = info.screenHeight || info.windowHeight || 812;
    if (!info.safeArea) {
      const top = info.statusBarHeight || 0;
      info.safeArea = { left: 0, right: sw, top, bottom: sh, width: sw, height: sh - top };
    }
    if (!info.SDKVersion) info.SDKVersion = '3.7.0';
    if (!info.version) info.version = '30.0.0';
    return info;
  } catch (e) {
    return {
      brand: 'douyin',
      model: 'Phone',
      pixelRatio: 2,
      screenWidth: 375,
      screenHeight: 812,
      windowWidth: 375,
      windowHeight: 812,
      statusBarHeight: 0,
      system: 'Unknown',
      platform: 'devtools',
      SDKVersion: '3.7.0',
      version: '30.0.0',
      safeArea: { left: 0, right: 375, top: 0, bottom: 812, width: 375, height: 812 },
    };
  }
}

function audioParam(initial) {
  return {
    value: initial,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  };
}

function createSilentAudioContext() {
  const destination = { connect() {}, disconnect() {}, channelCount: 2 };
  const makeNode = () => {
    const node = {
      connect() { return node; },
      disconnect() {},
      channelCount: 2,
    };
    return node;
  };
  const started = Date.now();
  const ctx = {
    sampleRate: 44100,
    state: 'running',
    destination,
    listener: {
      positionX: audioParam(0),
      positionY: audioParam(0),
      positionZ: audioParam(0),
      forwardX: audioParam(0),
      forwardY: audioParam(0),
      forwardZ: audioParam(-1),
      upX: audioParam(0),
      upY: audioParam(1),
      upZ: audioParam(0),
      setPosition() {},
      setOrientation() {},
    },
    createGain() {
      const node = makeNode();
      node.gain = audioParam(1);
      return node;
    },
    createBufferSource() {
      const node = makeNode();
      node.buffer = null;
      node.loop = false;
      node.playbackRate = audioParam(1);
      node.onended = null;
      node.start = function () {};
      node.stop = function () {};
      return node;
    },
    createBuffer(channels, length, sampleRate) {
      const ch = Math.max(1, channels | 0);
      const len = Math.max(1, length | 0);
      const rate = sampleRate || 44100;
      const data = [];
      for (let i = 0; i < ch; i++) data.push(new Float32Array(len));
      return {
        length: len,
        duration: len / rate,
        numberOfChannels: ch,
        sampleRate: rate,
        getChannelData(i) { return data[i] || data[0]; },
        copyToChannel() {},
        copyFromChannel() {},
      };
    },
    decodeAudioData(_data, success) {
      const buffer = ctx.createBuffer(2, 1, 44100);
      const done = Promise.resolve(buffer);
      if (typeof success === 'function') done.then(success);
      return done;
    },
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    suspend() { ctx.state = 'suspended'; return Promise.resolve(); },
    close() { ctx.state = 'closed'; return Promise.resolve(); },
  };
  Object.defineProperty(ctx, 'currentTime', {
    get() { return (Date.now() - started) / 1000; },
  });
  return ctx;
}

const noopLog = {
  info(...args) { console.info(...args); },
  log(...args) { console.log(...args); },
  warn(...args) { console.warn(...args); },
  error(...args) { console.error(...args); },
  debug(...args) { console.debug(...args); },
  setFilterMsg() {},
  addFilterMsg() {},
};

const fallbacks = {
  env: {
    USER_DATA_PATH: (realTt && realTt.env && realTt.env.USER_DATA_PATH) || 'ttfile://user',
  },
  getSystemInfoSync: safeSysInfo,
  getWindowInfo() {
    if (realTt && typeof realTt.getWindowInfo === 'function') {
      try { return realTt.getWindowInfo(); } catch (e) {}
    }
    return safeSysInfo();
  },
  getDeviceInfo() {
    if (realTt && typeof realTt.getDeviceInfo === 'function') {
      try { return realTt.getDeviceInfo(); } catch (e) {}
    }
    return safeSysInfo();
  },
  getAppBaseInfo() {
    if (realTt && typeof realTt.getAppBaseInfo === 'function') {
      try { return realTt.getAppBaseInfo(); } catch (e) {}
    }
    return safeSysInfo();
  },
  getAccountInfoSync() {
    if (realTt && typeof realTt.getAccountInfoSync === 'function') {
      try {
        const acc = realTt.getAccountInfoSync();
        if (acc && acc.miniProgram) return acc;
        if (acc && acc.microapp) {
          return { miniProgram: { appId: acc.microapp.appId || '__APPID__', envVersion: acc.microapp.envType || 'release' } };
        }
      } catch (e) {}
    }
    return { miniProgram: { appId: '__APPID__', envVersion: 'release' } };
  },
  getRealtimeLogManager() {
    if (realTt && typeof realTt.getRealtimeLogManager === 'function') {
      try {
        const m = realTt.getRealtimeLogManager();
        if (m) return m;
      } catch (e) {}
    }
    return noopLog;
  },
  getLogManager(opt) {
    if (realTt && typeof realTt.getLogManager === 'function') {
      try {
        const m = realTt.getLogManager(opt || { level: 0 });
        if (m) return m;
      } catch (e) {}
    }
    return noopLog;
  },
  onUnhandledRejection(cb) {
    if (realTt && typeof realTt.onUnhandledRejection === 'function') {
      try { realTt.onUnhandledRejection(cb); } catch (e) {}
    }
  },
  onWindowResize(cb) {
    if (realTt && typeof realTt.onWindowResize === 'function') {
      try { realTt.onWindowResize(cb); } catch (e) {}
    }
  },
  onDeviceOrientationChange(cb) {
    if (realTt && typeof realTt.onDeviceOrientationChange === 'function') {
      try { realTt.onDeviceOrientationChange(cb); } catch (e) {}
    }
  },
  createFeedbackButton() {
    if (realTt && typeof realTt.createFeedbackButton === 'function') {
      try { return realTt.createFeedbackButton.apply(realTt, arguments); } catch (e) {}
    }
    return { show() {}, hide() {}, destroy() {}, onTap() {}, offTap() {} };
  },
  createGameClubButton() {
    return { show() {}, hide() {}, destroy() {}, onTap() {}, offTap() {}, style: {} };
  },
  reportUserBehaviorBranchAnalytics() {},
  reportScene() {},
  triggerGC() {
    if (realTt && typeof realTt.triggerGC === 'function') {
      try { realTt.triggerGC(); } catch (e) {}
    }
  },
    onNetworkStatusChange(cb) {
      if (realTt && typeof realTt.onNetworkStatusChange === 'function') {
        try { realTt.onNetworkStatusChange(cb); } catch (e) {}
      }
    },
    getNetworkType(opt) {
      if (realTt && typeof realTt.getNetworkType === 'function') {
        try { return realTt.getNetworkType(opt); } catch (e) {}
      }
      if (opt && typeof opt.success === 'function') opt.success({ networkType: 'wifi' });
    },
    onError(cb) {
      if (realTt && typeof realTt.onError === 'function') {
        try { realTt.onError(cb); } catch (e) {}
      }
    },
    onMemoryWarning(cb) {
      if (realTt && typeof realTt.onMemoryWarning === 'function') {
        try { realTt.onMemoryWarning(cb); } catch (e) {}
      }
    },
    onAudioInterruptionBegin(cb) {
      if (realTt && typeof realTt.onAudioInterruptionBegin === 'function') {
        try { realTt.onAudioInterruptionBegin(cb); } catch (e) {}
      }
    },
    onAudioInterruptionEnd(cb) {
      if (realTt && typeof realTt.onAudioInterruptionEnd === 'function') {
        try { realTt.onAudioInterruptionEnd(cb); } catch (e) {}
      }
    },
    showShareMenu(opt) {
      if (realTt && typeof realTt.showShareMenu === 'function') {
        try { return realTt.showShareMenu(opt); } catch (e) {}
      }
    },
    onShareAppMessage(cb) {
      if (realTt && typeof realTt.onShareAppMessage === 'function') {
        try { return realTt.onShareAppMessage(cb); } catch (e) {}
      }
    },
    setStorage(opt) {
      if (realTt && typeof realTt.setStorage === 'function') return realTt.setStorage(opt);
      try {
        if (realTt && typeof realTt.setStorageSync === 'function' && opt) realTt.setStorageSync(opt.key, opt.data);
        if (opt && typeof opt.success === 'function') opt.success({});
      } catch (e) {
        if (opt && typeof opt.fail === 'function') opt.fail({ errMsg: String(e) });
      }
      if (opt && typeof opt.complete === 'function') opt.complete({});
    },
    getStorage(opt) {
      if (realTt && typeof realTt.getStorage === 'function') return realTt.getStorage(opt);
      try {
        const data = (realTt && typeof realTt.getStorageSync === 'function' && opt) ? realTt.getStorageSync(opt.key) : '';
        if (opt && typeof opt.success === 'function') opt.success({ data });
      } catch (e) {
        if (opt && typeof opt.fail === 'function') opt.fail({ errMsg: String(e) });
      }
      if (opt && typeof opt.complete === 'function') opt.complete({});
    },
    removeStorage(opt) {
      if (realTt && typeof realTt.removeStorage === 'function') return realTt.removeStorage(opt);
      try {
        if (realTt && typeof realTt.removeStorageSync === 'function' && opt) realTt.removeStorageSync(opt.key);
        if (opt && typeof opt.success === 'function') opt.success({});
      } catch (e) {
        if (opt && typeof opt.fail === 'function') opt.fail({ errMsg: String(e) });
      }
      if (opt && typeof opt.complete === 'function') opt.complete({});
    },
    clearStorage(opt) {
      if (realTt && typeof realTt.clearStorage === 'function') return realTt.clearStorage(opt);
      try {
        if (realTt && typeof realTt.clearStorageSync === 'function') realTt.clearStorageSync();
        if (opt && typeof opt.success === 'function') opt.success({});
      } catch (e) {
        if (opt && typeof opt.fail === 'function') opt.fail({ errMsg: String(e) });
      }
      if (opt && typeof opt.complete === 'function') opt.complete({});
    },
    setPreferredFramesPerSecond(fps) {
      if (realTt && typeof realTt.setPreferredFramesPerSecond === 'function') {
        try { realTt.setPreferredFramesPerSecond(fps); } catch (e) {}
      }
    },
    createWebAudioContext() {
    return createSilentAudioContext();
  },
};

if (realTt) {
  let mainCanvasCreated = false;
  const wxShim = new Proxy(realTt, {
    get(target, prop) {
      if (prop === 'env') return fallbacks.env;
      if (prop === 'createCanvas') {
        return function () {
          const c = target.createCanvas.apply(target, arguments);
          if (c && !c.id) {
            c.id = mainCanvasCreated ? 'offscreen-canvas' : 'canvas';
            mainCanvasCreated = true;
          }
          return c;
        };
      }
      if (prop === 'createWebAudioContext') {
        return function () {
          try {
            if (typeof target.createWebAudioContext === 'function') {
              const ctx = target.createWebAudioContext();
              if (ctx) return ctx;
            }
          } catch (e) {}
          console.warn('[DouyinBoot] WebAudio 不可用，改用静音上下文');
          return createSilentAudioContext();
        };
      }
      if (prop in target && target[prop] !== undefined) {
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      }
      if (prop in fallbacks) {
        return fallbacks[prop];
      }
      if (typeof prop === 'string' && /^(on|off)[A-Z]/.test(prop)) {
        return function () {};
      }
      return undefined;
    },
  });
  GameGlobal.wx = wxShim;
  rootScope.wx = wxShim;
}

if (typeof requestAnimationFrame !== 'function') {
  const raf = function (cb) {
    if (realTt && typeof realTt.requestAnimationFrame === 'function') {
      try { return realTt.requestAnimationFrame(cb); } catch (e) {}
    }
    return setTimeout(cb, 16);
  };
  rootScope.requestAnimationFrame = raf;
  GameGlobal.requestAnimationFrame = raf;
}
if (typeof cancelAnimationFrame !== 'function') {
  const cancel = function (id) {
    if (realTt && typeof realTt.cancelAnimationFrame === 'function') {
      try { return realTt.cancelAnimationFrame(id); } catch (e) {}
    }
    return clearTimeout(id);
  };
  rootScope.cancelAnimationFrame = cancel;
  GameGlobal.cancelAnimationFrame = cancel;
}
"""


CHECK_VERSION_JS = """// @ts-nocheck
/* 抖音小游戏环境能力检测（无任何微信版本弹窗） */
const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
const platform = String(info.platform || '').toLowerCase();
const system = String(info.system || '');

export const isDebug = false;
export const isPc = platform === 'windows' || platform === 'mac';
export const isIOS = platform === 'ios';
export const isAndroid = platform === 'android';
export const isDevtools = platform === 'devtools';
export const isHarmony = platform === 'ohos' || platform === 'harmony';
export const isMobile = !isPc && !isDevtools;
export const isDevelop = isDevtools;
export const isH5Renderer = false;
export const isSupportBufferURL = typeof wx.createBufferURL === 'function';
export const isSupportPlayBackRate = true;
export const isSupportCacheAudio = true;
export const isSupportInnerAudio = true;
export const isIOS175 = false;
export const isSupportSharedCanvasMode = false;
export const isSupportVideoPlayer = false;
export const webAudioNeedResume = isIOS;

GameGlobal.canUseH5Renderer = false;
GameGlobal.canUseiOSAutoGC = false;

export function canUseCoverview() {
  return isMobile || isDevtools;
}

if (isHarmony && typeof window !== 'undefined' && window.devicePixelRatio > 2) {
  try {
    window.devicePixelRatio = 2;
    const c = window.canvas;
    if (c) {
      c.width = Math.round(window.innerWidth * 2);
      c.height = Math.round(window.innerHeight * 2);
    }
  } catch (e) {}
}

export default () => Promise.resolve(true);
"""


TT_UNITY_MANAGER_JS = """// @ts-nocheck
/* 抖音小游戏 Unity/Tuanjie WASM 启动与缓存管理器（替代微信私有 UnityPlugin） */
import { launchEventType } from './plugin-config';

const CACHE_ROOT_NAME = '__GAME_FILE_CACHE';

function getFs() {
  try {
    return wx.getFileSystemManager ? wx.getFileSystemManager() : null;
  } catch (e) {
    return null;
  }
}

function userRoot() {
  return (wx && wx.env && wx.env.USER_DATA_PATH) || 'ttfile://user';
}

function ensureDirSync(fs, dirPath) {
  if (!fs || !dirPath) return;
  try {
    fs.accessSync(dirPath);
    return;
  } catch (e) {}
  try {
    fs.mkdirSync(dirPath, true);
  } catch (e) {}
}

function parentDir(filePath) {
  const idx = filePath.lastIndexOf('/');
  return idx > 0 ? filePath.substring(0, idx) : '';
}

function encodeUtf8(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i);
      const cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function decodeUtf8(bytes) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 < 0x80) out += String.fromCharCode(b0);
    else if ((b0 & 0xe0) === 0xc0) out += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if ((b0 & 0xf0) === 0xe0) {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
    } else {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const cp = (((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

function toArrayBuffer(data) {
  if (!data) return new ArrayBuffer(0);
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  if (typeof data === 'string') return encodeUtf8(data).buffer;
  return encodeUtf8(JSON.stringify(data)).buffer;
}

/* 极简 WebGL 启动封面渲染器：在 WASM 与首包下载期间绘制背景图与金色进度条，进入引擎前彻底释放临时 GL 对象 */
class SplashRenderer {
  constructor(mainCanvas, contextType, bgPath) {
    this.canvas = mainCanvas;
    this.progress = 0.04;
    this.disposed = false;
    this.rafId = 0;
    this.texReady = false;
    this.imgW = 720;
    this.imgH = 1280;
    this.gl = null;
    try {
      // WeChat UnityPlugin 中 contextType: 1=WebGL1, 2=WebGL2；必须与 data.tj3d 的图形 API 严格一致，避免主画布锁定到错误的 WebGL 版本
      const attrs = { alpha: false, depth: true, stencil: true, antialias: false, preserveDrawingBuffer: false };
      this.gl = (contextType === 2 && mainCanvas.getContext('webgl2', attrs)) || mainCanvas.getContext('webgl', attrs);
      if (this.gl) this.initGl(bgPath);
    } catch (e) {
      this.gl = null;
    }
  }

  initGl(bgPath) {
    const gl = this.gl;
    const vsSrc = `
      attribute vec2 aPos;
      attribute vec2 aUv;
      varying vec2 vUv;
      void main() {
        vUv = aUv;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;
    const fsSrc = `
      precision mediump float;
      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform vec4 uColor;
      uniform float uUseTex;
      void main() {
        if (uUseTex > 0.5) {
          gl_FragColor = texture2D(uTex, vUv);
        } else {
          gl_FragColor = uColor;
        }
      }
    `;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    this.vs = compile(gl.VERTEX_SHADER, vsSrc);
    this.fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    this.prog = gl.createProgram();
    gl.attachShader(this.prog, this.vs);
    gl.attachShader(this.prog, this.fs);
    gl.linkProgram(this.prog);
    this.buf = gl.createBuffer();
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);

    if (wx && typeof wx.createImage === 'function' && bgPath) {
      const img = wx.createImage();
      img.onload = () => {
        if (this.disposed || !this.gl) return;
        this.imgW = img.width || 720;
        this.imgH = img.height || 1280;
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this.texReady = true;
      };
      img.src = bgPath;
    }

    const loop = () => {
      if (this.disposed) return;
      this.draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.draw();
    this.rafId = requestAnimationFrame(loop);
  }

  setProgress(p) {
    if (p > this.progress) this.progress = Math.min(1, p);
  }

  drawQuad(x0, y0, x1, y1, u0, v0, u1, v1, useTex, r, g, b, a) {
    const gl = this.gl;
    const verts = new Float32Array([
      x0, y0, u0, v0,
      x1, y0, u1, v0,
      x0, y1, u0, v1,
      x0, y1, u0, v1,
      x1, y0, u1, v0,
      x1, y1, u1, v1,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(this.prog, 'aPos');
    const aUv = gl.getAttribLocation(this.prog, 'aUv');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uUseTex'), useTex ? 1.0 : 0.0);
    gl.uniform4f(gl.getUniformLocation(this.prog, 'uColor'), r, g, b, a);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  draw() {
    const gl = this.gl;
    if (!gl || this.disposed) return;
    const cw = this.canvas.width || 720;
    const ch = this.canvas.height || 1280;
    gl.viewport(0, 0, cw, ch);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.078, 0.051, 0.035, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);

    const scale = Math.max(cw / 720, ch / 1280);
    if (this.texReady) {
      const dw = 720 * scale;
      const dh = 1280 * scale;
      const uCrop = Math.min(0.45, Math.max(0, (dw - cw) / (2 * dw)));
      const vCrop = Math.min(0.45, Math.max(0, (dh - ch) / (2 * dh)));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(gl.getUniformLocation(this.prog, 'uTex'), 0);
      this.drawQuad(-1, -1, 1, 1, uCrop, vCrop, 1 - uCrop, 1 - vCrop, true, 1, 1, 1, 1);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // 与 LoadingScreen.cs 对齐的底部进度槽（720x1280 下宽 400、高 10、离底 214）
    const barW = 400 * scale;
    const barH = Math.max(6, 10 * scale);
    const barBottom = 214 * scale;
    const xLeft = -barW / cw;
    const xRight = barW / cw;
    const yBot = -1 + (2 * barBottom) / ch;
    const yTop = yBot + (2 * barH) / ch;
    this.drawQuad(xLeft, yBot, xRight, yTop, 0, 0, 1, 1, false, 0.0, 0.0, 0.0, 0.48);
    const fillX = xLeft + (xRight - xLeft) * Math.max(0.03, Math.min(1, this.progress));
    this.drawQuad(xLeft, yBot, fillX, yTop, 0, 0, 1, 1, false, 0.902, 0.71, 0.29, 1.0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    const gl = this.gl;
    if (!gl) return;
    try {
      const aPos = gl.getAttribLocation(this.prog, 'aPos');
      const aUv = gl.getAttribLocation(this.prog, 'aUv');
      if (aPos >= 0) gl.disableVertexAttribArray(aPos);
      if (aUv >= 0) gl.disableVertexAttribArray(aUv);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      if (this.buf) gl.deleteBuffer(this.buf);
      if (this.tex) gl.deleteTexture(this.tex);
      if (this.prog) gl.deleteProgram(this.prog);
      if (this.vs) gl.deleteShader(this.vs);
      if (this.fs) gl.deleteShader(this.fs);
    } catch (e) {}
    this.gl = null;
  }
}

function installUnityLoader(unityNamespace, manager) {
  const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
  const systemInfo = {
    browser: 'DouyinMiniGame',
    browserVersion: String(sys.version || '1.0'),
    gpu: 'Mobile GPU',
    os: String(sys.platform || 'mobile'),
    osVersion: String(sys.system || ''),
    width: Number((GameGlobal.canvas && GameGlobal.canvas.width) || sys.screenWidth || 720),
    height: Number((GameGlobal.canvas && GameGlobal.canvas.height) || sys.screenHeight || 1280),
    hasCursorLock: false,
    hasFullscreen: false,
    hasThreads: false,
    hasWasm: true,
    hasWasmThreads: false,
    hasWebGL: 2,
  };

  class CachedXHR {
    constructor() {
      this.signal = { aborted: false };
      this.paramsCache = { url: '', method: 'GET' };
      this.responseType = 'arraybuffer';
      this.status = 0;
      this.response = null;
      this.isReadFromCache = false;
      this.postData = null;
      this.onload = null;
      this.onerror = null;
      this.ontimeout = null;
      this.onabort = null;
      this.onsave = null;
      this.onsavefail = null;
      this._task = null;
    }

    abort() {
      this.signal.aborted = true;
      if (this._task && typeof this._task.abort === 'function') {
        try { this._task.abort(); } catch (e) {}
      }
      if (typeof this.onabort === 'function') this.onabort();
    }

    open(method, url) {
      this.paramsCache = { url: String(url || ''), method: String(method || 'GET').toUpperCase() };
    }

    send(body) {
      this.postData = body || null;
      this.openAndSend(this.paramsCache.url, {
        method: this.paramsCache.method,
        headers: {},
        body: body || null,
      }).then(() => {
        if (typeof this.onload === 'function') this.onload({ target: this });
      }).catch((err) => {
        if (this.signal.aborted) return;
        if (typeof this.onerror === 'function') this.onerror(err);
      });
    }

    openAndSend(url, init = {}) {
      const method = String(init.method || this.paramsCache.method || 'GET').toUpperCase();
      const headers = init.headers || {};
      this.paramsCache = { url, method };
      const fs = getFs();
      const canCache = method === 'GET' && fs && unityNamespace.isCacheableFile && unityNamespace.isCacheableFile(url);
      const cachePath = canCache ? manager.getCachePath(url) : '';

      if (canCache && cachePath) {
        try {
          fs.accessSync(cachePath);
          return new Promise((resolve, reject) => {
            fs.readFile({
              filePath: cachePath,
              success: (res) => {
                const ab = toArrayBuffer(res.data);
                const bytes = new Uint8Array(ab);
                this.status = 200;
                this.response = ab;
                this.isReadFromCache = true;
                if (typeof this.onsave === 'function') {
                  try { this.onsave(cachePath); } catch (e) {}
                }
                resolve({
                  url,
                  status: 200,
                  headers: new Map(),
                  parsedBody: bytes,
                  originXHR: this,
                });
              },
              fail: () => {
                this._fetchNetwork(url, method, headers, init, fs, canCache, cachePath).then(resolve, reject);
              },
            });
          });
        } catch (e) {}
      }

      return this._fetchNetwork(url, method, headers, init, fs, canCache, cachePath);
    }

    _fetchNetwork(url, method, headers, init, fs, canCache, cachePath) {
      // GET 可缓存大文件（StreamingAssets 图包 / 音乐）优先走 downloadFile 落盘，省内存峰值
      if (canCache && cachePath && typeof wx.downloadFile === 'function') {
        return new Promise((resolve, reject) => {
          const task = wx.downloadFile({
            url,
            header: headers,
            success: (res) => {
              const code = Number(res.statusCode || 200);
              if (code >= 200 && code < 300 && res.tempFilePath && fs) {
                ensureDirSync(fs, parentDir(cachePath));
                let savedPath = res.tempFilePath;
                try {
                  fs.copyFileSync(res.tempFilePath, cachePath);
                  savedPath = cachePath;
                  if (typeof this.onsave === 'function') this.onsave(cachePath);
                } catch (e) {
                  if (typeof this.onsavefail === 'function') this.onsavefail(e);
                }
                fs.readFile({
                  filePath: savedPath,
                  success: (rf) => {
                    const ab = toArrayBuffer(rf.data);
                    const bytes = new Uint8Array(ab);
                    this.status = code;
                    this.response = ab;
                    this.isReadFromCache = false;
                    resolve({
                      url,
                      status: code,
                      headers: new Map(),
                      parsedBody: bytes,
                      originXHR: this,
                    });
                  },
                  fail: (err) => reject(new Error((err && err.errMsg) || 'readFile fail')),
                });
              } else {
                this.status = code || 500;
                reject(new Error('HTTP ' + this.status));
              }
            },
            fail: (err) => reject(new Error((err && err.errMsg) || 'downloadFile fail')),
          });
          this._task = task;
          if (task && typeof task.onProgressUpdate === 'function' && typeof init.onProgress === 'function') {
            task.onProgressUpdate((p) => {
              init.onProgress({
                response: { url, status: 200, headers: new Map() },
                loaded: p.totalBytesWritten || 0,
                total: p.totalBytesExpectedToWrite || 100,
                lengthComputable: true,
                type: 'progress',
              });
            });
          }
        });
      }

      // 常规 HTTP 请求（含云函数 POST 登录/存档/排行榜、经分上报）
      return new Promise((resolve, reject) => {
        let reqData = undefined;
        if (init.body != null) {
          const ct = String(headers['Content-Type'] || headers['content-type'] || '').toLowerCase();
          if (ArrayBuffer.isView(init.body)) {
            const view = new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength);
            reqData = (ct.includes('json') || ct.includes('text')) ? decodeUtf8(view) : view.slice().buffer;
          } else {
            reqData = init.body;
          }
        }
        const task = wx.request({
          url,
          method,
          header: headers,
          data: reqData,
          responseType: 'arraybuffer',
          timeout: (init.timeout ? Number(init.timeout) * 1000 : 15000),
          success: (res) => {
            const code = Number(res.statusCode || 200);
            const ab = toArrayBuffer(res.data);
            const bytes = new Uint8Array(ab);
            const hdrMap = new Map();
            if (res.header && typeof res.header === 'object') {
              Object.keys(res.header).forEach((k) => hdrMap.set(k, String(res.header[k])));
            }
            this.status = code;
            this.response = ab;
            this.isReadFromCache = false;
            resolve({
              url,
              status: code,
              headers: hdrMap,
              parsedBody: bytes,
              originXHR: this,
            });
          },
          fail: (err) => reject(new Error((err && err.errMsg) || 'request fail')),
        });
        this._task = task;
      });
    }
  }

  const loaderObj = {
    SystemInfo: systemInfo,
    UnityCache: {
      XMLHttpRequest: CachedXHR,
    },
  };
  unityNamespace.UnityLoader = loaderObj;
  GameGlobal.UnityLoader = loaderObj;
  if (typeof window !== 'undefined') window.UnityLoader = loaderObj;
}

function parseAndMountWebData(Module, bytes) {
  const magic = 'TuanjieWebData1.0\\0';
  let magicMatch = true;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic.charCodeAt(i)) {
      magicMatch = false;
      break;
    }
  }
  const altMagic = 'UnityWebData1.0\\0';
  let pos = magic.length;
  if (!magicMatch) {
    pos = altMagic.length;
    for (let i = 0; i < altMagic.length; i++) {
      if (bytes[i] !== altMagic.charCodeAt(i)) {
        throw new Error('未知首包数据头格式');
      }
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint32(pos, true);
  pos += 4;
  while (pos < headerSize) {
    const dataOffset = view.getUint32(pos, true);
    pos += 4;
    const dataSize = view.getUint32(pos, true);
    pos += 4;
    const nameLen = view.getUint32(pos, true);
    pos += 4;
    const name = decodeUtf8(bytes.subarray(pos, pos + nameLen));
    pos += nameLen;
    let folderStart = 0;
    let slash = name.indexOf('/', folderStart) + 1;
    while (slash > 0) {
      Module.FS_createPath(name.substring(0, folderStart), name.substring(folderStart, slash - 1), true, true);
      folderStart = slash;
      slash = name.indexOf('/', folderStart) + 1;
    }
    Module.FS_createDataFile(name, null, bytes.subarray(dataOffset, dataOffset + dataSize), true, true, true);
  }
}

function wrapWasmImports(info) {
  const wrapped = {};
  Object.keys(info || {}).forEach((mod) => {
    const src = info[mod] || {};
    const dst = {};
    Object.keys(src).forEach((key) => {
      const val = src[key];
      if (typeof val !== 'function') {
        dst[key] = val;
        return;
      }
      dst[key] = function douyinWasmImport() {
        try {
          return val.apply(this, arguments);
        } catch (err) {
          // 抖音真机 TTWebAssembly 会在跨 WASM 栈回抛时把原始值（如 Emscripten 主循环 'unwind' 或 IL2CPP C# 异常指针数字）
          // 统一吞掉改写成 Error('JS Function calls failed.')，在此记录原始抛值供 handleException 与 invoke_* 精确还原！
          GameGlobal.__ttLastWasmThrow = { has: true, val: err };
          if (err !== 'unwind' && typeof err !== 'number' && !(err && err.name === 'ExitStatus')) {
            console.error('[DouyinBoot] wasm 调用 JS 失败', mod + '.' + key, err && (err.stack || err.message || err));
          }
          throw err;
        }
      };
    });
    wrapped[mod] = dst;
  });
  return wrapped;
}

function toUint8(raw) {
  if (!raw) throw new Error('wasm 文件是空的');
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw.data) return toUint8(raw.data);
  throw new Error('无法读取 wasm 文件');
}

function instantiateBrowserWasm(brPath, imports) {
  const browserWasm = GameGlobal.__DouyinBrowserWebAssembly;
  if (!browserWasm || typeof browserWasm.instantiate !== 'function') {
    return Promise.reject(new Error('没有浏览器 WebAssembly'));
  }
  if (typeof DecompressionStream !== 'function' || typeof Blob === 'undefined' || typeof Response === 'undefined') {
    return Promise.reject(new Error('没有 brotli 解压'));
  }
  const fs = wx.getFileSystemManager();
  let raw;
  try {
    raw = fs.readFileSync(brPath);
  } catch (e) {
    raw = fs.readFileSync('/' + brPath);
  }
  const u8 = toUint8(raw);
  console.log('[DouyinBoot] 浏览器解压 wasm', u8.byteLength);
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('br'));
  return new Response(stream).arrayBuffer().then((buf) => {
    console.log('[DouyinBoot] 浏览器编译 wasm', buf.byteLength);
    return browserWasm.instantiate(buf, imports);
  });
}

export default class DouyinUnityManager {
  constructor(config) {
    this.config = config || {};
    this._progressCbs = [];
    this._preparedCbs = [];
    this.isVisible = true;
    this.gameInstance = null;
    this.assetPath = `${String(this.config.DATA_CDN || '').replace(/\\/$/, '')}/Assets`;
    this.PLUGIN_CACHE_PATH = `${userRoot()}/${CACHE_ROOT_NAME}`;

    const rawFs = getFs();
    ensureDirSync(rawFs, this.PLUGIN_CACHE_PATH);
    this.fs = {
      accessSync(p) {
        if (!rawFs) return false;
        try { rawFs.accessSync(p); return true; } catch (e) { return false; }
      },
      addFileInfo() {},
      modifyFileInfo() {},
      removeFileInfo() {},
    };

    this.Logger = {
      eventLog() {},
      pluginLog(msg) { console.log(msg); },
    };
    this.TimeLogger = {
      timeStart() {},
      timeEnd() {},
    };
    this.reporter = {
      wxAssetBundle: { reportEmptyContent(info) { console.warn('[AssetBundle]', info); } },
      alarm: { malloc(info) { console.warn('[WasmHeap]', info); } },
    };
    const dummyMonitor = {
      isRunning: () => false,
      start() {},
      stop() {},
      shouldStartCpuProfile: () => false,
      onCpuProfileStarted() {},
      reportUnityProfileData() {},
      shouldForceShowPerfMonitor: () => false,
    };
    this.getGameDataMonitor = () => dummyMonitor;
    this.getWXAppCheatMonitor = () => dummyMonitor;

    if (wx && typeof wx.onShow === 'function') wx.onShow(() => { this.isVisible = true; });
    if (wx && typeof wx.onHide === 'function') wx.onHide(() => { this.isVisible = false; });

    if (GameGlobal.canvas && !GameGlobal.canvas.id) {
      GameGlobal.canvas.id = 'canvas';
    }
    const lpc = (this.config && this.config.loadingPageConfig) || {};
    const bgImg = (lpc.materialConfig && lpc.materialConfig.backgroundImage) || 'images/background.jpg';
    const ctxType = (this.config && this.config.contextConfig && this.config.contextConfig.contextType) || 1;
    this._splash = new SplashRenderer(GameGlobal.canvas, ctxType, bgImg);
  }

  onLaunchProgress(cb) {
    if (typeof cb === 'function') this._progressCbs.push(cb);
  }

  onModulePrepared(cb) {
    if (typeof cb === 'function') this._preparedCbs.push(cb);
  }

  _emitProgress(type, extra = {}) {
    const evt = { type, data: { costTimeMs: 0, runTimeMs: 0, isVisible: this.isVisible, ...extra } };
    this._progressCbs.forEach((cb) => {
      try { cb(evt); } catch (e) {}
    });
  }

  getCachePath(url) {
    if (!url) return '';
    let clean = String(url).replace(/ /g, '%20');
    const q = clean.indexOf('?');
    if (q >= 0) clean = clean.substring(0, q);
    const cdn = String(this.config.DATA_CDN || '').replace(/\\/$/, '');
    let rel = clean;
    if (cdn && clean.startsWith(cdn)) {
      rel = clean.substring(cdn.length).replace(/^\\/+/, '');
    } else {
      rel = clean.replace(/^https?:\\/\\/[^/]+\\//, '');
    }
    return `${this.PLUGIN_CACHE_PATH}/${rel}`;
  }

  hideLoadingPage() {
    if (this._splash) {
      this._splash.dispose();
      this._splash = null;
    }
  }

  printErr(msg) { console.error(msg); }
  writeLog(msg) { console.log(msg); }
  writeWarn(msg) { console.warn(msg); }
  showAbort() { this.hideLoadingPage(); }
  reportCustomLaunchInfo() {}
  reportGameSceneError() {}
  setConcurrent() {}
  setDataCDN(cdn) { this.config.DATA_CDN = cdn; }
  setPreloadList() {}
  setGameStage() {}
  cleanCache() { return Promise.resolve(true); }
  cleanAllCache() { return Promise.resolve(true); }
  removeFile(p) {
    const fs = getFs();
    if (!fs || !p) return Promise.resolve(false);
    return new Promise((resolve) => {
      fs.unlink({ filePath: p, success: () => resolve(true), fail: () => resolve(false) });
    });
  }

  _loadWasmSubpackage() {
    if (!wx || typeof wx.loadSubpackage !== 'function') return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = (why) => {
        if (settled) return;
        settled = true;
        if (why) console.warn('[DouyinBoot] wasm 分包超时，继续启动');
        resolve();
      };
      const timer = setTimeout(() => done('timeout'), 20000);
      wx.loadSubpackage({
        name: 'wasmcode',
        success: () => {
          clearTimeout(timer);
          console.log('[DouyinBoot] wasm 分包完成');
          done();
        },
        fail: (err) => {
          clearTimeout(timer);
          console.warn('[DouyinBoot] loadSubpackage wasmcode fallback:', err && err.errMsg ? err.errMsg : err);
          done();
        },
      });
    });
  }

  _loadDataPackage() {
    const md5 = this.config.DATA_FILE_MD5;
    const gameName = this.config.GAME_NAME || 'webgl';
    const fileName = `${md5}.${gameName}.data.unityweb.bin.txt`;
    const subPrefix = (GameGlobal.unityNamespace && GameGlobal.unityNamespace.dataFileSubPrefix) || '';
    const prefix = subPrefix ? `${subPrefix.replace(/^\\/+|\\/+$/g, '')}/` : '';
    const cdnUrl = `${String(this.config.DATA_CDN || '').replace(/\\/$/, '')}/${prefix}${fileName}`;
    const cacheFile = `${this.PLUGIN_CACHE_PATH}/${fileName}`;
    const total = Number(this.config.DATA_FILE_SIZE) || 0;
    const fs = getFs();

    const downloadAndCache = () => {
      if (fs) {
        try {
          const files = fs.readdirSync(this.PLUGIN_CACHE_PATH) || [];
          files.forEach((f) => {
            if (f !== fileName && f.endsWith('.data.unityweb.bin.txt')) {
              try { fs.unlinkSync(`${this.PLUGIN_CACHE_PATH}/${f}`); } catch (e2) {}
            }
          });
        } catch (e) {}
      }
      console.log('[DouyinBoot] 开始拉取首包', total, cdnUrl);
      return this._downloadDataByRange(cdnUrl, total).then((bytes) => {
        if (fs && bytes && bytes.byteLength > 0 && typeof fs.writeFile === 'function') {
          try {
            ensureDirSync(fs, this.PLUGIN_CACHE_PATH);
            const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            fs.writeFile({ filePath: cacheFile, data: ab, fail() {} });
          } catch (e3) {}
        }
        return bytes;
      });
    };

    if (fs && typeof fs.readFile === 'function') {
      try {
        fs.accessSync(cacheFile);
        return new Promise((resolve, reject) => {
          fs.readFile({
            filePath: cacheFile,
            success: (res) => {
              const bytes = new Uint8Array(toArrayBuffer(res.data));
              if (bytes.byteLength >= 32 && (!total || bytes.byteLength === total)) {
                this._setDataProgress(1);
                console.log('[DouyinBoot] 命中本地首包缓存', bytes.byteLength);
                resolve(bytes);
              } else {
                downloadAndCache().then(resolve, reject);
              }
            },
            fail: () => downloadAndCache().then(resolve, reject),
          });
        });
      } catch (e) {}
    }

    return downloadAndCache();
  }

  _setDataProgress(ratio) {
    let r = ratio;
    if (r < 0) r = 0;
    if (r > 1) r = 1;
    if (this._splash) this._splash.setProgress(0.12 + r * 0.65);
  }

  _downloadDataByRange(cdnUrl, totalSize) {
    const CHUNK = 512 * 1024;
    const CONCURRENCY = 4;
    const self = this;
    if (!wx || typeof wx.request !== 'function') {
      return Promise.reject(new Error('tt.request 不可用'));
    }
    const requestChunk = (start, end, left) => new Promise((resolve, reject) => {
      wx.request({
        url: cdnUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        header: { Range: 'bytes=' + start + '-' + end },
        timeout: 20000,
        success: (res) => {
          const code = Number(res.statusCode || 0);
          if ((code === 206 || code === 200) && res.data) {
            resolve(new Uint8Array(toArrayBuffer(res.data)));
            return;
          }
          if (left > 0) {
            requestChunk(start, end, left - 1).then(resolve, reject);
            return;
          }
          reject(new Error('首包分块 HTTP ' + code));
        },
        fail: (err) => {
          if (left > 0) {
            requestChunk(start, end, left - 1).then(resolve, reject);
            return;
          }
          reject(new Error((err && err.errMsg) || '首包分块失败'));
        },
      });
    });

    const firstEnd = Math.max(0, Math.min(CHUNK, totalSize || CHUNK) - 1);
    return requestChunk(0, firstEnd, 2).then((first) => {
      const total = totalSize || first.length;
      if (!total) throw new Error('首包长度未知');
      if (first.length >= total) {
        self._setDataProgress(1);
        console.log('[DouyinBoot] 首包完成', first.length);
        return first.subarray(0, total);
      }
      const firstExpect = firstEnd + 1;
      if (first.length < firstExpect) throw new Error('首包分块过短');
      const out = new Uint8Array(total);
      out.set(first.subarray(0, firstExpect), 0);
      let received = firstExpect;
      let cursor = firstExpect;
      let inflight = 0;
      let lastLog = 0;
      return new Promise((resolve, reject) => {
        let failed = false;
        const tick = () => {
          self._setDataProgress(received / total);
          if (received - lastLog >= 2 * 1024 * 1024 || received >= total) {
            lastLog = received;
            console.log('[DouyinBoot] 首包 ' + Math.floor(received * 100 / total) + '%');
          }
        };
        const launch = () => {
          if (failed) return;
          if (received >= total && inflight === 0) {
            console.log('[DouyinBoot] 首包完成', total);
            resolve(out);
            return;
          }
          while (!failed && inflight < CONCURRENCY && cursor < total) {
            const start = cursor;
            const end = Math.min(total - 1, start + CHUNK - 1);
            const expect = end - start + 1;
            cursor = end + 1;
            inflight += 1;
            requestChunk(start, end, 2).then((chunk) => {
              if (failed) return;
              if (chunk.length < expect) {
                failed = true;
                reject(new Error('首包分块过短 ' + start));
                return;
              }
              out.set(chunk.subarray(0, expect), start);
              received += expect;
              inflight -= 1;
              tick();
              launch();
            }).catch((err) => {
              if (failed) return;
              failed = true;
              reject(err);
            });
          }
        };
        tick();
        launch();
      });
    });
  }

  startGame() {
    console.log('[DouyinBoot] startGame');
    const unityNamespace = GameGlobal.unityNamespace;
    installUnityLoader(unityNamespace, this);
    this._emitProgress(launchEventType.launchPlugin);

    const codeMd5 = this.config.CODE_FILE_MD5;
    const gameName = this.config.GAME_NAME || 'webgl';
    const wasmRelPath = `wasmcode/${codeMd5}.${gameName}.wasm.code.unityweb.wasm.br`;

    Promise.all([
      this._loadWasmSubpackage().then(() => {
        if (this._splash) this._splash.setProgress(0.12);
        this._emitProgress(launchEventType.loadWasm);
      }),
      this._loadDataPackage().then((bytes) => {
        this._emitProgress(launchEventType.loadAssets);
        return bytes;
      }),
    ]).then(([, dataBytes]) => {
      if (this._splash) this._splash.setProgress(0.86);
      if (GameGlobal.canvas && !GameGlobal.canvas.id) {
        GameGlobal.canvas.id = 'canvas';
      }
      const Module = {
        canvas: GameGlobal.canvas,
        IsWxGame: true,
        companyName: 'RosaGames',
        productName: 'cunkou',
        productVersion: '1.0.0',
        streamingAssetsUrl: `${String(this.config.DATA_CDN || '').replace(/\\/$/, '')}/StreamingAssets`,
        webglContextAttributes: {
          preserveDrawingBuffer: false,
          powerPreference: 2,
          stencil: true,
          depth: true,
          alpha: false,
          antialias: false,
        },
        preRun: [],
        postRun: [],
        print: (t) => console.log(t),
        printErr: (t) => console.error(t),
        wasmPath: wasmRelPath,
        wasmInstantiated: () => {
          if (this._splash) this._splash.setProgress(0.95);
          this._emitProgress(launchEventType.compileWasm);
        },
        calledMainCb: () => {
          this.hideLoadingPage();
          this._emitProgress(launchEventType.prepareGame);
        },
        instantiateWasm: (imports, successCallback) => {
          const wrapped = wrapWasmImports(imports);
          const finish = (res, how) => {
            const inst = (res && res.instance) ? res.instance : res;
            const mod = res && res.module;
            console.log('[DouyinBoot] wasm 编译完成', how);
            // 严禁对主画布调用 WEBGL_lose_context.loseContext()（会导致同一 canvas 的 WebGL 上下文永久丢失）
            // 仅调用 hideLoadingPage() 释放封面着色器与缓冲，将健康的 WebGL2 上下文平滑移交团结引擎
            this.hideLoadingPage();
            successCallback(inst, mod);
          };
          const viaTt = (p) => {
            const WasmHost = typeof TTWebAssembly !== 'undefined' ? TTWebAssembly : GameGlobal.WXWebAssembly;
            if (!WasmHost || typeof WasmHost.instantiate !== 'function') {
              return Promise.reject(new Error('没有可用的 WebAssembly.instantiate'));
            }
            console.log('[DouyinBoot] 编译 wasm TTWebAssembly', p);
            return WasmHost.instantiate(p, wrapped);
          };
          instantiateBrowserWasm(wasmRelPath, wrapped)
            .then((res) => finish(res, 'browser'))
            .catch((err) => {
              console.warn('[DouyinBoot] 浏览器 WebAssembly 不可用，改用 TTWebAssembly', err && (err.message || err));
              return viaTt(wasmRelPath).catch(() => viaTt('/' + wasmRelPath)).then((res) => finish(res, 'tt'));
            })
            .catch((err) => {
              console.error('[DouyinBoot] TTWebAssembly.instantiate failed:', err);
              if (this.onLogError) this.onLogError(err);
            });
          return {};
        },
      };

      GameGlobal.Module = Module;
      unityNamespace.Module = Module;
      this.gameInstance = { Module };

      this._preparedCbs.forEach((cb) => {
        try { cb(); } catch (e) {}
      });

      const bootFn = unityNamespace.UnityModule;
      if (typeof bootFn !== 'function') {
        throw new Error('缺少 unityNamespace.UnityModule');
      }
      // 抖音没有 IndexedDB。引擎默认会 FS.mount(IDBFS) 再 syncfs，assert 直接把启动打断。
      // 改成内存目录，PlayerPrefs 只在本次运行有效。
      Module.tuanjieFileSystemInit = function () {
        const ns = GameGlobal.unityNamespace || {};
        const FS = ns.FS;
        const IDBFS = ns.IDBFS;
        if (IDBFS) {
          IDBFS.syncfs = function (mount, populate, callback) {
            if (typeof callback === 'function') callback(null);
          };
        }
        try {
          if (FS && IDBFS) {
            try { FS.mkdir('/idbfs'); } catch (e) {}
            FS.mount(IDBFS, {}, '/idbfs');
          }
        } catch (err) {
          console.warn('[DouyinBoot] 建立内存存档目录失败', err);
        }
        console.log('[DouyinBoot] 已跳过 IndexedDB，存档只在本次运行有效');
      };
      unityNamespace.isLoopRunnerEnable = true;
      console.log('[DouyinBoot] 启动帧循环');
      console.log('[DouyinBoot] 调用引擎');
      bootFn(Module);
      // wasm-preloadAssets 只能在引擎函数返回后清掉。放进 preRun 会和 run() 互相等待，首包下完也会一直停在封面上。
      console.log('[DouyinBoot] 开始挂载首包', dataBytes && dataBytes.length);
      try {
        parseAndMountWebData(Module, dataBytes);
        console.log('[DouyinBoot] 首包已挂载');
        this._emitProgress(launchEventType.readAssets);
      } catch (err) {
        console.error('[DouyinBoot] mount data failed:', err);
        if (this.onLogError) this.onLogError(err);
        throw err;
      }
      if (typeof Module.removeRunDependency === 'function') {
        console.log('[DouyinBoot] 放开引擎启动');
        Module.removeRunDependency('wasm-preloadAssets');
      }
    }).catch((err) => {
      console.error('[DouyinBoot] 启动失败:', err);
      if (this.onLogError) this.onLogError(err);
      if (wx && typeof wx.showModal === 'function') {
        wx.showModal({
          title: '资源加载失败',
          content: '请检查网络连接后重新打开小游戏（' + ((err && err.message) || err) + '）',
          showCancel: false,
        });
      }
    });
  }
}
"""


def build_douyin_game_js(meta: dict) -> str:
    return f"""// @ts-nocheck
import './tt-shim';
import './weapp-adapter';
import './events';
import './texture-config';
import unityNamespace from './unity-namespace';
import './webgl.wasm.framework.unityweb';
import './unity-sdk/index';
import checkVersion from './check-version';
import {{ launchEventType, scaleMode }} from './plugin-config';
import './plugins/screen-adapter';
import DouyinUnityManager from './tt-unity-manager';

const managerConfig = {{
  DATA_FILE_MD5: '{meta["DATA_FILE_MD5"]}',
  CODE_FILE_MD5: '{meta["CODE_FILE_MD5"]}',
  GAME_NAME: '{meta["GAME_NAME"]}',
  APPID: '{DOUYIN_APPID}',
  DATA_FILE_SIZE: '{meta["DATA_FILE_SIZE"]}',
  OPT_DATA_FILE_SIZE: '',
  DATA_CDN: '{meta["DATA_CDN"]}',
  // 抖音一次性订阅消息模板 ID（在抖音开放平台 -> 运营/互动能力 -> 订阅消息 选用模板后可直接填在此处或 CloudConfig.cs 中）
  SUBSCRIBE_TMPL_IDS: {{
    patrol: '', // 巡村收益满仓 / 体力恢复提醒模板 ID（如 MSG...）
    sign: '',   // 每日签到 / 活动开启提醒模板 ID（如 MSG...）
    update: '', // 版本更新提醒模板 ID（单独请求）
  }},
  loadDataPackageFromSubpackage: false,
  compressDataPackage: false,
  preloadDataList: [],
  contextConfig: {{
    contextType: {meta["CONTEXT_TYPE"]},
    contextExt: {{
      enableGLX: false,
      enableMetal: false,
    }},
  }},
  useOffscreenCanvas: false,
  PROFILER_UPLOAD_URL: '',
  hideAfterCallmain: false,
  loadingPageConfig: {{
    designWidth: 720,
    designHeight: 1280,
    scaleMode: scaleMode.noBorder,
    materialConfig: {{
      backgroundImage: 'images/background.jpg',
      backgroundVideo: '',
      iconImage: 'images/unity_logo.png',
    }},
  }},
}};

GameGlobal.managerConfig = managerConfig;
GameGlobal.DATA_CDN = managerConfig.DATA_CDN;

checkVersion().then((enable) => {{
  if (!enable) return;
  Error.stackTraceLimit = Infinity;
  const gameManager = new DouyinUnityManager(managerConfig);
  GameGlobal.manager = gameManager;

  gameManager.onLaunchProgress((e) => {{
    if (e.type === launchEventType.prepareGame) {{
      setTimeout(() => {{
        if (gameManager && gameManager.hideLoadingPage) gameManager.hideLoadingPage();
      }}, 6000);
    }}
  }});

  gameManager.onModulePrepared(() => {{
    for (const key in unityNamespace) {{
      if (!Object.prototype.hasOwnProperty.call(GameGlobal, key) || key === 'DATA_CDN') {{
        GameGlobal[key] = unityNamespace[key];
      }}
    }}
    managerConfig.DATA_CDN = GameGlobal.DATA_CDN;
    gameManager.assetPath = `${{(managerConfig.DATA_CDN || '').replace(/\\/$/, '')}}/Assets`;
  }});

  gameManager.onLogError = function (err) {{
    console.error('[EngineError]', err && err.stack ? err.stack : err);
  }};

  gameManager.startGame();
}});
"""


def _find_matching_forward(s: str, open_idx: int, open_ch: str, close_ch: str) -> int:
    depth = 0
    for i in range(open_idx, len(s)):
        if s[i] == open_ch:
            depth += 1
        elif s[i] == close_ch:
            depth -= 1
            if depth == 0:
                return i
    raise ValueError(f"括号未闭合: {s[open_idx:open_idx + 60]!r}")


def _find_matching_backward(s: str, close_idx: int, open_ch: str, close_ch: str) -> int:
    depth = 0
    for i in range(close_idx, -1, -1):
        if s[i] == close_ch:
            depth += 1
        elif s[i] == open_ch:
            depth -= 1
            if depth == 0:
                return i
    raise ValueError(f"反向括号未闭合: {s[max(0, close_idx - 60):close_idx + 1]!r}")


_JS_KEYWORDS = {
    "return", "throw", "typeof", "void", "delete", "await", "yield",
    "case", "new", "in", "of", "instanceof", "else", "if",
}


def _extract_lhs_bounds(s: str, end_pos: int) -> tuple[int, int]:
    """反向提取紧邻 ?. 或 ?? 左侧的 Primary/Member/Call/Paren 表达式区间 [start, end)。"""
    r = end_pos
    while r > 0 and s[r - 1] in " \t":
        r -= 1
    p = r
    while p > 0:
        q = p
        while q > 0 and s[q - 1] in " \t":
            q -= 1
        if q == 0:
            break
        ch = s[q - 1]
        if ch == ")":
            open_p = _find_matching_backward(s, q - 1, "(", ")")
            # 检查圆括号前是否是函数调用（标识符 / ] / ) / .prop）还是独立分组表达式 (a || b)
            k = open_p
            while k > 0 and s[k - 1] in " \t":
                k -= 1
            if k > 0 and (s[k - 1].isalnum() or s[k - 1] in "_$])"):
                p = open_p
                continue
            p = open_p
            break
        if ch == "]":
            open_b = _find_matching_backward(s, q - 1, "[", "]")
            p = open_b
            continue
        if ch.isalnum() or ch in "_$\x00":
            id_end = q
            while q > 0 and (s[q - 1].isalnum() or s[q - 1] in "_$\x00"):
                q -= 1
            word = s[q:id_end]
            if word in _JS_KEYWORDS:
                break
            p = q
            k = p
            while k > 0 and s[k - 1] in " \t":
                k -= 1
            if k > 0 and s[k - 1] == ".":
                if k >= 2 and s[k - 2] == "?":
                    break
                p = k - 1
                continue
            break
        break
    return p, r


def _split_member_obj_prop(expr: str) -> tuple[str, str] | None:
    """若 expr 形如 OBJ.PROP（顶层属性访问），拆出 (OBJ, PROP) 以保留方法调用的 this 绑定。"""
    e = expr.strip()
    m = re.search(r"\.\s*([A-Za-z_$][A-Za-z0-9_$]*)$", e)
    if not m:
        return None
    obj = e[:m.start()].strip()
    prop = m.group(1)
    if not obj or obj.endswith("?"):
        return None
    return obj, prop


def _extract_rhs_bounds(s: str, start_pos: int) -> tuple[int, int]:
    """正向提取紧邻 ?? 右侧的单值/成员/调用/括号表达式区间 [start, end)。"""
    l = start_pos
    while l < len(s) and s[l] in " \t":
        l += 1
    p = l
    if p < len(s) and s[p] in "+-!~":
        p += 1
        while p < len(s) and s[p] in " \t":
            p += 1
    while p < len(s):
        ch = s[p]
        if ch == "(":
            p = _find_matching_forward(s, p, "(", ")") + 1
            continue
        if ch == "[":
            p = _find_matching_forward(s, p, "[", "]") + 1
            continue
        if ch.isalnum() or ch in "_$\x00":
            while p < len(s) and (s[p].isalnum() or s[p] in "_$\x00."):
                p += 1
            continue
        break
    return l, p


def _lower_class_fields(code: str) -> str:
    """将 ES2022 类实例字段声明（如 threeD = false; source;）降级进 constructor()，兼容字节 tmacs 的 babylon 解析器。"""
    cls_rx = re.compile(r"\bclass\s+[A-Za-z_$][A-Za-z0-9_$]*(?:\s+extends\s+[^{]+)?\s*\{")
    pos = 0
    out = []
    while True:
        m = cls_rx.search(code, pos)
        if not m:
            out.append(code[pos:])
            break
        brace_open = m.end() - 1
        brace_close = _find_matching_forward(code, brace_open, "{", "}")
        out.append(code[pos:brace_open + 1])
        body = code[brace_open + 1:brace_close]

        # 扫描类体顶层（depth == 0）的字段声明行
        lines = body.splitlines(keepends=True)
        depth = 0
        fields: list[tuple[str, str]] = []
        kept_lines: list[str] = []
        field_line_rx = re.compile(
            r"^(\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=\s*([^;\n]+?))?\s*;(\s*(?:\x00L\d+L\x00)?\s*\r?\n?)$"
        )
        for ln in lines:
            if depth == 0:
                fm = field_line_rx.match(ln)
                if fm and fm.group(2) not in _JS_KEYWORDS:
                    fname = fm.group(2)
                    fval = fm.group(3).strip() if fm.group(3) is not None else "undefined"
                    fields.append((fname, fval))
                    continue
            kept_lines.append(ln)
            # 简易花括号深度统计（这些文件顶层无复杂模板花括号）
            depth += ln.count("{") - ln.count("}")

        new_body = "".join(kept_lines)
        if fields:
            assigns = "".join(f"        this.{k} = {v};\n" for k, v in fields)
            ctor_m = re.search(r"\bconstructor\s*\([^)]*\)\s*\{", new_body)
            if ctor_m:
                insert_at = ctor_m.end()
                new_body = new_body[:insert_at] + "\n" + assigns + new_body[insert_at:]
            else:
                new_body = "\n    constructor() {\n" + assigns + "    }\n" + new_body

        out.append(new_body)
        out.append("}")
        pos = brace_close + 1
    return "".join(out)


def _mask_js_non_code(code: str) -> tuple[str, list[str]]:
    """逐字符扫描 JS，安全遮罩注释、正则字面量、单双引号字符串以及模板字符串静态文本段（保留 ${...} 内表达式代码与配对花括号）。"""
    lits: list[str] = []
    out: list[str] = []
    n = len(code)
    i = 0
    tpl_brace_stack: list[int] = []
    last_sig = ""  # 上一个非空白有效源码末尾字符或关键字标记，用于区分除号 / 与正则字面量 /.../

    def save(seg: str) -> str:
        idx = len(lits)
        lits.append(seg)
        return f"\x00L{idx}L\x00"

    def can_start_regex() -> bool:
        if not last_sig:
            return True
        if last_sig in "([{:;,=!&|?+-*~^%<>":
            return True
        if last_sig.startswith("KW:"):
            return True
        return False

    def scan_template_chunk(start: int, include_open: bool) -> int:
        j = start + (1 if include_open else 0)
        while j < n:
            c = code[j]
            if c == "\\":
                j += 2
                continue
            if c == "`":
                out.append(save(code[start:j + 1]))
                return j + 1
            if c == "$" and j + 1 < n and code[j + 1] == "{":
                if j > start:
                    out.append(save(code[start:j]))
                out.append("${")
                tpl_brace_stack.append(0)
                return j + 2
            j += 1
        if start < n:
            out.append(save(code[start:]))
        return n

    while i < n:
        c = code[i]
        if c in " \t\r\n":
            out.append(c)
            i += 1
            continue
        if c == "/" and i + 1 < n and code[i + 1] == "/":
            j = code.find("\n", i + 2)
            if j < 0:
                j = n
            out.append(save(code[i:j]))
            i = j
            continue
        if c == "/" and i + 1 < n and code[i + 1] == "*":
            j = code.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(save(code[i:j]))
            i = j
            continue
        if c == "/" and can_start_regex():
            j = i + 1
            in_cls = False
            while j < n and code[j] != "\n":
                rc = code[j]
                if rc == "\\":
                    j += 2
                    continue
                if rc == "[":
                    in_cls = True
                elif rc == "]":
                    in_cls = False
                elif rc == "/" and not in_cls:
                    j += 1
                    while j < n and code[j].isalpha():
                        j += 1
                    break
                j += 1
            out.append(save(code[i:j]))
            last_sig = "/"
            i = j
            continue
        if c in ("'", '"'):
            q = c
            j = i + 1
            while j < n:
                if code[j] == "\\":
                    j += 2
                    continue
                if code[j] == q:
                    j += 1
                    break
                j += 1
            out.append(save(code[i:j]))
            last_sig = q
            i = j
            continue
        if c == "`":
            i = scan_template_chunk(i, True)
            if not tpl_brace_stack:
                last_sig = "`"
            else:
                last_sig = "{"
            continue
        if tpl_brace_stack:
            if c == "{":
                tpl_brace_stack[-1] += 1
                out.append(c)
                last_sig = "{"
                i += 1
                continue
            if c == "}":
                if tpl_brace_stack[-1] == 0:
                    tpl_brace_stack.pop()
                    out.append("}")
                    i = scan_template_chunk(i + 1, False)
                    last_sig = "`" if not tpl_brace_stack else "{"
                    continue
                tpl_brace_stack[-1] -= 1
                out.append(c)
                last_sig = "}"
                i += 1
                continue
        if c.isalpha() or c in "_$":
            j = i + 1
            while j < n and (code[j].isalnum() or code[j] in "_$"):
                j += 1
            word = code[i:j]
            out.append(word)
            last_sig = f"KW:{word}" if word in _JS_KEYWORDS else "ID"
            i = j
            continue
        out.append(c)
        last_sig = c
        i += 1

    return "".join(out), lits


def downlevel_js_for_tmacs(src: str) -> str:
    """将 ES2020 可选链 (?.)、空值合并 (??) 及类属性字段降级为纯 ES2015/ES2017，兼容抖音上传编译器 babylon。"""
    if "?." not in src and "??" not in src and "class " not in src:
        return src

    # 1. 先遮罩注释、字符串与模板静态段，再处理类字段与 ?. / ??
    masked, lits = _mask_js_non_code(src)
    masked = _lower_class_fields(masked)
    if "?." not in masked and "??" not in masked:
        def _restore_early(m: re.Match) -> str:
            return lits[int(m.group(1))]
        return re.sub(r"\x00L(\d+)L\x00", _restore_early, masked)

    # 2. 逐个从左到右消解 ?. （含 ?.[k](args)、?.[k]、?.(args)、?.prop?.(args)、?.prop(args)、?.prop）
    oc_seq = 0
    while "?." in masked:
        idx = masked.find("?.")
        lhs_s, lhs_e = _extract_lhs_bounds(masked, idx)
        lhs = masked[lhs_s:lhs_e]
        if not lhs:
            raise ValueError(f"无法提取 ?. 左侧表达式: {masked[max(0, idx - 50):idx + 50]!r}")
        oc_seq += 1
        v = f"_oc{oc_seq}"
        rhs_start = idx + 2

        if rhs_start < len(masked) and masked[rhs_start] == "[":
            b_end = _find_matching_forward(masked, rhs_start, "[", "]")
            key_expr = masked[rhs_start + 1:b_end]
            after_b = b_end + 1
            if after_b < len(masked) and masked[after_b] == "(":
                p_end = _find_matching_forward(masked, after_b, "(", ")")
                args_expr = masked[after_b + 1:p_end]
                rep = f"(({v}) => ({v} != null && typeof {v}[{key_expr}] === 'function' ? {v}[{key_expr}]({args_expr}) : undefined))({lhs})"
                masked = masked[:lhs_s] + rep + masked[p_end + 1:]
            else:
                rep = f"(({v}) => ({v} != null ? {v}[{key_expr}] : undefined))({lhs})"
                masked = masked[:lhs_s] + rep + masked[after_b:]
        elif rhs_start < len(masked) and masked[rhs_start] == "(":
            p_end = _find_matching_forward(masked, rhs_start, "(", ")")
            args_expr = masked[rhs_start + 1:p_end]
            mp = _split_member_obj_prop(lhs)
            if mp is not None:
                obj_expr, prop_name = mp
                rep = f"(({v}) => ({v} != null && typeof {v}.{prop_name} === 'function' ? {v}.{prop_name}({args_expr}) : undefined))({obj_expr})"
            else:
                rep = f"(({v}) => (typeof {v} === 'function' ? {v}({args_expr}) : undefined))({lhs})"
            masked = masked[:lhs_s] + rep + masked[p_end + 1:]
        else:
            pm = re.match(r"([A-Za-z_$][A-Za-z0-9_$]*)", masked[rhs_start:])
            if not pm:
                raise ValueError(f"无法识别 ?. 右侧成员: {masked[idx:idx + 50]!r}")
            prop = pm.group(1)
            after_p = rhs_start + len(prop)
            if masked[after_p:after_p + 3] == "?.(":
                p_end = _find_matching_forward(masked, after_p + 2, "(", ")")
                args_expr = masked[after_p + 3:p_end]
                rep = f"(({v}) => ({v} != null && typeof {v}.{prop} === 'function' ? {v}.{prop}({args_expr}) : undefined))({lhs})"
                masked = masked[:lhs_s] + rep + masked[p_end + 1:]
            elif after_p < len(masked) and masked[after_p] == "(":
                p_end = _find_matching_forward(masked, after_p, "(", ")")
                args_expr = masked[after_p + 1:p_end]
                rep = f"(({v}) => ({v} != null ? {v}.{prop}({args_expr}) : undefined))({lhs})"
                masked = masked[:lhs_s] + rep + masked[p_end + 1:]
            else:
                rep = f"(({v}) => ({v} != null ? {v}.{prop} : undefined))({lhs})"
                masked = masked[:lhs_s] + rep + masked[after_p:]

    # 3. 逐个从左到右消解 ?? 空值合并
    nc_seq = 0
    while "??" in masked:
        idx = masked.find("??")
        lhs_s, lhs_e = _extract_lhs_bounds(masked, idx)
        rhs_s, rhs_e = _extract_rhs_bounds(masked, idx + 2)
        lhs = masked[lhs_s:lhs_e]
        rhs = masked[rhs_s:rhs_e]
        if not lhs or not rhs:
            raise ValueError(f"无法提取 ?? 两侧表达式: {masked[max(0, idx - 50):idx + 50]!r}")
        nc_seq += 1
        v = f"_nc{nc_seq}"
        rep = f"(({v}) => ({v} !== null && {v} !== undefined ? {v} : {rhs}))({lhs})"
        masked = masked[:lhs_s] + rep + masked[rhs_e:]

    # 4. 还原字符串与注释字面量
    def _restore_lit(m: re.Match) -> str:
        return lits[int(m.group(1))]

    return re.sub(r"\x00L(\d+)L\x00", _restore_lit, masked)


def main() -> int:
    game_js = WX_MINI / "game.js"
    if not game_js.exists():
        print(f"未找到 {game_js}，请先执行一次小游戏 WASM 导出。", file=sys.stderr)
        return 1

    meta = parse_wx_game_js(game_js)
    if not meta["DATA_FILE_MD5"] or not meta["CODE_FILE_MD5"]:
        print(f"无法从 {game_js} 解析 DATA_FILE_MD5 / CODE_FILE_MD5：{meta}", file=sys.stderr)
        return 1

    wasm_rel = f"wasmcode/{meta['CODE_FILE_MD5']}.{meta['GAME_NAME']}.wasm.code.unityweb.wasm.br"
    wasm_src = WX_MINI / wasm_rel
    if not wasm_src.exists():
        print(f"未找到 WASM 代码包：{wasm_src}", file=sys.stderr)
        return 1

    data_src = WX_WEBGL / f"{meta['DATA_FILE_MD5']}.{meta['GAME_NAME']}.data.unityweb.bin.txt"
    if not data_src.exists():
        print(f"未找到 CDN 首包文件：{data_src}", file=sys.stderr)
        return 1

    if DY_OUT.exists():
        shutil.rmtree(DY_OUT)
    DY_OUT.mkdir(parents=True, exist_ok=True)

    # 1. 拷贝基础运行时文件（剔除 4.7MB 调试符号文件，精简主包体积）
    for fn in (
        "weapp-adapter.js",
        "events.js",
        "texture-config.js",
        "unity-namespace.js",
        "webgl.wasm.framework.unityweb.js",
        "plugin-config.js",
    ):
        shutil.copy2(WX_MINI / fn, DY_OUT / fn)

    for folder in ("images", "plugins", "unity-sdk"):
        src_dir = WX_MINI / folder
        if src_dir.exists():
            shutil.copytree(src_dir, DY_OUT / folder)

    # 修正 inner-audio.js 对 ttfile:// 本地缓存路径的判断
    inner_audio = DY_OUT / "unity-sdk" / "audio" / "inner-audio.js"
    if inner_audio.exists():
        ia_txt = inner_audio.read_text(encoding="utf-8")
        ia_txt = ia_txt.replace(
            "!/^https?:\\/\\//.test(v) && !/^wxfile:\\/\\//.test(v)",
            "!/^(https?|wxfile|ttfile):\\/\\//.test(v)",
        )
        inner_audio.write_text(ia_txt, encoding="utf-8")

    # 加固 webgl.wasm.framework.unityweb.js：
    # 1) jsCanvasSelector 对 canvas.id 为空的兜底保护
    # 2) 还原抖音真机 TTWebAssembly 跨 WASM 栈改写的 'unwind' 与 IL2CPP C# 异常指针，避免 handleException / invoke_* 误判崩溃
    fw_js = DY_OUT / "webgl.wasm.framework.unityweb.js"
    if fw_js.exists():
        fw_txt = fw_js.read_text(encoding="utf-8")
        fw_txt = fw_txt.replace(
            'var canvasId=Module["canvas"]?Module["canvas"].id:"tuanjie-canvas";',
            'var canvasId=(Module["canvas"]&&Module["canvas"].id)?Module["canvas"].id:"canvas";',
        )
        tt_unwrap_helpers = (
            'function __ttUnwrapMainEx(e){'
            'var t=typeof GameGlobal!=="undefined"&&GameGlobal.__ttLastWasmThrow;'
            'if(t&&t.has){var v=t.val;if(v==="unwind"||(v&&v.name==="ExitStatus")){t.has=false;return v}}'
            'return e}'
            'function __ttUnwrapInvokeEx(e){'
            'if(e===e+0)return e;'
            'var t=typeof GameGlobal!=="undefined"&&GameGlobal.__ttLastWasmThrow;'
            'if(t&&t.has&&typeof t.val==="number"){var n=t.val;t.has=false;return n}'
            'return e}\n'
        )
        if "function handleException(e){" not in fw_txt:
            raise RuntimeError("webgl.wasm.framework.unityweb.js 未找到 handleException 签名")
        fw_txt = tt_unwrap_helpers + fw_txt.replace(
            "function handleException(e){",
            "function handleException(e){e=__ttUnwrapMainEx(e);",
            1,
        ).replace(
            "if(e!==e+0)throw e;",
            "e=__ttUnwrapInvokeEx(e);if(e!==e+0)throw e;",
        )
        fw_js.write_text(fw_txt, encoding="utf-8")

    # 2. 拷贝 wasmcode 代码分包
    dy_wasm_dir = DY_OUT / "wasmcode"
    dy_wasm_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(wasm_src, dy_wasm_dir / wasm_src.name)
    (dy_wasm_dir / "game.js").write_text("// wasmcode subpackage entry\n", encoding="utf-8")

    # 3. 写入抖音专属配置与加载脚本
    game_json = {
        "deviceOrientation": "portrait",
        "showStatusBar": False,
        "networkTimeout": {
            "request": 15000,
            "connectSocket": 10000,
            "uploadFile": 10000,
            "downloadFile": 60000,
        },
        "subpackages": [
            {
                "name": "wasmcode",
                "root": "wasmcode/",
            }
        ],
    }
    (DY_OUT / "game.json").write_text(json.dumps(game_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    project_cfg = {
        "description": "村口大战外星人 抖音小游戏工程",
        "appid": DOUYIN_APPID,
        "projectname": "cunkou-douyin",
        "compileType": "game",
        "miniprogramRoot": "./",
        "setting": {
            "urlCheck": False,
            "es6": True,
            "enhance": True,
            "minified": False,
            "autoAudits": False,
        },
    }
    (DY_OUT / "project.config.json").write_text(
        json.dumps(project_cfg, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    (DY_OUT / "tt-shim.js").write_text(TT_SHIM_JS.replace("__APPID__", DOUYIN_APPID), encoding="utf-8")
    (DY_OUT / "check-version.js").write_text(CHECK_VERSION_JS, encoding="utf-8")
    (DY_OUT / "tt-unity-manager.js").write_text(TT_UNITY_MANAGER_JS, encoding="utf-8")
    (DY_OUT / "game.js").write_text(build_douyin_game_js(meta), encoding="utf-8")

    # 4. 将全部 JS 文件中的 ES2020+ 语法（?. / ?? / 类实例字段）降级为 ES2015/ES2017，兼容抖音服务端 tmacs (babylon) 上传编译
    downleveled_count = 0
    for js_file in sorted(DY_OUT.rglob("*.js")):
        orig = js_file.read_text(encoding="utf-8")
        fixed = downlevel_js_for_tmacs(orig)
        if fixed != orig:
            js_file.write_text(fixed, encoding="utf-8")
            downleveled_count += 1

    main_bytes = sum(
        p.stat().st_size for p in DY_OUT.rglob("*")
        if p.is_file() and "wasmcode" not in p.relative_to(DY_OUT).parts
    )
    wasm_bytes = sum(p.stat().st_size for p in dy_wasm_dir.rglob("*") if p.is_file())
    print(
        f"抖音包导出成功：{DY_OUT}\n"
        f"  AppID={DOUYIN_APPID} | 主包={main_bytes / 1048576:.2f} MB | wasmcode分包={wasm_bytes / 1048576:.2f} MB | "
        f"CDN首包={data_src.name} ({data_src.stat().st_size / 1048576:.2f} MB)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
