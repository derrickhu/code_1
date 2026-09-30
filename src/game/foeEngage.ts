/**
 * 怪物接敌。停哪、打谁、能不能挥刀。
 *
 * 行军是 `@/game/march`：一路匀速往前走。
 * 射程和村民同一把尺：`visualReachGap` / `posFromVisualGap`。
 * 表里的 range 是视觉格，不是轴距 —— 空场被拉开，轴上 3 格等于从村口打到第二排。
 */
import { posFromVisualGap, visualReachGap } from '@/balance/combat';
import type { EnemyDef } from '@/balance/stages';

export interface EngageFighter {
  uid: string;
  alive: boolean;
  lane: number;
  cell: number;
  pos: number;
}

export interface EngageFoe {
  lane: number;
  pos: number;
  skipUid?: string;
  def: Pick<EnemyDef, 'flying' | 'burrow' | 'range'>;
}

/** 飞的和钻地的都不被阻挡，也都奔这一路最后排 */
export function unblocked(def: Pick<EnemyDef, 'flying' | 'burrow'>): boolean {
  return def.flying === true || def.burrow === true;
}

/** 地面怪被这一路最靠前的活人挡住。返回那个人 */
export function blockerFor<T extends EngageFighter>(foe: EngageFoe, team: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const f of team) {
    if (!f.alive || f.lane !== foe.lane) continue;
    if (f.uid === foe.skipUid) continue;
    if (f.pos < foe.pos - 0.5) continue;
    if (!best || f.pos < best.pos) best = f;
  }
  return best;
}

/** 飞的专挑这一路最后排的人 */
export function sniperTarget<T extends EngageFighter>(foe: EngageFoe, team: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const f of team) {
    if (!f.alive || f.lane !== foe.lane) continue;
    if (!best || f.cell > best.cell) best = f;
  }
  return best;
}

/** 这一刻该打谁。地面怪打挡路的，飞的和钻地的直奔最后排 */
export function foeTarget<T extends EngageFighter>(foe: EngageFoe, team: readonly T[]): T | undefined {
  return unblocked(foe.def) ? sniperTarget(foe, team) : blockerFor(foe, team);
}

/**
 * 怪挥刀往后只补半格。人的扇形往后更长（见 REACH_BACK）：
 * 人要补刚挤过去的，怪穿过去不回头多打一截。
 */
const FOE_REACH_BACK = 0.5;

/** 这个人在不在自己的攻击范围里。视觉格差，向前和村民同一把尺。 */
export function foeInRange(e: EngageFoe, target: EngageFighter): boolean {
  const gap = visualReachGap(target.pos, e.pos);
  return gap <= e.def.range && gap >= -FOE_REACH_BACK;
}

/**
 * 该停在哪。没活人挡就是 undefined，一路走到头。
 *
 * 停点 = 从目标沿视觉尺往外推自己的射程。
 * 飞碟 3 格是「目标面前 3 视觉格」，不是钉在出场口隔空打。
 */
export function foeHaltPos<T extends EngageFighter>(foe: EngageFoe, team: readonly T[]): number | undefined {
  const t = foeTarget(foe, team);
  if (!t || !t.alive) return undefined;
  return Math.max(0, posFromVisualGap(t.pos, foe.def.range));
}

/** 进了自己的攻击范围才许挥刀。 */
export function foeCanSwing(e: EngageFoe, target: EngageFighter): boolean {
  return foeInRange(e, target);
}
