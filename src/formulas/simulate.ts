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

import { MOD_SLOTS_PER_HERO, TOTAL_WAVES } from '../balance/combat';
import { comboOf } from '../balance/combos';
import { getWave } from '../balance/enemies';
import { getHero } from '../balance/heroes';
import { getMod } from '../balance/mods';
import { laneOf, type LaneLevels } from '../balance/lanes';
import { DEFAULT_RUN_GROWTH, type RunGrowth } from '../balance/yard';
import type { PickOption, PickStrategy } from '../balance/picker';
import {
  applyPick,
  createRun,
  installMod,
  installTargets,
  tick,
  type HeroUnit,
  type LoseReason,
  type RunState,
} from '../game/BattleEngine';

/** 非随机策略开局固定带这仨：肉、锤、后排，避免选人干扰「装给谁」的回归 */
const SIM_ROSTER = ['tiezhu', 'dachui', 'laoyanqiang'] as const;

/** 选哪张牌 */
function chooseOption(
  options: readonly PickOption[],
  strategy: PickStrategy,
  rng: () => number,
  state: RunState,
): PickOption | undefined {
  if (options.length === 0) return undefined;

  const recruits = options.filter(
    (o) => o.kind === 'recruit' && !state.team.some((h) => h.def.id === o.heroId),
  );
  if (recruits.length > 0) {
    if (strategy === 'random') return recruits[Math.floor(rng() * recruits.length)];
    for (const id of SIM_ROSTER) {
      const hit = recruits.find((o) => o.kind === 'recruit' && o.heroId === id);
      if (hit) return hit;
    }
    return [...recruits].sort((a, b) => {
      if (a.kind !== 'recruit' || b.kind !== 'recruit') return 0;
      return getHero(b.heroId).hp - getHero(a.heroId).hp;
    })[0];
  }

  if (strategy === 'random') return options[Math.floor(rng() * options.length)];

  const mods = options.filter((o) => o.kind === 'mod');
  if (mods.length === 0) return options[0];

  /**
   * 同一类里挑星级最高的那张。
   *
   * 懂的人当然优先拿村里研发过的那条路 —— 不看星就等于假设玩家无视
   * 自己花过的钱，第二条门路的价值永远量不出来。
   * 星全是 0 时它退化成「取第一张」，白板基线一个字都不变。
   */
  const byKind = (kind: string): PickOption | undefined => {
    const cands = mods.filter((o) => o.kind === 'mod' && getMod(o.modId).kind === kind);
    const starOf = (o: PickOption): number =>
      o.kind === 'mod' ? state.modStars[o.modId] ?? 0 : 0;
    return cands.reduce<PickOption | undefined>(
      (best, o) => (best === undefined || starOf(o) > starOf(best) ? o : best),
      undefined,
    );
  };

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
    // 越挨越猛、反弹、加厚、站得起来、吸血，都是给挨刀那个人的
    case 'rageOnHurt':
    case 'thorns':
    case 'armorPct':
    case 'revive':
    case 'lifesteal':
      return front;
    // 控场、收割、一片、穿透给射程长的，能同时覆盖更多敌人
    case 'slowOnHit':
    case 'execute':
    case 'splash':
    case 'pierce':
      return ranged;
    // 壳给远程：近战本来就挨打，这件的戏是「脆皮也敢挨一口」
    case 'shield':
      return ranged;
    // 暖水瓶倒了没人灌，跟音响一样往后站
    case 'heal':
      return [...targets].sort((a, b) => b.slot - a.slot)[0];
    // 纯倍率给底子最硬的
    case 'frontMult':
    case 'heavySwing':
    case 'atkPct':
    case 'crit':
      return hardest;
    // 电锯焊给近战不亏射程；焊给远程是取舍，懂的人不乱焊
    case 'sawGrip':
      return melee;
    // 音响倒了光环停，别让脆皮站最前扛这件
    case 'teamHaste':
      return [...targets].sort((a, b) => b.slot - a.slot)[0];
    // 小东西会跟主人学那一手（减速、带响、回血），所以先找有手艺的人教，
    // 学不到东西时才退回按力气挑 —— 质变比量变值钱
    case 'summon': {
      // 小东西的攻击按主人算，还会跟主人学那一手，所以先找有手艺的人教；
      // 同样有手艺就挑身上最空的 —— 装配位是稀缺资源，
      // 独立单位吃不到主人的暴击重击那些乘区，占掉主输出的位子不值
      const teachers = targets.filter(
        (h) => h.stats.slowOnHit || h.stats.splash || h.stats.lifestealPct > 0,
      );
      if (teachers.length > 0) {
        return [...teachers].sort(
          (a, b) => a.mods.length - b.mods.length || b.stats.atk - a.stats.atk,
        )[0];
      }
      return hardest;
    }
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

/** 飞碟打后排：队首仍扛步兵，后排两人里把肉的换到最后挡飞碟 */
function reorderForSaucer(state: RunState, strategy: PickStrategy): void {
  if (strategy !== 'smart') return;
  if (!getWave(state.wave).spawns.some((g) => g.enemyId === 'saucer')) return;
  const back = state.team.filter((h) => h.slot > 0);
  if (back.length < 2) return;
  const stout = [...back].sort((a, b) => b.maxHp - a.maxHp)[0];
  const rearSlot = Math.max(...back.map((h) => h.slot));
  if (!stout || stout.slot === rearSlot) return;
  const rear = state.team.find((h) => h.slot === rearSlot);
  const from = stout.slot;
  stout.slot = rearSlot;
  if (rear) rear.slot = from;
}

export interface SimConfig {
  strategy: PickStrategy;
  seed: number;
  /**
   * 钉一件必出。
   *
   * 用来单独量一件破烂的「装给谁」敏感度：同一件必出，只换装法，
   * smart 与 random 拉开多少就是这一件本身挑不挑人。
   * 整池混着跑量不出这个 —— 池子里多一件就会摊薄抽到强定位件的概率，
   * 总差值反而会降，看不出新件本身好不好。
   */
  pinModId?: string;
  /** 打第几档难度阶梯。0 是照旧 */
  ladderLv?: number;
  /**
   * 局外那几条养成线。默认全 0 —— 主曲线永远按「什么都没买」校准，
   * 买了之后变强是养成该有的事，不该把基线一起抬走。
   * 传进来只用于验护栏：满研发不许把这一局打成过家家。
   */
  growth?: RunGrowth;
  laneLv?: LaneLevels;
  carryModId?: string;
}

export interface SimResult {
  /** 打到第几波。cleared 为 true 时等于 TOTAL_WAVES */
  reachedWave: number;
  cleared: boolean;
  /**
   * 卡住的是被打穿还是推不动。调曲线时这两件事的解法相反：
   * 队灭要降敌人输出，推不动要给玩家伤害，混在一起看只会来回拧。
   */
  loseReason?: LoseReason;
  durationMs: number;
  installs: number;
  /** 每个人身上装了什么，用来看构筑是否集中 */
  team: { heroId: string; slot: number; mods: string[] }[];
}

/** 单波最多 1200 tick，15 波留足余量后再乘 2 作为死循环保护 */
const MAX_TICKS = 1200 * TOTAL_WAVES * 2;

export function simulateRun(config: SimConfig): SimResult {
  const state: RunState = createRun(
    config.seed,
    0,
    'ad',
    config.pinModId ?? '',
    undefined,
    undefined,
    '',
    config.ladderLv ?? 0,
    undefined,
    config.growth ?? DEFAULT_RUN_GROWTH,
    { laneLv: config.laneLv, carryModId: config.carryModId },
  );

  let ticks = 0;
  let lastSaucerWave = 0;
  while (state.phase !== 'won' && state.phase !== 'lost') {
    if (ticks++ > MAX_TICKS) {
      throw new Error(`模拟未收敛：seed=${config.seed} strategy=${config.strategy}`);
    }
    if (state.phase === 'picking') {
      const chosen = chooseOption(state.pendingOptions, config.strategy, state.rng, state);
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
    if (state.phase === 'fighting' && lastSaucerWave !== state.wave) {
      lastSaucerWave = state.wave;
      reorderForSaucer(state, config.strategy);
    }
    tick(state);
    // 事件只服务渲染层，批量回归里必须清掉，否则一局下来会堆成几十万条
    state.events.length = 0;
  }

  return {
    reachedWave: state.wave,
    cleared: state.phase === 'won',
    loseReason: state.loseReason,
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
  /**
   * 一局平均焊上几件。主体验「把杂兵改造成怪物」的密度就是这个数 ——
   * 它太小，池子里的合体和每人 3 件的取舍都不会发生。
   */
  avgInstalls: number;
  /** 至少点出一次合体的局占比。合体是「两件叠一起出事了」的唯一出口 */
  comboRate: number;
  /** 最满那个人身上的件数均值。贴近 MOD_SLOTS_PER_HERO 才说明取舍真的存在 */
  avgTopSlots: number;
  /** 有人焊满 3 件的局占比 */
  fullSlotRate: number;
  /**
   * 一局里同一条门路占了多少件（最大那条的占比均值）。
   *
   * 这是「我这号走的是哪条路」有没有成立的唯一量化证据：
   * 什么都没研发时它应该贴着随机水平（5 条路里最大那条约 3 成），
   * 研发满一条之后应该明显抬起来。抬不起来说明 laneDrawMul 白给。
   */
  topLaneShare: number;
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
  meta: Pick<SimConfig, 'growth' | 'laneLv' | 'carryModId' | 'ladderLv'> = {},
): BatchStats {
  const waves: number[] = [];
  let cleared = 0;
  let totalMs = 0;
  let installs = 0;
  let comboRuns = 0;
  let topSlots = 0;
  let fullSlotRuns = 0;
  let laneShare = 0;
  const reachCount = new Array<number>(TOTAL_WAVES).fill(0);

  for (let i = 0; i < runs; i += 1) {
    const r = simulateRun({ ...meta, strategy, seed: seedBase + i * 7919 });
    waves.push(r.reachedWave);
    if (r.cleared) cleared += 1;
    totalMs += r.durationMs;
    installs += r.installs;
    if (r.team.some((h) => comboOf(h.mods) !== undefined)) comboRuns += 1;
    const top = Math.max(0, ...r.team.map((h) => h.mods.length));
    topSlots += top;
    if (top >= MOD_SLOTS_PER_HERO) fullSlotRuns += 1;
    laneShare += topLaneShareOf(r);
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
    avgInstalls: installs / runs,
    comboRate: comboRuns / runs,
    avgTopSlots: topSlots / runs,
    fullSlotRate: fullSlotRuns / runs,
    topLaneShare: laneShare / runs,
  };
}

/** 这一局焊上的件里，最集中那条门路占了几成 */
function topLaneShareOf(r: SimResult): number {
  const ids = r.team.flatMap((h) => h.mods);
  if (ids.length === 0) return 0;
  const count = new Map<string, number>();
  for (const id of ids) {
    const lane = laneOf(id);
    if (!lane) continue;
    count.set(lane, (count.get(lane) ?? 0) + 1);
  }
  return Math.max(0, ...count.values()) / ids.length;
}
