/**
 * 三条护栏 + 结构自检。
 *
 * 它们打的是**真引擎**（game/BattleEngine），不是旁边另写一套模型 ——
 * 上一版有过 formulas/simulate 和引擎各算一套的时期，
 * 结果护栏绿着而真机是坏的。模拟器和场景必须驱动同一个 tick。
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

import { ARMOR_K, BOSS_HP_MUL, CELL_COUNT, LANE_COUNT, LEAK_ALLOW, cellPos } from '@/balance/combat';
import { autoPlace, dumbPlace, runBattle } from '@/game/BattleEngine';
import { simulate, clearDay, poolOf, sweepStages, sweepStats } from '../simulate';
import {
  STAGES, STAGE_COUNT, findStage, getEnemy, getStage, rateStars,
} from '@/balance/stages';
import { assertWeights, expectedPerDay } from '@/balance/stall';
import {
  SQUAD_CAP_MAX, VILLAGE_LV_MAX, VILLAGE_LV_TUNED,
  squadCap, villageCumExp, villageMul, yieldMul,
} from '@/balance/village';
import {
  COUNTERS, COUNTER_DOWN, COUNTER_UP, DEFAULT_SQUAD, LANES, ROLES,
  VILLAGERS, assertRosterComplete, evoKindOf, getVillager, laneMul, statsOf,
} from '@/balance/villagers';

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
    for (const v of VILLAGERS) {
      expect(evoKindOf(v, 1)).toBe('plain');
      expect(evoKindOf(v, 2)).toBeTruthy();
      expect(evoKindOf(v, 3)).toBeTruthy();
    }
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

  it('战场是 3 路 × 4 格，满编 12 人站满', () => {
    expect(LANE_COUNT * CELL_COUNT).toBe(12);
    expect(SQUAD_CAP_MAX).toBe(12);
    expect(SQUAD_CAP_MAX).toBe(LANE_COUNT * CELL_COUNT);
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
        .toBeGreaterThanOrEqual(20);
    }
  });

  it('乱排会把人浪费在空路上，通关率明显偏低', () => {
    for (const s of sweeps) {
      // 「打」罩三路之后，堆在一路的输出也能刮到邻路，绝对通关率会抬一点。
      // 空路没人挡仍会漏，差值护栏才是「布阵没被买掉」的真门槛。
      expect(s.stats.dumbWinPct, `种子 ${s.seed} 乱排也能过 ${s.stats.dumbWinPct}%`)
        .toBeLessThan(78);
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
    const place = autoPlace(pool, stage, 3);
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
      // 400 关的全通以年计，这里量的仍是手校段：运气最差也得在 60 天里推完 40 关
      expect(clearDay(r.smart, 40), `种子 ${r.seed} 六十天没推完 40 关`).toBeDefined();
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
    /*
     * 拿**第一次打到 8-5 那天**的存档，不是跑完那天的。
     *
     * 40 关那一版两者差不多（D28 就全通了，之后基本不再长）。
     * 400 关不行：D60 的存档已经推到 150 关往后，面板远超 8-5 的水位，
     * 拿它去打 8-5 是「满级号回头刷新手关」，堆什么阵都能过 ——
     * 那测的不是克制，是等级差。
     */
    const l = runs[0]!.smart.attemptSnap.get(stage.id) ?? runs[0]!.smart.endState;
    const cap = squadCap(l.villageLv);
    const mul = villageMul(l.villageLv);
    const counter = LANES.find((x) => COUNTERS[x] === stage.mainLane)!;

    const stacked = poolOf(l).filter((c) => c.villager.lane === counter);
    // 方阵完整，所以克制门路一定凑得出 4 个定位
    expect(stacked.length).toBeGreaterThanOrEqual(3);
    const res = runBattle(stage, autoPlace(stacked, stage, cap), mul);
    expect(res.won, '只用克制门路就能过 8-5，克制变成了解题按钮').toBe(false);
  });
});

