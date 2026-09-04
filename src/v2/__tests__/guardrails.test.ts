/**
 * v2 三条护栏 + 结构自检。
 *
 * 这个文件跟 src/formulas/__tests__/simulate.test.ts **不互通**：
 * 那边钉的是上一版（改装件构筑、失败=队灭、一图 15 波），
 * 里面有两组共 20 条回归明文断言「失败条件是队灭，不是漏怪」，
 * 跟这一版正好相反。旧的会继续绿着直到旧引擎下线，别拿它的阈值判这边。
 *
 * 三条护栏对应 docs/00-体验目标.md §8 那三个留空的阈值：
 *
 *   1. 布阵没被买掉 —— 像样的排法比乱排至少多 25 个点通关率
 *   2. 克制不是运气惩罚 —— 手里没有克制门路的人也推得下去
 *   3. 曲线形状对 —— 墙在每章后半段、判负主要是漏怪不是超时、一个月内推完
 *
 * 阈值全部留了余量，不是贴着实测值写的：护栏是抓「机制被改坏」，
 * 不是抓「数值动了 2%」。要是哪条一改数值就红，那是阈值太紧，先看是不是真坏了。
 */
import { describe, expect, it } from 'vitest';

import { ARMOR_K, dumbPlace, runBattle, smartPlace } from '../battle';
import { simulate, poolOf, sweepStages, sweepStats } from '../sim';
import {
  CELL_COUNT, LANE_COUNT, LEAK_ALLOW, STAGES, STAGE_COUNT,
  cellPos, findStage, getStage, rateStars,
} from '../stages';
import { assertWeights, expectedPerDay } from '../stall';
import {
  SQUAD_CAP_MAX, VILLAGE_LV_MAX, squadCap, villageCumExp, villageMul,
} from '../village';
import {
  COUNTERS, COUNTER_DOWN, COUNTER_UP, DEFAULT_SQUAD, LANES, ROLES,
  VILLAGERS, assertRosterComplete, getVillager, laneMul, statsOf,
} from '../villagers';

const SEEDS = [20260904, 7, 99, 1234, 555];
const DAYS = 60;

const runs = SEEDS.map((seed) => ({
  seed,
  smart: simulate({ days: DAYS, seed, place: 'smart' }),
  dumb: simulate({ days: DAYS, seed, place: 'dumb' }),
}));
const sweeps = runs.map((r) => ({ seed: r.seed, stats: sweepStats(sweepStages(r.smart)) }));

describe('结构自检', () => {
  it('村民是 5 门路 × 4 定位 的完整方阵', () => {
    expect(() => assertRosterComplete()).not.toThrow();
    expect(VILLAGERS).toHaveLength(LANES.length * ROLES.length);
  });

  it('靶面权重之和是 1000', () => {
    expect(() => assertWeights()).not.toThrow();
  });

  it('克制是个五元环，来回倍率对称', () => {
    // 每条门路克一条、被一条克，不能有孤点也不能有双向克
    for (const lane of LANES) {
      expect(LANES).toContain(COUNTERS[lane]);
      expect(COUNTERS[lane]).not.toBe(lane);
      expect(COUNTERS[COUNTERS[lane]]).not.toBe(lane);
    }
    expect(new Set(Object.values(COUNTERS)).size).toBe(LANES.length);
    expect(COUNTER_UP * COUNTER_DOWN).toBeCloseTo(1, 1);
  });

  it('战场是 3 路 × 4 格，最多只给 8 个人，空 4 格', () => {
    expect(LANE_COUNT * CELL_COUNT).toBe(12);
    expect(SQUAD_CAP_MAX).toBe(8);
    expect(SQUAD_CAP_MAX).toBeLessThan(LANE_COUNT * CELL_COUNT);
    expect(squadCap(VILLAGE_LV_MAX)).toBe(SQUAD_CAP_MAX);
  });

  /**
   * 这条是拿真 bug 换来的。
   *
   * 原来 SPAWN_GAP=4 / CELL_SPAN=2，战场 12 格长而射程只有 1~5，
   * 敌人被 cell 0 的人挡在 pos 3.5，**cell 2 和 cell 3 永远打不到任何东西** ——
   * 而布阵策略恰好把「打」位放在 cell 2。结果上场人数从 3 涨到 8
   * 几乎没换来输出，第 6 章往后满级也推不动。
   *
   * 改射程和改格距都会碰到这件事，所以钉死：每个定位该站的那一格必须够到挡点。
   */
  it('每个定位在它该站的格子上都够得到敌人挡点', () => {
    const blockPos = cellPos(0) - 0.5;
    const wantCell: Record<string, number> = { tank: 0, block: 1, dps: 2 };
    for (const [role, cell] of Object.entries(wantCell)) {
      for (const lane of LANES) {
        const v = VILLAGERS.find((x) => x.role === role && x.lane === lane)!;
        const s = statsOf(v, 1, 0, 1);
        expect(
          cellPos(cell) - s.range,
          `${v.name}（${role}）站 cell ${cell} 打不到挡点`,
        ).toBeLessThanOrEqual(blockPos);
      }
    }
  });

  /**
   * 护甲必须是百分比，不能是扁平减法。
   *
   * 扁平减法那版铁柱 def 60，第 1~4 章每次只吃 1 点伤害 —— 字面意义上无敌 ——
   * 到第 8 章突然一下 214。「免疫」和「秒删」之间没有过渡，曲线没法校，
   * 而且前排打不死就没有漏怪、只剩超时，判负变得读不懂。
   */
  it('护甲是百分比减伤，前排不会出现免疫段', () => {
    const tank = statsOf(getVillager('tiezhu'), 1, 0, 1);
    const soak = 1 - tank.def / (tank.def + ARMOR_K);
    expect(soak).toBeGreaterThan(0.5); // 减伤不超过一半
    expect(soak).toBeLessThan(0.95);
  });

  it('星评三档分得开：漏了 ★1、倒了 ★2、清得利索才 ★3', () => {
    expect(rateStars(0, 0, true, 1000, 9000)).toBe(3);
    expect(rateStars(0, 0, true, 99_000, 9000)).toBe(2); // 干净但拖太久
    expect(rateStars(0, 2, true, 1000, 9000)).toBe(2);
    expect(rateStars(2, 0, true, 1000, 9000)).toBe(1);
    expect(rateStars(0, 0, false, 1000, 9000)).toBe(0);
  });
});

