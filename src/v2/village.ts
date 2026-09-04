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

export const VILLAGE_LV_MAX = 20;

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
 * 战场是 3 路 × 4 格 = 12 格，满级只给 8 人 —— **空着的 4 格就是取舍**，
 * 玩家必须选哪一路厚哪一路薄。8 是上限，§6 第 14 条写明不许再往上加，
 * 再加就撞反目标「格子里全是人，看不出哪一路要崩」。
 */
/**
 * 解锁档刻意前重后轻。
 *
 * 第 3 章开始敌人就是两三路一起来，而三个人摊到三路就是一路一个、毫无纵深 ——
 * 模拟器实测 **3-2 在所有种子里都是墙**（3-1 能 ★3 过，3-2 只多一只就漏 3 个）。
 * 那不是难度问题，是「一路一个人」这个阵型本身没得排，
 * 玩家在那儿卡住学不到任何东西。所以第 4 个人提前到 Lv.2、第 5 个到 Lv.4。
 */
export const SQUAD_CAP_AT: readonly { lv: number; cap: number }[] = [
  { lv: 1, cap: 3 },
  { lv: 2, cap: 4 },
  { lv: 4, cap: 5 },
  { lv: 7, cap: 6 },
  { lv: 11, cap: 7 },
  { lv: 15, cap: 8 },
];

export const SQUAD_CAP_MAX = 8;

export function clampVillageLv(raw: unknown): number {
  const n = Math.floor(Number(raw) || 1);
  return Math.max(1, Math.min(VILLAGE_LV_MAX, n));
}

/** 升到下一级还要多少。满级返回 undefined */
export function nextVillageCost(lv: number): number | undefined {
  const i = clampVillageLv(lv) - 1;
  return VILLAGE_STEPS[i];
}

/** 从 Lv.1 升到 lv 的累计经验 */
export function villageCumExp(lv: number): number {
  const top = clampVillageLv(lv);
  let sum = 0;
  for (let i = 0; i < top - 1; i += 1) sum += VILLAGE_STEPS[i] ?? 0;
  return sum;
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
 * 进化成本。一阶→二阶、二阶→三阶。
 *
 * 废铁是量大的那头（弹弓摊天天掉），零件是卡门槛的那头（掉得少）。
 * 两级材料是为了让「先把谁喂到三阶」成为一个真决策：
 * 废铁够了但零件不够时，玩家得挑一个人先上，这就是「攒谁、喂谁」的那一半。
 */
export const EVO_COST: readonly { scrap: number; parts: number }[] = [
  { scrap: 120, parts: 4 },
  { scrap: 400, parts: 18 },
];

/** 从 stage 阶升到下一阶要多少。已经三阶返回 undefined */
export function nextEvoCost(stage: number): { scrap: number; parts: number } | undefined {
  const i = Math.max(1, Math.floor(stage)) - 1;
  return EVO_COST[i];
}

/** 把一个人从一阶喂到三阶的总花费 */
export function evoTotalCost(): { scrap: number; parts: number } {
  return EVO_COST.reduce(
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
  /** 每人当前几阶（1~3），没记录的按 1 */
  evo: Readonly<Record<string, number>>;
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
    stars: {},
    scrap: 0,
    parts: 0,
    credits: 0,
  };
}

export function evoOf(p: Progress, id: string): number {
  return Math.max(1, Math.min(3, Math.floor(p.evo[id] ?? 1)));
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
