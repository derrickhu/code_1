/**
 * 伤害公式（纯函数）
 *
 * 只有一条公式，乘区刻意保持极少：护甲 → 减伤 → 改装倍率。
 * 克制系已裁掉（docs/00-体验目标.md §4），所以这里不再有系别乘区。
 *
 * 改装件的倍率走 `modMult` 这个独占乘区，目的和当初给克制留乘区一样：
 * 「装对了」的收益不能被护甲或基础攻击差吃掉，否则反目标第一条
 * 「这几件破烂装谁身上都一样」就会在数值层面成立。
 */

import { ARMOR_K } from '../balance/combat';

/** 护甲减伤，收益递减，不会出现免伤 */
export function armorReduction(def: number): number {
  return def / (def + ARMOR_K);
}

export interface DamageInput {
  atk: number;
  targetDef: number;
  /** 改装件带来的伤害倍率（队首翻倍、重击、暴击等的合并结果），1 表示没有 */
  modMult: number;
  /** 受击方减伤百分点（又套一层被一类） */
  targetDamageReductionPct: number;
}

export function computeDamage(input: DamageInput): number {
  const afterArmor = input.atk * (1 - armorReduction(input.targetDef));
  const afterReduction = afterArmor * (1 - input.targetDamageReductionPct / 100);
  return Math.max(1, afterReduction * input.modMult);
}
