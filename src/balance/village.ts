/**
 * 局外养成：村庄等级（公共等级）、上场人数、进化成本。
 *
 * 对标产品的「糖果条填满全员升一级」就是这条：**不逐个喂经验**。
 * 逐个养的代价上一版已经付过 —— 单件破烂升星只碰池子里 1/27，
 * 买完下一局大概率抽不到，钱花了看不见（见 §修订记录 2026-08-31）。
 * 20 个村民逐个喂会把同样的错放大三倍，所以经验只有一条公共条。
 *
 * 村庄等级只放大 hp / atk，不碰射程和出手间隔 —— 见 villagers.statsOf 的注释。
 */
import { CRAFT_MAX } from '@/balance/villagers';

export { CRAFT_MAX };

/**
 * 村庄等级上限。
 *
 * Lv.20 之前的每一格都是贴着 40 关主线校出来的（见下面 VILLAGE_STEPS 的校准史），
 * **那一段一个数都没动**；Lv.20 往上是 400 关主线新接的跑道。
 */
export const VILLAGE_LV_MAX = 120;

/** 老曲线的分界线。到这一级为止的所有数值都是手校的，不许用公式覆盖 */
export const VILLAGE_LV_TUNED = 20;

/**
 * 升到下一级要多少村庄经验。约 112 × 1.06^(lv-1)，这张表是准的。
 *
 * 累计 3803 点。按弹弓摊一天约 180~195 点算，满级约 21 天，
 * 和 40 关主线的推图周期对齐 —— 别把它调快，村庄等级是**唯一**的长线数值腿，
 * 提前满级之后局外就只剩收集了。
 *
 * **总量不是重点，分配才是。** 第一版是 17/26/37/49/63… 起步，
 * 总量也是 3800、也是 20 天满级，但模拟器跑出来的形状完全不对：
 * 日产出 180 点而前五级一共只要 192 点，于是**第一天直接 Lv.6、第五天 Lv.13、
 * 五天推完五章**，然后从 D25 一路卡在 7-3 到 D60。
 * 前期白送、后期干等，中间没有过渡。
 *
 * 现在起步 112（约 0.6 天一级），倍率压到 1.06，累计到 Lv.6 要 633 点 ≈ 3.5 天。
 * 摊子的靶位解锁跟着摊开：Lv.2 蓝筐（第 1 天）、Lv.6 铁盆（第 3~4 天）、
 * Lv.8 旧喇叭（第 5 天），一天看见一个新靶，而不是开服就挂满。
 */
export const VILLAGE_STEPS: readonly number[] = [
  112, 119, 126, 134, 142, 150, 160, 169, 179, 190,
  201, 213, 226, 240, 254, 269, 285, 303, 321,
];

/** 每级全村民 hp / atk 各 +3%。Lv.20 合计 +57% */
export const VILLAGE_STEP_PCT = 3;

/**
 * 上场人数的解锁档。
 *
 * 战场是 3 路 × 4 格 = 12 格，满编 12 人。
 *
 * 堆人靠填满这 12 格，不加第 4、第 5 列。3 列才能一眼看出哪一路要崩，
 * 也才跟布阵稿、塔塔主画面是同一件事。
 */
/**
 * 前 6 档跟旧 8 人曲线对齐（3-2 那堵假墙还在），
 * Lv.11 起多给人，到 Lv.20 站满 12。
 */
export const SQUAD_CAP_AT: readonly { lv: number; cap: number }[] = [
  { lv: 1, cap: 3 },
  { lv: 2, cap: 4 },
  { lv: 4, cap: 5 },
  { lv: 7, cap: 6 },
  { lv: 11, cap: 8 },
  { lv: 15, cap: 10 },
  { lv: 20, cap: 12 },
];

export const SQUAD_CAP_MAX = 12;

export function clampVillageLv(raw: unknown): number {
  const n = Math.floor(Number(raw) || 1);
  return Math.max(1, Math.min(VILLAGE_LV_MAX, n));
}

