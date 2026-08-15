/**
 * 全局游戏单例 - 持有 PIXI.Application 和核心引用
 *
 * direct-webgl 单 canvas 直上屏（对齐 game2D_huahua，已验证微信真机）。
 */
import * as PIXI from 'pixi.js';
import { TweenManager } from './TweenManager';
import { iosPlatform } from './webglContextPatch';
import { Platform, getNativePlatformApi } from './PlatformService';
import { UPDATE_PRIORITY } from '@pixi/ticker';

declare const GameGlobal: any;

/** 小游戏真机 WebGL 初始化选项（对齐 game2D_huahua） */
const RENDERER_OPTS = {
  backgroundColor: 0x1a1126,
  resolution: 1,
  antialias: true,
  preserveDrawingBuffer: true,
  preferWebGLVersion: 1,
};

class GameClass {
  app!: PIXI.Application;
  stage: PIXI.Container;
  ticker: PIXI.Ticker;

  designWidth = 750;
  designHeight = 1334;
  screenWidth = 375;
  screenHeight = 667;
  scale = 1;
  dpr = 1;

  /**
   * 顶栏以下内容起点（设计稿 Y）= 胶囊底边 + 间距。
   * 章节匾、列表顶等用这个；顶栏本身请用 safeHeaderCenterY。
   */
  safeTop = 0;
  /** 底部安全区内缩（Home Indicator 等），设计稿坐标 */
  safeBottom = 0;
  /**
   * 顶栏垂直中心（设计稿 Y）—— 与微信/抖音右上角「··· / 收起」胶囊垂直居中对齐。
   * 返回钮、标题匾、货币条中心都应对齐此值。
   */
  safeHeaderCenterY = 48;
  /** 胶囊左缘（设计稿）；右侧 UI 不得超过此值减间距 */
  safeCapsuleLeft = 750;
  safeCapsuleTop = 0;
  safeCapsuleBottom = 32;

  private _initialized = false;

  constructor() {
    this.stage = new PIXI.Container();
    this.ticker = new PIXI.Ticker();
  }

  init(canvas: any): void {
    if (this._initialized) return;

    const _api: any = getNativePlatformApi();
    const sysInfo = _api?.getSystemInfoSync?.();

    if (sysInfo) {
      this.screenWidth = sysInfo.screenWidth ?? this.screenWidth;
      this.screenHeight = sysInfo.screenHeight ?? this.screenHeight;
      this.dpr = sysInfo.pixelRatio || 2;
    }

    this._applySafeArea(_api, sysInfo);

    this.scale = this.screenWidth / this.designWidth * this.dpr;
    const realWidth = this.screenWidth * this.dpr;
    const realHeight = this.screenHeight * this.dpr;

    canvas.width = realWidth;
    canvas.height = realHeight;

    const tryCreateRuntime = (view: any): { app: PIXI.Application | null; renderer: PIXI.IRenderer | null } => {
      let r: PIXI.IRenderer | null = null;
      let a: PIXI.Application | null = null;
      try {
        a = new PIXI.Application({ view, width: realWidth, height: realHeight, ...RENDERER_OPTS } as any);
      } catch (e) {
        console.error('[Game] new PIXI.Application 失败:', e);
      }
      if (a?.stage && a?.ticker && a?.renderer) {
        return { app: a, renderer: a.renderer };
      }
      if (a?.renderer) r = a.renderer;
      if (!r) {
        try {
          r = new PIXI.Renderer({ view, width: realWidth, height: realHeight, ...RENDERER_OPTS } as any);
        } catch (e2) {
          console.error('[Game] new PIXI.Renderer 失败:', e2);
        }
      }
      if (!r) {
        try {
          r = PIXI.autoDetectRenderer({ view, width: realWidth, height: realHeight, ...RENDERER_OPTS } as any);
        } catch (e3) {
          console.error('[Game] autoDetectRenderer 失败:', e3);
        }
      }
      return { app: a, renderer: r };
    };

    const { app, renderer: initialRenderer } = tryCreateRuntime(canvas);
    let renderer = initialRenderer;

    if (app?.stage && app?.ticker && app?.renderer) {
      this.app = app;
      this.stage = app.stage;
      this.ticker = app.ticker;
      renderer = app.renderer;
    } else {
      if (app?.renderer) renderer = app.renderer;
      this.stage = new PIXI.Container();
      this.ticker = new PIXI.Ticker();
      this.ticker.start();
      if (renderer) {
        this.ticker.add(() => { renderer!.render(this.stage); });
      } else {
        console.error('[Game] 所有渲染器创建均失败，画面将无法渲染');
      }
      this.app = { stage: this.stage, ticker: this.ticker, renderer, view: canvas } as any;
    }

    if (!renderer) {
      try { (GameGlobal as any).__gameRendered = false; } catch (_) { /* */ }
      console.error('[Game] 渲染器不可用，终止初始化');
      return;
    }

    try { (GameGlobal as any).__gameRendered = true; } catch (_) { /* */ }

    this.stage.scale.set(this.scale, this.scale);
    this.stage.sortableChildren = true;
    this.ticker.add(() => {
      TweenManager.update(this.ticker.deltaMS / 1000);
    }, this, UPDATE_PRIORITY.HIGH);

    try {
      if (!this.ticker.started) this.ticker.start();
    } catch (e) {
      console.error('[Game] ticker.start 异常:', e);
    }

    try {
      const evtSys = (this.app.renderer as any).events;
      if (evtSys && evtSys.domElement) {
        const dom = evtSys.domElement;
        evtSys.mapPositionToPoint = (point: any, x: number, y: number) => {
          let rect: any;
          try { rect = dom.getBoundingClientRect(); } catch (_) { rect = null; }
          if (!rect || !rect.width || !rect.height) {
            rect = { left: 0, top: 0, width: this.screenWidth, height: this.screenHeight };
          }
          const resMul = 1.0 / (evtSys.resolution || 1);
          point.x = ((x - (rect.left || 0)) * (dom.width / rect.width)) * resMul;
          point.y = ((y - (rect.top || 0)) * (dom.height / rect.height)) * resMul;
        };
      }
    } catch (e) { console.warn('[Game] EventSystem patch 失败:', e); }

    this._initialized = true;
  }

