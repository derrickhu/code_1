/**
 * 村口大战外星人 · 游戏入口
 *
 * 先出标准 Loading（插画 + 进度条 + 健康游戏忠告），资源就绪再落村子。
 */
import '@/core/pixiUnsafeEvalPatch';
import { analytics, initAnalytics, setAnalyticsUserId } from '@/analytics';
import { BASE_GAME_KEY } from '@/config/gameKeyScope';
import { BackendService } from '@/core/BackendService';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import {
  LOADING_SPLASH,
  preloadPaths,
  villageArtPaths,
} from '@/core/TextureLoader';
import { OverlayManager } from '@/core/OverlayManager';
import { BgmPlayer } from '@/core/BgmPlayer';
import { GMManager } from '@/core/GMManager';
import { BattleScene } from '@/scenes/BattleScene';
import { VillageScene } from '@/scenes/VillageScene';
import { LoadingScreenOverlay } from '@/ui/LoadingScreenOverlay';
import { GMEntryButton } from '@/ui/GMEntryButton';
import { GMPanel } from '@/ui/GMPanel';

declare const GameGlobal: any;

const MIN_LOADING_MS = 900;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

initAnalytics();

if (typeof GameGlobal !== 'undefined') {
  const prevError = GameGlobal.onError;
  const prevReject = GameGlobal.onUnhandledRejection;
  GameGlobal.onError = (msg: string) => {
    console.error('[GlobalError]', msg);
    try { prevError?.(msg); } catch { /* */ }
    analytics.trackAppError(msg, { source: 'GameGlobal.onError' });
  };
  GameGlobal.onUnhandledRejection = (ev: { reason?: unknown }) => {
    console.error('[UnhandledRejection]', ev?.reason || ev);
    try { prevReject?.(ev); } catch { /* */ }
    analytics.trackAppError(ev?.reason || ev, { source: 'unhandledRejection' });
  };
}

async function bootBackend(): Promise<string> {
  if (!BackendService.available) return '';
  try {
    await BackendService.ensureToken();
    return BackendService.userId;
  } catch (error) {
    console.warn('[main] 后端登录失败（不挡玩）', error);
    return '';
  }
}

async function main(): Promise<void> {
  const canvas = GameGlobal?.canvas ?? null;
  if (!canvas) {
    console.error('[main] 找不到 canvas');
    return;
  }

  Game.init(canvas);
  if (!Game.app?.renderer) {
    console.error('[main] 渲染器初始化失败');
    return;
  }

  console.log(`[main] 启动 平台=${Platform.name} gameKey=${BASE_GAME_KEY} 版本=${__APP_VERSION__}`);
  const userIdP = bootBackend();

  Game.stage.sortableChildren = true;
  const loading = new LoadingScreenOverlay();
  Game.stage.addChild(loading);
  Game.syncFrameToScreen();
  const shownAt = Date.now();

  await preloadPaths([LOADING_SPLASH]);
  loading.applySplashTexture();
  loading.setProgress(0.12);
  Game.syncFrameToScreen();

  await preloadPaths(villageArtPaths(), (loaded, total) => {
    const ratio = total > 0 ? loaded / total : 1;
    loading.setProgress(0.12 + ratio * 0.78);
  });
  loading.setProgress(0.92);

  SceneManager.register(new VillageScene());
  SceneManager.register(new BattleScene());
  SceneManager.switchTo('village');

  if (GMManager.isRuntimeAllowed) {
    OverlayManager.container.addChild(new GMPanel());
    OverlayManager.container.addChild(new GMEntryButton());
  }

  await Game.warmScenePresent();
  loading.setProgress(1);
  Game.syncFrameToScreen();

  const wait = MIN_LOADING_MS - (Date.now() - shownAt);
  if (wait > 0) await sleep(wait);

  Game.stage.removeChild(loading);
  loading.destroy({ children: true });
  Game.syncFrameToScreen();

  // game.js 的启动超时诊断靠这个标记判断是否真的画出来了
  if (typeof GameGlobal !== 'undefined') GameGlobal.__gameRendered = true;

  const userId = await userIdP;
  if (userId) {
    setAnalyticsUserId(userId);
  } else {
    console.warn('[main] 未拿到登录 userId，经分仅以 anonymous_id 上报');
  }
  analytics.trackSessionStart({
    entry: 'main_boot',
    with_user_id: !!userId,
  });

  let lastHideAt = 0;
  Platform.onHide(() => {
    BgmPlayer.pause();
    analytics.trackSessionEnd('app-hide');
    lastHideAt = Date.now();
  });
  Platform.onShow(() => {
    BgmPlayer.resume();
    if (lastHideAt > 0) {
      analytics.trackAppShow({
        background_ms: Date.now() - lastHideAt,
      });
    }
  });
}

main().catch((e) => {
  console.error('[main] 启动失败:', e);
});
