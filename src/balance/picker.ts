/**
 * 三选一规则（纯数据 + 抽取规则）
 *
 * 一局的选择序列：村子里点齐 3 人 → 进场直接开打 →
 * 杀敌攒够经验就当场发三件改装件挑一件，再决定装给谁。
 *
 * 「装给谁」是独立的一步，不自动分配。这一步就是主体验本身
 * （docs/00-体验目标.md §4），省掉它等于把游戏改回「三选一加数值」。
 *
 * 两个刻意的设定：
 *
 * 1. **每件改装件一局只出一次**，抽中即从池里拿掉。二十多件里发 7 件，
 *    每局的组合都不同，「这一局才有的戏」才立得住。
 * 2. **三张牌的 kind 尽量不同，且保证至少一张 pivot**。三张都是纯强度
 *    等于没有取舍，也等于这一轮没有改定位的机会。
 *
 * 验收指标：埋点看「装给谁」的分布。若某个位置被装超过 70%，
 * 说明改装件与角色的搭配没有真差异，要回来改 mods.ts 而不是改数值。
 */

import { TEAM_SIZE } from './combat';
import type { ModKind } from './mods';

/**
 * 升级所需的累计经验。杀敌攒经验，跨过一档就当场发一次三选一。
 *
 * 换掉了原先写死波次的 PICK_WAVES。写死波次的问题是发牌与玩家干了什么无关，
 * 打得好打得烂都在第 2、4、5 波拿到牌，波次边界成了唯一的心跳。
 * 挂到杀敌上之后，屏幕上一直有条在涨的东西，且「再撑一会儿就有牌」
 * 是玩家自己能感觉到的进度（docs/00-体验目标.md §4）。
 *
 * 仍然是 7 档，与旧的发牌次数一致——池子二十多件，发 7 件还剩大半，
 * 「每局的组合都不同」才站得住。这一步只换驱动源，不加发牌次数。
 *
 * 阈值贴着旧时机放，但第一档必须低于第 1 波总经验（7 只小灰 × 1）。
 * 写成 7 会让第一张牌刚好落在清完场的那一帧，连续战场又被拆回「打完一波再发牌」。
 */
export const LEVEL_EXP: readonly number[] = [5, 26, 46, 66, 100, 158, 232];

/** 升到第 level + 1 级还差多少经验。满级返回 undefined */
export function levelThreshold(level: number): number | undefined {
  return LEVEL_EXP[level];
}

/** 每次给几张牌挑（改装件）。开局村民是一次铺开全员，不走这个数 */
export const CHOICES_PER_PICK = 3;

/** 上场人数上限，与队列长度一致 */
export const MAX_TEAM_SIZE = TEAM_SIZE;

export type PickOption =
  | { kind: 'recruit'; heroId: string }
  | { kind: 'mod'; modId: string };

export type PickKind = PickOption['kind'];

/**
 * 模拟里用的策略。每个策略同时决定「选哪张牌」与「装给谁」——
 * 后者是这个游戏的核心动作，不带进模拟就没法回归主体验。
 *
 * `smart` 与 `random` 的差值即「装对人」的决策价值，
 * 是反目标第一条「这几件破烂装谁身上都一样」的直接度量。
 */
export type PickStrategy =
  /** 优先改定位的破烂，并装给最能吃到它的人。代表懂了的玩家 */
  | 'smart'
  /** 什么都往同一个人身上堆，代表「我就要一个猛的」 */
  | 'focus'
  /** 平均分给三个人，代表求稳 */
  | 'spread'
  /** 只挑纯强度的破烂 */
  | 'output'
  /** 随机选牌、随机装人，代表首次接触的玩家 */
  | 'random';

export const PICK_STRATEGIES: readonly PickStrategy[] = [
  'smart',
  'focus',
  'spread',
  'output',
  'random',
];

/** 发牌时的 kind 优先顺序：先保证有 pivot，再补别的 */
export const KIND_PRIORITY: readonly ModKind[] = ['pivot', 'output', 'tanky', 'team'];