/** Lv.20 往上每级的经验按 1.06 复利续下去，跟手校那 19 格是同一个斜率 */
const VILLAGE_STEP_RATE = 1.06;

/** 升到下一级还要多少。满级返回 undefined */
export function nextVillageCost(lv: number): number | undefined {
  const at = clampVillageLv(lv);
  if (at >= VILLAGE_LV_MAX) return undefined;
  const i = at - 1;
  const tuned = VILLAGE_STEPS[i];
  if (tuned !== undefined) return tuned;
  const last = VILLAGE_STEPS[VILLAGE_STEPS.length - 1]!;
  return Math.round(last * Math.pow(VILLAGE_STEP_RATE, i - VILLAGE_STEPS.length + 1));
}

/** 从 Lv.1 升到 lv 的累计经验 */
export function villageCumExp(lv: number): number {
  const top = clampVillageLv(lv);
  let sum = 0;
  for (let i = 1; i < top; i += 1) sum += nextVillageCost(i) ?? 0;
  return sum;
}

/**
 * 产出倍率：摊子和关卡结算的所有产出都乘它。
 *
 * **Lv.20 及以前恒等于 1**，因为前 40 关的经济是贴着原始产出校的，
 * 一乘就全废。Lv.20 往上每级 +5% 复利 —— 没有这条，手艺 75 档那 1480 次喂料
 * 按现在的日产要跑几千天，跑道会变成一堵墙。
 */
export const YIELD_STEP_RATE = 1.05;

export function yieldMul(lv: number): number {
  const at = clampVillageLv(lv);
  return at <= VILLAGE_LV_TUNED ? 1 : Math.pow(YIELD_STEP_RATE, at - VILLAGE_LV_TUNED);
}

/** 村庄等级给的面板乘数。Lv.1 是 1.0 */
export function villageMul(lv: number): number {
  return 1 + (clampVillageLv(lv) - 1) * VILLAGE_STEP_PCT / 100;
}

/** 这个村庄等级能上几个人 */
export function squadCap(lv: number): number {
  const at = clampVillageLv(lv);
  let cap = 3;
  for (const row of SQUAD_CAP_AT) {
    if (at >= row.lv) cap = row.cap;
  }
  return cap;
}

/** 下一次上场人数会在几级涨。已经满员返回 undefined */
export function nextCapLv(lv: number): number | undefined {
  const at = clampVillageLv(lv);
  return SQUAD_CAP_AT.find((r) => r.lv > at)?.lv;
}

/**
 * 手艺 1–10。视觉二三阶嵌在 3 / 6。
 *
 * 星管上限：★0 只能到 3（二阶），★2 解开三阶，★5 才能焊满。
 * 零件继续卡「先喂谁」。数值在 craft 3 / 6 对齐旧的二阶 / 三阶，后面只小幅加。
 */
/** 手艺前 10 档的成本是手校的，往上按这个复利续 */
const CRAFT_COST_RATE = 1.08;

/**
 * 下标 0 = 手艺 1→2。合计约 1050 废铁 + 77 零件。
 *
 * **前五档吃废铁，后四档吃零件** —— 因为瓶颈在通关那天对调了。
 * 推图期废铁日产 214（大头是首通结算）、零件只有 13，所以前段用废铁计价，
 * 零件卡「今天先喂谁」；推完 40 关之后首通结算没了，废铁掉到重打的那点活水，
 * 而零件照旧从摊子来、越堆越多。后四档要是还按废铁计价，就会卡死在通关那天。
 */
export const CRAFT_COST: readonly { scrap: number; parts: number }[] = [
  { scrap: 40, parts: 1 },
  { scrap: 80, parts: 3 },
  { scrap: 90, parts: 2 },
  { scrap: 120, parts: 3 },
  { scrap: 210, parts: 8 },
  { scrap: 90, parts: 10 },
  { scrap: 110, parts: 13 },
  { scrap: 140, parts: 17 },
  { scrap: 170, parts: 20 },
];

