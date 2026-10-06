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
import { getStage } from '@/balance/stages';
import { yieldMul } from '@/balance/village';

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
 * 锁着的靶要写出打中得到什么。名字本身看不出用途。
 * 蓝筐给零件，铁盆白送一发，喇叭给工分。
 */
const TARGET_LOCK_USE: Readonly<Record<string, string>> = {
  crate: '零件 +1',
  basin: '再来一发',
  horn: '工分 +1',
};

/** 锁着时挂在靶名下面的那一行。开着的靶不写 */
export function targetLockUse(id: string): string | undefined {
  return TARGET_LOCK_USE[id];
}

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

/**
 * 第 1 章过关给几发。后面的章在这之上加，不加在首通那一笔上。
 * 一天的弹子账（DAILY_PELLETS）仍按这个开局数校。
 */
export const PELLET_CLEAR = 3;
/** 首次通关额外给几发。每一章都是这一笔，不随难度涨 */
export const PELLET_FIRST = 4;
/**
 * 第 9 章起过关才多给弹子。前 8 章（40 关）一个不加。
 *
 * 那 40 关的天数和村庄升级是贴着「过关 3 发」校的。往前加一两发，
 * 村庄 20 级会提前到来，人变强，后面的关就打得太顺。
 * 第 9 章多 1 发，之后每 8 章再多 1 发，最多多 4 发（过关 7 发）。
 * 到顶就停。弹子仍是摊上的次数，不按关卡号无限加。
 */
export const PELLET_CHAPTER_START = 9;
export const PELLET_CHAPTER_EVERY = 8;
export const PELLET_CHAPTER_CAP = 4;

/** 这一章过关比第 1 章多几发。前 8 章是 0 */
export function pelletChapterBonus(chapter: number): number {
  const ch = Math.max(1, Math.floor(chapter) || 1);
  if (ch < PELLET_CHAPTER_START) return 0;
  const steps = Math.floor((ch - PELLET_CHAPTER_START) / PELLET_CHAPTER_EVERY);
  return Math.min(PELLET_CHAPTER_CAP, 1 + steps);
}

/** 打赢这一关给几发。首通另加 PELLET_FIRST，输了不走这里 */
export function pelletsForStage(stageId: number, first: boolean): number {
  const bonus = pelletChapterBonus(getStage(stageId).chapter);
  return PELLET_CLEAR + bonus + (first ? PELLET_FIRST : 0);
}
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
/**
 * 过关结算看广告再给的弹子。固定 3 发，不跟这一关本来的过关弹子翻倍，
 * 也不再翻废铁。日限在 AdDay.settleDouble，跟摊子广告对齐成一天 3 次。
 * 不进 DAILY_PELLETS：这是玩家自己点的，模拟器不算进每天的自动进账。
 */
export const SETTLE_AD_PELLETS = 3;
/** 存量上限。村庄 Lv.5 之后涨到 26 */
export const PELLET_CAP = 20;
export const PELLET_CAP_LATE = 26;

export function pelletCap(villageLv: number): number {
  return villageLv >= 5 ? PELLET_CAP_LATE : PELLET_CAP;
}

export function pelletRegenMin(villageLv: number): number {
  return villageLv >= 5 ? PELLET_REGEN_MIN_LATE : PELLET_REGEN_MIN;
}

/** 首通一关给的废铁。废铁的大头在这儿，不在摊子 */
export const SETTLE_SCRAP = 50;

/**
 * 重打已经通关的关给多少废铁。
 *
 * 必须比首通低一大截，否则「刷最短的那关」是最优解 ——
 * 1-1 打一遍不到一分钟，给满 50 的话手艺后四档就变成挂机刷出来的，
 * 而不是推图推出来的。给 15 是为了让通关后仍有一条废铁的活水，
 * 不是为了让人蹲在第一关。
 */
export const SETTLE_SCRAP_REPLAY = 15;

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

  // 工分不乘产出倍率：名单最多 20 人、星最多 ★10，喊人的总需求是封顶的，
  // 乘上去只会喊出一堆没处放的重复
  const k = yieldMul(villageLv);
  return {
    exp: exp * loop * CHAIN_MUL * k,
    scrap: scrap * loop * CHAIN_MUL * k,
    parts: parts * loop * k,
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
  /** 工分是保底补上的，不是打中喇叭。抽卡那种「保底亮了」靠这个分 */
  pityHit: boolean;
}

