/**
 * 怪物行军。怎么走的唯一真源。
 *
 * 土路映射把空场拉开、人仍站底下 4 格。表里的 spd 是「每秒几视觉格」，
 * 每一步沿 posVisualFrac 积分，屏幕上一路一个速度，不在半路换挡。
 *
 * 减速只乘冰冻倍率。停在谁的射程里、能不能挥刀，是 `@/game/foeEngage`。
 *
 * BattleEngine 只问 marchStep；BattleScene 只问 marchLerp。
 */
import {
  VIS_ENGAGE_POS, combatCellPx, combatVisualPerPos, posFromVisualFrac, posScreenY,
  posVisualFrac, visualReachGap,
} from '@/balance/combat';

/** 沿视觉尺往底线走一步。spd 单位：视觉格 / 秒。slow 是减速倍率。 */
export function marchStep(pos: number, spd: number, dtSec: number, slow = 1): number {
  const visual = Math.max(0, spd) * Math.max(0, slow);
  return posFromVisualFrac(posVisualFrac(pos) + visual * combatVisualPerPos() * dtSec);
}

/**
 * 两拍之间的脚底。按视觉比例抹，不按轴 pos 抹。
 * 轴上抹会在空场 / 可站区交界处再顿一下。
 */
export function marchLerp(fromPos: number, toPos: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  const a = posVisualFrac(fromPos);
  const b = posVisualFrac(toPos);
  return posFromVisualFrac(a + (b - a) * u);
}

/** 出场走到可站区上沿要几秒。慢的就是慢。 */
export function approachWalkSec(spd: number): number {
  if (spd <= 0) return Number.POSITIVE_INFINITY;
  return visualReachGap(VIS_ENGAGE_POS, 0) / spd;
}

/** 这一刻屏幕上每秒走多少像素。测验「会不会换挡」用。 */
export function marchScreenVel(
  spd: number,
  pos: number,
  topY: number,
  goalY: number,
  dt = 0.01,
): number {
  const next = marchStep(pos, spd, dt);
  return (posScreenY(next, topY, goalY) - posScreenY(pos, topY, goalY)) / dt;
}

/** 匀速时屏幕速度 = spd × 一格像素。任何 pos 都应等于这个。 */
export function marchScreenVelWant(spd: number, topY: number, goalY: number): number {
  return spd * combatCellPx(topY, goalY);
}
