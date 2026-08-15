/**
 * 敌人原型与 15 波编排（纯数据）
 *
 * 波次结构与数值曲线分开：结构（出什么、什么系、几只）写死在 WAVES 里，
 * 强度只由 waveHpMult / waveAtkMult 两条曲线控制。调难度时只动曲线参数，
 * 不动编排 —— 否则每次调参都会顺手改掉「第几波引入第二个系」这类体验节奏。
 *
 * 编排目标（docs/00-体验目标.md §7）：卡关点稳定落在第 9 到 12 波。
 * 太早挫败，太晚则复活广告没有需求。
 */

import type { Element } from './counters';

export interface EnemyProto {
  id: string;
  name: string;
  /** Lv1（第 1 波）基础值 */
  hp: number;
  atk: number;
  def: number;
  /** 推进速度（格/秒） */
  speed: number;
  attackIntervalMs: number;
  isBoss: boolean;
}

export const ENEMY_PROTOS: readonly EnemyProto[] = [
  { id: 'runner', name: '疾行者', hp: 120, atk: 12, def: 0, speed: 4.5, attackIntervalMs: 900, isBoss: false },
  { id: 'grunt', name: '兵卒', hp: 260, atk: 22, def: 10, speed: 2.6, attackIntervalMs: 1100, isBoss: false },
  { id: 'brute', name: '重甲', hp: 700, atk: 40, def: 35, speed: 1.6, attackIntervalMs: 1400, isBoss: false },
  { id: 'boss', name: '统领', hp: 2600, atk: 70, def: 45, speed: 1.8, attackIntervalMs: 1600, isBoss: true },
];

const PROTO_BY_ID: Readonly<Record<string, EnemyProto>> = Object.fromEntries(
  ENEMY_PROTOS.map((e) => [e.id, e]),
);

export function getEnemyProto(id: string): EnemyProto {
  const p = PROTO_BY_ID[id];
  if (!p) throw new Error(`未知敌人: ${id}`);
  return p;
}

export interface WaveSpawn {
  enemyId: string;
  element: Element;
  count: number;
  /** 同组出怪间隔 */
  intervalMs: number;
  /** 该组相对本波开始的延迟出场 */
  delayMs: number;
}

export interface WaveDef {
  wave: number;
  spawns: readonly WaveSpawn[];
  /** 波次预告文案。让「卡关时该换谁」有明确指向，而不是靠玩家自己猜 */
  hint: string;
}

function s(enemyId: string, element: Element, count: number, intervalMs = 600, delayMs = 0): WaveSpawn {
  return { enemyId, element, count, intervalMs, delayMs };
}

/**
 * 波次编排。三个阶段的意图：
 * 1–3 单系教学，建立「他们自己能打」的信任；
 * 4–7 引入第二、第三系，让克制第一次改变结果；
 * 8 小 Boss 作为第一个可能卡住的点；
 * 9–12 三系混合，主卡关区，也是复活广告的需求来源；
 * 13–15 高压收尾。
 */
export const WAVES: readonly WaveDef[] = [
  // 第 1 波只给 3 只：此时玩家手里只有 1 个英雄，任何定位都必须能独自守住，
  // 否则开局就漏怪，后面全程滚雪球
  { wave: 1, spawns: [s('grunt', 'flame', 3)], hint: '炎系来袭' },
  { wave: 2, spawns: [s('grunt', 'flame', 6)], hint: '炎系来袭' },
  { wave: 3, spawns: [s('runner', 'flame', 6, 400)], hint: '炎系疾行者，速度很快' },
  { wave: 4, spawns: [s('grunt', 'vine', 5), s('runner', 'vine', 3, 400, 3000)], hint: '藤系来袭，炎系英雄能克它' },
  { wave: 5, spawns: [s('grunt', 'vine', 6), s('brute', 'vine', 1, 600, 4000)], hint: '藤系带重甲' },
  { wave: 6, spawns: [s('runner', 'tide', 8, 350)], hint: '潮系疾行者，藤系英雄能克它' },
  { wave: 7, spawns: [s('grunt', 'tide', 6), s('brute', 'tide', 2, 800, 5000)], hint: '潮系带重甲' },
  { wave: 8, spawns: [s('boss', 'vine', 1), s('grunt', 'vine', 4, 700, 2000)], hint: '藤系统领，炎系英雄能克它' },
  { wave: 9, spawns: [s('grunt', 'flame', 5), s('runner', 'tide', 6, 400, 3000)], hint: '炎与潮混编' },
  { wave: 10, spawns: [s('brute', 'flame', 3, 900), s('grunt', 'vine', 6, 600, 4000)], hint: '炎系重甲配藤系兵卒' },
  { wave: 11, spawns: [s('runner', 'tide', 10, 300), s('brute', 'flame', 2, 900, 5000)], hint: '潮系冲锋，注意漏怪' },
  { wave: 12, spawns: [s('grunt', 'vine', 8, 500), s('brute', 'tide', 3, 900, 5000)], hint: '藤系大队配潮系重甲' },
  { wave: 13, spawns: [s('brute', 'flame', 3, 900), s('runner', 'vine', 8, 350, 4000)], hint: '三系齐来' },
  { wave: 14, spawns: [s('grunt', 'tide', 8, 450), s('brute', 'vine', 4, 900, 5000)], hint: '潮系大队配藤系重甲' },
  // 终局刻意不做成数值墙：护卫减到 2 重甲加 4 兵卒，
  // 让「打到第 15 波」的玩家有真实通关概率。终局要的是高潮，不是劝退
  {
    wave: 15,
    spawns: [s('boss', 'flame', 1), s('brute', 'tide', 2, 900, 3000), s('grunt', 'vine', 4, 500, 6000)],
    hint: '炎系统领压阵，潮系英雄能克它',
  },
];

/**
 * 强度曲线。这两个数是整个切片最需要回归的参数。
 *
 * 上限由英雄的成长空间决定：满编 6 人练到 5 级约 2 倍，叠满增益再约 1.5 倍，
 * 合计只有 3 倍出头。敌人 15 波若按 1.22 复合成长会到 17.6 倍，
 * 第 12 波必然出现断崖 —— 回归数据已经证实过一次。
 * 因此曲线必须压到「15 波总成长与英雄成长同量级、略高一线」。
 */
export const WAVE_CURVE = {
  hpGrowth: 1.235,
  atkGrowth: 1.14,
  /**
   * 第 KNEE 波之后改用这条更平缓的成长。
   *
   * 卡关区被设计在 9 到 12 波，因此 13 波之后没有理由继续指数上升 ——
   * 那只会让「已经打到这里」的玩家撞上纯数值墙，通关率恒为 0。
   * 放缓之后 13 到 15 波是留给通关者的收尾段，终局是高潮而不是劝退。
   */
  lateGrowth: 1.1,
  knee: 12,
} as const;

function segmented(growth: number, late: number, wave: number): number {
  if (wave <= WAVE_CURVE.knee) return growth ** (wave - 1);
  return growth ** (WAVE_CURVE.knee - 1) * late ** (wave - WAVE_CURVE.knee);
}

export function waveHpMult(wave: number): number {
  return segmented(WAVE_CURVE.hpGrowth, WAVE_CURVE.lateGrowth, wave);
}

export function waveAtkMult(wave: number): number {
  return segmented(WAVE_CURVE.atkGrowth, 1.02, wave);
}

export function getWave(wave: number): WaveDef {
  const w = WAVES.find((x) => x.wave === wave);
  if (!w) throw new Error(`未定义波次: ${wave}`);
  return w;
}
