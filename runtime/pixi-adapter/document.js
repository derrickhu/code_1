/**
 * document 对象模拟
 */

const platform = require('./platform');
const Image = require('./Image');
const { Element } = require('./element');

const _eventListeners = {};

const body = new Element();
body.clientWidth = 0;
body.clientHeight = 0;

const documentElement = new Element();

const document = {
  body,
  documentElement,
  readyState: 'complete',

  createElement(tag) {
    tag = tag.toLowerCase();
    switch (tag) {
      case 'canvas':
        return platform.createCanvas();
      case 'img':
      case 'image':
        return platform.createImage();
      default:
        return new Element();
    }
  },

  createElementNS(_ns, tag) {
    return this.createElement(tag);
  },

  createTextNode() {
    return new Element();
  },

  getElementById() {
    return null;
  },

  getElementsByTagName(tag) {
    if (tag === 'canvas') {
      const { canvas } = require('./canvas');
      return [canvas];
    }
    return [];
  },

  querySelector() {
    return null;
  },

  querySelectorAll() {
    return [];
  },

  // PixiJS EventSystem 使用 elementFromPoint 来确定事件目标
  elementFromPoint() {
    const { canvas } = require('./canvas');
    return canvas;
  },

  addEventListener(type, handler) {
    if (!_eventListeners[type]) _eventListeners[type] = [];
    _eventListeners[type].push(handler);
  },

  removeEventListener(type, handler) {
    if (!_eventListeners[type]) return;
    const idx = _eventListeners[type].indexOf(handler);
    if (idx !== -1) _eventListeners[type].splice(idx, 1);
  },

  dispatchEvent(ev) {
    const queue = _eventListeners[ev.type];
    if (queue) queue.forEach(handler => handler(ev));
  },

  // PixiJS 会检查这些
  fonts: {
    add() {},
    delete() {},
    has() { return false; },
    forEach() {},
  },

  hidden: false,
  visibilityState: 'visible',
};

module.exports = document;
