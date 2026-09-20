/**
 * 攻击范围。出手判定和地上那片展示的唯一真源。
 *
 * ── 一把尺子 ────────────────────────────────────────
 * 前后距离只问 visualReachGap（和怪脚底同一套 posScreenY）。
 * 可站区里它等于轴距；空场被拉长，同一段轴距算更多格。
 *
 *   距离 = hypot(|路差| × REACH_LANE_WEIGHT, visualReachGap)
 *   在射程里 ⇔ 距离 ≤ N
 *
 * 王大锤永远是 2 格：换格子只平移，扇形一样大。
 * 邻列按 1.5 格折算。这是半径怎么量，不是两套射程。
 *
 * ── 开火线（不是射程）────────────────────────────────
 * 空场（COMBAT_POS 外）不许打。只挡「现在能不能出手」，不裁扇形。
 *
 * ── 出手 = 展示 ──────────────────────────────────────
 * reachSep → inReachRadius
 * 会不会出手：canReach = 开火线内 + inReachRadius
 * 地上画什么：reachScreenPoly，顶点都在 inReachRadius 上，
 * 用 posScreenY 映到屏幕。怪的脚底也是 posScreenY，所以
 * 能打到 ⇔ 脚底在扇形里（开火线外除外）。
 *
 * BattleEngine / BattleScene 都不许再写第二套距离公式。
 */
import {
  inCombatZone, laneScreenX, posFromVisualGap, posScreenY, visualReachGap,
} from '@/balance/combat';

/** 一次出手 / 一块展示共用的人 */
export interface ReachAtk {
  lane: number;
  pos: number;
  range: number;
}

/** 一次出手 / 一块展示共用的目标点 */
export interface ReachTgt {
  lane: number;
  pos: number;
}

/**
 * 邻列在半径里算几格。
 *
 * 1.0 太扁：射程 3 横着铺满三路。
 * 2.0 太圆：「打」站推荐格 hypot(2, 2.5)=3.2 > 3，邻列挡点够不着。
 * 1.5：hypot(1.5, 2.5)=2.92，标准阵型刚好够；挨（射程 1）1.5>1，仍只守本路。
 */
export const REACH_LANE_WEIGHT = 1.5;

/** 身后还能补的那一截。扇形往后只留这么多，不是整圆 */
export const REACH_BACK = 0.5;

/** 谁的半径够得着邻列。由射程和 REACH_LANE_WEIGHT 决定，不是角色开关 */
export function laneReachOf(range: number): number {
  return Number.isFinite(reachAhead(range, 1)) ? 1 : 0;
}

export function reachDist(dlane: number, dpos: number): number {
  return Math.hypot(Math.abs(dlane) * REACH_LANE_WEIGHT, dpos);
}

/** 这条路正前方最远还能打多远（视觉格）。NaN = 半径罩不到这条路 */
export function reachAhead(range: number, side: number): number {
  const w = Math.abs(side) * REACH_LANE_WEIGHT;
  if (w > range) return Number.NaN;
  return Math.sqrt(range * range - w * w);
}

/**
 * 出手和展示共用的相对位移。
 * dpos 是视觉格差，不是 pos 相减。
 */
export function reachSep(atk: ReachAtk, tgt: ReachTgt): { dlane: number; dpos: number } {
  return {
    dlane: tgt.lane - atk.lane,
    dpos: visualReachGap(atk.pos, tgt.pos),
  };
}

/**
 * 相对位移在不在半径里。不看站哪一排，只看差了几路几格。
 */
export function inReachRadius(range: number, dlane: number, dpos: number): boolean {
  if (dpos < -REACH_BACK) return false;
  return reachDist(dlane, dpos) <= range + 1e-6;
}

/** 这个人打不打得到这个点。引擎挑怪、点人看射程，只问这个。 */
export function canReach(atk: ReachAtk, tgt: ReachTgt): boolean {
  if (!inCombatZone(tgt.pos)) return false;
  const { dlane, dpos } = reachSep(atk, tgt);
  return inReachRadius(atk.range, dlane, dpos);
}

/**
 * 射程轮廓，轴坐标描一圈。每个顶点的 reachSep 都在半径上。
 * 不裁开火线：裁了换格子扇形会变矮。
 */
export function reachPoly(atk: ReachAtk, steps = 28): ReachTgt[] {
  const maxSide = atk.range / REACH_LANE_WEIGHT;
  if (maxSide <= 0) return [];
  const far: ReachTgt[] = [];
  const near: ReachTgt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const side = -maxSide + (2 * maxSide * i) / steps;
    const ahead = reachAhead(atk.range, side);
    if (!Number.isFinite(ahead)) continue;
    if (!inReachRadius(atk.range, side, ahead)) continue;
    const lane = atk.lane + side;
    far.push({ lane, pos: posFromVisualGap(atk.pos, ahead) });
    let lo = 0;
    let hi = REACH_BACK;
    for (let k = 0; k < 10; k += 1) {
      const mid = (lo + hi) / 2;
      if (inReachRadius(atk.range, side, -mid)) lo = mid;
      else hi = mid;
    }
    near.push({ lane, pos: posFromVisualGap(atk.pos, -lo) });
  }
  if (far.length < 2) return far;
  return far.concat(near.reverse());
}

/** 扇形原点的屏幕 y。人和怪的脚底、reachScreenPoly 都落这儿。 */
export function reachOriginY(pos: number, topY: number, goalY: number): number {
  return posScreenY(pos, topY, goalY);
}

/**
 * 射程轮廓映到屏幕。顶点和怪的脚底都走 posScreenY，没有第二套投影。
 * 弧线按视觉格差取样，所以换格子高度不变。
 */
export function reachScreenPoly(
  atk: ReachAtk,
  topY: number,
  goalY: number,
): { x: number; y: number }[] {
  return reachPoly(atk).map((p) => ({
    x: laneScreenX(p.lane),
    y: posScreenY(p.pos, topY, goalY),
  }));
}
