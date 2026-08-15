/**
 * 数值回归工具：npm run sim
 *
 * 唯一要回答的问题 —— 卡关点是否稳定落在第 9 到 12 波（docs/00-体验目标.md §7）。
 * 同时用不同选牌策略跑，检查「懂了的玩家」（smart）是否真的比乱选（random）打得更深。
 * 若两者差距不明显，说明克制与三选一没有形成决策价值，
 * 那是反目标第一条「我选谁都一样」的数值证据。
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
  console.log(`代号1 数值回归 · 每策略 ${RUNS} 局 · 目标中位卡关 ${TARGET_MIN}–${TARGET_MAX} 波`);
  console.log(`当前曲线 hpGrowth=${WAVE_CURVE.hpGrowth} atkGrowth=${WAVE_CURVE.atkGrowth}\n`);

  const all = PICK_STRATEGIES.map((st) => simulateBatch(st, RUNS));
  for (const s of all) printStats(s);

  const smart = all.find((s) => s.strategy === 'smart');
  const random = all.find((s) => s.strategy === 'random');
  const coverage = all.find((s) => s.strategy === 'coverage');

  if (smart && random) {
    const gap = smart.meanWave - random.meanWave;
    const clearRatio = random.clearRate > 0 ? smart.clearRate / random.clearRate : Infinity;
    console.log(
      `\n整体决策价值：smart 平均多打 ${gap.toFixed(2)} 波，通关率是 random 的 ` +
        `${Number.isFinite(clearRatio) ? `${clearRatio.toFixed(1)} 倍` : '数倍以上'} ——` +
        (gap >= 1 ? ' 会玩确实有回报。' : ' 不足 1 波，玩得好坏没区别。'),
    );
  }
  // smart 与 coverage 都会优先填满阵容，唯一差别是招人与上场时看不看系别，
  // 因此这个差值单独度量克制本身的决策价值
  if (smart && coverage) {
    const gap = smart.meanWave - coverage.meanWave;
    console.log(
      `克制的决策价值：看系别 vs 不看系别，平均相差 ${gap.toFixed(2)} 波 ——` +
        (gap >= 0.8
          ? ' 克制值得玩家关心。'
          : ' 克制强度不足，玩家没有理由在意系别，正撞反目标第一条。'),
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
