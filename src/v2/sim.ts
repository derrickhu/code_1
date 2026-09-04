/**
 * 模拟器：把摊子、养成、推图三件事咬在一起按天跑。
 *
 * 它要回答的是**校准问题**，不是「好不好玩」：
 *
 *   1. 40 关推完要多少天？（对齐村庄满级的 ~19.5 天）
 *   2. 卡关点落在哪儿？（§8 要求稳定落在每章第 4–5 关）
 *   3. 布阵到底值多少个点？（smart vs dumb 的通关率差）
 *   4. 克制会不会变成运气惩罚？（喊人是随机的，手里没有克制门路时还能不能过）
 *
 * 三条设计决定写在这儿，因为它们是**模型假设**，改之前先想清楚：
 *
 * - **产出用期望值，不掷骰子。** 摊子的方差对长线曲线没有信息量，
 *   而 40 关 × N 天 × 蒙特卡洛的成本全花在重算同一件事上。
 *   `stall.expectedPerPellet` 就是为这个准备的。
 * - **喊人是随机的。** 玩家选不了喊到谁（§4.3 不做概率池也不做定向），
 *   所以这里必须掷骰子 —— 「手里正好没有克制这一章的门路」是真实处境，
 *   护栏要能证明那种情况下也过得去，而不是假设玩家永远有对的人。
 * - **推图会卡住，卡住是有效信号。** 打不过就不再往前，当天到此为止。
 *   弹子的大头来自离线和广告（33 发里的 27 发），所以卡住的人靠村庄等级
 *   还在变强，几天后自己能捅过去 —— 这是曲线自恢复，不是死锁。
 */
import {
  runBattle, smartPlace, dumbPlace,
  type BattleResult, type Candidate, type Placement,
} from './battle';
import {
  STAGES, STAGE_COUNT, getStage, type StageDef,
} from './stages';
import {
  DAILY_PELLETS, PELLET_AD, PELLET_AD_DAILY, PELLET_CLEAR, PELLET_FIRST,
  PELLET_LOSE, PELLET_OFFLINE_CAP, SETTLE_SCRAP,
  expectedPerPellet, mulberry32, type Rng,
} from './stall';
import {
  CALL_COST, CALL_DUP_SCRAP, CALL_PITY_NEW, addVillageExp,
  evoOf, nextEvoCost, squadCap, starsOf, villageMul,
  type Progress,
} from './village';
import {
  DEFAULT_SQUAD, STAR_MAX, VILLAGERS, getVillager, type Role,
} from './villagers';

/** 可写的 Progress，跑模拟时用 */
interface Live {
  villageLv: number;
  villageExp: number;
  roster: string[];
  evo: Record<string, number>;
  stars: Record<string, number>;
  scrap: number;
  parts: number;
  credits: number;
  /** 已首通的关卡 id */
  cleared: Set<number>;
}

function freshLive(): Live {
  return {
    villageLv: 1,
    villageExp: 0,
    roster: [...DEFAULT_SQUAD],
    evo: {},
    stars: {},
    scrap: 0,
    parts: 0,
    credits: 0,
    cleared: new Set(),
  };
}

function asProgress(l: Live): Progress {
  return {
    villageLv: l.villageLv,
    villageExp: l.villageExp,
    roster: l.roster,
    evo: l.evo,
    stars: l.stars,
    scrap: l.scrap,
    parts: l.parts,
    credits: l.credits,
  };
}

/** 手上这些人，按当前阶数和星级摊成候选池 */
export function poolOf(l: Live): Candidate[] {
  const p = asProgress(l);
  return l.roster.map((id) => ({
    villager: getVillager(id),
    evoStage: evoOf(p, id),
    stars: starsOf(p, id),
  }));
}

/**
 * 喂谁先：挨 → 拦 → 打 → 修。
 *
 * 挡不住才会漏，漏够就判负，所以前排的收益直接换算成通关率；
 * 「打」喂早了只是把清怪提前，救不了一条崩掉的路。
 */
const EVO_ORDER: Readonly<Record<Role, number>> = {
  tank: 0, block: 1, dps: 2, heal: 3,
};

