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
  autoPlace, dumbPlace, runBattle,
  type BattleResult, type Candidate, type Placement,
} from '@/game/BattleEngine';
import {
  CHAPTER_COUNT, STAGES, STAGE_COUNT, getStage, type StageDef,
} from '@/balance/stages';
import {
  DAILY_PELLETS, PELLET_AD, PELLET_AD_DAILY, PELLET_CLEAR, PELLET_FIRST,
  PELLET_LOSE, PELLET_OFFLINE_CAP, SETTLE_SCRAP, SETTLE_SCRAP_REPLAY,
  expectedPerPellet, mulberry32, type Rng,
} from '@/balance/stall';
import {
  CALL_COST, addVillageExp, craftOf, evoFromCraft, evoOf, nextFeed,
  rollCall, squadCap, starsOf, villageMul, yieldMul,
  type Progress,
} from '@/balance/village';
import {
  CRAFT_MAX, DEFAULT_SQUAD, STAR_MAX, VILLAGERS, getVillager, type Role,
} from '@/balance/villagers';

/** 可写的 Progress，跑模拟时用 */
interface Live {
  villageLv: number;
  villageExp: number;
  roster: string[];
  evo: Record<string, number>;
  craft: Record<string, number>;
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
    craft: {},
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
    craft: l.craft,
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
    craft: craftOf(p, id),
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
 * 花废铁和零件喂手艺。
 *
 * 先全员推到 3（二阶），再推到 6（三阶），最后才往 10 走。
 * 星卡住就跳过这个人。零件先花在「人人看得见的二阶」上，别集中焊一个人。
 */
function spendEvo(l: Live): void {
  const order = evoPriority(l);
    // 先全员二阶、再全员三阶，然后才一个个往手艺上限焊。
    // 上一版这里写死到 10 就停了，于是 400 关跑道上账面躺着 56 万废铁没人花
    for (const target of [3, 6, 10, CRAFT_MAX]) {
    for (const id of order) {
      for (;;) {
        const p = asProgress(l);
        if (craftOf(p, id) >= target) break;
        const cost = nextFeed(p, id);
        if (!cost) break;
        // 各人的下一档价不再一致（星卡的位置不同），买不起这个还可能买得起下一个
        if (l.scrap < cost.scrap || l.parts < cost.parts) break;
        l.scrap -= cost.scrap;
        l.parts -= cost.parts;
        const next = craftOf(p, id) + 1;
        l.craft[id] = next;
        l.evo[id] = evoFromCraft(next);
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
  const ids = VILLAGERS.map((v) => v.id);
  while (l.credits >= CALL_COST) {
    l.credits -= CALL_COST;
    callCount.n += 1;
    const got = rollCall(asProgress(l), callCount.n, rng, ids, STAR_MAX);
    if (got.isNew) {
      l.roster.push(got.id);
      continue;
    }
    l.scrap += got.scrap;
    if (got.starTo) l.stars[got.starTo] = starsOf(asProgress(l), got.starTo) + 1;
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
    craft: { ...l.craft },
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
    ? autoPlace(pool, stage, cap)
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
      if (nextId > STAGE_COUNT) {
        /*
         * 40 关全通之后接着重打末关。
         *
         * 不建模这一段，模拟器会以为「通关那天经济归零」—— 上一版就是这样，
         * 于是它报告手艺后四档永远够不着，而真机里重打是给废铁的。
         * 重打按 SETTLE_SCRAP_REPLAY 计价，弹子照给。
         */
        const last = getStage(STAGE_COUNT);
        const res = runBattle(last, placeFor(l, last, mode, day + a), villageMul(l.villageLv));
        if (!res.won) break;
        l.scrap += SETTLE_SCRAP_REPLAY * yieldMul(l.villageLv);
        wins += 1;
        continue;
      }
      const stage = getStage(nextId);
      if (!attemptSnap.has(nextId)) attemptSnap.set(nextId, cloneLive(l));
      const res = runBattle(stage, placeFor(l, stage, mode, day + a), villageMul(l.villageLv));
      if (res.won) {
        l.cleared.add(nextId);
        l.scrap += SETTLE_SCRAP * yieldMul(l.villageLv);
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
    /*
     * **只扫这次长线里真的打到过的关。**
     *
     * 40 关那一版可以拿「跑完那天的存档」去补没推到的关，因为 60 天足够全通，
     * 补的只是零星几关。400 关不行：60 天只推到 150 关上下，
     * 剩下 250 关会全部拿 D60 的存档去打第 300 关 —— 必然全灭，
     * 于是通关率、布阵差值、墙的位置三条指标测的都是「玩家够不到的内容」。
     * 实测就是这么炸的：布阵差值从 52 点掉到 20 点，墙有 98% 落在没推到的章。
     */
    const hit = sim.attemptSnap.get(stage.id);
    if (!hit) continue;
    const snap = hit;
    const mul = villageMul(snap.villageLv);
    const cap = squadCap(snap.villageLv);
    const pool = poolOf(snap);
    out.push({
      stage,
      atLv: snap.villageLv,
      cap,
      roster: snap.roster.length,
      capped: false,
      smart: runBattle(stage, autoPlace(pool, stage, cap), mul),
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
  for (let c = 1; c <= CHAPTER_COUNT; c += 1) {
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

/**
 * 推完前 n 关是哪一天。没推到就返回 undefined。
 *
 * 主线 400 关的周期以年计，`clearAllDay`（全通那天）在 60 天的回归里永远是空的，
 * 所以曲线形状的护栏改用这个 —— 它问的是「**前 40 关**还是不是一个月上下」，
 * 那一段的手感是花大代价校出来的，接跑道不许把它冲掉。
 */
export function clearDay(sim: SimResult, n: number): number | undefined {
  const at = sim.days.findIndex((d) => d.stage >= n);
  return at < 0 ? undefined : at + 1;
}

/** 一天的期望产出，跑报表用 */
export function dailyYield(villageLv: number): ReturnType<typeof expectedPerPellet> & { pellets: number } {
  const per = expectedPerPellet(villageLv);
  return { ...per, pellets: DAILY_PELLETS };
}
