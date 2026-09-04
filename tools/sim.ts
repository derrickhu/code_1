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

import { MOD_SLOTS_PER_HERO, TOTAL_WAVES } from '../src/balance/combat';
import { MAX_TEAM_SIZE, PICK_STRATEGIES } from '../src/balance/picker';
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

/**
 * 改造密度：主体验「把杂兵改造成怪物」一局发生几次。
 *
 * 卡关波次达标不等于这一局好玩 —— 焊件数太少时，合体和每人 3 件的取舍
 * 都不会发生，玩家一局下来只是看着三个人站着打。这三个数就是那件事的度量。
 */
function printDensity(all: readonly BatchStats[]): void {
  console.log(`\n改造密度（装配上限每人 ${MOD_SLOTS_PER_HERO} 件 · 全队 ${MOD_SLOTS_PER_HERO * MAX_TEAM_SIZE} 件）`);
  for (const s of all) {
    console.log(
      `${s.strategy.padEnd(9)} 焊上 ${s.avgInstalls.toFixed(2)} 件  ` +
        `最满一人 ${s.avgTopSlots.toFixed(2)} 件  ` +
        `焊满过 ${pct(s.fullSlotRate).padStart(6)}  ` +
        `出过合体 ${pct(s.comboRate).padStart(6)}`,
    );
  }
  const smart = all.find((s) => s.strategy === 'smart');
  if (smart) {
    const cap = MOD_SLOTS_PER_HERO * MAX_TEAM_SIZE;
    console.log(
      `\nsmart 一局用掉 ${((smart.avgInstalls / cap) * 100).toFixed(0)}% 的装配容量 ——` +
        (smart.avgInstalls >= cap * 0.8
          ? ' 容量吃紧，「拆谁的给谁腾位」是真决策。'
          : ' 容量远没用满，每人 3 件的取舍实际不存在。'),
    );
    console.log(
      `合体出现率 ${pct(smart.comboRate)} ——` +
        (smart.comboRate >= 0.6
          ? ' 大多数局都能撞出「这两件叠一起出事了」。'
          : ' 多数局一次都碰不到，合体系统等于没上线。'),
    );
  }
}

/**
 * 门路研发：局外买的那条线到底有没有伸进这一局。
 *
 * 什么都没研发 vs 满研发一条路，对比三件事：
 * 一局的牌有多偏向那条路（topLaneShare）、变强了多少（meanWave）、
 * 以及**装对人还值不值钱**（smart−random 的差）。
 * 第三条是护栏：研发把局里的决策抹平了，这条线就白做。
 */
function printLanes(): void {
  const one1 = { reach: 5, heavy: 0, stand: 0, rage: 0, band: 0 };
  const two = { reach: 5, heavy: 0, stand: 5, rage: 0, band: 0 };
  const plain = simulateBatch('smart', RUNS, 1);
  const one = simulateBatch('smart', RUNS, 1, { laneLv: one1 });
  const both = simulateBatch('smart', RUNS, 1, { laneLv: two });
  const plainR = simulateBatch('random', RUNS, 1);
  const oneR = simulateBatch('random', RUNS, 1, { laneLv: one1 });
  console.log('\n门路研发');
  console.log(
    `什么都没买   同路占比 ${pct(plain.topLaneShare).padStart(6)}  ` +
      `均值 ${plain.meanWave.toFixed(2)} 波  通关率 ${pct(plain.clearRate).padStart(6)}`,
  );
  console.log(
    `满研发一路   同路占比 ${pct(one.topLaneShare).padStart(6)}  ` +
      `均值 ${one.meanWave.toFixed(2)} 波  通关率 ${pct(one.clearRate).padStart(6)}`,
  );
  console.log(
    `满研发两路   同路占比 ${pct(both.topLaneShare).padStart(6)}  ` +
      `均值 ${both.meanWave.toFixed(2)} 波  通关率 ${pct(both.clearRate).padStart(6)}`,
  );
  const allIn = simulateBatch('smart', RUNS, 1, {
    laneLv: { reach: 5, heavy: 5, stand: 5, rage: 5, band: 5 },
  });
  console.log(
    `五路全满     同路占比 ${pct(allIn.topLaneShare).padStart(6)}  ` +
      `均值 ${allIn.meanWave.toFixed(2)} 波  通关率 ${pct(allIn.clearRate).padStart(6)}` +
      (allIn.clearRate >= 0.9 ? '  ← 顶到天花板，该往难度档 / 后面的关放' : ''),
  );
  const lift = one.topLaneShare - plain.topLaneShare;
  console.log(
    `牌面偏向 +${(lift * 100).toFixed(1)} 个点 ——` +
      (lift >= 0.04
        ? ' 研发看得见：这一局的牌真的偏过去了。'
        : ' 偏得太少，玩家说不出自己走的是哪条路。'),
  );
  console.log(
    `买完不许更难：一路 ${pct(one.clearRate)} / 两路 ${pct(both.clearRate)} vs 白板 ${pct(plain.clearRate)} ——` +
      (one.clearRate >= plain.clearRate && both.clearRate >= one.clearRate
        ? ' 每一笔都在往上走。'
        : ' 有一档买了反而更难，专精被自己的偏科反噬了。'),
  );
  // 门路和合体表故意不对齐：专精会挤掉跨路那 5 组，掉一点是预期的（见 lanes.ts 顶部）
  console.log(
    `出过合体 ${pct(plain.comboRate)} → ${pct(one.comboRate)}（满一路） → ${pct(both.comboRate)}（满两路）` +
      '，专精挤掉跨路那几组，掉一点是预期的',
  );
  const gapPlain = plain.meanWave - plainR.meanWave;
  const gapFull = one.meanWave - oneR.meanWave;
  console.log(
    `装对人的价值 ${gapPlain.toFixed(2)} → ${gapFull.toFixed(2)} 波 ——` +
      (gapFull >= 1
        ? ' 研发满了照样得装对人，局里的决策没被买掉。'
        : ' 研发把局里的决策抹平了，等于花钱买掉玩法。'),
  );
}

function main(): void {
  console.log(`村口大战外星人 数值回归 · 每策略 ${RUNS} 局 · 目标中位卡关 ${TARGET_MIN}–${TARGET_MAX} 波`);
  console.log(`当前曲线 hpGrowth=${WAVE_CURVE.hpGrowth} atkGrowth=${WAVE_CURVE.atkGrowth}\n`);

  const all = PICK_STRATEGIES.map((st) => simulateBatch(st, RUNS));
  for (const s of all) printStats(s);

  printDensity(all);
  printLanes();

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
