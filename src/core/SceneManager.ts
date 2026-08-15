/**
 * 场景管理器 - 管理场景切换
 */
import * as PIXI from 'pixi.js';
import { Game } from './Game';
import { TweenManager, Ease } from './TweenManager';
import { OverlayManager } from './OverlayManager';
import { Platform } from './PlatformService';

export interface Scene {
  readonly name: string;
  readonly container: PIXI.Container;
  onEnter?(data?: unknown): void;
  onExit?(): void;
  update?(dt: number): void;
  /**
   * 若场景支持「暂存切出」（如灵宠图鉴进详情不销毁），
   * 在切到无关场景时由 SceneManager 调用以释放内存。
   */
  discardParked?: () => void;
}

class SceneManagerClass {
  private _scenes: Map<string, Scene> = new Map();
  private _currentScene: Scene | null = null;
  /** 每帧驱动 current.update(dt) 的 ticker 是否已挂载（懒挂载，避免 Game 未初始化） */
  private _tickerInstalled = false;

  register(scene: Scene): void {
    this._scenes.set(scene.name, scene);
  }

  /** 懒挂载：首次切场景时把「驱动当前场景 update」接到全局 ticker。 */
  private _ensureTicker(): void {
    if (this._tickerInstalled) return;
    Game.ticker.add(() => {
      const dt = Game.ticker.deltaMS / 1000;
      this._currentScene?.update?.(dt);
    });
    this._tickerInstalled = true;
  }

  /** 统一进场转场：iOS 真机跳过 alpha=0；devtools 保留淡入以便调试 */
  private _playEnterTransition(scene: Scene): void {
    const c = scene.container;
    TweenManager.cancelTarget(c);
    const instant = Platform.isMinigame && !Platform.isDevtools;
    if (instant) {
      c.alpha = 1;
      c.y = 0;
      return;
    }
    c.alpha = 0;
    c.y = 24;
    TweenManager.to({ target: c, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
    TweenManager.to({ target: c, props: { y: 0 }, duration: 0.28, ease: Ease.easeOutCubic });
  }

  switchTo(name: string, data?: unknown): void {
    const nextScene = this._scenes.get(name);
    if (!nextScene) {
      console.error(`[SceneManager] 场景 "${name}" 未注册`);
      return;
    }

    if (!Game.stage) {
      console.error('[SceneManager] Game.stage 未初始化，无法切换场景。'
        + ' 请检查 Game.init() 是否在 switchTo() 之前被调用且执行成功。');
      return;
    }

    // 退出当前场景
    if (this._currentScene) {
      TweenManager.cancelTarget(this._currentScene.container);
      this._currentScene.onExit?.();
      Game.stage.removeChild(this._currentScene.container);
    }

    // 安全重置：确保 stage.pivot 归零（防止残留偏移）
    Game.stage.pivot.set(0, 0);

    // 关闭所有弹窗面板，重置覆盖层 transform（防止场景切换时面板状态残留）
    this._closeAndResetOverlay();

    // 取消新场景容器上可能存在的旧 tween
    TweenManager.cancelTarget(nextScene.container);

    // 场景 container 为单例复用；切出时勿长期 mute 根节点，否则返回后子按钮全部失效
    const root = nextScene.container;
    root.interactiveChildren = true;
    root.eventMode = 'passive';

    // 进入新场景
    this._ensureTicker();
    this._currentScene = nextScene;
    Game.stage.addChild(nextScene.container);
    nextScene.onEnter?.(data);
    this._playEnterTransition(nextScene);

    // 确保全局覆盖层（弹窗面板）始终在场景之上
    this._bringOverlayToFront();

    void Game.warmScenePresent();
  }

  get current(): Scene | null {
    return this._currentScene;
  }

  /** 将 OverlayManager 的容器提升到 stage 最顶部 */
  private _bringOverlayToFront(): void {
    try {
      OverlayManager.bringToFront();
    } catch (e) {
      console.warn('[SceneManager] bringToFront 失败:', e);
    }
  }

  /** 关闭所有弹窗并重置覆盖层 transform */
  private _closeAndResetOverlay(): void {
    try {
      OverlayManager.closeAllPanels();
      OverlayManager.resetTransform();
    } catch (e) {
      console.warn('[SceneManager] closeAndResetOverlay 失败:', e);
    }
  }
}

export const SceneManager = new SceneManagerClass();