function evoPriority(l: Live): string[] {
  return [...l.roster].sort((a, b) => {
    const va = getVillager(a);
    const vb = getVillager(b);
    const d = EVO_ORDER[va.role] - EVO_ORDER[vb.role];
    if (d !== 0) return d;
    return va.id.localeCompare(vb.id);
  });
}

/**
 * 花废铁和零件喂进化。
 *
 * 先把所有人推到二阶，再逐个上三阶 —— 二阶单价 120/4，三阶 400/18，
 * 同样的废铁摊到二阶身上换来的面板多得多，集中冲三阶是亏的。
 */
function spendEvo(l: Live): void {
  const order = evoPriority(l);
  for (const tier of [2, 3]) {
    for (const id of order) {
      while (evoOf(asProgress(l), id) < tier) {
        const cost = nextEvoCost(evoOf(asProgress(l), id));
        if (!cost) break;
        // 各阶单价一致，买不起这个就买不起同阶的任何人，直接收工
        if (l.scrap < cost.scrap || l.parts < cost.parts) return;
        l.scrap -= cost.scrap;
        l.parts -= cost.parts;
        l.evo[id] = evoOf(asProgress(l), id) + 1;
      }
    }
  }
}

/**
 * 花工分喊人。喊到谁是随机的 —— 玩家没得挑，模型也不许挑。
 *
 * 前 CALL_PITY_NEW 次必出新人；之后按「已有人数 / 全池」的比例判重复，
 * 重复折废铁并加一颗星。
 */
function spendCalls(l: Live, rng: Rng, callCount: { n: number }): void {
  while (l.credits >= CALL_COST) {
    l.credits -= CALL_COST;
    callCount.n += 1;

    const owned = new Set(l.roster);
    const missing = VILLAGERS.filter((v) => !owned.has(v.id));
    const forceNew = callCount.n <= CALL_PITY_NEW;
    const dupChance = l.roster.length / VILLAGERS.length;

    if (missing.length > 0 && (forceNew || rng() > dupChance)) {
      const pick = missing[Math.floor(rng() * missing.length)]!;
      l.roster.push(pick.id);
      continue;
    }

    // 重复：折废铁 + 加一颗星（挑星最少的，避免全堆在一个人身上）
    l.scrap += CALL_DUP_SCRAP;
    const p = asProgress(l);
    const low = [...l.roster]
      .filter((id) => starsOf(p, id) < STAR_MAX)
      .sort((a, b) => starsOf(p, a) - starsOf(p, b))[0];
    if (low) l.stars[low] = starsOf(p, low) + 1;
  }
}

export interface DayLog {
  day: number;
  villageLv: number;
  /** 当天结束时打到第几关（已通关数） */
  stage: number;
  chapter: number;
  roster: number;
  cap: number;
  scrap: number;
  parts: number;
  credits: number;
  /** 当天赢了几关、输了几场 */
  wins: number;
  losses: number;
  /** 当天在哪一关卡住了（没卡就是 undefined） */
  stuckAt?: string;
}

export interface SimOptions {
  days?: number;
  seed?: number;
  /** 一天最多打几场（含失败的） */
  attemptsPerDay?: number;
  /** 布阵策略。默认 smart */
  place?: 'smart' | 'dumb';
  /** 看不看摊子的激励广告 */
  watchAds?: boolean;
}

export interface SimResult {
  days: DayLog[];
  /** 第几天首次通到每一章（下标 0 = 第 1 章） */
  chapterDay: (number | undefined)[];
  /** 第几天村庄到每一级（下标 0 = Lv.1） */
  villageDay: (number | undefined)[];
  /** 各村庄等级第一次达到时的存档快照 */
  snapshots: Map<number, Live>;
  /**
   * 第一次去打第 N 关时手上的存档，关卡扫描用。
   *
   * 不按村庄等级建快照：等级第一天就冲到 Lv.6（前几级只要 17~63 点，
   * 日产出 170 点），Lv.2~5 压根没有快照，按等级找就会拿 Lv.1 的三人一阶存档
   * 去打第 3 章，测出来的是个不存在的玩家。
   */
  attemptSnap: Map<number, Live>;
  finalStage: number;
  finalDay: number;
  /** 40 关全通用了多少天，没通完是 undefined */
  clearAllDay?: number;
  /** 跑完那天的存档 */
  endState: Live;
}