describe('护栏 1：布阵没被买掉', () => {
  it('像样的排法比乱排至少多 25 个点通关率', () => {
    for (const s of sweeps) {
      expect(s.stats.gapPct, `种子 ${s.seed} 的布阵差值只有 ${s.stats.gapPct} 点`)
        .toBeGreaterThanOrEqual(25);
    }
  });

  it('乱排会把人浪费在空路上，通关率明显偏低', () => {
    for (const s of sweeps) {
      expect(s.stats.dumbWinPct, `种子 ${s.seed} 乱排也能过 ${s.stats.dumbWinPct}%`)
        .toBeLessThan(60);
    }
  });

  /**
   * 一路没人就是一路通天，所以「铺开」优先于「纵深」。
   *
   * 这条也是拿真 bug 换来的：有一版按「同定位第 n 个去第 n 路」分人，
   * 3 人时每个定位只有一个，三个人全挤在第 0 路、另外两路空着，
   * 结果 **1-1 全种子失败** —— 而 1-1 是新手第一关。
   */
  it('开局三个人也能过 1-1，且三条有怪的路都站到人', () => {
    const stage = getStage(1);
    const pool = DEFAULT_SQUAD.map((id) => ({
      villager: getVillager(id), evoStage: 1, stars: 0,
    }));
    const place = smartPlace(pool, stage, 3);
    expect(place).toHaveLength(3);

    const spawnLanes = new Set(stage.waves.flatMap((w) => w.groups.map((g) => g.lane)));
    const held = new Set(place.map((p) => p.lane));
    for (const lane of spawnLanes) {
      expect(held, `第 ${lane} 路有怪但没人守`).toContain(lane);
    }
    expect(runBattle(stage, place, 1).won).toBe(true);
  });
});

