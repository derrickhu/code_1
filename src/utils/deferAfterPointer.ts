/**
 * 推迟到当前指针事件派发完成后再执行。
 * 避免 pointertap 内切场景/destroy 节点后，Pixi pointerup 仍遍历 pressTargets 报 null.scale。
 */
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';

let _rafId = 0;
const _queue: Array<() => void> = [];

export function deferAfterPointerEvent(fn: () => void): void {
  _queue.push(fn);
  if (_rafId !== 0) return;
  const flush = () => {
    _rafId = 0;
    const batch = _queue.splice(0);
    for (const run of batch) {
      try {
        run();
      } catch (err) {
        console.error('[deferAfterPointer]', err);
      }
    }
  };
  _rafId = -1;
  if (Platform.isMinigame && !Platform.isDevtools) {
    setTimeout(flush, 0);
    return;
  }
  if (Game.ticker?.started) {
    Game.ticker.addOnce(flush);
    return;
  }
  _rafId = requestAnimationFrame(flush);
}

/** 推迟到下一帧（场景 switchTo 后的 build 专用，避免与 Pixi 挂载同帧冲突）。 */
export function deferNextFrame(fn: () => void): void {
  const run = () => {
    try {
      fn();
    } catch (err) {
      console.error('[deferNextFrame]', err);
    }
  };
  // 真机 pointerup→setTimeout(switchTo) 后 ticker.addOnce 常不触发，build 永远不执行 → 黑屏
  if (Platform.isMinigame && !Platform.isDevtools) {
    setTimeout(run, 0);
    return;
  }
  if (Game.ticker?.started) {
    Game.ticker.addOnce(run);
    return;
  }
  requestAnimationFrame(run);
}
