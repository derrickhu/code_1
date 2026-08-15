/**
 * 批量回归：用不同选牌策略快进 BattleEngine，验证卡关曲线。
 *
 * 战斗逻辑**不在这里**，全部在 game/BattleEngine.ts —— 本文件只负责
 * 「扮演不同水平的玩家」并统计结果。这样回归验过的数值在真机上才成立。
 *
 * 唯一要回答的问题：卡关点是否稳定落在第 9 到 12 波（docs/00-体验目标.md §7）。
 */

import { TOTAL_WAVES } from '../balance/combat';
import { getCounterMult, type Element } from '../balance/counters';
import { getHero } from '../balance/heroes';
import type { PickKind, PickOption, PickStrategy } from '../balance/picker';
import {
  applyPick,
  createRun,
  tick,
  upcomingWaveElement,
  type DeployOptions,
  type Row,
  type RunState,
} from '../game/BattleEngine';

/** 不同水平的玩家在「上场时看不看系别」上的差异 */
function deployOptionsFor(strategy: PickStrategy): DeployOptions {
  if (strategy === 'smart') return { preferCounter: true, shuffle: false };
  if (strategy === 'random') return { preferCounter: false, shuffle: true };
  return { preferCounter: false, shuffle: false };
}

function chooseOption(
  options: readonly PickOption[],
  strategy: PickStrategy,
  upcoming: Element | undefined,
  rng: () => number,
): PickOption | undefined {
  if (options.length === 0) return undefined;
  const byKind = (kind: PickKind) => options.find((o) => o.kind === kind);

  switch (strategy) {
    case 'coverage':
      return byKind('recruit') ?? byKind('levelUp') ?? options[0];
    case 'power':
      return byKind('levelUp') ?? byKind('buff') ?? options[0];
    case 'buff':
      return byKind('buff') ?? byKind('levelUp') ?? options[0];
    case 'smart': {
      // 懂了的玩家：组队阶段从三张里挑能克来袭系别的那个，满编之后转为堆强度。
      // 与 coverage 的唯一差别就是这一步看不看系别，因此两者差值即克制的决策价值。
      if (upcoming) {
        const countering = options.find(
          (o) => o.kind === 'recruit' && getCounterMult(getHero(o.heroId).element, upcoming) > 1,
        );
        if (countering) return countering;
      }
      return byKind('levelUp') ?? byKind('recruit') ?? byKind('buff') ?? options[0];
    }
    case 'random':
      return options[Math.floor(rng() * options.length)];
  }
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
  baseHpLeft: number;
  picks: PickKind[];
  /** 拥有的全部英雄（可多于上场 6 人，多出来的是应对特定系别的替补） */
  roster: { heroId: string; level: number; row: Row }[];
}

/** 单波最多 1200 tick，15 波留足余量后再乘 2 作为死循环保护 */
const MAX_TICKS = 1200 * TOTAL_WAVES * 2;

export function simulateRun(config: SimConfig): SimResult {
  const state: RunState = createRun(config.seed);
  const deployOpts = deployOptionsFor(config.strategy);

  let ticks = 0;
  while (state.phase !== 'won' && state.phase !== 'lost') {
    if (ticks++ > MAX_TICKS) {
      throw new Error(`模拟未收敛：seed=${config.seed} strategy=${config.strategy}`);
    }
    if (state.phase === 'picking') {
      const chosen = chooseOption(
        state.pendingOptions,
        config.strategy,
        upcomingWaveElement(state.wave),
        state.rng,
      );
      if (!chosen) break;
      applyPick(state, chosen, deployOpts);
      continue;
    }
    tick(state, deployOpts);
    // 事件只服务渲染层，批量回归里必须清掉，否则一局下来会堆成几十万条
    state.events.length = 0;
  }

  return {
    reachedWave: state.wave,
    cleared: state.phase === 'won',
    durationMs: state.totalMs,
    baseHpLeft: state.baseHp,
    picks: state.picks,
    roster: state.roster.map((h) => ({ heroId: h.def.id, level: h.level, row: h.row })),
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
