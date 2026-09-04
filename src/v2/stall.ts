/**
 * 村口弹弓摊：局外唯一的资源出口。
 *
 * 它替掉的是上一版的文字货架（废品站）。同样是「拿资源」，
 * 差别在动作：货架是读文字点购买，摊子是拉一下弹弓、靶子倒下来、东西掉出来。
 * 对标产品把抽卡、升级、抓宠压成一个两秒动作，就是这条。
 *
 * 一条硬口径（§5 资源种类 ≤ 4）：**弹子是次数，不是货币。**
 * 不进货币条、不能买、不能换、没有第二个去处。玩家一旦问出
 * 「弹子能买什么」，说明它变成了第五种货币，届时砍掉存量改成纯次数。
 */

export type Drop = 'exp' | 'scrap' | 'parts' | 'credits';

export interface TargetDef {
  id: string;
  name: string;
  /** 千分权重，便于精确配比。总和必须是 1000 */
  weight: number;
  exp: number;
  scrap: number;
  parts: number;
  credits: number;
  /** 打中之后免费再来一发（不耗弹子）。目前只有吊铁盆 */
  rebound?: boolean;
  /** 卡面那一行 */
  pitch: string;
}

/**
 * 靶面。按村庄等级分批挂上墙（见 TARGET_UNLOCK_LV）。
 *
 * 产出重心刻意压在**村庄经验**上，废铁只是零头 —— 废铁的大头在关卡结算里
 * （SETTLE_SCRAP），摊子要是也成为废铁水龙头，两边一叠就把养成曲线冲垮了。
 */
export const TARGETS: readonly TargetDef[] = [
  {
    id: 'cans',
    name: '铁皮罐 ×3',
    weight: 340,
    exp: 6, scrap: 0, parts: 0, credits: 0,
    pitch: '最好打的一排，摊子的主产出',
  },
  {
    id: 'bottles',
    name: '绿酒瓶 ×2',
    weight: 240,
    exp: 0, scrap: 4, parts: 0, credits: 0,
    pitch: '碎得响，但废铁只是零头',
  },
  {
    id: 'tv',
    name: '破电视',
    weight: 160,
    exp: 0, scrap: 0, parts: 1, credits: 0,
    pitch: '零件的唯一来源，卡进化门槛',
  },
  {
    id: 'crate',
    name: '蓝塑料筐',
    weight: 120,
    exp: 4, scrap: 0, parts: 1, credits: 0,
    pitch: '两头都给的中靶位',
  },
  {
    id: 'basin',
    name: '吊着的铁盆',
    weight: 80,
    exp: 5, scrap: 0, parts: 0, credits: 0,
    rebound: true,
    pitch: '晃着的，打中接一发连击',
  },
  {
    id: 'horn',
    name: '挂着的旧喇叭',
    weight: 60,
    exp: 0, scrap: 0, parts: 0, credits: 1,
    pitch: '响一声记一个工分，最小最偏',
  },
];

/** 靶位按村庄等级分批解锁。头两个一开始就有 */
export const TARGET_UNLOCK_LV: Readonly<Record<string, number>> = {
  cans: 1, bottles: 1, tv: 1, crate: 2, basin: 6, horn: 8,
};

/**
 * 连带：打中一个靶会碰倒相邻的，相邻按 50% 结算，只结经验和废铁。
 *
 * 相邻平均按 0.8 个算，所以经验/废铁的期望乘 1 + 0.8 × 0.5 = 1.4。
 * 这是「一发拿多种奖」的落地方式，也是靶子倒下要做足响声的地方 ——
 * 反馈不够时玩家会开始连点跳动画，那是要加演出，不是减发数。
 */
export const CHAIN_MUL = 1.4;

/** 每多少发必出一个工分。村庄 Lv.10 之后降到 6 */
export const CREDIT_PITY = 8;
export const CREDIT_PITY_LATE = 6;

export function creditPity(villageLv: number): number {
  return villageLv >= 10 ? CREDIT_PITY_LATE : CREDIT_PITY;
}

/* ---------------- 弹子（次数，不是货币） ---------------- */

/** 通关一关给几发 */
export const PELLET_CLEAR = 3;
/** 首次通关额外给几发 */
export const PELLET_FIRST = 4;
/** 打输了也给一发，不能空手回村 */
export const PELLET_LOSE = 1;
/** 离线多久回一发（分钟）。村庄 Lv.5 之后降到 30 */
export const PELLET_REGEN_MIN = 40;
export const PELLET_REGEN_MIN_LATE = 30;
/** 离线最多攒几发 */
export const PELLET_OFFLINE_CAP = 12;
/** 摊子看一条广告给几发，日限几次 */
export const PELLET_AD = 5;
export const PELLET_AD_DAILY = 3;
/** 存量上限。村庄 Lv.5 之后涨到 26 */
export const PELLET_CAP = 20;
export const PELLET_CAP_LATE = 26;

