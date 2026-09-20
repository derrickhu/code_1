/**
 * 攻击范围。出手判定和地上那片展示的唯一真源。
 *
 * ── 尺子 ────────────────────────────────────────────
 * 射程 N 格 = 从自己身上量出去的固定半径，不随站第几排变。
 * 三婶永远是 3 格：放前排放后排，相对位移相同则出手续论相同。
 *
 *   距离 = hypot(|路差| × REACH_LANE_WEIGHT, 前后格差)
 *   在射程里 ⇔ 距离 ≤ N
 *
 * 邻列按 1.5 格折算（见 REACH_LANE_WEIGHT）。这是半径怎么量，不是两套射程。
 *
 * ── 开火线（另一条全员规则，不是射程）────────────────
 * 门洞里（COMBAT_POS 外）不许打。前排多出来的射程会顶到这条线，
 * 扇形看起来矮一截 —— 裁的是门洞，不是这人射程变了。
 *
 * ── 出手和展示 ──────────────────────────────────────
 * 会不会出手：canReach
 * 地上画什么：reachScreenPoly（只描 canReach === true 的点，
 * 用和敌人脚底同一套 laneScreenX / posScreenY）
 *
 * BattleEngine / BattleScene 都不许再写第二套距离公式。
 */
import { COMBAT_POS, inCombatZone, laneScreenX, posScreenY } from '@/balance/combat';

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

/** 这条路正前方最远还能打多远。NaN = 半径罩不到这条路 */
export function reachAhead(range: number, side: number): number {
  const w = Math.abs(side) * REACH_LANE_WEIGHT;
  if (w > range) return Number.NaN;
  return Math.sqrt(range * range - w * w);
}

/**
 * 相对位移在不在半径里。不看站哪一排，只看差了几路几格。
 *
 * 这是「攻击范围不随摆放位置变化」的那一层。
 */
export function inReachRadius(range: number, dlane: number, dpos: number): boolean {
  if (dpos < -REACH_BACK) return false;
  return reachDist(dlane, dpos) <= range + 1e-6;
}

/**
 * 会不会出手。引擎挑怪、点人看射程、地上那片，只问这个。
 *
 * = 开火线内 + inReachRadius。没有第三套。
 */
export function canReach(atk: ReachAtk, tgt: ReachTgt): boolean {
  if (!inCombatZone(tgt.pos)) return false;
  return inReachRadius(atk.range, tgt.lane - atk.lane, atk.pos - tgt.pos);
}

/**
 * 能出手的那块地，轴坐标描一圈。每个顶点都满足 canReach。
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
    const lane = atk.lane + side;
    const posFar = Math.max(COMBAT_POS, atk.pos - ahead);
    if (!canReach(atk, { lane, pos: posFar })) continue;
    far.push({ lane, pos: posFar });
    let lo = 0;
    let hi = REACH_BACK;
    for (let k = 0; k < 10; k += 1) {
      const mid = (lo + hi) / 2;
      if (canReach(atk, { lane, pos: atk.pos + mid })) lo = mid;
      else hi = mid;
    }
    near.push({ lane, pos: atk.pos + lo });
  }
  if (far.length < 2) return far;
  return far.concat(near.reverse());
}

/**
 * 出手范围映到屏幕。和怪的脚底用同一套 laneScreenX / posScreenY。
 * 禁止按格高另算半径 —— 那会比真出手短。
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
