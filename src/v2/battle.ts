/**
 * 战斗模型：3 路 × 4 格的分路自动塔防。纯函数，不碰渲染。
 *
 * 这一版的失败条件是**漏怪到底线或超时**（§4.4），不再是队灭 ——
 * 上一版那两组「失败条件是队灭，不是漏怪」「一个图不断出怪，不是十五场小仗」
 * 共 20 条回归是**明文禁止**本文件的做法的，它们会在旧引擎那边继续绿着，
 * 这里另建一套护栏（见 __tests__/guardrails.test.ts）。
 *
 * 三件事必须让「谁放哪一格」真的有后果，否则布阵就是假决策：
 *
 * 1. **阻挡几何**：地面怪被这一路上最靠前的活人挡住，挡住才开打。
 *    所以谁站 cell 0 决定谁先挨，这是布阵最直接的一笔。
 * 2. **飞碟点后排**：飞的不被阻挡，而且专挑这一路**最后排**的人打。
 *    把脆皮塞到后面躲刀，遇到飞碟章就是送 —— 后排不是安全区。
 * 3. **空路直接漏**：一路没人就是一路通天。12 格只有 8 个人，
 *    三路都想守厚是不可能的，这就是取舍。
 */
import {
  COUNTERS, laneMul, statsOf,
  type Lane, type Role, type VillagerDef,
} from './villagers';
import {
  CELL_COUNT, GOAL_POS, LANE_COUNT, LEAK_ALLOW, WAVE_GAP_MS, cellPos, getEnemy,
  rateStars, type EnemyDef, type StageDef, type Stars,
} from './stages';

export const TICK_MS = 100;

export interface Placement {
  villager: VillagerDef;
  /** 第几路 0..2 */
  lane: number;
  /** 第几格 0..3，0 最靠敌方 */
  cell: number;
  evoStage: number;
  stars: number;
}

interface Fighter {
  id: string;
  def: VillagerDef;
  lane: number;
  cell: number;
  pos: number;
  hp: number;
  maxHp: number;
  atk: number;
  armor: number;
  range: number;
  interval: number;
  cd: number;
  alive: boolean;
}

interface Foe {
  def: EnemyDef;
  lane: number;
  pos: number;
  hp: number;
  maxHp: number;
  atk: number;
  armor: number;
  cd: number;
  /** 减速剩余 ms，由「拦」位施加 */
  slowMs: number;
  alive: boolean;
}

export interface BattleResult {
  won: boolean;
  /** 'clear' 打完了 | 'leak' 漏够了 | 'timeout' 超时 */
  reason: 'clear' | 'leak' | 'timeout';
  leaked: number;
  fallen: number;
  stars: Stars;
  elapsedMs: number;
  /** 还剩几只没清掉 */
  leftAlive: number;
}

/** 「拦」位打中之后的减速 */
const SLOW_MUL = 0.65;
const SLOW_MS = 1600;
/** 「修」位每次回多少（按 atk 的倍数），以及它出手打人的折扣 */
const HEAL_MUL = 1.4;
const HEAL_ATK_CUT = 0.5;
/** 「越挨越猛」：血越少攻击越高，最多加这么多 */
const RAGE_BONUS = 0.5;

/**
 * 护甲的软化常数。减伤 = def / (def + ARMOR_K)。
 *
 * 原来是扁平减法（atk - def），跑出来是灾难：铁柱 def 60，第 1~4 章
 * 每次只吃 1 点伤害 —— 字面意义上无敌 —— 到第 8 章突然一下 214。
 * 「免疫」和「秒删」之间没有过渡，曲线根本没法校。
 *
 * 更要紧的是它把失败条件也带歪了：前排打不死，敌人就永远堆在他面前过不去，
 * 于是没有漏怪、只有干等到超时。超时是玩家读不懂的失败（「我没输，是钟输了」），
 * 而 §4.4 想要的判负是**看得见的漏怪**。改成百分比之后前排会真的倒、
 * 敌人会真的走过去，超时退回它该在的位置：只兜住打不动的死局。
 *
 * K=200 时：def 60 → 减 23%，def 13 → 减 6%，装甲的 def 34 → 减 15%。
 */
