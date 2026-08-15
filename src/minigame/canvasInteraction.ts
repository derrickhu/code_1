/**
 * 微信小游戏统一 canvas 交互
 *
 * 拖拽事件链（小游戏必须成对，勿混 touchstart + pointerup）：
 *   touchstart → touchmove → touchend   （与 ScrollList / canvasTapRouter 一致）
 * 浏览器 / huahua 单 canvas：
 *   容器 pointerdown → canvas pointermove → pointerup
 */
import * as PIXI from 'pixi.js';
import { Platform } from '@/core/PlatformService';
import { designEventToLocal } from '@/utils/clientEventToDesign';
import { getTouchCanvas, type TouchCanvasLike } from '@/utils/touchCanvas';

export interface CanvasDragOptions {
  container: PIXI.Container;
  width: number;
  height: number;
  canStart: () => boolean;
  isDragging: () => boolean;
  onDown: (localX: number, localY: number) => void;
  onMove: (localX: number, localY: number) => void;
  onUp: () => void;
}

export interface CanvasDragHandle {
  destroy(): void;
}

export interface CanvasPointerMoveOptions {
  onMove: (e: unknown) => void;
  onUp: (e?: unknown) => void;
  onDown?: (e: unknown) => void;
}

export interface CanvasPointerMoveHandle {
  destroy(): void;
}

const useMinigameTouch = (): boolean => Platform.isMinigame && !Platform.isDevtools;

function attachCanvasMoveUp(
  canvas: TouchCanvasLike,
  opts: CanvasPointerMoveOptions,
): () => void {
  const onDown = opts.onDown
    ? (((e: Event) => opts.onDown!(e)) as EventListener)
    : null;
  const onMove = ((e: Event) => {
    (e as { preventDefault?: () => void }).preventDefault?.();
    opts.onMove(e);
  }) as EventListener;
  const onUp = ((e: Event) => opts.onUp(e)) as EventListener;

  if (useMinigameTouch()) {
    if (onDown) canvas.addEventListener('touchstart', onDown, { passive: true });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      if (onDown) canvas.removeEventListener('touchstart', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }

  if (onDown) canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  return () => {
    if (onDown) canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
  };
}

export function bindCanvasDrag(opts: CanvasDragOptions): CanvasDragHandle {
  const {
    container, width, height,
  } = opts;
  let armed = false;
  const canvas = getTouchCanvas();
  const touchMode = useMinigameTouch();

  const tryDown = (localX: number, localY: number): boolean => {
    if (armed || opts.isDragging()) return false;
    if (!opts.canStart()) return false;
    if (localX < 0 || localY < 0 || localX > width || localY > height) return false;
    armed = true;
    opts.onDown(localX, localY);
    return true;
  };

  const release = (): void => {
    armed = false;
    if (opts.isDragging()) opts.onUp();
  };

  const handleMove = (e: unknown): void => {
    if (!opts.isDragging()) return;
    const p = designEventToLocal(container, e);
    opts.onMove(p.x, p.y);
  };

  const onCanvasDown = ((e: Event) => {
    const p = designEventToLocal(container, e);
    tryDown(p.x, p.y);
  }) as EventListener;

  const onPixiDown = (e: PIXI.FederatedPointerEvent) => {
    const p = container.toLocal(e.global);
    tryDown(p.x, p.y);
  };

  let detachMoveUp: (() => void) | null = null;

  if (touchMode) {
    container.eventMode = 'none';
    canvas.addEventListener('touchstart', onCanvasDown, { passive: true });
    detachMoveUp = attachCanvasMoveUp(canvas, {
      onMove: handleMove,
      onUp: release,
    });
  } else {
    container.eventMode = 'static';
    container.hitArea = new PIXI.Rectangle(0, 0, width, height);
    container.interactiveChildren = false;
    container.on('pointerdown', onPixiDown);
    detachMoveUp = attachCanvasMoveUp(canvas, {
      onMove: handleMove,
      onUp: release,
    });
  }

  return {
    destroy() {
      if (touchMode) {
        canvas.removeEventListener('touchstart', onCanvasDown);
      } else if (container && !container.destroyed) {
        container.off('pointerdown', onPixiDown);
      }
      detachMoveUp?.();
      armed = false;
    },
  };
}

export function bindCanvasPointerMove(opts: CanvasPointerMoveOptions): CanvasPointerMoveHandle {
  const canvas = getTouchCanvas();
  const detach = attachCanvasMoveUp(canvas, opts);
  return { destroy: detach };
}
