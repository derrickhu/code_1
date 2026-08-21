/**
 * 三选一规则（纯数据 + 抽取规则）
 *
 * 一局的选择序列：开局一次点齐 3 个村民 → 立刻开打 →
 * 之后每次都是**三件改装件挑一件，再决定装给谁**。
 *
 * 「装给谁」是独立的一步，不自动分配。这一步就是主体验本身
 * （docs/00-体验目标.md §4），省掉它等于把游戏改回「三选一加数值」。
 *
 * 两个刻意的设定：
 *
 * 1. **每件改装件一局只出一次**，抽中即从池里拿掉。12 件里发 7 件，
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
 * 三选一出现在这些波次之前。开局选人另算，一局共 7 件改装件。
 *
 * 第 2 波就开始发破烂，让主体验尽早上场。中段连续三手把构筑立住，
 * 之后隔一波给一次，把节奏让回给观战。
 */
export const PICK_WAVES: readonly number[] = [2, 4, 5, 6, 8, 10, 12];

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
