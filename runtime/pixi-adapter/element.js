/**
 * DOM 元素模拟
 * 业界已知坑：HTMLCanvasElement / HTMLImageElement 必须用 constructor 直接赋值
 * 不能用 class extends，否则 instanceof 校验会失败
 */

const platform = require('./platform');

class Element {
  constructor() {
    this.childNodes = [];
    this.style = { cursor: null };
    this.clientWidth = 0;
    this.clientHeight = 0;
    this._listeners = {};
  }
  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    return child;
  }
  addEventListener(type, handler) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(handler);
  }
  removeEventListener(type, handler) {
    if (!this._listeners[type]) return;
    const idx = this._listeners[type].indexOf(handler);
    if (idx !== -1) this._listeners[type].splice(idx, 1);
  }
  insertBefore() {}
  replaceChild() {}
  cloneNode() { return new Element(); }
  setAttribute() {}
  getAttribute() { return null; }
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 };
  }
}

// 通过 constructor 直接赋值（非 extends），确保 instanceof 正确
// 鸿蒙等部分设备 createCanvas/createImage 返回对象可能无 constructor，需容错
let HTMLCanvasElement, HTMLImageElement;
try {
  const _tmpCanvas = platform.createCanvas();
  HTMLCanvasElement = (_tmpCanvas && _tmpCanvas.constructor) ? _tmpCanvas.constructor : Element;
} catch (e) {
  console.warn('[element] HTMLCanvasElement 获取失败，回退到 Element:', e);
  HTMLCanvasElement = Element;
}
try {
  const _tmpImage = platform.createImage();
  HTMLImageElement = (_tmpImage && _tmpImage.constructor) ? _tmpImage.constructor : Element;
} catch (e) {
  console.warn('[element] HTMLImageElement 获取失败，回退到 Element:', e);
  HTMLImageElement = Element;
}

class HTMLVideoElement extends Element {}

module.exports = {
  Element,
  HTMLCanvasElement,
  HTMLImageElement,
  HTMLVideoElement,
};