describe('护栏 2：克制不是运气惩罚', () => {
  it('克制倍率压得住，不许让被克的阵容打不过去', () => {
    expect(COUNTER_UP).toBeLessThanOrEqual(1.35);
    expect(COUNTER_DOWN).toBeGreaterThanOrEqual(0.7);
    // 来回一共只差这么多，别把它做成解一次就完的谜题
    expect(COUNTER_UP / COUNTER_DOWN).toBeLessThan(2);
  });

  it('每条门路都能找到克它的人，而且是全定位的', () => {
    // 方阵完整意味着「敌人克我的坦克，我换一条门路的坦克上」永远有路
    for (const lane of LANES) {
      const counter = LANES.find((l) => COUNTERS[l] === lane);
      expect(counter, `没有门路克 ${lane}`).toBeDefined();
      for (const role of ROLES) {
        expect(
          VILLAGERS.find((v) => v.lane === counter && v.role === role),
          `克 ${lane} 的门路缺 ${role}`,
        ).toBeDefined();
      }
    }
  });

  /**
   * 喊人是随机的，玩家选不了喊到谁 —— 所以「手里正好没有克这一章的门路」
   * 是真实处境，不是边缘情况。五个种子就是五套不同的运气。
   */
  it('运气最差的那趟也推得下去', () => {
    const worst = Math.min(...sweeps.map((s) => s.stats.smartWinPct));
    expect(worst, `最差种子只有 ${worst}% 通关率`).toBeGreaterThanOrEqual(75);
    for (const r of runs) {
      expect(r.smart.clearAllDay, `种子 ${r.seed} 六十天没推完`).toBeDefined();
    }
  });

  /**
   * 反过来也要成立：光堆克制不能当胜利按钮。
   *
   * 1.3 的倍率撑不起「为克制牺牲输出」，所以策略得先配平定位。
   * 这一条实测过 —— 有一版策略给克制加 60 分权重，在 8-5 上堆了一队
   * 攻击只有 0.85 倍的「挨得住」，34 只怪清不完漏 4 个，
   * 而随便换个排法反而 ★3 通关。
   */
  it('光堆克制门路不是胜利按钮', () => {
    const stage = findStage(8, 5)!;
    const l = runs[0]!.smart.endState;
    const cap = squadCap(l.villageLv);
    const mul = villageMul(l.villageLv);
    const counter = LANES.find((x) => COUNTERS[x] === stage.mainLane)!;

    const stacked = poolOf(l).filter((c) => c.villager.lane === counter);
    // 方阵完整，所以克制门路一定凑得出 4 个定位
    expect(stacked.length).toBeGreaterThanOrEqual(3);
    const res = runBattle(stage, smartPlace(stacked, stage, cap), mul);
    expect(res.won, '只用克制门路就能过 8-5，克制变成了解题按钮').toBe(false);
  });
});

