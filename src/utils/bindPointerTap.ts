/**
 * 可点击绑定（见 @/minigame/index.ts 统一交互层）：
 * - 微信小游戏：canvasTapRouter（touchstart/touchend + 设计坐标 hitTest）
 * - 纯浏览器：pointerdown + pointerup
 * 可选 onLongPress：按住约 450ms 触发，松手不再走短按。
 */
import * as PIXI from 'pixi.js';
import { Platform } from '@/core/PlatformService';
import { playSfx } from '@/core/SfxPlayer';
import { registerCanvasTap } from './canvasTapRouter';
import { clientEventToDesign } from './clientEventToDesign';
import { deferAfterPointerEvent } from './deferAfterPointer';

const DEFAULT_LONG_PRESS_MS = 450;
const HOLD_SLOP = 14;

export function bindPointerTap(
  target: PIXI.Container,
  /** 参数是本次 tap 的设计坐标；只关心「点了」的调用方直接忽略即可。 */
  fn: (dx: number, dy: number) => void,
  opts?: {
    guard?: () => boolean;
    blockTap?: () => boolean;
    pointGuard?: (dx: number, dy: number) => boolean;
    sync?: boolean;
    /** 不播点击音（长按菜单、全屏挡板） */
    silent?: boolean;
    onLongPress?: () => void;
    longPressMs?: number;
  },
): void {
  let fired = false;
  const run = (dx: number, dy: number): void => {
    if (fired) return;
    if (opts?.guard && !opts.guard()) return;
    if (opts?.blockTap?.()) return;
    fired = true;
    if (opts?.sync) {
      try { fn(dx, dy); } catch (err) { console.error('[bindPointerTap sync]', err); }
      fired = false;
      return;
    }
    deferAfterPointerEvent(() => {
      fired = false;
      fn(dx, dy);
    });
  };

  if (Platform.isMinigame) {
    if (target.eventMode === 'none' || !target.eventMode) {
      target.eventMode = 'static';
    }
    registerCanvasTap({
      target,
      fn: run,
      guard: opts?.guard,
      blockTap: opts?.blockTap,
      pointGuard: opts?.pointGuard,
      sync: opts?.sync,
      silent: opts?.silent,
      onLongPress: opts?.onLongPress,
      longPressMs: opts?.longPressMs,
    });
    return;
  }

  target.eventMode = target.eventMode === 'none' ? 'static' : (target.eventMode || 'static');
  let armed = false;
  let longPressed = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;

  const clearHold = (): void => {
    if (holdTimer != null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  target.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
    armed = true;
    longPressed = false;
    clearHold();
    startX = e.global.x;
    startY = e.global.y;
    if (!opts?.onLongPress) return;
    const ms = opts.longPressMs ?? DEFAULT_LONG_PRESS_MS;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (!armed) return;
      if (opts.guard && !opts.guard()) return;
      if (opts.blockTap?.()) return;
      longPressed = true;
      try {
        opts.onLongPress!();
      } catch (err) {
        console.error('[bindPointerTap longPress]', err);
      }
    }, ms);
  });
  target.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
    if (!armed || longPressed || holdTimer == null) return;
    const dx = e.global.x - startX;
    const dy = e.global.y - startY;
    if (dx * dx + dy * dy > HOLD_SLOP * HOLD_SLOP) clearHold();
  });
  target.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
    clearHold();
    if (!armed) return;
    armed = false;
    if (longPressed) return;
    const p = e.nativeEvent ? clientEventToDesign(e.nativeEvent) : { x: e.global.x, y: e.global.y };
    if (!opts?.silent) playSfx('ui_tap', 40);
    run(p.x, p.y);
  });
  target.on('pointerupoutside', () => {
    clearHold();
    armed = false;
  });
  target.on('pointercancel', () => {
    clearHold();
    armed = false;
  });
}
