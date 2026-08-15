/**
 * 微信双 canvas：TouchEvent 桥接挂在 GameGlobal.canvas（pixi-primary）。
 */
import { Game } from '@/core/Game';

declare const GameGlobal: { canvas?: TouchCanvasLike } | undefined;

export type TouchCanvasLike = {
  addEventListener: (type: string, handler: EventListener, options?: boolean | AddEventListenerOptions) => void;
  removeEventListener: (type: string, handler: EventListener, options?: boolean | AddEventListenerOptions) => void;
};

export function getTouchCanvas(): TouchCanvasLike {
  const bridged = GameGlobal?.canvas;
  if (bridged && typeof bridged.addEventListener === 'function') {
    return bridged;
  }
  return Game.app.view as unknown as TouchCanvasLike;
}