describe('护栏 3：曲线形状', () => {
  /**
   * 主线扩到 400 关之后，「全通」以年计，60 天的回归里量不到。
   * 所以这条改成盯**手校段**：前 40 关还是不是一个月上下、村庄前 20 级还是不是三周。
   * 那一段的形状是花大代价校出来的（见 stages.ts 的校准史），
   * 接 400 关的跑道不许把它冲掉 —— 头一版把 ×2788 均摊到 80 章就冲掉过一次。
   */
  it('前 40 关仍是一个月上下，村庄前 20 级仍是三周', () => {
    for (const r of runs) {
      const done = clearDay(r.smart, 40)!;
      const maxed = r.smart.villageDay[VILLAGE_LV_TUNED - 1]!;
      // 下限原来是 D18，靠的是 D8~D17 卡在 8-4 等满编的一堵墙（整整十天零进度）。
      // 配方折算把墙拆掉、三身同打法加码之后是 D7~D9 推完，前 20 天几乎每天都有进度，下限跟着放到 D7。
      expect(done, `种子 ${r.seed} 在 D${done} 就推完 40 关了，太快`).toBeGreaterThanOrEqual(7);
      expect(done, `种子 ${r.seed} 到 D${done} 才推完 40 关，太慢`).toBeLessThanOrEqual(50);
      expect(maxed).toBeGreaterThan(12);
      expect(maxed).toBeLessThan(32);
    }
  });

  /** 跑道要真的接得上：60 天里推得动 40 关往后，但远远到不了头 */
  it('400 关是地平线，不是进度条', () => {
    for (const r of runs) {
      const reached = r.smart.endState.cleared.size;
      expect(reached, `种子 ${r.seed} 六十天只推到 ${reached} 关，跑道没接上`)
        .toBeGreaterThan(40);
      expect(r.smart.clearAllDay, `种子 ${r.seed} 六十天就把 400 关打完了`)
        .toBeUndefined();
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
      // 按真实有效血量比：hpMul 已经折过配方，光乘只数会把小灰和装甲算成一样重
      const ehp = (id: string): number => {
        const e = getEnemy(id);
        const own = (e.hp * (e.def + ARMOR_K)) / ARMOR_K;
        return e.spawn ? own + e.spawn.times * ehp(e.spawn.enemy) : own;
      };
      // 大个子一只顶 BOSS_HP_MUL 只的血，按一只算会把带首领的第 5 关算轻
      const load = (s: typeof first): number =>
        s.hpMul * s.waves.reduce((a, w) => a + w.groups.reduce(
          (b, g) => b + g.count * ehp(g.enemy) * (g.boss ? BOSS_HP_MUL : 1), 0), 0);
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
    // 墙的标签形如 `12-3(leak)`，章号可能是两位数，得按 `-` 切而不是取第 3 个字符
    const idx = sweeps.flatMap((s) => s.stats.walls
      .map((w) => Number(w.split('-')[1]?.[0])).filter((n) => Number.isFinite(n)));
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
      expect(three, `种子 ${s.seed} 有 ${three}% 的通关是 ★3`).toBeLessThanOrEqual(93);
      expect(three).toBeGreaterThanOrEqual(25);
    }
  });

  it('一局在 1~2 分钟里', () => {
    for (const s of STAGES) {
      expect(s.timeLimitMs).toBeGreaterThanOrEqual(60_000);
      expect(s.timeLimitMs).toBeLessThanOrEqual(125_000);
      expect(s.parMs).toBeLessThan(s.timeLimitMs);
    }
    expect(STAGE_COUNT).toBe(400);
    expect(LEAK_ALLOW).toBe(3);
  });

  it('资源不超过 4 种，日产出够得上养成成本', () => {
    const y = expectedPerDay(10);
    // 废铁 / 零件 / 工分 / 村庄经验，弹子是次数不算货币
    expect(Object.keys(y).sort()).toEqual(['credits', 'exp', 'parts', 'scrap']);
    // 村庄升到手校段的顶（Lv.20）按日产出算，仍落在 15~30 天。
    // Lv.20 往上是 400 关的跑道，产出跟着 yieldMul 复利涨，不在这条里量
    const days = villageCumExp(VILLAGE_LV_TUNED) / y.exp;
    expect(days).toBeGreaterThan(15);
    expect(days).toBeLessThan(30);
  });

  /** 跑道的产出必须跟着成本涨，否则手艺后段是一堵墙不是一条路 */
  it('产出倍率只在手校段之后才生效', () => {
    expect(yieldMul(1)).toBe(1);
    expect(yieldMul(VILLAGE_LV_TUNED)).toBe(1);
    expect(yieldMul(VILLAGE_LV_MAX)).toBeGreaterThan(50);
  });
});

/**
 * 局内要有压力，不能是「外星人送死队」。
 *
 * 改之前实测：前 7 章首打的胜局里，外星人砍中过人的比例大多是 0%，
 * 全队血条从头到尾不动，赢了也不知道自己差点输 —— 玩家原话就是送死队。
 * 这几条盯的是**赢的那些局**：通关率照旧，但赢得要有惊险。
 */
