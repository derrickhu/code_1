/**
 * 村口大战外星人 · 游戏入口
 *
 * 进来先落村子：选人、废品站、开打。战场里不再连选三轮。
 */
import '@/core/pixiUnsafeEvalPatch';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { BattleScene } from '@/scenes/BattleScene';
import { VillageScene } from '@/scenes/VillageScene';

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

  SceneManager.register(new VillageScene());
  SceneManager.register(new BattleScene());
  SceneManager.switchTo('village');

  await Game.warmScenePresent();
  // game.js 的启动超时诊断靠这个标记判断是否真的画出来了
  if (typeof GameGlobal !== 'undefined') GameGlobal.__gameRendered = true;
}

main().catch((e) => {
  console.error('[main] 启动失败:', e);
});
