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
const realTt = typeof tt !== 'undefined' ? tt : (typeof GameGlobal !== 'undefined' && GameGlobal.__tt ? GameGlobal.__tt : null);
if (typeof GameGlobal === 'undefined') {
  globalThis.GameGlobal = globalThis;
}
GameGlobal.__tt = realTt;

const nativeWasm = typeof TTWebAssembly !== 'undefined'
  ? TTWebAssembly
  : (typeof WebAssembly !== 'undefined' ? WebAssembly : undefined);
GameGlobal.WXWebAssembly = nativeWasm;
GameGlobal.WebAssembly = nativeWasm;

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
  createWebAudioContext() {
    if (realTt && typeof realTt.createWebAudioContext === 'function') {
      try { return realTt.createWebAudioContext(); } catch (e) {}
    }
    const Ctx = typeof AudioContext !== 'undefined'
      ? AudioContext
      : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    return Ctx ? new Ctx() : null;
  },
};

if (realTt) {
  const wxShim = new Proxy(realTt, {
    get(target, prop) {
      if (prop === 'env') return fallbacks.env;
      if (prop in target && target[prop] !== undefined) {
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      }
      if (prop in fallbacks) {
        return fallbacks[prop];
      }
      return undefined;
    },
  });
  GameGlobal.wx = wxShim;
  globalThis.wx = wxShim;
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

    const bgImg = this.config.loadingPageConfig?.materialConfig?.backgroundImage || 'images/background.jpg';
    const ctxType = this.config.contextConfig?.contextType || 1;
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
      wx.loadSubpackage({
        name: 'wasmcode',
        success: () => resolve(),
        fail: (err) => {
          console.warn('[DouyinBoot] loadSubpackage wasmcode fallback:', err);
          resolve();
        },
      });
    });
  }

  _loadDataPackage() {
    const md5 = this.config.DATA_FILE_MD5;
    const gameName = this.config.GAME_NAME || 'webgl';
    const fileName = `${md5}.${gameName}.data.unityweb.bin.txt`;
    const subPrefix = GameGlobal.unityNamespace?.dataFileSubPrefix || '';
    const prefix = subPrefix ? `${subPrefix.replace(/^\\/+|\\/+$/g, '')}/` : '';
    const cdnUrl = `${String(this.config.DATA_CDN || '').replace(/\\/$/, '')}/${prefix}${fileName}`;
    const cacheFile = `${this.PLUGIN_CACHE_PATH}/${fileName}`;
    const fs = getFs();

    // 命中本地缓存直接读盘（并清理旧 MD5 首包文件释放空间）
    if (fs) {
      try {
        fs.accessSync(cacheFile);
        return new Promise((resolve, reject) => {
          fs.readFile({
            filePath: cacheFile,
            success: (res) => {
              if (this._splash) this._splash.setProgress(0.75);
              resolve(new Uint8Array(toArrayBuffer(res.data)));
            },
            fail: () => {
              this._downloadDataPackage(cdnUrl, cacheFile, fileName, fs).then(resolve, reject);
            },
          });
        });
      } catch (e) {}
    }

    return this._downloadDataPackage(cdnUrl, cacheFile, fileName, fs);
  }

  _downloadDataPackage(cdnUrl, cacheFile, currentName, fs) {
    if (fs) {
      try {
        const files = fs.readdirSync(this.PLUGIN_CACHE_PATH) || [];
        files.forEach((f) => {
          if (f !== currentName && f.endsWith('.data.unityweb.bin.txt')) {
            try { fs.unlinkSync(`${this.PLUGIN_CACHE_PATH}/${f}`); } catch (e2) {}
          }
        });
      } catch (e) {}
    }

    return new Promise((resolve, reject) => {
      const task = wx.downloadFile({
        url: cdnUrl,
        success: (res) => {
          if (Number(res.statusCode || 200) !== 200 || !res.tempFilePath) {
            reject(new Error('首包下载失败 HTTP ' + res.statusCode));
            return;
          }
          let readTarget = res.tempFilePath;
          if (fs) {
            try {
              ensureDirSync(fs, this.PLUGIN_CACHE_PATH);
              fs.copyFileSync(res.tempFilePath, cacheFile);
              readTarget = cacheFile;
            } catch (e) {}
            fs.readFile({
              filePath: readTarget,
              success: (rf) => resolve(new Uint8Array(toArrayBuffer(rf.data))),
              fail: (err) => reject(new Error((err && err.errMsg) || '读取首包失败')),
            });
          } else {
            reject(new Error('FileSystemManager 不可用'));
          }
        },
        fail: (err) => reject(new Error((err && err.errMsg) || '下载首包网络异常')),
      });
      if (task && typeof task.onProgressUpdate === 'function') {
        task.onProgressUpdate((p) => {
          const ratio = p.totalBytesExpectedToWrite > 0
            ? (p.totalBytesWritten / p.totalBytesExpectedToWrite)
            : 0.3;
          if (this._splash) this._splash.setProgress(0.12 + ratio * 0.65);
        });
      }
    });
  }

  startGame() {
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
          const WasmHost = typeof TTWebAssembly !== 'undefined' ? TTWebAssembly : GameGlobal.WXWebAssembly;
          const tryInstantiate = (p) => WasmHost.instantiate(p, imports);
          tryInstantiate(wasmRelPath)
            .catch(() => tryInstantiate('/' + wasmRelPath))
            .then((res) => {
              const inst = (res && res.instance) ? res.instance : res;
              const mod = res && res.module;
              // 先释放临时封面占用的 GL 句柄，再交由引擎接管同一个 WebGL 上下文
              this.hideLoadingPage();
              successCallback(inst, mod);
            })
            .catch((err) => {
              console.error('[DouyinBoot] TTWebAssembly.instantiate failed:', err);
              if (this.onLogError) this.onLogError(err);
            });
          return {};
        },
      };

      Module.preRun.push(() => {
        try {
          parseAndMountWebData(Module, dataBytes);
          this._emitProgress(launchEventType.readAssets);
        } catch (err) {
          console.error('[DouyinBoot] mount data failed:', err);
          if (this.onLogError) this.onLogError(err);
        }
        if (typeof Module.removeRunDependency === 'function') {
          Module.removeRunDependency('wasm-preloadAssets');
        }
      });

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
      bootFn(Module);
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