  pointerEventToStageLocal(e: unknown): PIXI.Point {
    const ev = e as {
      clientX?: number; clientY?: number; x?: number; y?: number;
      touches?: { clientX?: number; clientY?: number }[];
      changedTouches?: { clientX?: number; clientY?: number }[];
    };
    const t0 = ev.changedTouches?.[0] ?? ev.touches?.[0];
    const cx = ev.clientX ?? t0?.clientX ?? ev.x ?? 0;
    const cy = ev.clientY ?? t0?.clientY ?? ev.y ?? 0;
    const rendererPoint = new PIXI.Point();
    const evtSys = (this.app.renderer as any)?.events;
    if (evtSys?.mapPositionToPoint) {
      evtSys.mapPositionToPoint(rendererPoint, cx, cy);
    } else {
      rendererPoint.x = cx * (this.designWidth / this.screenWidth);
      rendererPoint.y = cy * (this.designWidth / this.screenWidth);
    }
    return this.stage.toLocal(rendererPoint);
  }

  get logicWidth(): number {
    return this.designWidth;
  }

  get logicHeight(): number {
    return this.screenHeight / this.screenWidth * this.designWidth;
  }

  /**
   * 右侧可排版右缘（避开微信/抖音胶囊），设计稿 X。
   * @param pad 与胶囊左缘的间距
   */
  contentRightX(pad = 12): number {
    const capLeft = this.safeCapsuleLeft;
    // 未取到胶囊 left（仍为设计宽）时，保守按屏宽 68% 作为右缘，切勿贴到 750
    if (capLeft >= this.designWidth - 4) {
      return Math.round(this.designWidth * 0.68) - pad;
    }
    // 右缘 = 胶囊左缘左侧；上限勿超过屏宽
    return Math.min(this.designWidth - pad, capLeft - pad);
  }

