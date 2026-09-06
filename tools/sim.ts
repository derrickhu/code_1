/**
 * 数值报表：npm run sim
 *
 * 跑的是真引擎（game/BattleEngine），和护栏、和真机同一个 tick。
 *
 * 这里要回答四个问题，对应 docs/00-体验目标.md §8 留空的那三个阈值：
 *
 *   1. 40 关推完多少天 —— 该和村庄满级的 ~19.5 天对得上。
 *   2. 卡关点在哪儿 —— 该稳定落在每章第 4–5 关。
 *   3. 布阵值多少个点 —— smart 对 dumb 的通关率差。差得少，
 *      说明「谁放哪一格」是假决策，得回去改战场几何，不是调曲线。
 *   4. 克制会不会变成运气惩罚 —— 换几个种子（= 换几套喊到的人）看最差那趟。
 */
import { CELL_COUNT, LANE_COUNT } from '../src/balance/combat';
import { STAGE_COUNT, stageEnemyCount } from '../src/balance/stages';
import { assertWeights, DAILY_PELLETS, expectedPerDay } from '../src/balance/stall';
import {
  SQUAD_CAP_MAX, VILLAGE_LV_MAX, villageCumExp, villageMul,
} from '../src/balance/village';
import { LANE_NAME, VILLAGERS, assertRosterComplete } from '../src/balance/villagers';
import { simulate, sweepStages, sweepStats, type SimResult } from '../src/formulas/simulate';

const DAYS = Number(process.env.DAYS ?? 60);
const SEEDS = (process.env.SEEDS ?? '20260904,7,99,1234,555')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));

function bar(rate: number, width = 20): string {
  const filled = Math.max(0, Math.min(width, Math.round(rate * width)));
  return '█'.repeat(filled) + '·'.repeat(width - filled);
}

function pad(n: number, w: number, d = 0): string {
  return n.toFixed(d).padStart(w);
}

/* ---------------- 自检 ---------------- */

assertRosterComplete();
assertWeights();

console.log('== 结构自检 ==');
console.log(
  `村民 ${VILLAGERS.length} 人（5 门路 × 4 定位 方阵完整）· ` +
  `战场 ${LANE_COUNT} 路 × ${CELL_COUNT} 格 = ${LANE_COUNT * CELL_COUNT} 格，满编 ${SQUAD_CAP_MAX} 人`,
);
console.log(`主线 ${STAGE_COUNT} 关 · 村庄满级 Lv.${VILLAGE_LV_MAX}（累计 ${villageCumExp(VILLAGE_LV_MAX)} 经验，面板 ×${villageMul(VILLAGE_LV_MAX).toFixed(2)}）`);

/* ---------------- 摊子产出 ---------------- */

console.log(`\n== 弹弓摊日产出（每天 ${DAILY_PELLETS} 发）==`);
for (const lv of [1, 5, 10, 15, 20]) {
  const y = expectedPerDay(lv);
  console.log(
    `Lv.${String(lv).padStart(2)}  经验 ${pad(y.exp, 6, 1)}  废铁 ${pad(y.scrap, 6, 1)}  ` +
    `零件 ${pad(y.parts, 5, 1)}  工分 ${pad(y.credits, 5, 1)}`,
  );
}

/* ---------------- 长线 ---------------- */

function reportRun(sim: SimResult, label: string): void {
  const chDays = sim.chapterDay
    .map((d, i) => (d === undefined ? `${i + 1}章 —` : `${i + 1}章 D${d}`))
    .join('  ');
  console.log(`\n${label}  推到 ${sim.finalStage}/${STAGE_COUNT} 关` +
    (sim.clearAllDay ? `，全通于 D${sim.clearAllDay}` : '，未通完'));
  console.log(`  首达：${chDays}`);
  console.log(`  村庄满级：${sim.villageDay[VILLAGE_LV_MAX - 1] ? `D${sim.villageDay[VILLAGE_LV_MAX - 1]}` : '未满'}`);

  // 每 5 天一行
  console.log('  天  村庄  关卡  人数/上场   废铁  零件  工分  卡在');
  for (const d of sim.days) {
    if (d.day % 5 !== 0 && d.day !== 1) continue;
    console.log(
      `  ${pad(d.day, 2)}  Lv.${pad(d.villageLv, 2)}  ${pad(d.stage, 4)}  ` +
      `${pad(d.roster, 4)}/${d.cap}     ${pad(d.scrap, 5)} ${pad(d.parts, 5)} ${pad(d.credits, 5)}  ${d.stuckAt ?? '—'}`,
    );
  }
}

