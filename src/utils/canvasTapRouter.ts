/**
 * 微信真机：tap 走 canvas touchstart/touchend + 设计坐标 hitTest（勿混 pointerdown，会覆盖 _active）。
 * 可选长按：按住达阈值且位移未超 slop 时触发 onLongPress，松手不再发 tap。
 */
import { Platform } from '@/core/PlatformService';
import { clientEventToDesign } from './clientEventToDesign';
import { containsDesignPoint, pickTopmostHit } from './hitTestDesign';
import { deferAfterPointerEvent } from './deferAfterPointer';
import { getTouchCanvas } from './touchCanvas';

const TAP_SLOP = 14;
const DEFAULT_LONG_PRESS_MS = 450;

interface TapBinding {
  target: import('pixi.js').Container;
  fn: () => void;
  guard?: () => boolean;
  blockTap?: () => boolean;
  /** 设计坐标额外过滤（如滚动列表视口外不响应） */
  pointGuard?: (dx: number, dy: number) => boolean;
  /** 为 true 时在 touchend 内同步执行（tt.addShortcut 等必须用户手势同步调用的 API） */
  sync?: boolean;
  onLongPress?: () => void;
  longPressMs?: number;
}

let _installed = false;
let _bindings: TapBinding[] = [];
let _active: { binding: TapBinding; x: number; y: number } | null = null;
let _holdTimer: ReturnType<typeof setTimeout> | null = null;
let _longPressed = false;

let _onStart: EventListener | null = null;
let _onMove: EventListener | null = null;
let _onEnd: EventListener | null = null;

function clearHoldTimer(): void {
  if (_holdTimer != null) {
    clearTimeout(_holdTimer);
    _holdTimer = null;
  }
}

function pickBinding(dx: number, dy: number): TapBinding | null {
  _bindings = _bindings.filter((b) => b.target.parent);
  // 禁用态也要参与 hitTest，否则会穿透点到下层按钮（抽卡结果页点「确定」误触底层十连）
  const hits = _bindings.filter((b) =>
    containsDesignPoint(b.target, dx, dy)
    && (!b.pointGuard || b.pointGuard(dx, dy)));
  if (!hits.length) return null;
  const top = pickTopmostHit(hits.map((b) => b.target), dx, dy);
  if (!top) return null;
  return hits.find((b) => b.target === top) ?? hits[hits.length - 1];
}

function armLongPress(binding: TapBinding): void {
  clearHoldTimer();
  if (!binding.onLongPress) return;
  const ms = binding.longPressMs ?? DEFAULT_LONG_PRESS_MS;
  _holdTimer = setTimeout(() => {
    _holdTimer = null;
    const act = _active;
    if (!act || act.binding !== binding) return;
    if (!binding.target.parent) return;
    if (binding.guard && !binding.guard()) return;
    if (binding.blockTap?.()) return;
    _longPressed = true;
    try {
      binding.onLongPress!();
    } catch (err) {
      console.error('[canvasTapRouter longPress]', err);
    }
  }, ms);
}

function ensureInstalled(): void {
  if (_installed || !Platform.isMinigame) return;
  const canvas = getTouchCanvas();
  if (!canvas?.addEventListener) return;

  _onStart = ((e: Event) => {
    clearHoldTimer();
    _longPressed = false;
    const p = clientEventToDesign(e);
    const binding = pickBinding(p.x, p.y);
    _active = binding ? { binding, x: p.x, y: p.y } : null;
    if (binding) armLongPress(binding);
  }) as EventListener;

  _onMove = ((e: Event) => {
    const act = _active;
    if (!act || _longPressed) return;
    const p = clientEventToDesign(e);
    const dx = p.x - act.x;
    const dy = p.y - act.y;
    if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) {
      clearHoldTimer();
    }
  }) as EventListener;

  _onEnd = ((e: Event) => {
    clearHoldTimer();
    const act = _active;
    const wasLong = _longPressed;
    _active = null;
    _longPressed = false;
    if (!act || wasLong) return;
    const b = act.binding;
    if (!b.target.parent) return;
    if (b.guard && !b.guard()) return;
    if (b.blockTap?.()) return;
    const p = clientEventToDesign(e);
    const dx = p.x - act.x;
    const dy = p.y - act.y;
    if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) return;
    if (!containsDesignPoint(b.target, p.x, p.y)) return;
    if (b.sync) {
      try { b.fn(); } catch (err) { console.error('[canvasTapRouter sync]', err); }
    } else {
      deferAfterPointerEvent(b.fn);
    }
  }) as EventListener;

  canvas.addEventListener('touchstart', _onStart, { passive: true });
  canvas.addEventListener('touchmove', _onMove, { passive: true });
  canvas.addEventListener('touchend', _onEnd);
  canvas.addEventListener('touchcancel', _onEnd);
  _installed = true;
}

export function registerCanvasTap(binding: TapBinding): () => void {
  ensureInstalled();
  _bindings.push(binding);
  return () => {
    const i = _bindings.indexOf(binding);
    if (i !== -1) _bindings.splice(i, 1);
  };
}
