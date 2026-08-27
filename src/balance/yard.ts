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
import { MODS, MOD_STAR_MAX, getMod, shortModName, type ModDef } from './mods';

/** 打完一波往废品堆记多少。走多远也算收获，别只靠局内零钱 */
export const YARD_PER_WAVE = 5;

/** 开局多带废品：0 / 8 / 16 / 24。口袋是成长的一档，不是第二条线 */
export const START_SCRAP_BONUS = [0, 8, 16, 24] as const;
export const START_SCRAP_COST = [30, 50, 80] as const;

export type GrowthId = 'hands' | 'reroll' | 'luck' | 'starter' | 'pocket' | 'breath';

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

export const YARD_GROWTH: readonly GrowthDef[] = [
  {
    id: 'hands',
    name: '下手更快',
    pitch: '破烂来得更勤，一局多焊几次',
    costs: [25, 40, 60, 90, 130],
    now: (lv) => (lv <= 0 ? '照旧攒经验' : `经验门槛 -${lv * HANDS_STEP}%`),
    next: (lv) => `门槛再降到 -${(lv + 1) * HANDS_STEP}%`,
  },
  {
    id: 'reroll',
    name: '多翻几手',
    pitch: '这局白换几批三选一',
    costs: [35, 55, 80, 110],
    now: (lv) => (lv <= 0 ? '重抽照旧花钱' : `每局白翻 ${lv} 次`),
    next: (lv) => `白翻加到 ${lv + 1} 次`,
  },
  {
    id: 'luck',
    name: '好货上门',
    pitch: '前几手必出改定位的破烂',
    costs: [45, 75],
    now: (lv) => (lv <= 0 ? '三选一照旧抽' : `前 ${lv} 手必出改定位`),
    next: (lv) => `前 ${lv + 1} 手必出改定位`,
  },
  {
    id: 'starter',
    name: '进场先焊',
    pitch: '人齐了先随便焊上，不是指定买哪件',
    costs: [50, 90],
    now: (lv) => (lv <= 0 ? '进场两手空空' : `开打先焊 ${lv} 件`),
    next: (lv) => `开打先焊 ${lv + 1} 件`,
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
    pitch: '队灭一次不用看广告，这套还在',
    costs: [70],
    now: (lv) => (lv <= 0 ? '跪了得看广告' : '本局能白站起来一次'),
    next: () => '队灭白站起来一次',
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
}

export function emptyGrowth(): GrowthLevels {
  return { hands: 0, reroll: 0, luck: 0, starter: 0, pocket: 0, breath: 0 };
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
  };
}

export interface RunGrowth {
  expPct: number;
  freeRerolls: number;
  luckPicks: number;
  startWelds: number;
  freeRevives: number;
}

export const DEFAULT_RUN_GROWTH: RunGrowth = {
  expPct: 0,
  freeRerolls: 0,
  luckPicks: 0,
  startWelds: 0,
  freeRevives: 0,
};

export function resolveRunGrowth(lv: GrowthLevels): RunGrowth {
  return {
    expPct: lv.hands * HANDS_STEP,
    freeRerolls: lv.reroll,
    luckPicks: lv.luck,
    startWelds: lv.starter,
    freeRevives: lv.breath > 0 ? 1 : 0,
  };
}

export function growthMax(id: GrowthId): number {
  return GROWTH_BY_ID[id].costs.length;
}

export function nextGrowthCost(id: GrowthId, lv: number): number | undefined {
  return GROWTH_BY_ID[id].costs[Math.max(0, Math.floor(lv))];
}

/** 单件破烂升星。买的不是解锁，是下一局抽到它时更猛 */
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

export function starTotalCost(): number {
  return MODS.length * MOD_STAR_COSTS.reduce((a, c) => a + c, 0);
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

/** 模拟 / 测试不传 unlocks 时仍用全池。破烂不用买，开打就在池子里 */
export function availableMods(_unlocked?: readonly string[]): readonly ModDef[] {
  return MODS;
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

export function yardDeposit(wave: number, leftover: number): number {
  return Math.max(0, Math.floor(leftover)) + Math.max(0, wave) * YARD_PER_WAVE;
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
      kind: 'star';
      id: string;
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
  stars: Readonly<Record<string, number>> = {},
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
  for (const m of MODS) {
    const now = stars[m.id] ?? 0;
    const cost = nextModStarCost(now);
    if (cost === undefined) continue;
    consider({
      kind: 'star',
      id: m.id,
      name: shortModName(m.name),
      cost,
      have,
      afford: have >= cost,
      next: `抽到更猛 ★${now + 1}`,
    });
  }
  return best ?? { kind: 'done' };
}

export function goalLine(goal: YardGoal): string {
  if (goal.kind === 'done') return '长线齐了，出村开焊';
  return goal.afford
    ? `${goal.name}能买了 · ${goal.next}`
    : `还差 ${goal.cost - goal.have} · ${goal.name}`;
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
  const pivots = MODS.filter((m) => m.kind === 'pivot' && !blocked.has(m.id));
  return pivots[Math.floor(Math.random() * pivots.length)];
}

export { shortModName };
