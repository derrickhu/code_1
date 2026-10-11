/**
 * 冷启动的前三分钟，三关各教一件事：
 *
 *   1-1 看人打怪，第一招由玩家自己点。两个人都在场上
 *   1-2 还是这两个人直接打，打完喊来第一个乡亲（喊人）
 *   1-3 新来的人还在底下，拖上路才能开打；打完带着零件回村升手艺（养成）
 *       升完去摊上把村子打到 2 级，1-4 四个人一起上（摊子）
 *   1-5 打完送一嗓子的工分，回村自己去大喇叭喊人（喊人第二次，这回是自己点）
 *
 * stageTop 从 1 起，赢下第 3 关变成 4。摊、喊人、手艺在这之前点不开。
 */

import { CALL_COST } from './village';

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

/** 'grow' 是手艺升过了、村子还在 1 级：去摊上把村子打到 2 级，1-4 就能四个人一起上 */
export type CraftStep = 'stall' | 'craft' | 'grow' | 'done';

/** 第 1 章要把村子带到几级。2 级多一个上场位，正好装下 1-3 回来的大锤 */
export const OPENING_VILLAGE_LV = 2;

/**
 * 1-5 还没过时，下一手去哪。
 * 第一档手艺要 2 个零件，零件从摊上的破电视来（1-3 首通先送一笔）。
 * 手艺升过之后再去摊上打村子经验。1-3 打完手上约 27 发，2 级要 15 发上下。
 */
export function chapter1CraftStep(
  stageTop: number,
  stage5Cleared: boolean,
  maxCraft: number,
  parts: number,
  villageLv: number,
  partsNeed = 2,
): CraftStep {
  if (!villageGateOpen(stageTop) || stage5Cleared) return 'done';
  if (maxCraft <= 1) return parts >= partsNeed ? 'craft' : 'stall';
  return villageLv < OPENING_VILLAGE_LV ? 'grow' : 'done';
}

/** 1-5 首通送的工分，正好喊一嗓子。第 1 章打完回村，第一次自己去大喇叭喊人 */
export const OPENING_CREDITS = CALL_COST;

export function openingCredits(stageId: number, first: boolean): number {
  return stageId === 5 && first ? OPENING_CREDITS : 0;
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