const runs = SEEDS.map((seed) => ({
  seed,
  smart: simulate({ days: DAYS, seed, place: 'smart' }),
  dumb: simulate({ days: DAYS, seed, place: 'dumb' }),
}));

console.log(`\n== 长线（${DAYS} 天，${SEEDS.length} 个种子 = ${SEEDS.length} 套喊到的人）==`);
reportRun(runs[0]!.smart, `种子 ${runs[0]!.seed}`);

console.log('\n  种子间对比（布阵值多少天）');
for (const r of runs) {
  const s = r.smart.clearAllDay ? `D${r.smart.clearAllDay}` : `${r.smart.finalStage}关`;
  const d = r.dumb.clearAllDay ? `D${r.dumb.clearAllDay}` : `${r.dumb.finalStage}关`;
  console.log(
    `  种子 ${String(r.seed).padStart(9)}  smart ${s.padStart(6)}  dumb ${d.padStart(6)}  ` +
    `村庄 Lv.${pad(r.smart.days.at(-1)!.villageLv, 2)}  入伙 ${pad(r.smart.days.at(-1)!.roster, 2)} 人`,
  );
}

/* ---------------- 关卡扫描 ---------------- */

console.log('\n== 关卡扫描（拿到达建议等级那天的真实存档打）==');
for (const r of runs) {
  const probes = sweepStages(r.smart);
  const st = sweepStats(probes);
  console.log(
    `\n种子 ${r.seed}：smart 通关 ${st.smartWinPct}%  dumb ${st.dumbWinPct}%  ` +
    `布阵差 ${st.gapPct > 0 ? '+' : ''}${st.gapPct} 点`,
  );
  console.log(`  失败原因：漏怪 ${st.leakPct}%  超时 ${st.timeoutPct}%`);
  console.log(`  星评（占通关数）：★★★ ${st.starMix[0]}%  ★★ ${st.starMix[1]}%  ★ ${st.starMix[2]}%`);
  console.log('  每章 smart 通关率');
  st.byChapter.forEach((p, i) => {
    console.log(`    ${i + 1} 章  ${bar(p / 100)} ${pad(p, 5, 1)}%`);
  });
  if (st.walls.length > 0) {
    console.log(`  打不过：${st.walls.join(' ')}`);
  }
}

/* ---------------- 结论 ---------------- */

console.log('\n== 逐关明细（种子 20260904）==');
console.log('  关卡  村庄 人数/上场  主门路  只数   smart          dumb');
for (const p of sweepStages(runs[0]!.smart)) {
  const mark = (r: typeof p.smart): string => (r.won ? `通 ★${r.stars} ${pad(r.elapsedMs / 1000, 4, 0)}s` : `${r.reason === 'leak' ? '漏' : '超'} 漏${r.leaked} 剩${r.leftAlive}`.padEnd(11));
  console.log(
    `  ${p.stage.label.padEnd(4)}  Lv.${pad(p.atLv, 2)} ${pad(p.roster, 3)}/${p.cap}` +
    `${p.capped ? '*' : ' '}   ${LANE_NAME[p.stage.mainLane].padEnd(5)} ${pad(stageEnemyCount(p.stage), 4)}  ` +
    `${mark(p.smart).padEnd(13)}  ${mark(p.dumb)}`,
  );
}
console.log('  （* = 长线里没推到这关，用的是满级存档）');

const first = sweepStats(sweepStages(runs[0]!.smart));
const clearDays = runs.map((r) => r.smart.clearAllDay).filter((d): d is number => d !== undefined);

console.log('\n== 回填 §8 用的三个数 ==');
console.log(`  1. 40 关推完：${clearDays.length === 0 ? '没有种子通完' : `D${Math.min(...clearDays)} ~ D${Math.max(...clearDays)}`}（目标对齐村庄满级 ~D20）`);
console.log(`  2. 卡关点：见上面每章通关率，墙该在第 4–5 关`);
console.log(`  3. 布阵差值：${first.gapPct} 点（太小说明布阵是假决策）`);