export function pelletCap(villageLv: number): number {
  return villageLv >= 5 ? PELLET_CAP_LATE : PELLET_CAP;
}

export function pelletRegenMin(villageLv: number): number {
  return villageLv >= 5 ? PELLET_REGEN_MIN_LATE : PELLET_REGEN_MIN;
}

/** 关卡结算给的废铁。废铁的大头在这儿，不在摊子 */
export const SETTLE_SCRAP = 50;

/** 一天按打 3 关、首通 2 关、离线满、广告看满算 */
export const DAILY_PELLETS =
  3 * PELLET_CLEAR + 2 * PELLET_FIRST + PELLET_OFFLINE_CAP + PELLET_AD_DAILY * PELLET_AD;

/* ---------------- 产出 ---------------- */

export interface Yield {
  exp: number;
  scrap: number;
  parts: number;
  credits: number;
}

export function emptyYield(): Yield {
  return { exp: 0, scrap: 0, parts: 0, credits: 0 };
}

export function addYield(a: Yield, b: Yield): Yield {
  return {
    exp: a.exp + b.exp,
    scrap: a.scrap + b.scrap,
    parts: a.parts + b.parts,
    credits: a.credits + b.credits,
  };
}

function openTargets(villageLv: number): readonly TargetDef[] {
  return TARGETS.filter((t) => villageLv >= (TARGET_UNLOCK_LV[t.id] ?? 1));
}

/**
 * 一发弹子的**期望**产出。校准和护栏用这个，不用随机。
 *
 * 三层：靶面期望 → 铁盆连击的几何级数 → 连带乘数（只加经验和废铁）→ 工分保底。
 */
export function expectedPerPellet(villageLv = 1): Yield {
  const open = openTargets(villageLv);
  const total = open.reduce((s, t) => s + t.weight, 0);
  if (total <= 0) return emptyYield();

  let exp = 0, scrap = 0, parts = 0, credits = 0, reboundP = 0;
  for (const t of open) {
    const p = t.weight / total;
    exp += p * t.exp;
    scrap += p * t.scrap;
    parts += p * t.parts;
    credits += p * t.credits;
    if (t.rebound) reboundP += p;
  }

  // 铁盆连击：打中就免费再来一发，等比数列求和
  const loop = reboundP >= 1 ? 1 : 1 / (1 - reboundP);

  return {
    exp: exp * loop * CHAIN_MUL,
    scrap: scrap * loop * CHAIN_MUL,
    parts: parts * loop,
    credits: credits * loop + 1 / creditPity(villageLv),
  };
}

/** 一天的期望产出，含关卡结算的废铁 */
export function expectedPerDay(villageLv = 1, clearsPerDay = 3): Yield {
  const per = expectedPerPellet(villageLv);
  return {
    exp: per.exp * DAILY_PELLETS,
    scrap: per.scrap * DAILY_PELLETS + clearsPerDay * SETTLE_SCRAP,
    parts: per.parts * DAILY_PELLETS,
    credits: per.credits * DAILY_PELLETS,
  };
}

/* ---------------- 随机（表现层与蒙特卡洛用） ---------------- */

export type Rng = () => number;

/** 小巧的可复现 RNG。测试要能重放，别用 Math.random */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ShotResult {
  hit: TargetDef;
  gain: Yield;
  /** 连击了几次（铁盆） */
  rebounds: number;
}

/** 打一发。pityCount 是「离上次出工分过了几发」，调用方自己累计 */
export function shoot(rng: Rng, villageLv: number, pityCount: number): {
  result: ShotResult;
  pityCount: number;
} {
  const open = openTargets(villageLv);
  const total = open.reduce((s, t) => s + t.weight, 0);
  let gain = emptyYield();
  let rebounds = 0;
  let first: TargetDef = open[0]!;
  let pity = pityCount;

  for (let guard = 0; guard < 16; guard += 1) {
    let roll = rng() * total;
    let hit = open[open.length - 1]!;
    for (const t of open) {
      if (roll < t.weight) { hit = t; break; }
      roll -= t.weight;
    }
    if (guard === 0) first = hit;

    gain = addYield(gain, {
      exp: hit.exp * CHAIN_MUL,
      scrap: hit.scrap * CHAIN_MUL,
      parts: hit.parts,
      credits: hit.credits,
    });
    pity += 1;
    if (hit.credits > 0) pity = 0;

    if (!hit.rebound) break;
    rebounds += 1;
  }

  const need = creditPity(villageLv);
  if (pity >= need) {
    gain = addYield(gain, { exp: 0, scrap: 0, parts: 0, credits: 1 });
    pity = 0;
  }

  return { result: { hit: first, gain, rebounds }, pityCount: pity };
}

/** 靶面权重之和必须是 1000，改配比时别算错 */
export function assertWeights(): void {
  const sum = TARGETS.reduce((s, t) => s + t.weight, 0);
  if (sum !== 1000) throw new Error(`靶面权重之和是 ${sum}，应该是 1000`);
}