export const ARMOR_K = 200;

function dmgOf(atk: number, armor: number, mul: number): number {
  const soak = 1 - armor / (armor + ARMOR_K);
  return Math.max(1, Math.round(atk * mul * soak));
}

function buildFighters(place: readonly Placement[], villageMul: number): Fighter[] {
  return place.map((p, i) => {
    const s = statsOf(p.villager, p.evoStage, p.stars, villageMul);
    return {
      id: `${p.villager.id}#${i}`,
      def: p.villager,
      lane: p.lane,
      cell: p.cell,
      pos: cellPos(p.cell),
      hp: s.hp,
      maxHp: s.hp,
      atk: s.atk,
      armor: s.def,
      range: s.range,
      interval: s.interval,
      cd: 0,
      alive: true,
    };
  });
}

interface Spawn {
  atMs: number;
  lane: number;
  enemy: string;
}

function buildSchedule(stage: StageDef): Spawn[] {
  const out: Spawn[] = [];
  stage.waves.forEach((wave, w) => {
    const base = w * WAVE_GAP_MS;
    for (const g of wave.groups) {
      for (let k = 0; k < g.count; k += 1) {
        out.push({
          atMs: base + g.atMs + k * g.gapMs,
          lane: g.lane % LANE_COUNT,
          enemy: g.enemy,
        });
      }
    }
  });
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** 地面怪被这一路最靠前的活人挡住。返回那个人 */
function blockerFor(foe: Foe, team: readonly Fighter[]): Fighter | undefined {
  let best: Fighter | undefined;
  for (const f of team) {
    if (!f.alive || f.lane !== foe.lane) continue;
    if (f.pos < foe.pos - 0.5) continue; // 已经被越过去了
    if (!best || f.pos < best.pos) best = f;
  }
  return best;
}

/** 飞的专挑这一路最后排的人 */
function sniperTarget(foe: Foe, team: readonly Fighter[]): Fighter | undefined {
  let best: Fighter | undefined;
  for (const f of team) {
    if (!f.alive || f.lane !== foe.lane) continue;
    if (!best || f.cell > best.cell) best = f;
  }
  return best;
}

/** 村民打自己这一路射程内最靠前（走得最远）的那只 */
function pickFoe(f: Fighter, foes: readonly Foe[]): Foe | undefined {
  let best: Foe | undefined;
  for (const e of foes) {
    if (!e.alive || e.lane !== f.lane) continue;
    const gap = f.pos - e.pos;
    if (gap > f.range || gap < -0.5) continue;
    if (!best || e.pos > best.pos) best = e;
  }
  return best;
}

/** 「修」位挑血量比例最低的队友 */
function pickHurt(team: readonly Fighter[]): Fighter | undefined {
  let best: Fighter | undefined;
  for (const f of team) {
    if (!f.alive || f.hp >= f.maxHp) continue;
    if (!best || f.hp / f.maxHp < best.hp / best.maxHp) best = f;
  }
  return best;
}

function effAtk(f: Fighter): number {
  if (f.def.lane !== 'rage') return f.atk;
  const lost = 1 - f.hp / f.maxHp;
  return f.atk * (1 + RAGE_BONUS * lost);
}

/**
 * 打一关。确定性的：同样的布阵和关卡，结果永远一样。
 *
 * 之所以不掺随机：护栏要能断言「换个排法通关率差 20 个点」这种事，
 * 随机会把信号埋进噪声里，而 200 局蒙特卡洛的成本又都花在重跑同一件事上。
 * 变化量交给布阵和养成，不交给骰子。
 */
export function runBattle(
  stage: StageDef,
  place: readonly Placement[],
  villageMul = 1,
): BattleResult {
  const team = buildFighters(place, villageMul);
  const schedule = buildSchedule(stage);
  const foes: Foe[] = [];

  let t = 0;
  let next = 0;
  let leaked = 0;
  const limit = stage.timeLimitMs;

  for (;;) {
    // 出怪
    while (next < schedule.length && schedule[next]!.atMs <= t) {
      const s = schedule[next]!;
      const def = getEnemy(s.enemy);
      foes.push({
        def,
        lane: s.lane,
        pos: 0,
        hp: Math.round(def.hp * stage.hpMul),
        maxHp: Math.round(def.hp * stage.hpMul),
        atk: def.atk * stage.atkMul,
        armor: def.def,
        cd: 0,
        slowMs: 0,
        alive: true,
      });
      next += 1;
    }

    // 外星人动
    for (const e of foes) {
      if (!e.alive) continue;
      if (e.slowMs > 0) e.slowMs = Math.max(0, e.slowMs - TICK_MS);

      const target = e.def.flying ? sniperTarget(e, team) : blockerFor(e, team);
      const inRange = target !== undefined
        && target.pos - e.pos <= e.def.range
        && target.pos - e.pos >= -0.5;

      if (inRange && target) {
        e.cd -= TICK_MS;
        if (e.cd <= 0) {
          e.cd = e.def.interval;
          const mul = laneMul(e.def.lane, target.def.lane);
          target.hp -= dmgOf(e.atk, target.armor, mul);
          if (target.hp <= 0) target.alive = false;
        }
      } else {
        const spd = e.def.spd * (e.slowMs > 0 ? SLOW_MUL : 1);
        e.pos += spd * (TICK_MS / 1000);
        if (e.pos > GOAL_POS) {
          e.alive = false;
          leaked += 1;
        }
      }
    }

    // 村民动
    for (const f of team) {
      if (!f.alive) continue;
      f.cd -= TICK_MS;
      if (f.cd > 0) continue;

      if (f.def.role === 'heal') {
        const hurt = pickHurt(team);
        if (hurt) {
          hurt.hp = Math.min(hurt.maxHp, hurt.hp + Math.round(f.atk * HEAL_MUL));
          f.cd = f.interval;
          continue;
        }
      }

      const foe = pickFoe(f, foes);
      if (!foe) continue;
      f.cd = f.interval;
      const raw = effAtk(f) * (f.def.role === 'heal' ? HEAL_ATK_CUT : 1);
      const mul = laneMul(f.def.lane, foe.def.lane);
      foe.hp -= dmgOf(raw, foe.armor, mul);
      if (foe.hp <= 0) {
        foe.alive = false;
      } else if (f.def.role === 'block') {
        foe.slowMs = SLOW_MS;
      }
    }

    const alive = foes.filter((e) => e.alive).length;

    if (leaked >= LEAK_ALLOW) {
      return {
        won: false, reason: 'leak', leaked, stars: 0,
        fallen: team.filter((f) => !f.alive).length,
        elapsedMs: t, leftAlive: alive,
      };
    }

    if (next >= schedule.length && alive === 0) {
      const fallen = team.filter((f) => !f.alive).length;
      return {
        won: true, reason: 'clear', leaked, fallen,
        stars: rateStars(leaked, fallen, true, t, stage.parMs),
        elapsedMs: t, leftAlive: 0,
      };
    }

    t += TICK_MS;
    if (t > limit) {
      return {
        won: false, reason: 'timeout', leaked, stars: 0,
        fallen: team.filter((f) => !f.alive).length,
        elapsedMs: t, leftAlive: alive,
      };
    }
  }
}

/* ---------------- 布阵策略（模拟器用） ---------------- */

/** 「修」和「打」往后站，「挨」和「拦」往前站 */
const ROLE_CELL_PREF: Readonly<Record<Role, number>> = {
  tank: 0, block: 1, dps: 2, heal: 3,
};

export interface Candidate {
  villager: VillagerDef;
  evoStage: number;
  stars: number;
}

/**
 * 上场人数对应的定位配比。
 *
 * 三路各一个「挨」的是骨架，所以坦克优先补到 3 个；「打」跟着补，
 * 因为漏怪判负的另一半是**清不完**，光挡不打一样会超时。
 */
const COMP: Readonly<Record<number, Partial<Record<Role, number>>>> = {
  3: { tank: 1, block: 1, dps: 1 },
  4: { tank: 1, block: 1, dps: 2 },
  5: { tank: 2, block: 1, dps: 2 },
  6: { tank: 2, block: 1, dps: 2, heal: 1 },
  7: { tank: 3, block: 1, dps: 2, heal: 1 },
  8: { tank: 3, block: 1, dps: 3, heal: 1 },
};

/**
 * 聪明布阵：先按定位配够骨架，再在每个定位里挑门路占优的人，最后三路纵向铺开。
 *
 * 这是护栏「布阵没被买掉」的正样本。它刻意只用玩家在开战前
 * **看得到的信息**（敌方主门路、自己人的门路与定位），不偷看关卡数据 ——
 * 否则测出来的差值是「作弊比乱来强」，证明不了布阵值钱。
 *
 * 第一版是「先按克制排序、再强行塞 3 个坦克」，在 8-5 上翻车了：
 * 敌方主门路是「下手重」，克它的是「挨得住」，于是策略堆了一队
 * 攻击只有 0.85 倍的人 —— 34 只怪清不完，漏 4 个判负，
 * 而随便换个排法反而 ★3 通关。教训有两条，都留着：
 *
 * 1. **克制倍率 1.3 撑不起「为克制牺牲输出」**，这是好事，
 *    说明克制不是解一次就完的谜题（§6 第 4 条）。策略必须先配平定位，
 *    克制只在同定位的候选之间做选择。
 * 2. 所以 smart **不是上限**。护栏里的 smart-dumb 差值是
 *    「像样的排法 vs 乱来」，不是「最优 vs 乱来」，别拿它当难度天花板。
 */
export function smartPlace(
  pool: readonly Candidate[],
  stage: StageDef,
  cap: number,
): Placement[] {
  const counter = Object.entries(COUNTERS)
    .find(([, weak]) => weak === stage.mainLane)?.[0] as Lane | undefined;

  // 门路只在同定位的候选之间做选择，不跨定位抢位置
  const score = (c: Candidate): number => {
    let s = c.evoStage * 10 + c.stars;
    if (counter && c.villager.lane === counter) s += 12;      // 我克敌方主门路
    if (COUNTERS[stage.mainLane] === c.villager.lane) s -= 8; // 敌方主门路克我
    return s;
  };

  const byRole = new Map<Role, Candidate[]>();
  for (const c of pool) {
    const list = byRole.get(c.villager.role) ?? [];
    list.push(c);
    byRole.set(c.villager.role, list);
  }
  for (const list of byRole.values()) list.sort((a, b) => score(b) - score(a));

  const quota = COMP[Math.max(3, Math.min(8, cap))] ?? COMP[8]!;
  const picked: Candidate[] = [];
  const taken = new Set<Candidate>();

  for (const [role, want] of Object.entries(quota) as [Role, number][]) {
    for (const c of byRole.get(role) ?? []) {
      if (picked.filter((p) => p.villager.role === role).length >= want) break;
      picked.push(c);
      taken.add(c);
    }
  }
  // 配比凑不满（手上缺这个定位）就按分数补
  if (picked.length < cap) {
    for (const c of [...pool].sort((a, b) => score(b) - score(a))) {
      if (picked.length >= cap) break;
      if (!taken.has(c)) { picked.push(c); taken.add(c); }
    }
  }

  return assign(picked.slice(0, cap), stage);
}

/** 每条路总共要来多少只。场上的出怪口玩家看得见，这不是偷看 */
function laneLoad(stage: StageDef): number[] {
  const load = new Array<number>(LANE_COUNT).fill(0);
  for (const w of stage.waves) {
    for (const g of w.groups) load[g.lane % LANE_COUNT]! += g.count;
  }
  return load;
}

/**
 * 按各路的怪量分人，每条有怪的路先保一个，再把余下的人补到「人均要挡的怪」最多的路。
 *
 * 两条踩过的坑都留着：
 *
 * 1. **一路没人就是一路通天**，所以铺开优先于纵深。上一版按
 *    「同定位第 n 个去第 n 路」分，3 人时每个定位只有一个，
 *    三个人全挤在第 0 路 —— 模拟器实测 1-1 全种子失败。
 * 2. **也不能无脑三路平摊**。第 1、2 章敌人只走一到两路，
 *    把 3 个人摊到 3 路就是拿一个人去守空路，实测 2-2 / 2-3 / 2-5 全成了墙。
 *
 * 所以要看出怪口。出怪口在场上是画出来的，玩家开战前就看得见，
 * 这跟偷看关卡数值是两回事。
 */
function assign(picked: readonly Candidate[], stage: StageDef): Placement[] {
  const load = laneLoad(stage);
  const active = load
    .map((n, lane) => ({ lane, load: n }))
    .filter((x) => x.load > 0)
    .sort((a, b) => b.load - a.load);
  if (active.length === 0) return [];

  const n = Math.min(picked.length, LANE_COUNT * CELL_COUNT);
  const quota = new Array<number>(LANE_COUNT).fill(0);
  let left = n;

  for (const a of active) {
    if (left <= 0) break;
    quota[a.lane] = 1;
    left -= 1;
  }
  while (left > 0) {
    let best = -1;
    let bestRatio = -1;
    for (const a of active) {
      if (quota[a.lane]! >= CELL_COUNT) continue;
      const ratio = a.load / (quota[a.lane]! + 1);
      if (ratio > bestRatio) { bestRatio = ratio; best = a.lane; }
    }
    if (best < 0) break;
    quota[best]! += 1;
    left -= 1;
  }

  // 先把各路最前格填满再往后走，怪多的路先拿人
  const slots: { lane: number; cell: number }[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    for (const a of active) {
      if (quota[a.lane]! > cell) slots.push({ lane: a.lane, cell });
    }
  }

  const byPref = [...picked].sort(
    (a, b) => ROLE_CELL_PREF[a.villager.role] - ROLE_CELL_PREF[b.villager.role],
  );
  const out: Placement[] = [];
  byPref.forEach((c, i) => {
    const slot = slots[i];
    if (!slot) return;
    out.push({
      villager: c.villager,
      lane: slot.lane,
      cell: slot.cell,
      evoStage: c.evoStage,
      stars: c.stars,
    });
  });
  return out;
}

/**
 * 乱来布阵：按固定顺序取人、按固定顺序填格，不看敌方门路也不看定位。
 *
 * 它是护栏的负样本。**不用随机**，否则同一个种子跑出来的差值会飘。
 */
export function dumbPlace(
  pool: readonly Candidate[],
  cap: number,
  offset = 0,
): Placement[] {
  const out: Placement[] = [];
  const n = Math.min(cap, pool.length);
  for (let i = 0; i < n; i += 1) {
    const c = pool[(i + offset) % pool.length]!;
    const slot = (i + offset) % (LANE_COUNT * CELL_COUNT);
    out.push({
      villager: c.villager,
      lane: slot % LANE_COUNT,
      cell: Math.floor(slot / LANE_COUNT) % CELL_COUNT,
      evoStage: c.evoStage,
      stars: c.stars,
    });
  }
  return out;
}
