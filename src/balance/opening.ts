/**
 * 冷启动的前两分钟。1-1、1-2 先把路走顺，赢下 1-3 才进村口。
 *
 * stageTop 从 1 起，赢下第 3 关变成 4。摊、喊人、手艺在这之前点不开。
 * 1-4、1-5 打不过可以回来打弹子、升手艺，不必卡在三个人手艺 1 上。
 */

export type WinFooter = 'push' | 'home' | 'next';

export function villageGateOpen(stageTop: number): boolean {
  return stageTop > 3;
}

export type CraftStep = 'stall' | 'craft' | 'done';

/**
 * 1-5 还没过、人都是手艺 1 时，下一手去哪。
 * 第一档手艺要 2 个零件，零件只从摊上的破电视来。
 */
export function chapter1CraftStep(
  stageTop: number,
  stage5Cleared: boolean,
  maxCraft: number,
  parts: number,
  partsNeed = 2,
): CraftStep {
  if (!villageGateOpen(stageTop) || stage5Cleared || maxCraft > 1) return 'done';
  return parts >= partsNeed ? 'craft' : 'stall';
}

/**
 * 赢了之后底下那颗大按钮。
 * 1-1 到 1-4 只往下推，1-5 回村，第 2 章起下一关为主。
 */
export function winFooter(chapter: number, index: number): WinFooter {
  if (chapter <= 1 && index < 5) return 'push';
  if (chapter <= 1) return 'home';
  return 'next';
}
