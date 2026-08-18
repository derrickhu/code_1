/**
 * 批量回归：用不同玩家策略快进 BattleEngine，验证卡关曲线。
 *
 * 战斗逻辑**不在这里**，全部在 game/BattleEngine.ts —— 本文件只负责
 * 「扮演不同水平的玩家」并统计结果。这样回归验过的数值在真机上才成立。
 *
 * 要回答两个问题：
 * 1. 卡关点是否稳定落在第 9 到 12 波（docs/00-体验目标.md §8）；
 * 2. **`smart` 与 `random` 的差值是否够大** —— 这是「破烂装谁身上不一样」的
 *    唯一量化证据，也是反目标第一条的防线。差值太小就要回去改 mods.ts。
 */

import { TOTAL_WAVES } from '../balance/combat';
import { getMod } from '../balance/mods';
import type { PickOption, PickStrategy } from '../balance/picker';
import {
  applyPick,
  createRun,
  installMod,
  installTargets,
  tick,
  type HeroUnit,
  type RunState,
} from '../game/BattleEngine';

/** 选哪张牌 */
function chooseOption(
  options: readonly PickOption[],
  strategy: PickStrategy,
  rng: () => number,
): PickOption | undefined {
  if (options.length === 0) return undefined;
  if (strategy === 'random') return options[Math.floor(rng() * options.length)];

  const mods = options.filter((o) => o.kind === 'mod');
  if (mods.length === 0) return options[0];

  const byKind = (kind: string) =>
    mods.find((o) => o.kind === 'mod' && getMod(o.modId).kind === kind);

  switch (strategy) {
    case 'output':
      return byKind('output') ?? byKind('pivot') ?? mods[0];
    case 'smart':
    case 'focus':
    case 'spread':
      return byKind('pivot') ?? byKind('output') ?? mods[0];
  }
}

/**
 * 装给谁。这是这个游戏的核心动作，所以不同策略的差别主要体现在这里。
 *
 * `smart` 的规则就是把每件破烂配给最能吃到它的人：长水管给近战、
 * 高压锅给挨打的队首、秤砣给攻击最高的。`random` 则随便装。
 */
function chooseTarget(
  state: RunState,
  strategy: PickStrategy,
  rng: () => number,
): HeroUnit | undefined {
  const targets = installTargets(state);
  if (targets.length === 0) return undefined;
  if (strategy === 'random') return targets[Math.floor(rng() * targets.length)];

  const front = [...targets].sort((a, b) => a.slot - b.slot)[0];
  const hardest = [...targets].sort((a, b) => b.stats.atk - a.stats.atk)[0];
  const melee = [...targets].sort((a, b) => a.stats.range - b.stats.range)[0];
  const ranged = [...targets].sort((a, b) => b.stats.range - a.stats.range)[0];
  const fewest = [...targets].sort((a, b) => a.mods.length - b.mods.length)[0];

  if (strategy === 'focus') return hardest;
  if (strategy === 'spread') return fewest;
  if (strategy === 'output') return hardest;

  const mod = state.pendingMod;
  if (!mod) return front;
  switch (mod.effect.kind) {
    // 改射程的给近战：把只能贴脸的改造成能站后面输出的
    case 'rangeUp':
      return melee;
    // 越挨越猛、反弹、加厚、站得起来，都是给挨刀那个人的
    case 'rageOnHurt':
    case 'thorns':
    case 'armorPct':
    case 'revive':
    case 'lifesteal':
      return front;
    // 一片、穿透给射程长的，能同时覆盖更多敌人
    case 'splash':
    case 'pierce':
      return ranged;
    // 纯倍率给底子最硬的
    case 'frontMult':
    case 'heavySwing':
    case 'atkPct':
    case 'crit':
      return hardest;
    default:
      return fewest;
  }
}

/**
 * 装完之后顺手调队列。
 *
 * 只有 smart 会做：钢板要求站队首才翻倍，装了就该把人挪上去。
 * 这一步是「改装件产生连带的站位决策」在模拟里的体现，
 * 没有它，钢板这类改装件的价值验不出来。
 */