function cloneLive(l: Live): Live {
  return {
    villageLv: l.villageLv,
    villageExp: l.villageExp,
    roster: [...l.roster],
    evo: { ...l.evo },
    stars: { ...l.stars },
    scrap: l.scrap,
    parts: l.parts,
    credits: l.credits,
    cleared: new Set(l.cleared),
  };
}

function placeFor(l: Live, stage: StageDef, mode: 'smart' | 'dumb', day: number): Placement[] {
  const pool = poolOf(l);
  const cap = squadCap(l.villageLv);
  return mode === 'smart'
    ? smartPlace(pool, stage, cap)
    : dumbPlace(pool, cap, day);
}

/** 跑一趟长线。默认 60 天 */
export function simulate(opts: SimOptions = {}): SimResult {
  const days = opts.days ?? 60;
  const attempts = opts.attemptsPerDay ?? 6;
  const mode = opts.place ?? 'smart';
  const watchAds = opts.watchAds ?? true;
  const rng = mulberry32(opts.seed ?? 20260904);

  const l = freshLive();
  const logs: DayLog[] = [];
  const chapterDay: (number | undefined)[] = [];
  const villageDay: (number | undefined)[] = [];
  const snapshots = new Map<number, Live>();
  const attemptSnap = new Map<number, Live>();
  const callCount = { n: 0 };
  let clearAllDay: number | undefined;

  villageDay[0] = 1;
  snapshots.set(1, cloneLive(l));

  for (let day = 1; day <= days; day += 1) {
    let wins = 0;
    let losses = 0;
    let stuckAt: string | undefined;
    let firsts = 0;

    // ---- 推图 ----
    for (let a = 0; a < attempts; a += 1) {
      const nextId = l.cleared.size + 1;
      if (nextId > STAGE_COUNT) break;
      const stage = getStage(nextId);
      if (!attemptSnap.has(nextId)) attemptSnap.set(nextId, cloneLive(l));
      const res = runBattle(stage, placeFor(l, stage, mode, day + a), villageMul(l.villageLv));
      if (res.won) {
        l.cleared.add(nextId);
        l.scrap += SETTLE_SCRAP;
        wins += 1;
        firsts += 1;
        if (l.cleared.size >= STAGE_COUNT && clearAllDay === undefined) clearAllDay = day;
      } else {
        losses += 1;
        stuckAt = stage.label;
        break; // 打不过就不硬撞，当天到此为止
      }
    }

    // ---- 弹子 ----
    const pellets = PELLET_OFFLINE_CAP
      + (watchAds ? PELLET_AD * PELLET_AD_DAILY : 0)
      + wins * PELLET_CLEAR
      + firsts * PELLET_FIRST
      + losses * PELLET_LOSE;

    // ---- 打摊子（期望值） ----
    const per = expectedPerPellet(l.villageLv);
    l.scrap += per.scrap * pellets;
    l.parts += per.parts * pellets;
    l.credits += per.credits * pellets;

    const grown = addVillageExp(asProgress(l), per.exp * pellets);
    const before = l.villageLv;
    l.villageLv = grown.lv;
    l.villageExp = grown.exp;
    for (let lv = before + 1; lv <= l.villageLv; lv += 1) {
      if (villageDay[lv - 1] === undefined) villageDay[lv - 1] = day;
    }

    // ---- 花钱 ----
    spendCalls(l, rng, callCount);
    spendEvo(l);

    // 快照要在当天所有开销之后取，代表「这一级的玩家手上真实的牌」
    if (!snapshots.has(l.villageLv)) snapshots.set(l.villageLv, cloneLive(l));

    const chapter = l.cleared.size === 0 ? 0 : getStage(l.cleared.size).chapter;
    if (chapter > 0 && chapterDay[chapter - 1] === undefined) chapterDay[chapter - 1] = day;

    logs.push({
      day,
      villageLv: l.villageLv,
      stage: l.cleared.size,
      chapter,
      roster: l.roster.length,
      cap: squadCap(l.villageLv),
      scrap: Math.round(l.scrap),
      parts: Math.round(l.parts),
      credits: Math.round(l.credits),
      wins,
      losses,
      stuckAt,
    });
  }

  return {
    days: logs,
    chapterDay,
    villageDay,
    snapshots,
    attemptSnap,
    finalStage: l.cleared.size,
    finalDay: days,
    clearAllDay,
    /** 跑完那天的存档。推不动的关只能拿它当上限参考 */
    endState: cloneLive(l),
  };
}

