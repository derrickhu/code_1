/**
 * 村里废品站：买的是肉鸽怎么长，不是某件破烂。
 *
 * 向僵尸开炮 / 城主别慌张都是这个分法：技能局里自己出，局外店卖的是
 * 「下手更快、多翻几手、进场先焊、跪了还能喘」。
 * 买技能会把池子锁死，扩展性只剩加件，而且买了也看不出养成。
 *
 * 村民仍是起点；人物等级不做。废品堆只养这条成长。
 */
import { LEVEL_EXP, levelThreshold } from './picker';
import { MODS, RUN_MODS, MOD_STAR_MAX, getMod, shortModName, type ModDef } from './mods';
import {
  LANES,
  laneDrawMul,
  laneStars,
  nextLaneCost,
  type LaneId,
  type LaneLevels,
} from './lanes';

/** 打完一波往废品堆记多少。走多远也算收获，别只靠局内零钱 */
export const YARD_PER_WAVE = 5;

/** 开局多带废品：0 / 8 / 16 / 24 / 34。口袋是成长的一档，不是第二条线 */
export const START_SCRAP_BONUS = [0, 8, 16, 24, 34] as const;
export const START_SCRAP_COST = [30, 50, 80, 120] as const;

export type GrowthId =
  | 'hands' | 'reroll' | 'luck' | 'starter' | 'pocket' | 'breath' | 'carry' | 'scav';

export interface GrowthDef {
  id: GrowthId;
  name: string;
  /** 买的是这一局肉鸽怎么变 */
  pitch: string;
  costs: readonly number[];
  now: (lv: number) => string;
  next: (lv: number) => string;
}

const HANDS_STEP = 20;

/** 会捡破烂：打完往废品堆多记的百分比 */
const SCAV_STEP = 20;

export const YARD_GROWTH: readonly GrowthDef[] = [
  {
    id: 'hands',
    name: '下手更快',
    pitch: '破烂来得更勤，一局多焊几次',
    costs: [25, 40, 60, 90, 130, 190],
    now: (lv) => (lv <= 0 ? '照旧攒经验' : `经验门槛 -${lv * HANDS_STEP}%`),
    next: (lv) => `门槛再降到 -${(lv + 1) * HANDS_STEP}%`,
  },
  {
    id: 'reroll',
    name: '多翻几手',
    pitch: '这局白换几批三选一',
    costs: [35, 55, 80, 110, 150],
    now: (lv) => (lv <= 0 ? '重抽照旧花钱' : `每局白翻 ${lv} 次`),
    next: (lv) => `白翻加到 ${lv + 1} 次`,
  },
  {
    id: 'carry',
    name: '带一件出村',
    pitch: '村里点好哪一件，进场直接焊上',
    costs: [80, 260],
    now: (lv) => {
      if (lv <= 0) return '出村两手空空';
      return lv >= 2 ? '带的那件还白升一星' : '出村带指定的一件';
    },
    next: (lv) => (lv <= 0 ? '自己点一件带出村' : '带出去的那件 +1 星'),
  },
  {
    id: 'luck',
    name: '好货上门',
    pitch: '前几手必出改定位的破烂',
    costs: [45, 75, 120],
    now: (lv) => (lv <= 0 ? '三选一照旧抽' : `前 ${lv} 手必出改定位`),
    next: (lv) => `前 ${lv + 1} 手必出改定位`,
  },
  {
    id: 'starter',
    name: '进场先焊',
    pitch: '人齐了先随便焊上，不是指定买哪件',
    costs: [50, 90, 150],
    now: (lv) => (lv <= 0 ? '进场两手空空' : `开打先焊 ${lv} 件`),
    next: (lv) => `开打先焊 ${lv + 1} 件`,
  },
  {
    id: 'scav',
    name: '会捡破烂',
    pitch: '打完这一局，废品堆记得更多',
    costs: [40, 70, 120],
    now: (lv) => (lv <= 0 ? '照旧按波数记' : `收成 +${lv * SCAV_STEP}%`),
    next: (lv) => `收成加到 +${(lv + 1) * SCAV_STEP}%`,
  },
  {
    id: 'pocket',
    name: '开局零钱',
    pitch: '口袋里先有废品，好重抽好拆件',
    costs: [...START_SCRAP_COST],
    now: (lv) => (lv <= 0 ? '开局口袋是空的' : `开局口袋 +${START_SCRAP_BONUS[lv] ?? 0}`),
    next: (lv) => `口袋加到 +${START_SCRAP_BONUS[lv + 1] ?? 0}`,
  },
  {
    id: 'breath',
    name: '村里一口气',
    pitch: '队灭不用看广告，这套还在',
    costs: [70, 180],
    now: (lv) => (lv <= 0 ? '跪了得看广告' : `本局能白站起来 ${lv} 次`),
    next: (lv) => `队灭白站起来 ${lv + 1} 次`,
  },
];

