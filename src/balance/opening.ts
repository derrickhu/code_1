/**
 * 冷启动的前三分钟，三关各教一件事：
 *
 *   1-1 看人打怪，第一招由玩家自己点。两个人都在场上
 *   1-2 还是这两个人直接打，打完喊来第一个乡亲（喊人）
 *   1-3 新来的人还在底下，拖上路才能开打；打完带着零件回村升手艺（养成）
 *
 * stageTop 从 1 起，赢下第 3 关变成 4。摊、喊人、手艺在这之前点不开。
 * 1-4、1-5 打不过可以回来打弹子、升手艺，不必卡在三个人手艺 1 上。
 */

export type WinFooter = 'push' | 'home' | 'next' | 'call' | 'craft';

export function villageGateOpen(stageTop: number): boolean {
  return stageTop > 3;
}

/**
 * 1-2 打完喊来的第一个人。三婶门路「带一帮人」克第 1 章领头的方块，
 * 1-3 顶掉谁上去都过得了，1-5 换下大锤手艺 1 也能过。
 */
export const OPENING_CALL_ID = 'sanshen';

/** 1-3 首通送的零件。正好够第一档手艺，回村就能点人升一级 */
export const OPENING_PARTS = 2;

/** 1-2 已经过了、还没喊过人：结算或进 1-3 时补喊这一次 */
export function needOpeningCall(stageTop: number, callCount: number, roster: readonly string[]): boolean {
  return stageTop >= 3 && callCount === 0 && !roster.includes(OPENING_CALL_ID);
}

/** 这一关打完多给几个零件。只有 1-3 首通这一笔 */
export function openingParts(stageId: number, first: boolean): number {
  return stageId === 3 && first ? OPENING_PARTS : 0;
}

export type CraftStep = 'stall' | 'craft' | 'done';

/**
 * 1-5 还没过、人都是手艺 1 时，下一手去哪。
 * 第一档手艺要 2 个零件，零件从摊上的破电视来（1-3 首通先送一笔）。
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
 * 1-2 还没喊过人时是「喊人」，1-3 拿到零件时是「回村升手艺」，
 * 其余 1-1 到 1-4 只往下推，1-5 回村，第 2 章起下一关为主。
 */
export function winFooter(
  chapter: number,
  index: number,
  opening: { needCall?: boolean; craftReady?: boolean } = {},
): WinFooter {
  if (chapter <= 1 && index === 2 && opening.needCall) return 'call';
  if (chapter <= 1 && index === 3 && opening.craftReady) return 'craft';
  if (chapter <= 1 && index < 5) return 'push';
  if (chapter <= 1) return 'home';
  return 'next';
}