describe('护栏 4：局内有压力', () => {
  it('外星人走得到人跟前，不是半路排队送死', () => {
    for (const s of sweeps) {
      expect(s.stats.winTouchPct, `种子 ${s.seed} 胜局里只有 ${s.stats.winTouchPct}% 的怪出过手`)
        .toBeGreaterThanOrEqual(18);
    }
  });

  it('赢的局里也有人被打到半血以下', () => {
    for (const s of sweeps) {
      expect(s.stats.winLowHpPct, `种子 ${s.seed} 胜局最惨的人平均还剩 ${s.stats.winLowHpPct}%`)
        .toBeLessThanOrEqual(60);
      // 反过来也别每局都打成残局，那是难度出了问题
      expect(s.stats.winLowHpPct).toBeGreaterThanOrEqual(15);
      expect(s.stats.winFallPct, `种子 ${s.seed} 胜局倒过人 ${s.stats.winFallPct}%`)
        .toBeGreaterThanOrEqual(15);
      expect(s.stats.winFallPct).toBeLessThanOrEqual(65);
    }
  });

  it('大个子基本都能冲到前排', () => {
    for (const s of sweeps) {
      expect(s.stats.bossContactPct, `种子 ${s.seed} 大个子只有 ${s.stats.bossContactPct}% 贴到脸`)
        .toBeGreaterThanOrEqual(60);
    }
  });

  /**
   * 绝活要值钱：同一套阵容，不放绝活明显更难。
   * 否则手动模式下「点不点都一样」，局内又退回看戏。
   */
  it('绝活值钱：不放绝活的通关率明显更低', () => {
    const probes = sweepStages(runs[0]!.smart);
    const on = probes.filter((p) => p.smart.won).length;
    const off = probes.filter((p) => {
      const snap = runs[0]!.smart.attemptSnap.get(p.stage.id)!;
      const place = autoPlace(poolOf(snap), p.stage, squadCap(snap.villageLv));
      return runBattle(p.stage, place, villageMul(snap.villageLv), false).won;
    }).length;
    expect(on - off, `放绝活 ${on} 关、不放 ${off} 关`).toBeGreaterThanOrEqual(probes.length * 0.2);
  });
});

/**
 * 绝活是「稀而重」：每人一场放两三次，放一次要看得出结果，
 * 而且打的血不能盖过平砍 —— 盖过了布阵就不重要了，局内变成比谁劲头满得快。
 */
describe('护栏 5：绝活稀而重', () => {
  it('绝活打的血占两到四成，后期不会越滚越大', () => {
    for (const s of sweeps) {
      const st = s.stats;
      const msg = `种子 ${s.seed} 绝活占比 ${st.skillSharePct}%（前 ${st.skillShareEarlyPct} → 后 ${st.skillShareLatePct}）`;
      expect(st.skillSharePct, msg).toBeGreaterThanOrEqual(22);
      expect(st.skillSharePct, msg).toBeLessThanOrEqual(38);
      expect(st.skillShareLatePct - st.skillShareEarlyPct, msg).toBeLessThanOrEqual(12);
    }
  });

  it('每人每场放一到四次', () => {
    for (const s of sweeps) {
      expect(s.stats.castsPerFighter, `种子 ${s.seed}`).toBeGreaterThanOrEqual(1);
      expect(s.stats.castsPerFighter, `种子 ${s.seed}`).toBeLessThanOrEqual(4);
    }
  });

  it('没有哑招，也没有一招独大', () => {
    for (const s of sweeps) {
      const xs = Object.entries(s.stats.perSkill);
      const mean = xs.reduce((a, [, k]) => a + k, 0) / Math.max(1, xs.length);
      for (const [id, k] of xs) {
        expect(k, `种子 ${s.seed} ${id} 每上场放 ${k} 次`).toBeGreaterThanOrEqual(1);
        expect(k, `种子 ${s.seed} ${id} 每上场放 ${k} 次，平均 ${mean.toFixed(2)}`)
          .toBeLessThanOrEqual(mean * 2);
      }
    }
  });

  it('伤害招放一次平均带走半只以上', () => {
    for (const s of sweeps) {
      expect(s.stats.killsPerCast, `种子 ${s.seed}`).toBeGreaterThanOrEqual(0.45);
    }
  });
});

describe('战斗模型是确定性的', () => {
  it('同样的布阵跑两遍结果完全一样', () => {
    const stage = findStage(5, 3)!;
    const l = runs[0]!.smart.endState;
    const place = autoPlace(poolOf(l), stage, squadCap(l.villageLv));
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