export const GROWTH_BY_ID: Readonly<Record<GrowthId, GrowthDef>> = Object.fromEntries(
  YARD_GROWTH.map((g) => [g.id, g]),
) as Readonly<Record<GrowthId, GrowthDef>>;

export interface GrowthLevels {
  hands: number;
  reroll: number;
  luck: number;
  starter: number;
  pocket: number;
  breath: number;
  carry: number;
  scav: number;
}

export function emptyGrowth(): GrowthLevels {
  return {
    hands: 0, reroll: 0, luck: 0, starter: 0, pocket: 0, breath: 0, carry: 0, scav: 0,
  };
}

export function clampLv(id: GrowthId, raw: unknown): number {
  const cap = GROWTH_BY_ID[id].costs.length;
  return Math.max(0, Math.min(cap, Math.floor(Number(raw) || 0)));
}

export function clampGrowth(
  raw: Partial<GrowthLevels> | undefined,
  startScrapLv = 0,
): GrowthLevels {
  const pocket = raw?.pocket ?? startScrapLv;
  return {
    hands: clampLv('hands', raw?.hands),
    reroll: clampLv('reroll', raw?.reroll),
    luck: clampLv('luck', raw?.luck),
    starter: clampLv('starter', raw?.starter),
    pocket: clampLv('pocket', pocket),
    breath: clampLv('breath', raw?.breath),
    carry: clampLv('carry', raw?.carry),
    scav: clampLv('scav', raw?.scav),
  };
}

export interface RunGrowth {
  expPct: number;
  freeRerolls: number;
  luckPicks: number;
  startWelds: number;
  freeRevives: number;
  /** 带出村那件白给几星。没买第二级携带位就是 0 */
  carryStars: number;
}

export const DEFAULT_RUN_GROWTH: RunGrowth = {
  expPct: 0,
  freeRerolls: 0,
  luckPicks: 0,
  startWelds: 0,
  freeRevives: 0,
  carryStars: 0,
};

export function resolveRunGrowth(lv: GrowthLevels): RunGrowth {
  return {
    expPct: lv.hands * HANDS_STEP,
    freeRerolls: lv.reroll,
    luckPicks: lv.luck,
    startWelds: lv.starter,
    freeRevives: lv.breath,
    carryStars: Math.max(0, lv.carry - 1),
  };
}

/** 买了携带位才能在村里点带哪一件出去 */
export function canCarry(lv: GrowthLevels): boolean {
  return lv.carry > 0;
}

/** 会捡破烂：打完这一局往废品堆多记的倍数 */
export function scavMul(lv: GrowthLevels): number {
  return 1 + lv.scav * SCAV_STEP / 100;
}

export function growthMax(id: GrowthId): number {
  return GROWTH_BY_ID[id].costs.length;
}

export function nextGrowthCost(id: GrowthId, lv: number): number | undefined {
  return GROWTH_BY_ID[id].costs[Math.max(0, Math.floor(lv))];
}

/**
 * 单件破烂升星的老价目表。
 *
 * 单件升星已经下线 —— 一件只占池子 1/27，买完下一局大概率抽不到，
 * 钱花了看不见，是这版局外养成最大的败笔。它的位置让给了门路研发。
 * 这张表只留着给老存档折算返还用，别再拿它加新档。
 */
export const MOD_STAR_COSTS = [20, 35, 55, 80] as const;

export function clampModStars(raw: Readonly<Record<string, number>> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const m of MODS) {
    const n = Math.max(0, Math.min(MOD_STAR_MAX, Math.floor(Number(raw[m.id]) || 0)));
    if (n > 0) out[m.id] = n;
  }
  return out;
}

export function nextModStarCost(stars: number): number | undefined {
  if (stars < 0 || stars >= MOD_STAR_MAX) return undefined;
  return MOD_STAR_COSTS[stars];
}

/**
 * 老存档里买过的单件星，原价折回废品。
 *
 * 全额返还，不打折：玩家没做错什么，是我们把这条线撤了。
 */
export function refundModStars(stars: Readonly<Record<string, number>> | undefined): number {
  const clean = clampModStars(stars);
  let sum = 0;
  for (const id of Object.keys(clean)) {
    const n = clean[id] ?? 0;
    for (let i = 0; i < n; i += 1) sum += MOD_STAR_COSTS[i] ?? 0;
  }
  return sum;
}

/** 下手更快：门槛按成长压，短关才焊得上第二件 */
export function pickNeed(level: number, expPct = 0): number | undefined {
  const base = levelThreshold(level);
  if (base === undefined) return undefined;
  const pct = Math.max(0, expPct);
  return Math.max(3, Math.round(base * 100 / (100 + pct)));
}

export function pickFrom(level: number, expPct = 0): number {
  if (level <= 0) return 0;
  return pickNeed(level - 1, expPct) ?? (LEVEL_EXP[level - 1] ?? 0);
}

export function startScrapBonus(level: number): number {
  const i = Math.max(0, Math.min(START_SCRAP_BONUS.length - 1, Math.floor(level)));
  return START_SCRAP_BONUS[i] ?? 0;
}