/** 旧两笔的合计，给还在读 EVO_COST 的测试当锚 */
export const EVO_COST: readonly { scrap: number; parts: number }[] = [
  { scrap: 120, parts: 4 },
  { scrap: 400, parts: 18 },
];

export function evoFromCraft(craft: number): number {
  const c = Math.max(1, Math.floor(craft));
  if (c >= 6) return 3;
  if (c >= 3) return 2;
  return 1;
}

export function craftFromEvo(evo: number): number {
  const e = Math.max(1, Math.min(3, Math.floor(evo)));
  return e >= 3 ? 6 : e >= 2 ? 3 : 1;
}

/**
 * 星管手艺上限。
 *
 * **★0~★5 这五格一个数都没动**（3 / 6 / 8 / 10），因为前 40 关是贴着它校的；
 * ★6 往上是 400 关主线新接的段。
 */
const CRAFT_CAP_AT: readonly number[] = [3, 3, 6, 8, 8, 10, 20, 32, 45, 60, 75];

export function craftCap(stars: number): number {
  const s = Math.max(0, Math.min(CRAFT_CAP_AT.length - 1, Math.floor(stars)));
  return CRAFT_CAP_AT[s]!;
}

export function nextCraftCost(craft: number): { scrap: number; parts: number } | undefined {
  const c = Math.max(1, Math.floor(craft));
  if (c >= CRAFT_MAX) return undefined;
  const tuned = CRAFT_COST[c - 1];
  if (tuned) return tuned;
  const last = CRAFT_COST[CRAFT_COST.length - 1]!;
  const k = Math.pow(CRAFT_COST_RATE, c - CRAFT_COST.length);
  return { scrap: Math.round(last.scrap * k), parts: Math.round(last.parts * k) };
}

/** 下一档手艺的价。星卡住或已经焊满返回 undefined */
export function nextFeed(p: Progress, id: string): { scrap: number; parts: number } | undefined {
  const craft = craftOf(p, id);
  if (craft >= craftCap(starsOf(p, id))) return undefined;
  return nextCraftCost(craft);
}

/** 从当前视觉阶走到下一视觉阶：按手艺 1 / 3 的下一档算（兼容旧调用） */
export function nextEvoCost(stage: number): { scrap: number; parts: number } | undefined {
  return nextCraftCost(craftFromEvo(stage));
}

export function evoTotalCost(): { scrap: number; parts: number } {
  return CRAFT_COST.reduce(
    (a, c) => ({ scrap: a.scrap + c.scrap, parts: a.parts + c.parts }),
    { scrap: 0, parts: 0 },
  );
}

/**
 * 喊人的门槛：攒够这些工分去村委会大喇叭喊一嗓子。
 *
 * 定 6 不是为了「快」，是因为**喊人是长线最后一条腿**。
 * 村庄 D22 就满级、名单 D25 集齐，之后唯一还在长的东西就是重复喊来的星级；
 * 门槛设 8 时工分日产 10 点只够一天 1.2 次，40 关要拖到 D47~D58 才推完。
 * 降到 6 之后约一天 2 次，推图收在 D30 上下，星级仍然是最后那道闸。
 */
export const CALL_COST = 6;

/**
 * 前几次喊人必出没有的新人。
 *
 * §4.3 明确喊人不做概率池、不做稀有度弹窗。保底在这里的意思是
 * 前 4 次必出新人，让新玩家几天内就有一队能排，之后才进重复池。
 */
export const CALL_PITY_NEW = 4;

/** 喊到已经入伙的人：折成废铁 + 给他加一颗星 */
export const CALL_DUP_SCRAP = 60;

export interface Progress {
  villageLv: number;
  villageExp: number;
  /** 已入伙的村民 id */
  roster: readonly string[];
  /** 每人当前几阶（1~3），没记录的按 1。由手艺推导，存着是为了旧档 */
  evo: Readonly<Record<string, number>>;
  /** 每人手艺 1~10。没记录的按 evo 反推 */
  craft: Readonly<Record<string, number>>;
  /** 每人几颗星，没记录的按 0 */
  stars: Readonly<Record<string, number>>;
  scrap: number;
  parts: number;
  /** 工分 */
  credits: number;
}

