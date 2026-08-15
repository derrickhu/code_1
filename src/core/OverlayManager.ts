/**
 * 全局弹窗覆盖层管理器
 *
 * 将弹窗面板（签到、任务、装修等）放在场景之上的全局层级，
 * 这样无论当前在哪个场景（合成棋盘 / 花店），弹窗都能正常显示。
 */
import * as PIXI from 'pixi.js';
import { Game } from './Game';
import { TweenManager } from './TweenManager';

class OverlayManagerClass {
  private _container: PIXI.Container | null = null;

  /** 获取全局覆盖层容器 */
  get container(): PIXI.Container {
    if (!this._container) {
      this._container = new PIXI.Container();
      this._container.sortableChildren = true;
      this._container.zIndex = 10000;
      Game.stage.addChild(this._container);
    }
    return this._container;
  }

  /** 确保覆盖层在最顶部 */
  bringToFront(): void {
    if (this._container && this._container.parent) {
      const parent = this._container.parent;
      parent.removeChild(this._container);
      parent.addChild(this._container);
    }
  }

  /**
   * 重置覆盖层容器的 transform（场景切换时调用）
   * 确保 position/scale/pivot/alpha 不会被之前场景的操作污染
   */
  resetTransform(): void {
    if (this._container) {
      this._container.position.set(0, 0);
      this._container.scale.set(1, 1);
      this._container.pivot.set(0, 0);
      this._container.alpha = 1;
      this._container.rotation = 0;
    }
  }

  /**
   * 立即关闭所有打开的面板（场景切换时调用）
   * 直接设 visible=false 并取消残留动画，不走 close() 的淡出流程
   */
  closeAllPanels(): void {
    if (!this._container) return;

    for (const child of this._container.children) {
      if (child.visible && typeof (child as any).close === 'function') {
        // 取消该面板及其子元素上的所有动画
        TweenManager.cancelTarget(child);
        for (const sub of (child as PIXI.Container).children || []) {
          TweenManager.cancelTarget(sub);
          if ((sub as any).scale) TweenManager.cancelTarget((sub as any).scale);
        }
        // 强制重置状态
        child.visible = false;
        child.alpha = 1;
        if (typeof (child as any)._isOpen !== 'undefined') {
          (child as any)._isOpen = false;
        }
      }
    }
  }
}

export const OverlayManager = new OverlayManagerClass();