/* ---------------- 关卡扫描 ---------------- */

export interface StageProbe {
  stage: StageDef;
  smart: BattleResult;
  dumb: BattleResult;
  /** 用的是哪一级的快照 */
  atLv: number;
  cap: number;
  roster: number;
  /** true = 长线里压根没推到这关，用的是满级存档 */
  capped: boolean;
}

/**
 * 拿「到达建议等级那天的真实存档」去打每一关，smart 和 dumb 各打一遍。
 *
 * 关键是**不给理想化存档**。手捏一个「该有的面板」会把喊人的随机性抹掉，
 * 于是「运气差、手里没有克制这一章的门路」这种真实处境永远测不到，
 * 而那恰好是反目标第三条要防的东西。
 */
export function sweepStages(sim: SimResult): StageProbe[] {
  const out: StageProbe[] = [];

  for (const stage of STAGES) {
    // 长线里推到过这关就用当时的存档；没推到就用跑完那天的（已经满级），
    // 那种情况下打不过说明「连练满都过不去」，是曲线爆了，不是玩家没练。
    const hit = sim.attemptSnap.get(stage.id);
    const snap = hit ?? sim.endState;
    const mul = villageMul(snap.villageLv);
    const cap = squadCap(snap.villageLv);
    const pool = poolOf(snap);
    out.push({
      stage,
      atLv: snap.villageLv,
      cap,
      roster: snap.roster.length,
      capped: hit === undefined,
      smart: runBattle(stage, smartPlace(pool, stage, cap), mul),
      dumb: runBattle(stage, dumbPlace(pool, cap, stage.id), mul),
    });
  }
  return out;
}

export interface SweepStats {
  n: number;
  smartWinPct: number;
  dumbWinPct: number;
  /** 布阵值多少个点 */
  gapPct: number;
  leakPct: number;
  timeoutPct: number;
  /** 三星 / 两星 / 一星占通关数的比例 */
  starMix: [number, number, number];
  /** 每章的 smart 通关率 */
  byChapter: number[];
  /** smart 打不过的关 */
  walls: string[];
}

export function sweepStats(probes: readonly StageProbe[]): SweepStats {
  const n = probes.length;
  const smartWins = probes.filter((p) => p.smart.won);
  const dumbWins = probes.filter((p) => p.dumb.won);
  const pct = (k: number): number => Math.round((k / Math.max(1, n)) * 1000) / 10;

  const stars = [0, 0, 0];
  for (const p of smartWins) {
    if (p.smart.stars >= 1) stars[p.smart.stars - 1] += 1;
  }
  const wn = Math.max(1, smartWins.length);

  const byChapter: number[] = [];
  for (let c = 1; c <= 8; c += 1) {
    const inCh = probes.filter((p) => p.stage.chapter === c);
    const won = inCh.filter((p) => p.smart.won).length;
    byChapter.push(Math.round((won / Math.max(1, inCh.length)) * 1000) / 10);
  }

  return {
    n,
    smartWinPct: pct(smartWins.length),
    dumbWinPct: pct(dumbWins.length),
    gapPct: Math.round((pct(smartWins.length) - pct(dumbWins.length)) * 10) / 10,
    leakPct: pct(probes.filter((p) => p.smart.reason === 'leak').length),
    timeoutPct: pct(probes.filter((p) => p.smart.reason === 'timeout').length),
    starMix: [
      Math.round((stars[2]! / wn) * 1000) / 10,
      Math.round((stars[1]! / wn) * 1000) / 10,
      Math.round((stars[0]! / wn) * 1000) / 10,
    ],
    byChapter,
    walls: probes.filter((p) => !p.smart.won).map((p) => `${p.stage.label}(${p.smart.reason})`),
  };
}

/** 一天的期望产出，跑报表用 */
export function dailyYield(villageLv: number): ReturnType<typeof expectedPerPellet> & { pellets: number } {
  const per = expectedPerPellet(villageLv);
  return { ...per, pellets: DAILY_PELLETS };
}