/**
 * 按「拿到了什么」分层，不按打中哪个靶。
 * 铁皮罐碰上保底工分，也是 jackpot —— 塔塔 / 爪机 / Coin Master 都是看掉出来的东西。
 */
export type PrizeTier = 'common' | 'uncommon' | 'rare' | 'jackpot';

export function prizeTier(gain: Yield): PrizeTier {
  if (gain.credits > 0) return 'jackpot';
  if (gain.parts > 0) return 'rare';
  if (gain.scrap > 0) return 'uncommon';
  return 'common';
}

export interface PrizeChip {
  kind: Drop;
  amount: number;
}

/** 每种资源一枚筹码。经验就地飘，废铁/零件/工分再飞进口袋。 */
export function prizeChips(gain: Yield): PrizeChip[] {
  const out: PrizeChip[] = [];
  if (gain.exp > 0) out.push({ kind: 'exp', amount: Math.round(gain.exp) });
  if (gain.scrap > 0) out.push({ kind: 'scrap', amount: Math.round(gain.scrap) });
  if (gain.parts > 0) out.push({ kind: 'parts', amount: Math.round(gain.parts) });
  if (gain.credits > 0) out.push({ kind: 'credits', amount: Math.round(gain.credits) });
  return out;
}

export function prizeBanner(result: ShotResult): string | null {
  if (result.gain.credits > 0) {
    const n = Math.round(result.gain.credits);
    return result.pityHit ? `保底工分 +${n}` : `工分 +${n}`;
  }
  if (result.gain.parts > 0) return `零件 +${Math.round(result.gain.parts)}`;
  return null;
}

/** 卡面上头那一行。比横幅短，给揭幕用。 */
export function prizeTitle(result: ShotResult): string | null {
  if (result.gain.credits > 0) return result.pityHit ? '保底到了' : '工分入手';
  if (result.gain.parts > 0) return '零件到手';
  return null;
}

export function prizeSub(result: ShotResult): string | null {
  if (result.pityHit) return '这一发算在保底上';
  if (result.gain.credits > 0 && result.hit.id === 'horn') return '旧喇叭响了一声';
  if (result.gain.parts > 0 && result.hit.id === 'tv') return '破电视里掉出来';
  if (result.gain.parts > 0 && result.hit.id === 'crate') return '筐底翻出零件';
  if (result.gain.parts > 0) return '零件到手了';
  return null;
}

export function prizeAccent(tier: PrizeTier): number {
  if (tier === 'jackpot') return 0xffe08a;
  if (tier === 'rare') return 0x7ec8ff;
  if (tier === 'uncommon') return 0xe8a05a;
  return 0x9be08a;
}

/**
 * 一发的演出节拍。对标爪机 / 弹珠台 / Peggle：
 * 普通也要让人看清砸上、罐子晃完。稀有再停一拍出卡。
 */
export const PRIZE_BEAT: Readonly<Record<PrizeTier, {
  hitStop: number;
  hold: number;
  fly: number;
  punch: number;
}>> = {
  common: { hitStop: 0.06, hold: 0.62, fly: 0.48, punch: 8 },
  uncommon: { hitStop: 0.07, hold: 0.68, fly: 0.5, punch: 10 },
  rare: { hitStop: 0.09, hold: 0.74, fly: 0.52, punch: 14 },
  jackpot: { hitStop: 0.16, hold: 0.92, fly: 0.56, punch: 18 },
};

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

    const k = yieldMul(villageLv);
    gain = addYield(gain, {
      exp: hit.exp * CHAIN_MUL * k,
      scrap: hit.scrap * CHAIN_MUL * k,
      parts: hit.parts * k,
      credits: hit.credits,
    });
    pity += 1;
    if (hit.credits > 0) pity = 0;

    if (!hit.rebound) break;
    rebounds += 1;
  }

  let pityHit = false;
  const need = creditPity(villageLv);
  if (pity >= need) {
    gain = addYield(gain, { exp: 0, scrap: 0, parts: 0, credits: 1 });
    pity = 0;
    pityHit = true;
  }

  return { result: { hit: first, gain, rebounds, pityHit }, pityCount: pity };
}

/** 靶面权重之和必须是 1000，改配比时别算错 */
export function assertWeights(): void {
  const sum = TARGETS.reduce((s, t) => s + t.weight, 0);
  if (sum !== 1000) throw new Error(`靶面权重之和是 ${sum}，应该是 1000`);
}
