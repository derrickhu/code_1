/**
 * 攻击范围。出手判定和地上那片展示的唯一真源。
 *
 * ── 业界怎么量（Clash / 王国保卫战 / 塔塔）──────────
 * 人站在粗格子上（我们是 3×4），射程不认格子。
 * 场上是一张连续平面，距离就是 hypot(Δx, Δy)，半径几格就是几格。
 * 格子再细也不会更准 —— 准是因为坐标是连续的，不是因为格多。
 * 我们量的最小刻度是 1/4 视觉格（REACH_TICK），描弧按这个走。
 *
 * ── 一把尺子 ────────────────────────────────────────
 * 世界坐标：x = 路 × 路宽折算，y = 视觉格（和怪脚底同一套 posScreenY）。
 *
 *   距离 = hypot(Δx, Δy)
 *   在射程里 ⇔ 距离 ≤ N，且不在身后 1.5 格以外
 *
 * 换格子只平移，半径不变。邻列、对巷都是同一张圆上的点，
 * 不是「本路一条、邻列再写一套」。
 *
 * ── 出手 = 展示 ──────────────────────────────────────
 * 会不会出手：canReach  = inReachRadius
 * 地上画什么：reachPoly = 半径轮廓（伸到出场线外才裁，不裁开火线）
 *
 * 半路没有开火线。村民打不打得到只看这张圆。
 * 怪停不停走同一把视觉尺（`visualReachGap`），见 `@/game/foeEngage`。
 *
 * BattleEngine / BattleScene 都不许再写第二套距离公式。
 */
import {
  LANE_COUNT, LANE_W, VIS_ENGAGE_POS, cellPos, combatVisualPerPos,
  laneScreenX, posFromVisualGap, posScreenY, posVisualFrac, visualReachGap,
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
 * 设计场高。只用来把路宽折成视觉格。
 * 真机场高变了判定也不变 —— 出手看的是这张连续平面，不是像素。
 */
const REACH_REF_FIELD_H = 1000;

/**
 * 邻列在平面上算几格。= 路宽 ÷ 一格高。
 * 取这个数，扇形在设计稿上才是正圆，不是横杠。
 */
export const REACH_LANE_WEIGHT = LANE_W / (REACH_REF_FIELD_H * combatVisualPerPos());

/** 量射程、描弧的最小刻度。摆放仍是 3×4，出手按连续坐标。 */
export const REACH_TICK = 0.25;

/**
 * 身后还能打到的那一截，视觉格。
 * 怪刚挤过脚底、人还在旁边时要补得着；再往底线走才出扇形。
 * 不是整圆：前排近战不该转过身把已经漏到村口的怪清掉。
 */
export const REACH_BACK = 1.5;

/**
 * 连续平面上的点。x、y 都是视觉格。
 * 出手和展示都问这个，不再各算各的 Δlane / Δpos。
 */
export function reachXY(p: ReachTgt): { x: number; y: number } {
  return {
    x: p.lane * REACH_LANE_WEIGHT,
    y: posVisualFrac(p.pos) / combatVisualPerPos(),
  };
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
 * 这个半径罩得到几路之外。0 本路、1 邻列、2 对巷。
 * 由半径和路宽折算推出来，不是角色开关。
 */
export function laneReachOf(range: number): number {
  let n = 0;
  while (n < LANE_COUNT - 1 && Number.isFinite(reachAhead(range, n + 1))) n += 1;
  return n;
}

/**
 * 定位射程的唯一公式：
 *
 *   半径 = 它该罩到的那一路、从推荐格到可站区上沿的平面距离 + 一点余量
 *
 * 挨 / 拦罩邻列，打罩对巷（三路都要够）。修不走这条，免得变成第二个打。
 * 余量是站位容错。半径本身就是往前打多远，空场里够得着就打。
 */
export function coverRange(coverLanes: number, standPos: number, slack = 0): number {
  const gap = visualReachGap(standPos, VIS_ENGAGE_POS);
  const need = Math.hypot(coverLanes * REACH_LANE_WEIGHT, Math.max(0, gap));
  return Math.round((need + slack) / REACH_TICK) * REACH_TICK;
}

/** 「修」位的攻击半径。手写：站最后一格必须够不到邻列挡点 */
export const HEAL_RANGE = 4;

export const ROLE_RANGE = {
  tank: coverRange(1, cellPos(0), 0.5),
  block: coverRange(1, cellPos(1), 0.5),
  dps: coverRange(2, cellPos(2), 1),
  heal: HEAL_RANGE,
} as const;

/**
 * 出手和展示共用的相对位移。
 * dpos 是视觉格差，不是 pos 相减。
 */
export function reachSep(atk: ReachAtk, tgt: ReachTgt): { dlane: number; dpos: number } {
  const a = reachXY(atk);
  const b = reachXY(tgt);
  return {
    dlane: tgt.lane - atk.lane,
    dpos: a.y - b.y,
  };
}

/**
 * 相对位移在不在半径里。不看站哪一排，只看平面上差了多少。
 */
export function inReachRadius(range: number, dlane: number, dpos: number): boolean {
  if (dpos < -REACH_BACK) return false;
  return reachDist(dlane, dpos) <= range + 1e-6;
}

/** 这个人打不打得到这个点。引擎挑怪、点人看射程，只问这个。 */
export function canReach(atk: ReachAtk, tgt: ReachTgt): boolean {
  if (tgt.pos < 0) return false;
  const { dlane, dpos } = reachSep(atk, tgt);
  return inReachRadius(atk.range, dlane, dpos);
}

/**
 * 射程轮廓，轴坐标描一圈。顶点落在半径上，和 canReach 同一条线。
 * 只在出场线外裁平，不裁开火线 —— 裁了纵向就剩一条横带。
 */
export function reachPoly(atk: ReachAtk, steps?: number): ReachTgt[] {
  const maxSide = atk.range / REACH_LANE_WEIGHT;
  if (maxSide <= 0) return [];
  const n = steps ?? Math.max(48, Math.round((2 * maxSide) / REACH_TICK) * 2);
  const far: ReachTgt[] = [];
  const near: ReachTgt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const side = -maxSide + (2 * maxSide * i) / n;
    const ahead = reachAhead(atk.range, side);
    if (!Number.isFinite(ahead)) continue;
    if (!inReachRadius(atk.range, side, ahead)) continue;
    const lane = atk.lane + side;
    far.push({ lane, pos: Math.max(0, posFromVisualGap(atk.pos, ahead)) });
    let lo = 0;
    let hi = REACH_BACK;
    for (let k = 0; k < 10; k += 1) {
      const mid = (lo + hi) / 2;
      if (inReachRadius(atk.range, side, -mid)) lo = mid;
      else hi = mid;
    }
    near.push({ lane, pos: Math.max(0, posFromVisualGap(atk.pos, -lo)) });
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
