/**
 * 触摸事件适配（对齐 game2D_huahua）
 * wx touch → canvas touch/pointer + window pointer（Pixi EventSystem 依赖后者收 move/up）
 */

const platform = require('./platform');
const { canvas } = require('./canvas');

class TouchEvent {
  constructor(type, touches) {
    this.type = type;
    this.target = canvas;
    this.currentTarget = canvas;
    this.touches = touches || [];
    this.changedTouches = touches || [];
    this.targetTouches = touches || [];
    this.timeStamp = Date.now();
    this.bubbles = true;
    this.cancelable = true;
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {}
}

function convertTouches(rawTouches) {
  if (!rawTouches) return [];
  return Array.prototype.map.call(rawTouches, (touch) => ({
    identifier: touch.identifier,
    clientX: touch.clientX,
    clientY: touch.clientY,
    pageX: touch.clientX,
    pageY: touch.clientY,
    screenX: touch.clientX,
    screenY: touch.clientY,
    target: canvas,
  }));
}

function createPointerEvent(type, touch, buttons) {
  return {
    type: type,
    pointerId: touch.identifier || 0,
    pointerType: 'touch',
    clientX: touch.clientX,
    clientY: touch.clientY,
    pageX: touch.clientX,
    pageY: touch.clientY,
    screenX: touch.clientX,
    screenY: touch.clientY,
    x: touch.clientX,
    y: touch.clientY,
    offsetX: touch.clientX,
    offsetY: touch.clientY,
    movementX: 0,
    movementY: 0,
    width: 1,
    height: 1,
    pressure: buttons ? 0.5 : 0,
    button: 0,
    buttons: buttons,
    isPrimary: true,
    target: canvas,
    currentTarget: canvas,
    timeStamp: Date.now(),
    bubbles: true,
    cancelable: true,
    preventDefault: function() {},
    stopPropagation: function() {},
    stopImmediatePropagation: function() {},
  };
}

function registerTouchEvents() {
  const _listeners = {};

  canvas.addEventListener = function(type, handler, options) {
    if (!_listeners[type]) _listeners[type] = [];
    _listeners[type].push(handler);
  };

  canvas.removeEventListener = function(type, handler) {
    if (!_listeners[type]) return;
    const idx = _listeners[type].indexOf(handler);
    if (idx !== -1) _listeners[type].splice(idx, 1);
  };

  function dispatch(type, rawEvent) {
    const touches = convertTouches(rawEvent.touches || rawEvent.changedTouches);
    const event = new TouchEvent(type, touches);
    event.changedTouches = convertTouches(rawEvent.changedTouches);

    const queue = _listeners[type];
    if (queue) {
      queue.forEach(function(handler) {
        try { handler(event); } catch (e) { console.error('[TouchEvent]', type, e); }
      });
    }
  }

  function dispatchPointer(pointerType, rawEvent) {
    const touches = rawEvent.changedTouches || rawEvent.touches || [];
    if (!touches.length) return;
    const touch = touches[0];

    const pointerEvent = createPointerEvent(
      pointerType,
      touch,
      pointerType === 'pointerup' || pointerType === 'pointercancel' ? 0 : 1,
    );

    const queue = _listeners[pointerType];
    if (queue) {
      queue.forEach(function(handler) {
        try { handler(pointerEvent); } catch (e) { console.error('[PointerEvent]', pointerType, e); }
      });
    }
  }

  function dispatchToWindow(type, event) {
    if (typeof GameGlobal !== 'undefined' && GameGlobal.__windowDispatchEvent) {
      try {
        GameGlobal.__windowDispatchEvent(type, event);
      } catch (e) {
        console.error('[TouchEvent] dispatchToWindow failed:', type, e);
      }
    }
  }

  platform.onTouchStart(function(e) {
    dispatch('touchstart', e);
    dispatchPointer('pointerdown', e);
    var touches = e.changedTouches || e.touches || [];
    if (touches.length) {
      dispatchToWindow('pointerdown', createPointerEvent('pointerdown', touches[0], 1));
    }
  });

  platform.onTouchMove(function(e) {
    dispatch('touchmove', e);
    dispatchPointer('pointermove', e);
    var touches = e.changedTouches || e.touches || [];
    if (touches.length) {
      dispatchToWindow('pointermove', createPointerEvent('pointermove', touches[0], 1));
    }
  });

  platform.onTouchEnd(function(e) {
    dispatch('touchend', e);
    dispatchPointer('pointerup', e);
    var touches = e.changedTouches || [];
    if (touches.length) {
      dispatchToWindow('pointerup', createPointerEvent('pointerup', touches[0], 0));
    }
  });

  platform.onTouchCancel(function(e) {
    dispatch('touchcancel', e);
    dispatchPointer('pointercancel', e);
    var touches = e.changedTouches || [];
    if (touches.length) {
      dispatchToWindow('pointercancel', createPointerEvent('pointercancel', touches[0], 0));
    }
  });

  var sysInfo = platform.getSystemInfoSync();
  var screenW = sysInfo.screenWidth || sysInfo.windowWidth || 375;
  var screenH = sysInfo.screenHeight || sysInfo.windowHeight || 667;

  try {
    canvas.getBoundingClientRect = function() {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        width: screenW,
        height: screenH,
        right: screenW,
        bottom: screenH,
      };
    };
  } catch (e) {}

  try {
    Object.defineProperty(canvas, 'clientWidth', { get: function() { return screenW; }, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { get: function() { return screenH; }, configurable: true });
  } catch (e) {}

  try {
    if (!canvas.style) canvas.style = {};
    canvas.style.touchAction = '';
    canvas.style.msTouchAction = '';
    canvas.style.cursor = '';
    canvas.style.width = screenW + 'px';
    canvas.style.height = screenH + 'px';
  } catch (e) {}

  if (!canvas.focus) canvas.focus = function() {};

  var _parentListeners = {};
  var fakeParent = {
    addEventListener: function(type, handler, options) {
      if (!_parentListeners[type]) _parentListeners[type] = [];
      _parentListeners[type].push(handler);
    },
    removeEventListener: function(type, handler) {
      if (!_parentListeners[type]) return;
      var idx = _parentListeners[type].indexOf(handler);
      if (idx !== -1) _parentListeners[type].splice(idx, 1);
    },
  };
  try { canvas.parentElement = fakeParent; } catch (e) {
    try { Object.defineProperty(canvas, 'parentElement', { value: fakeParent, configurable: true, writable: true }); } catch (e2) {}
  }
  try { canvas.parentNode = fakeParent; } catch (e) {
    try { Object.defineProperty(canvas, 'parentNode', { value: fakeParent, configurable: true, writable: true }); } catch (e2) {}
  }

}

module.exports = { TouchEvent, registerTouchEvents };
