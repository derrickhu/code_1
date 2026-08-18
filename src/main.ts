/**
 * 村口大战外星人 · 游戏入口
 *
 * 第一版刻意只做一件事：进来就能打。没有登录、没有云同步、没有 Loading 页、
 * 没有编队前置页 —— 「十秒可懂」是直玩投放的硬门槛（docs/00-体验目标.md §3），
 * 开场每多一层，投放素材里能展示的游戏本体就少一层。
 */
import '@/core/pixiUnsafeEvalPatch';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { BattleScene } from '@/scenes/BattleScene';

declare const GameGlobal: any;

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

  console.log(`[main] 启动 平台=${Platform.name} 版本=${__APP_VERSION__}`);

  SceneManager.register(new BattleScene());
  SceneManager.switchTo('battle');

  await Game.warmScenePresent();
  // game.js 的启动超时诊断靠这个标记判断是否真的画出来了
  if (typeof GameGlobal !== 'undefined') GameGlobal.__gameRendered = true;
}

main().catch((e) => {
  console.error('[main] 启动失败:', e);
});
