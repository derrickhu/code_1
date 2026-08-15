/**
 * 伤害公式（纯函数）
 *
 * 只有一条公式，且克制是**乘算最外层** —— 这样「选对系别」的收益不会被
 * 护甲或等级差吃掉。反目标第一条「我选谁都一样」在数值上的根源就是
 * 克制被其他乘区淹没，所以这里刻意让它独占一个乘区。
 */

import { ARMOR_K } from '../balance/combat';

/** 护甲减伤，收益递减，不会出现免伤 */
export function armorReduction(def: number): number {
  return def / (def + ARMOR_K);
}

export interface DamageInput {
  atk: number;
  targetDef: number;
  /** 来自 getCounterMult */
  counterMult: number;
  /** 「相克」增益的额外百分点，只在克制成立时生效 */
  counterBonusPct: number;
  /** 暴击倍率，1 表示未暴击 */
  critMult: number;
  /** 受击方减伤百分点（前排铁壁一类） */
  targetDamageReductionPct: number;
}

export function computeDamage(input: DamageInput): number {
  const afterArmor = input.atk * (1 - armorReduction(input.targetDef));
  const counter =
    input.counterMult > 1
      ? input.counterMult * (1 + input.counterBonusPct / 100)
      : input.counterMult;
  const afterReduction = afterArmor * (1 - input.targetDamageReductionPct / 100);
  return Math.max(1, afterReduction * counter * input.critMult);
}