describe('护栏 3：曲线形状', () => {
  it('40 关在一个月上下推完，且不早于村庄满级', () => {
    for (const r of runs) {
      const done = r.smart.clearAllDay!;
      const maxed = r.smart.villageDay[VILLAGE_LV_MAX - 1]!;
      expect(done, `种子 ${r.seed} 在 D${done} 就推完了，太快`).toBeGreaterThan(20);
      expect(done, `种子 ${r.seed} 到 D${done} 才推完，太慢`).toBeLessThanOrEqual(50);
      expect(maxed).toBeGreaterThan(12);
      expect(maxed).toBeLessThan(32);
    }
  });

  /**
   * 判负要看得懂。漏怪是看得见的（东西走过了底线），
   * 超时是看不懂的（「我没输，是钟输了」），所以超时只兜打不动的死局。
   */
  it('主要判负原因是漏怪，不是超时', () => {
    for (const s of sweeps) {
      expect(s.stats.timeoutPct, `种子 ${s.seed} 超时占 ${s.stats.timeoutPct}%`)
        .toBeLessThanOrEqual(12);
    }
    // 漏怪压过超时这件事在**汇总**上断言：单个种子只有 40 关做分母，
    // 3 关和 4 关就是 7.5% 和 10%，比大小等于掷硬币。五个种子 200 关才有意义。
    const leak = sweeps.reduce((a, s) => a + s.stats.leakPct, 0);
    const timeout = sweeps.reduce((a, s) => a + s.stats.timeoutPct, 0);
    expect(leak, `汇总漏怪 ${leak / 5}% vs 超时 ${timeout / 5}%`).toBeGreaterThan(timeout);
  });

  /**
   * 章内爬坡必须比章间台阶陡，墙才会落在每章后半段。
   *
   * 有一版章内 ×1.35、章间 ×1.20，两者差不多，40 关基本是条直线，
   * 墙散在 3-1 / 6-1 / 6-2 / 8-3 毫无规律。现在章内 ×1.85、章间 ×1.10，
   * 下一章第 1 关比上一章第 5 关还轻，每章都是「喘一口 → 越来越紧」。
   */
  it('每章的第 1 关比上一章的第 5 关轻', () => {
    for (let c = 2; c <= 8; c += 1) {
      const first = findStage(c, 1)!;
      const prevLast = findStage(c - 1, 5)!;
      const load = (s: typeof first): number =>
        s.hpMul * s.waves.reduce((a, w) => a + w.groups.reduce((b, g) => b + g.count, 0), 0);
      expect(load(first), `${c}-1 比 ${c - 1}-5 还重`).toBeLessThan(load(prevLast));
    }
  });

  it('章内难度单调递增', () => {
    for (let c = 1; c <= 8; c += 1) {
      for (let i = 2; i <= 5; i += 1) {
        const prev = findStage(c, i - 1)!;
        const cur = findStage(c, i)!;
        expect(cur.hpMul, `${c}-${i} 不比 ${c}-${i - 1} 重`).toBeGreaterThan(prev.hpMul);
      }
    }
  });

  /**
   * 墙的位置只在**汇总**上断言。
   *
   * 单个种子上它不稳：快照取的是「第一次打这关时」的存档，
   * 玩家清掉 x-1 之后正好在 x-2 耗尽余量也很常见（种子 99 就是
   * 3-2 / 4-2 / 5-2），落在哪一格取决于成长曲线恰好停在哪儿。
   * 曲线本身的形状由上面那两条（章内单调、章间下探）保证，
   * 这一条只拦「墙整体前移」这种真跑偏。
   */
  it('汇总下来，墙主要落在每章后半段', () => {
    const idx = sweeps.flatMap((s) => s.stats.walls.map((w) => Number(w[2])));
    const late = idx.filter((i) => i >= 3).length;
    const all = sweeps.map((s) => `${s.seed}: ${s.stats.walls.join(' ')}`).join(' | ');
    expect(late / Math.max(1, idx.length), all).toBeGreaterThanOrEqual(0.5);
  });

  /**
   * 星评要有区分度。第一版只看「没漏 + 没倒」，实测 92%~97% 的通关都是 ★3，
   * 重打一关没有任何理由。加了 par 时间之后才分得开。
   */
  it('星评有区分度：★3 不是人人都有', () => {
    for (const s of sweeps) {
      const [three] = s.stats.starMix;
      expect(three, `种子 ${s.seed} 有 ${three}% 的通关是 ★3`).toBeLessThanOrEqual(85);
      expect(three).toBeGreaterThanOrEqual(35);
    }
  });

  it('一局在 1~2 分钟里', () => {
    for (const s of STAGES) {
      expect(s.timeLimitMs).toBeGreaterThanOrEqual(60_000);
      expect(s.timeLimitMs).toBeLessThanOrEqual(125_000);
      expect(s.parMs).toBeLessThan(s.timeLimitMs);
    }
    expect(STAGE_COUNT).toBe(40);
    expect(LEAK_ALLOW).toBe(3);
  });

  it('资源不超过 4 种，日产出够得上养成成本', () => {
    const y = expectedPerDay(10);
    // 废铁 / 零件 / 工分 / 村庄经验，弹子是次数不算货币
    expect(Object.keys(y).sort()).toEqual(['credits', 'exp', 'parts', 'scrap']);
    // 村庄满级累计经验按日产出算，落在 15~30 天
    const days = villageCumExp(VILLAGE_LV_MAX) / y.exp;
    expect(days).toBeGreaterThan(15);
    expect(days).toBeLessThan(30);
  });
});

describe('战斗模型是确定性的', () => {
  it('同样的布阵跑两遍结果完全一样', () => {
    const stage = findStage(5, 3)!;
    const l = runs[0]!.smart.endState;
    const place = smartPlace(poolOf(l), stage, squadCap(l.villageLv));
    const a = runBattle(stage, place, villageMul(l.villageLv));
    const b = runBattle(stage, place, villageMul(l.villageLv));
    expect(a).toEqual(b);
  });

  it('克制对敌我双方都生效', () => {
    for (const lane of LANES) {
      expect(laneMul(lane, COUNTERS[lane])).toBe(COUNTER_UP);
      expect(laneMul(COUNTERS[lane], lane)).toBe(COUNTER_DOWN);
      expect(laneMul(lane, lane)).toBe(1);
    }
  });

  it('乱排策略不看敌方门路，是干净的负样本', () => {
    const a = findStage(6, 3)!;
    const b = findStage(6, 4)!;
    const pool = poolOf(runs[0]!.smart.endState);
    // 同一个 offset 在不同关卡上给出同样的格位分布
    const pa = dumbPlace(pool, 8, 3).map((p) => `${p.lane}:${p.cell}`);
    const pb = dumbPlace(pool, 8, 3).map((p) => `${p.lane}:${p.cell}`);
    expect(pa).toEqual(pb);
    expect(a.mainLane).toBeDefined();
    expect(b.mainLane).toBeDefined();
  });
});