function reorderAfterInstall(state: RunState, strategy: PickStrategy, target: HeroUnit): void {
  if (strategy !== 'smart') return;
  const wantsFront = target.stats.frontMult > 1;
  if (!wantsFront || target.slot === 0) return;
  const head = state.team.find((h) => h.slot === 0);
  const from = target.slot;
  target.slot = 0;
  if (head) head.slot = from;
}

export interface SimConfig {
  strategy: PickStrategy;
  seed: number;
}

export interface SimResult {
  /** 打到第几波。cleared 为 true 时等于 TOTAL_WAVES */
  reachedWave: number;
  cleared: boolean;
  durationMs: number;
  installs: number;
  /** 每个人身上装了什么，用来看构筑是否集中 */
  team: { heroId: string; slot: number; mods: string[] }[];
}

/** 单波最多 1200 tick，15 波留足余量后再乘 2 作为死循环保护 */
const MAX_TICKS = 1200 * TOTAL_WAVES * 2;

export function simulateRun(config: SimConfig): SimResult {
  const state: RunState = createRun(config.seed);

  let ticks = 0;
  while (state.phase !== 'won' && state.phase !== 'lost') {
    if (ticks++ > MAX_TICKS) {
      throw new Error(`模拟未收敛：seed=${config.seed} strategy=${config.strategy}`);
    }
    if (state.phase === 'picking') {
      const chosen = chooseOption(state.pendingOptions, config.strategy, state.rng);
      if (!chosen) break;
      applyPick(state, chosen);
      continue;
    }
    if (state.phase === 'installing') {
      const target = chooseTarget(state, config.strategy, state.rng);
      if (!target) break;
      installMod(state, target.def.id);
      reorderAfterInstall(state, config.strategy, target);
      continue;
    }
    tick(state);
    // 事件只服务渲染层，批量回归里必须清掉，否则一局下来会堆成几十万条
    state.events.length = 0;
  }

  return {
    reachedWave: state.wave,
    cleared: state.phase === 'won',
    durationMs: state.totalMs,
    installs: state.stats.installs,
    team: state.team.map((h) => ({
      heroId: h.def.id,
      slot: h.slot,
      mods: h.mods.map((m) => m.id),
    })),
  };
}

export interface BatchStats {
  strategy: PickStrategy;
  runs: number;
  clearRate: number;
  /** 卡关波次的中位数与分位数 */
  medianWave: number;
  p25Wave: number;
  p75Wave: number;
  /**
   * 平均到达波次。衡量策略差异时看这个而不是中位数 ——
   * 中位数是整数，两个策略明明差出数倍通关率，中位数却可能只差 1。
   */
  meanWave: number;
  /** 每波的到达率，索引 0 对应第 1 波 */
  reachRate: number[];
  avgDurationSec: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[idx] ?? 0;
}

export function simulateBatch(
  strategy: PickStrategy,
  runs: number,
  seedBase = 1,
): BatchStats {
  const waves: number[] = [];
  let cleared = 0;
  let totalMs = 0;
  const reachCount = new Array<number>(TOTAL_WAVES).fill(0);

  for (let i = 0; i < runs; i += 1) {
    const r = simulateRun({ strategy, seed: seedBase + i * 7919 });
    waves.push(r.reachedWave);
    if (r.cleared) cleared += 1;
    totalMs += r.durationMs;
    const upTo = r.cleared ? TOTAL_WAVES : r.reachedWave - 1;
    for (let w = 0; w < upTo; w += 1) {
      const cur = reachCount[w];
      if (cur !== undefined) reachCount[w] = cur + 1;
    }
  }

  const sorted = [...waves].sort((a, b) => a - b);
  return {
    strategy,
    runs,
    clearRate: cleared / runs,
    medianWave: quantile(sorted, 0.5),
    p25Wave: quantile(sorted, 0.25),
    p75Wave: quantile(sorted, 0.75),
    meanWave: waves.reduce((a, b) => a + b, 0) / runs,
    reachRate: reachCount.map((c) => c / runs),
    avgDurationSec: totalMs / runs / 1000,
  };
}
