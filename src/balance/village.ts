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
 * 前 6 档跟旧 8 人曲线对齐（3-2 那堵假墙还在），Lv.11 起多给人，到 Lv.18 站满 12。
 *
 * **满编那一档就是 40 关收尾墙的长短钮。**
 *
 * 8-4 要 12 个人才推得动（漏怪，不是打不死），所以那堵墙从「第一次摸到 8-4」
 * 一直卡到「满编那天」。2026-09-21 量了三档（种子 20260904）：
 *
 *   Lv.20（原值）  满编 D23  8-4 卡 D14~D22 九天  40 关 D28
 *   Lv.19          满编 D20  卡七天              40 关 D21
 *   Lv.18          满编 D17  卡四天              40 关 D18
 *   Lv.17          满编 D15  卡一两天            40 关 D16 ← 护栏红
 *
 * 也就是说**「墙短一点」和「主线短一点」是同一个钮**，拆不开：
 * 想把墙从九天压到四天，40 关就得从 D28 提到 D18。护栏下限正好是 D18，
 * 所以 18 是能给的极限，一格都不剩 —— 下次再往这条线上加东西，
 * 先看「40 关 ≥ D18」那条会不会当场红。要留余量就退回 19，墙七天。
 */
export const SQUAD_CAP_AT: readonly { lv: number; cap: number }[] = [
  { lv: 1, cap: 3 },
  { lv: 2, cap: 4 },
  { lv: 4, cap: 5 },
  { lv: 7, cap: 6 },
  { lv: 11, cap: 8 },
  { lv: 15, cap: 10 },
  { lv: 18, cap: 12 },
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
 * 手艺 1–75。视觉二三阶嵌在 3 / 6。
 *
 * 星管上限：★0 只能到 3（二阶），★2 解开三阶，★5 才能焊满（见 CRAFT_CAP_AT）。
 * 零件继续卡「先喂谁」。数值在 craft 3 / 6 对齐旧的二阶 / 三阶，后面只小幅加。
 */
/** 跑道段废铁每档 +8% 复利。零件另有一条更陡的，见 CRAFT_PARTS_RATE */
const CRAFT_COST_RATE = 1.08;

/**
 * 跑道段零件每档 +8.85% 复利，比废铁陡。
 *
 * 两条不同斜率是为了让**计价比**（废铁:零件）一路往下滑：craft 10 上是 13:1，
 * 焊到 75 收到 7.9:1。理由见 CRAFT_COST 的注释 —— 供给比本身就是递减的，
 * 计价比得跟着走，否则总有一种资源在溢出。
 */
const CRAFT_PARTS_RATE = 1.091;

/** 跑道段的计价基准（craft 10→11 那一档），比 13:1 */
const CRAFT_LATE_BASE = { scrap: 184, parts: 14 } as const;

/**
 * 下标 0 = 手艺 1→2。合计约 1050 废铁 + 59 零件。
 *
 * **计价比（废铁:零件）从 ~21:1 一路滑到 ~8:1，全程贴着供给比走。**
 *
 * 上一版是「前五档吃废铁，后四档吃零件」，计价比在 craft 6 上一步从 26:1 砸到 8.5:1
 * 就再不动了。那是给 40 关主线写的：假设推完之后首通结算没了、废铁断流，
 * 所以后段改用零件计价。**400 关把这个前提推翻了** —— 关永远推不到头，
 * 首通废铁就一直在流，废铁从来不缺，缺的一直是零件。
 *
 * 2026-09-21 拿模拟器量了 240 天（种子 20260904，铺开喂）：
 * 边际供给比 D40 是 19.7、D80 是 12.8、D120 是 10.5、D240 是 8.1 —— **递减**，
 * 因为首通废铁不吃 yieldMul 而摊子零件吃。而计价比是常数 8.5，
 * 两条线要到 D240 才相交。相交之前全程错配，症状是：
 *
 *   craft 1~5 计价 26~45:1 > 供给 19.7:1 → 废铁卡着、零件堆到 161 没处花（D30）
 *   craft 6+  计价 8.5:1   < 供给 12~19:1 → 零件见底、废铁堆到 18466（D180）
 *
 * 所以废铁数一个没动（前 40 关是废铁卡的，动了就冲掉手校曲线），
 * 只把零件重排成「早段多吃一点、中段少吃一点」，让计价比平滑下滑。
 */
export const CRAFT_COST: readonly { scrap: number; parts: number }[] = [
  { scrap: 40, parts: 2 },
  { scrap: 80, parts: 4 },
  { scrap: 90, parts: 4 },
  { scrap: 120, parts: 6 },
  { scrap: 210, parts: 10 },
  { scrap: 90, parts: 5 },
  { scrap: 110, parts: 7 },
  { scrap: 140, parts: 9 },
  { scrap: 170, parts: 12 },
];

/** 旧两笔的合计，给还在读 EVO_COST 的测试当锚 */
export const EVO_COST: readonly { scrap: number; parts: number }[] = [
  { scrap: 120, parts: 4 },
  { scrap: 400, parts: 18 },
];

/**
 * 换形态要几颗星。下标 = 形态 - 1，所以一阶恒为 ★0。
 *
 * **形态原来挂在手艺上**（craft 3 换第二张立绘、craft 6 换第三张），
 * 于是玩家面前摆着三个数：星、手艺、阶，而阶只是手艺的一个别名。
 * 2026-09-21 把它挪到星上：**星解锁「他变成什么」，手艺只管「他多硬」**，
 * 一条轴一件事，「一阶二阶三阶」这个说法从界面上消失，只剩形态名
 * （「焊了个鼓风机」）和星数。
 *
 * 形态不是纯换皮，每一张立绘背后都有一套打法（见 villagers.EVO_KIND：
 * 穿两个、劈一片、反弹、同路加速……），所以挪闸门就是在动通关率。
 *
 * 实测（2026-09-21，5 种子 × 60 天）：
 *
 *   三身放 ★2 和放 ★3 跑出来**一个字都不差** —— 都是 8 章 D28、都卡 5-1 到 D25。
 *   因为名单到 D25 才集齐，那之前喊到的多半是新人、星本来就少，
 *   两个闸门谁都还没摸到。既然不花钱，就按可读性挑：
 *   **第一颗星立刻换样**（当场兑现「星能换形态」这条规则），第三颗星换到最后一身。
 *
 * 代价是诚实记下来的：二身原来挂在手艺 3 上（120 废铁，D2 就有），
 * 现在要等第一次喊重，于是 40 关从 D25 推到 D28。护栏窗口是 D18~D50，还剩一倍余量。
 * 换来的是「一身」第一次成为一个真的会待一阵的状态，而不是开局两天的过场。
 */
export const EVO_STAR_GATE: readonly number[] = [0, 1, 3];

/** 这些星够换到第几张立绘（1~3） */
export function evoFromStars(stars: number): number {
  const s = Math.max(0, Math.floor(stars));
  let stage = 1;
  for (let i = 0; i < EVO_STAR_GATE.length; i += 1) {
    if (s >= EVO_STAR_GATE[i]!) stage = i + 1;
  }
  return stage;
}

/** 再几颗星换下一张立绘。已经是最后一张返回 undefined */
export function nextEvoStars(stars: number): { need: number; stage: number } | undefined {
  const s = Math.max(0, Math.floor(stars));
  const now = evoFromStars(s);
  const gate = EVO_STAR_GATE[now];
  if (gate === undefined) return undefined;
  return { need: gate - s, stage: now + 1 };
}

/** 刚喊到的这颗星是不是正好换了形态。揭晓牌要靠它决定报不报「他变样了」 */
export function starOpenedEvo(starsAfter: number): boolean {
  const s = Math.max(0, Math.floor(starsAfter));
  return s > 0 && evoFromStars(s) !== evoFromStars(s - 1);
}

export function craftFromEvo(evo: number): number {
  const e = Math.max(1, Math.min(3, Math.floor(evo)));
  return e >= 3 ? 6 : e >= 2 ? 3 : 1;
}

/**
 * 星管手艺上限。下标 = 星数，长度必须是 STAR_MAX + 1。
 *
 * **规则一句话：一颗星解开一段手艺。没有白档。**
 *
 * 上一版是 10 星、表 `[3, 4, 6, 8, 8, 10, 20, 32, 45, 60, 75]`，
 * 换算成「这颗星解开几档」是 `+1 +2 +2 0 +2 +10 +12 +13 +15 +15` ——
 * 同一个单位从 0 档跳到 15 档，玩家说不出规律，★4 还是纯白档（8→8）。
 * 那个白档当年是为了躲「乱排通关率 < 60%」才留的，**而那条护栏后来放宽到了 78%**
 * （见 guardrails「乱排会把人浪费在空路上」），躲的东西早就不在了。
 * 真正的病是刻度切太细：一档手艺的重量和一颗星的重量对不上，只能拿白档去凑。
 *
 * 现在 5 星、每颗星解开 +2 / +3 / +8 / +16 / +43 档。**递增就是那条规律**：
 * 星越多，一颗星解开的手艺越多 —— 这是玩家唯一需要记住的话。
 *
 * 数不是挑好看的，是被护栏逼出来的。`★1 = 6` 试过一次直接红（2026-09-21）：
 * 种子 555 在 D12 就推完 40 关（护栏要 ≥ D18）。因为**三阶那一下是这条轴上最重的一跳**
 * （craft 6 = ×2.4，craft 4 只有 ×1.75），而喊重了前几天就在发星，
 * ★1 开三阶等于全员提前两周涨四成面板，手校的 40 关曲线当场被冲掉。
 * 所以 `★1 = 5`：三阶照旧押在 ★2 后面，这一格只放宽二阶那段。
 * 往后 ★3 / ★4 的两次大放宽都落在 60 天之外，够不着手校段。
 */
const CRAFT_CAP_AT: readonly number[] = [3, 5, 8, 16, 32, 75];

export function craftCap(stars: number): number {
  const s = Math.max(0, Math.min(CRAFT_CAP_AT.length - 1, Math.floor(stars)));
  return CRAFT_CAP_AT[s]!;
}

/**
 * 再攒几颗星才能把手艺上限往上抬一格，抬到多少。
 *
 * 现在表里没有白档，所以 `need` 恒为 1；返回值仍保留这个字段，
 * 是因为详情页要说的是「上限解到多少」而不是「下一颗星」，
 * 以后要是再往表里塞档，这个口径不用跟着改。
 */
export function nextCapStars(stars: number):
{ need: number; stars: number; cap: number } | undefined {
  const s = Math.max(0, Math.min(CRAFT_CAP_AT.length - 1, Math.floor(stars)));
  const now = CRAFT_CAP_AT[s]!;
  for (let t = s + 1; t < CRAFT_CAP_AT.length; t += 1) {
    const cap = CRAFT_CAP_AT[t]!;
    if (cap > now) return { need: t - s, stars: t, cap };
  }
  return undefined;
}

export function nextCraftCost(craft: number): { scrap: number; parts: number } | undefined {
  const c = Math.max(1, Math.floor(craft));
  if (c >= CRAFT_MAX) return undefined;
  const tuned = CRAFT_COST[c - 1];
  if (tuned) return tuned;
  // craft 10→11 是跑道段第一档，正好落在基准上
  const n = c - CRAFT_COST.length - 1;
  return {
    scrap: Math.round(CRAFT_LATE_BASE.scrap * Math.pow(CRAFT_COST_RATE, n)),
    parts: Math.round(CRAFT_LATE_BASE.parts * Math.pow(CRAFT_PARTS_RATE, n)),
  };
}

/** 下一档手艺的价。星卡住或已经焊满返回 undefined */
export function nextFeed(p: Progress, id: string): { scrap: number; parts: number } | undefined {
  const craft = craftOf(p, id);
  if (craft >= craftCap(starsOf(p, id))) return undefined;
  return nextCraftCost(craft);
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
  /** 本级已经攒了多少。不是从 1 级累加；升完一级会把这一格清掉 */
  villageExp: number;
  /** 已入伙的村民 id */
  roster: readonly string[];
  /** 每人当前几阶（1~3），没记录的按 1。由手艺推导，存着是为了旧档 */
  evo: Readonly<Record<string, number>>;
  /** 每人手艺 1~CRAFT_MAX。没记录的按 evo 反推 */
  craft: Readonly<Record<string, number>>;
  /** 每人几颗星（0~STAR_MAX），没记录的按 0 */
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
  return evoFromStars(starsOf(p, id));
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
): CallResult {
  const owned = new Set(p.roster);
  const missing = allIds.filter((id) => !owned.has(id));
  const forceNew = callCount <= CALL_PITY_NEW;
  const dupChance = p.roster.length / Math.max(1, allIds.length);

  if (missing.length > 0 && (forceNew || rng() > dupChance)) {
    const newcomer = missing[Math.floor(rng() * missing.length)]!;
    return { id: newcomer, isNew: true, scrap: 0 };
  }

  /*
   * 喊重了：折废铁 + 加一颗星，平摊给当前星最少的人。
   *
   * 「谁重复来谁涨」和「全压在主力身上」都试过，两版都会把推图曲线搅乱到对成本表
   * 极度敏感（同一组成本，种子间从 20 天到 60 天都有）—— 星卡着手艺上限，
   * 星一集中，主力的面板就跑在关卡难度前面。
   *
   * 2026-09-20 又拿模拟器量了第三版：给玩家一个「先练他」的名额。
   * 量了两种强度，前 40 关（5 种子均值，基线 D27.6）：
   *
   *   指定谁涨星 + 料也跟着集中 → D31.2，慢 3.6 天
   *   只当平手时的排序权         → D30.6，慢 3.0 天
   *
   * 连「只排序、不改分配形状」都是负的，说明这不是强度问题，是形状问题：
   * 3 路 × 4 格、靠换人吃克制，一个超人覆盖不了三条路，铺开永远更划算。
   * 星的分配一旦和喂料的顺序落在同一个人身上，铺开的优势就被削掉一截。
   *
   * 结论：**这个游戏里任何玩家可控的星集中都是陷阱**，给了就是拿玩家的主动权
   * 换他的进度，撞 §6「花下去不许更难」。所以星这一轴不开玩家入口 ——
   * 玩家的主动权在喂料那一轴（手艺 ×127 比星 ×1.8 重得多），
   * 该补的是把那一轴说清楚，不是再造一个假的。别再拿 pick 参数回来。
   */
  const low = [...p.roster]
    .filter((id) => starsOf(p, id) < starMax)
    .sort((a, b) => starsOf(p, a) - starsOf(p, b))[0];
  const who = p.roster[Math.floor(rng() * Math.max(1, p.roster.length))] ?? low ?? '';
  return { id: who, isNew: false, scrap: CALL_DUP_SCRAP, starTo: low };
}

export function starsOf(p: Progress, id: string): number {
  return Math.max(0, Math.floor(p.stars[id] ?? 0));
}

/**
 * 本级经验条。`exp` 必须是本级剩余，不要再减 villageCumExp。
 * 门楣曾经写成累计，6 级会报「再 719 点」、金条永远是空的。
 */
export function villageBar(lv: number, exp: number): {
  into: number;
  need: number | undefined;
  left: number;
  ratio: number;
  maxed: boolean;
} {
  const at = clampVillageLv(lv);
  const need = nextVillageCost(at);
  if (need === undefined) {
    return { into: 0, need, left: 0, ratio: 1, maxed: true };
  }
  const into = Math.max(0, Math.min(need, Math.floor(Number(exp) || 0)));
  return {
    into,
    need,
    left: Math.max(0, need - into),
    ratio: into / need,
    maxed: false,
  };
}

/** 挂在「村子 N 级」底下。经验对上摊子飘的「经验 +N」，加人说能多带谁 */
export function villageNeedHint(lv: number, exp: number): string {
  const bar = villageBar(lv, exp);
  if (bar.maxed || bar.need === undefined) return '村子满级了';
  const capLv = nextCapLv(lv);
  if (capLv === clampVillageLv(lv) + 1) {
    return `还差 ${bar.left} 经验，出村能多带一个人`;
  }
  return `还差 ${bar.left} 经验，全员再硬一截`;
}

/** 灌经验，够了就连升。返回的 exp 仍是本级剩余 */
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