export function emptyProgress(roster: readonly string[]): Progress {
  return {
    villageLv: 1,
    villageExp: 0,
    roster: [...roster],
    evo: {},
    craft: {},
    stars: {},
    scrap: 0,
    parts: 0,
    credits: 0,
  };
}

export function evoOf(p: Progress, id: string): number {
  return evoFromCraft(craftOf(p, id));
}

export function craftOf(p: Progress, id: string): number {
  const raw = p.craft[id];
  if (raw !== undefined) {
    return Math.max(1, Math.min(CRAFT_MAX, Math.floor(raw)));
  }
  return craftFromEvo(Math.max(1, Math.min(3, Math.floor(p.evo[id] ?? 1))));
}

/**
 * 喊一嗓子的结果。**喊到谁是随机的，玩家没得挑**（§4.3 不做概率池、不做定向）。
 *
 * 这个函数是真源，存档层和模拟器共用同一份 —— 上一版有过
 * 「模拟器自己写一套掷骰」的时期，于是护栏证明的是模型而不是游戏。
 */
export interface CallResult {
  id: string;
  isNew: boolean;
  /** 喊重了折多少废铁 */
  scrap: number;
  /** 喊重了给谁加了一颗星（可能没人可加，全满星时是 undefined） */
  starTo?: string;
}

export function rollCall(
  p: Progress,
  callCount: number,
  rng: () => number,
  allIds: readonly string[],
  starMax: number,
  /** 玩家指定的「重点培养」对象。喊重了的那颗星落到他身上 */
  pick?: string,
): CallResult {
  const owned = new Set(p.roster);
  const missing = allIds.filter((id) => !owned.has(id));
  const forceNew = callCount <= CALL_PITY_NEW;
  const dupChance = p.roster.length / Math.max(1, allIds.length);

  if (missing.length > 0 && (forceNew || rng() > dupChance)) {
    const pick = missing[Math.floor(rng() * missing.length)]!;
    return { id: pick, isNew: true, scrap: 0 };
  }

  /*
   * 喊重了：折废铁 + 加一颗星。
   *
   * 默认平摊给当前星最少的人。试过「谁重复来谁涨」和「全压在主力身上」两版，
   * 两版都会把推图曲线搅乱到对成本表极度敏感（同一组成本，种子间从 20 天到 60 天
   * 都有），因为星卡着手艺上限，星一集中，主力的面板就跑在关卡难度前面。
   * 平摊看着没性格，但它是这条曲线现在唯一稳的支点。
   *
   * pick 是留给「玩家指定重点培养」的口子，默认不走 —— 真要开得连着重调成本表。
   */
  const low = [...p.roster]
    .filter((id) => starsOf(p, id) < starMax)
    .sort((a, b) => starsOf(p, a) - starsOf(p, b))[0];
  const who = p.roster[Math.floor(rng() * Math.max(1, p.roster.length))] ?? low ?? '';
  const aimed = pick !== undefined && p.roster.includes(pick) && starsOf(p, pick) < starMax;
  return { id: who, isNew: false, scrap: CALL_DUP_SCRAP, starTo: aimed ? pick : low };
}

export function starsOf(p: Progress, id: string): number {
  return Math.max(0, Math.floor(p.stars[id] ?? 0));
}

/** 灌经验，够了就连升。返回升了几级 */
export function addVillageExp(p: Progress, exp: number): { lv: number; exp: number; gained: number } {
  let lv = clampVillageLv(p.villageLv);
  let acc = Math.max(0, p.villageExp) + Math.max(0, Math.floor(exp));
  let gained = 0;
  for (;;) {
    const need = nextVillageCost(lv);
    if (need === undefined || acc < need) break;
    acc -= need;
    lv += 1;
    gained += 1;
  }
  return { lv, exp: acc, gained };
}
