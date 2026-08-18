/**
 * 三系克制（纯数据）
 *
 * 只做 3 系循环，不做 5 系：单局 7 分钟学不完 5 系，且违反「十秒可懂」。
 * 依据 docs/00-体验目标.md §4。
 *
 * 克制强度是本项目头号风险的主要防线 —— 体验目标的反目标第一条是
 * 「反正它自己会打，我选谁都一样」。系数太小，换人换不出差别，主体验塌掉；
 * 太大则退化成「猜对系别就赢」，决策变成读答案。1.5 / 0.67 是起点，
 * 由 tools/sim.ts 的卡关分布回归验证。
 */

/** 炎烧藤、藤吸潮、潮灭炎 —— 选这三个意象是因为相克关系可以靠直觉读出来 */
export type Element = 'flame' | 'vine' | 'tide';

export const ELEMENTS: readonly Element[] = ['flame', 'vine', 'tide'];

export const ELEMENT_NAMES: Readonly<Record<Element, string>> = {
  flame: '炎',
  vine: '藤',
  tide: '潮',
};

/** 混系波次按系别分路：炎左、藤中、潮右。单系波次再均摊到三路。 */
export const ELEMENT_LANE: Readonly<Record<Element, 0 | 1 | 2>> = {
  flame: 0,
  vine: 1,
  tide: 2,
};

export const LANE_NAMES = ['左', '中', '右'] as const;

/** key 克制 value */
const BEATS: Readonly<Record<Element, Element>> = {
  flame: 'vine',
  vine: 'tide',
  tide: 'flame',
};

/**
 * 2.0 / 0.55 是回归逼出来的，不是拍的。
 *
 * 试过 1.5 / 0.67 与 1.75 / 0.6：在能通过卡关区间检查的曲线下，
 * 「看系别」相对「不看系别」的收益都不足 1 波，等于玩家没理由在意系别。
 * 另一条路是把敌人曲线压平来放大策略差异，但那会让前 8 波毫无压力。
 * 所以克制强度本身必须够大 —— 它是「换人真的会改变结果」的主要载体。
 */
export const COUNTER_MULT = {
  /** 我克它 */
  advantage: 2,
  neutral: 1,
  /** 它克我 */
  disadvantage: 0.55,
} as const;

export function getCounterMult(attacker: Element, defender: Element): number {
  if (BEATS[attacker] === defender) return COUNTER_MULT.advantage;
  if (BEATS[defender] === attacker) return COUNTER_MULT.disadvantage;
  return COUNTER_MULT.neutral;
}

/** 谁克我 —— 波次预告与「换阵容」提示要用它反查建议系别 */
export function getCounteredBy(el: Element): Element {
  for (const candidate of ELEMENTS) {
    if (BEATS[candidate] === el) return candidate;
  }
  throw new Error(`克制表不完整: ${el}`);
}