  /**
   * 根据系统信息 / 胶囊按钮刷新安全区。
   * 顶栏中线对齐胶囊；内容从胶囊下方开始；底部纳入 Home Indicator。
   */
  private _applySafeArea(_api: any, sysInfo: any): void {
    const sw = this.screenWidth || 375;
    const sh = this.screenHeight || 667;
    const ratio = this.designWidth / sw;

    let capTopPx = 0;
    let capBottomPx = 0;
    let capLeftPx = sw;
    let capHeightPx = 32;

    try {
      const capsule = _api?.getMenuButtonBoundingClientRect?.();
      // 注意：不能用 capsule.top 真值判断（少数环境 top 可能为 0），以 height 为准
      if (capsule && typeof capsule.height === 'number' && capsule.height > 0) {
        capTopPx = Number(capsule.top) || 0;
        capHeightPx = capsule.height;
        capBottomPx = Number(capsule.bottom) > 0
          ? Number(capsule.bottom)
          : capTopPx + capHeightPx;
        if (typeof capsule.left === 'number' && capsule.left > 0) {
          capLeftPx = capsule.left;
        }
      }
    } catch (_) { /* */ }

    if (capBottomPx <= capTopPx) {
      const statusPx = Number(sysInfo?.statusBarHeight) > 0
        ? Number(sysInfo.statusBarHeight)
        : 20;
      // 无胶囊时：状态栏下模拟一颗标准胶囊
      capTopPx = statusPx + 6;
      capHeightPx = 32;
      capBottomPx = capTopPx + capHeightPx;
      capLeftPx = sw - 100;
    }

    // 极端兜底：仍贴顶则按常见刘海机预留
    if (capBottomPx < 24) {
      capTopPx = 44;
      capHeightPx = 32;
      capBottomPx = capTopPx + capHeightPx;
    }

    this.safeCapsuleTop = Math.round(capTopPx * ratio);
    this.safeCapsuleBottom = Math.round(capBottomPx * ratio);
    this.safeCapsuleLeft = Math.round(capLeftPx * ratio);
    this.safeHeaderCenterY = Math.round(((capTopPx + capBottomPx) / 2) * ratio);

    // 内容区从胶囊下方开始，再加一点呼吸间距
    const gapBelowCapsule = Math.round(10 * ratio);
    this.safeTop = this.safeCapsuleBottom + gapBelowCapsule;

    // 底部安全区（Home Indicator）
    let bottomInsetPx = 0;
    try {
      const sa = sysInfo?.safeArea;
      if (sa && typeof sa.bottom === 'number' && sh > 0) {
        bottomInsetPx = Math.max(0, sh - sa.bottom);
      } else if (typeof sysInfo?.safeAreaInsets?.bottom === 'number') {
        bottomInsetPx = Math.max(0, sysInfo.safeAreaInsets.bottom);
      }
    } catch (_) { /* */ }
    this.safeBottom = Math.round(bottomInsetPx * ratio);

    try {
      console.log(
        `[Game] safeArea headerCenter=${this.safeHeaderCenterY} top=${this.safeTop} `
        + `bottom=${this.safeBottom} capsule=${this.safeCapsuleTop}-${this.safeCapsuleBottom} `
        + `left=${this.safeCapsuleLeft} screen=${sw}x${sh}`,
      );
    } catch (_) { /* */ }
  }

  /**
   * 帧率上限（仅浏览器环境生效）。
   *
   * 小游戏真机上禁用：Pixi Ticker.maxFPS 的节流检查依赖
   * `rAF 时间戳` 与 `performance.now()` 同源，而微信 iOS 上两个时钟
   * 基准不一致（社区已知坑），`_lastFrame` 一旦被污染成未来值，
   * `delta` 恒为负 → ticker 永久静默（Tween/render 全停，点屏才有画面）。
   * game2D_huahua 从不设 maxFPS，同机型稳定 —— 与其对齐。
   */
  setMaxFPS(fps: number): void {
    if (Platform.isMinigame) return;
    try { this.ticker.maxFPS = fps; } catch (_) { /* */ }
  }

  /** 立即 render 上屏（不依赖 ticker 时序；换场景/拖动跟手时用） */
  syncFrameToScreen(): void {
    const renderer = this.app?.renderer;
    if (!renderer || !this.stage) return;
    renderer.render(this.stage);
  }

  /** iOS 真机：场景 build 后多帧 present，避免首帧空白 */
  async warmScenePresent(): Promise<void> {
    this.syncFrameToScreen();
    if (!Platform.isMinigame || Platform.isDevtools || !iosPlatform()) return;
    await this._waitPresentFrames(2);
    this.syncFrameToScreen();
  }

  private _waitPresentFrames(count: number): Promise<void> {
    return new Promise((resolve) => {
      let left = count;
      const tick = (): void => {
        left--;
        if (left <= 0) {
          try { this.ticker.remove(tick); } catch (_) { /* */ }
          resolve();
        }
      };
      if (this.ticker?.started) {
        this.ticker.add(tick);
        return;
      }
      let n = 0;
      const poll = (): void => {
        n++;
        if (n >= count) resolve();
        else setTimeout(poll, 16);
      };
      setTimeout(poll, 16);
    });
  }
}

const _global: any = typeof GameGlobal !== 'undefined' ? GameGlobal
  : typeof window !== 'undefined' ? window
  : typeof globalThis !== 'undefined' ? globalThis
  : {};

if (!_global.__gameInstance) {
  _global.__gameInstance = new GameClass();
}
export const Game: GameClass = _global.__gameInstance;
