/**
 * 数值回归工具：npm run sim
 *
 * 要回答两个问题：
 *
 * 1. 卡关点是否稳定落在第 9 到 12 波（docs/00-体验目标.md §8）。
 * 2. **「装对人」值不值钱** —— smart（按破烂配人）对 random（随便装）的差值。
 *    差值不足 1 波，就是反目标第一条「这几件破烂装谁身上都一样」的数值证据，
 *    要回去改 mods.ts 的定位改写强度，而不是调曲线。
 *
 * 另外看 focus（全堆一个人）与 spread（平均分）：这两条差不多说明构筑没有形状，
 * 「把一个杂兵改造成怪物」就只是句口号。
 */

import { TOTAL_WAVES } from '../src/balance/combat';
import { PICK_STRATEGIES } from '../src/balance/picker';
import { WAVE_CURVE } from '../src/balance/enemies';
import { simulateBatch, type BatchStats } from '../src/formulas/simulate';

const RUNS = Number(process.env.RUNS ?? 500);
const TARGET_MIN = 9;
const TARGET_MAX = 12;

function bar(rate: number, width = 24): string {
  const filled = Math.round(rate * width);
  return '█'.repeat(filled) + '·'.repeat(width - filled);
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function printStats(s: BatchStats): void {
  const inTarget = s.medianWave >= TARGET_MIN && s.medianWave <= TARGET_MAX;
  const flag = inTarget ? '达标' : '偏离';
  console.log(
    `${s.strategy.padEnd(9)} 中位 ${String(s.medianWave).padStart(2)} 波 ` +
      `[p25 ${s.p25Wave} / p75 ${s.p75Wave}] 均值 ${s.meanWave.toFixed(2)}  ` +
      `通关率 ${pct(s.clearRate).padStart(6)}  均时 ${s.avgDurationSec.toFixed(0)}s  ${flag}`,
  );
}

function main(): void {
  console.log(`村口大战外星人 数值回归 · 每策略 ${RUNS} 局 · 目标中位卡关 ${TARGET_MIN}–${TARGET_MAX} 波`);
  console.log(`当前曲线 hpGrowth=${WAVE_CURVE.hpGrowth} atkGrowth=${WAVE_CURVE.atkGrowth}\n`);

  const all = PICK_STRATEGIES.map((st) => simulateBatch(st, RUNS));
  for (const s of all) printStats(s);

  const smart = all.find((s) => s.strategy === 'smart');
  const random = all.find((s) => s.strategy === 'random');
  const focus = all.find((s) => s.strategy === 'focus');
  const spread = all.find((s) => s.strategy === 'spread');

  // smart 与 random 选的牌倾向相同，唯一差别是装给谁，
  // 因此这个差值就是「装对人」本身的决策价值
  if (smart && random) {
    const gap = smart.meanWave - random.meanWave;
    const clearRatio = random.clearRate > 0 ? smart.clearRate / random.clearRate : Infinity;
    console.log(
      `\n装对人的价值：smart 平均多打 ${gap.toFixed(2)} 波，通关率是 random 的 ` +
        `${Number.isFinite(clearRatio) ? `${clearRatio.toFixed(1)} 倍` : '数倍以上'} ——` +
        (gap >= 1
          ? ' 装给谁确实有回报。'
          : ' 不足 1 波，撞上反目标第一条：破烂装谁身上都一样。'),
    );
  }
  if (focus && spread) {
    const gap = Math.abs(focus.meanWave - spread.meanWave);
    console.log(
      `构筑形状：全堆一个人 vs 平均分，相差 ${gap.toFixed(2)} 波 ——` +
        (gap >= 0.8 ? ' 两种路线的手感确实不同。' : ' 差别太小，构筑没有形状。'),
    );
  }

  console.log('\n逐波到达率（smart 策略）');
  if (smart) {
    for (let w = 0; w < TOTAL_WAVES; w += 1) {
      const rate = smart.reachRate[w] ?? 0;
      const marker = w + 1 >= TARGET_MIN && w + 1 <= TARGET_MAX ? '←目标区' : '';
      console.log(`  第 ${String(w + 1).padStart(2)} 波 ${bar(rate)} ${pct(rate).padStart(6)} ${marker}`);
    }
  }
}

main();
