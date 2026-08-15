/**
 * 微信小游戏统一适配入口
 *
 * 交互分层（详见 canvasInteraction.ts 顶部注释）：
 * - 点击 → bindPointerTap / canvasTapRouter
 * - 拖拽 → bindCanvasDrag
 * - 坐标 → clientEventToDesign
 * - 上屏 → Game.syncFrameToScreen / warmScenePresent
 * - 触摸桥 → minigame/pixi-adapter/TouchEvent.js
 */
export {
  bindCanvasDrag,
  bindCanvasPointerMove,
  type CanvasDragHandle,
  type CanvasDragOptions,
  type CanvasPointerMoveHandle,
  type CanvasPointerMoveOptions,
} from './canvasInteraction';

export { bindPointerTap } from '@/utils/bindPointerTap';
export { registerCanvasTap } from '@/utils/canvasTapRouter';
export { clientEventToDesign, designEventToLocal } from '@/utils/clientEventToDesign';