export function nextStartScrapCost(level: number): number | undefined {
  return nextGrowthCost('pocket', level);
}

/** 模拟 / 测试不传 unlocks 时仍用本局池。回声件不发 */
export function availableMods(_unlocked?: readonly string[]): readonly ModDef[] {
  return RUN_MODS;
}

export function isStarterMod(_id: string): boolean {
  return true;
}

export function isModUnlocked(_id: string, _unlocked?: readonly string[]): boolean {
  return true;
}

/**
 * 村里那堆废品离线自己涨。
 *
 * 上限刻意压在「打一局的收成」左右：它是回访的理由，不是替代打一局的路子。
 * 涨满就停，多挂一天不会多给 —— 这条是防挂机的，别取消。
 */
export const PILE_PER_HOUR = 6;
export const PILE_CAP = 60;

export function pileGrowth(have: number, elapsedMs: number): number {
  const add = Math.floor((Math.max(0, elapsedMs) / 3_600_000) * PILE_PER_HOUR);
  return Math.max(0, Math.min(PILE_CAP, Math.floor(have) + add));
}

export function yardDeposit(wave: number, leftover: number, scav = 1): number {
  const base = Math.max(0, Math.floor(leftover)) + Math.max(0, wave) * YARD_PER_WAVE;
  return Math.floor(base * Math.max(1, scav));
}

export function unlockLabel(modId: string): string {
  return getMod(modId).name;
}

export type YardGoal =
  | {
      kind: 'growth';
      id: GrowthId;
      name: string;
      cost: number;
      have: number;
      afford: boolean;
      next: string;
    }
  | {
      kind: 'lane';
      id: LaneId;
      name: string;
      cost: number;
      have: number;
      afford: boolean;
      next: string;
    }
  | { kind: 'done' };

/** 村里下一档该买的。货架和主页共用，玩家始终知道差多少。 */
export function nextYardGoal(
  have: number,
  lv: GrowthLevels,
  lanes: Readonly<Partial<LaneLevels>> = {},
): YardGoal {
  let best: YardGoal | undefined;
  const consider = (g: Exclude<YardGoal, { kind: 'done' }>): void => {
    if (!best || best.kind === 'done' || g.cost < best.cost) best = g;
  };
  for (const def of YARD_GROWTH) {
    const cost = nextGrowthCost(def.id, lv[def.id]);
    if (cost === undefined) continue;
    consider({
      kind: 'growth',
      id: def.id,
      name: def.name,
      cost,
      have,
      afford: have >= cost,
      next: def.next(lv[def.id]),
    });
  }
  for (const l of LANES) {
    const now = Math.max(0, Math.floor(Number(lanes[l.id]) || 0));
    const cost = nextLaneCost(now);
    if (cost === undefined) continue;
    const st = laneStars(now + 1);
    consider({
      kind: 'lane',
      id: l.id,
      name: l.name,
      cost,
      have,
      afford: have >= cost,
      next: st > laneStars(now)
        ? `这条路全升到 ★${st}`
        : `这条路出得勤 ×${laneDrawMul(now + 1).toFixed(2).replace(/0$/, '')}`,
    });
  }
  return best ?? { kind: 'done' };
}

export function goalLine(goal: YardGoal): string {
  if (goal.kind === 'done') return '长线齐了，出村开焊';
  return goal.afford
    ? `${goal.name}能买了`
    : `还差 ${goal.cost - goal.have} · ${goal.name}`;
}

/** 卡上只写这一句：点下去变成什么。满级写已经买到的那档。 */
export function growthTag(id: GrowthId, lv: number, maxed: boolean): string {
  const at = maxed ? lv : lv + 1;
  switch (id) {
    case 'hands':
      return `门槛 -${at * HANDS_STEP}%`;
    case 'reroll':
      return `白翻 ${at}`;
    case 'luck':
      return `前${at}手改定位`;
    case 'starter':
      return `开打先焊${at}件`;
    case 'pocket':
      return `口袋 +${START_SCRAP_BONUS[at] ?? START_SCRAP_BONUS[START_SCRAP_BONUS.length - 1]}`;
    case 'breath':
      return '跪了白站1次';
    case 'carry':
      return at >= 2 ? '带出村还+1星' : '出村带指定一件';
    case 'scav':
      return `收成 +${at * SCAV_STEP}%`;
    default:
      return '';
  }
}

/** 总花费。验收「别再几局买空」用 */
export function growthTotalCost(): number {
  return YARD_GROWTH.reduce((sum, g) => sum + g.costs.reduce((a, c) => a + c, 0), 0);
}

/** 村子里看广告白送：从改定位里翻一件。破烂不用解锁 */
export function rollVillageGift(
  _unlocked: readonly string[] = [],
  except: readonly string[] = [],
): ModDef | undefined {
  const blocked = new Set(except);
  const pivots = RUN_MODS.filter((m) => m.kind === 'pivot' && !blocked.has(m.id));
  return pivots[Math.floor(Math.random() * pivots.length)];
}

export { shortModName };
