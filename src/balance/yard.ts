/**
 * 村里废品站：局外只养「下一局能焊什么」，不养人物等级。
 * 村民仍是起点；养成对象是破烂池和开局零钱。
 */
import { MODS, getMod, shortModName, type ModDef } from './mods';

/** 开局就在池子里的。锁着的要拿废品堆买下来 */
export const STARTER_MOD_IDS: readonly string[] = [
  'pipe',
  'steelplate',
  'pressurecooker',
  'helmet',
  'firecracker',
  'pot',
  'quilt',
  'speaker',
];

export interface YardUnlock {
  modId: string;
  cost: number;
  pitch: string;
}

/** 打完一波往废品堆记多少。走多远也算收获，别只靠局内零钱 */
export const YARD_PER_WAVE = 5;

/** 开局多带废品：0 / 8 / 16 / 24 */
export const START_SCRAP_BONUS = [0, 8, 16, 24] as const;
export const START_SCRAP_COST = [30, 50, 80] as const;

export const YARD_UNLOCKS: readonly YardUnlock[] = [
  { modId: 'weight', cost: 40, pitch: '池子里多一件：快手改成重炮' },
  { modId: 'blower', cost: 50, pitch: '池子里多一件：单点改成一片' },
  { modId: 'wire', cost: 60, pitch: '池子里多一件：一条线全归他' },
  { modId: 'chainsaw', cost: 70, pitch: '池子里多一件：远程焊上就得贴脸' },
];

export function isStarterMod(id: string): boolean {
  return STARTER_MOD_IDS.includes(id);
}

export function isModUnlocked(id: string, unlocked: readonly string[]): boolean {
  return isStarterMod(id) || unlocked.includes(id);
}

/** 模拟 / 测试不传 unlocks 时仍用全池，避免卡关曲线被养成锁歪 */
export function availableMods(unlocked?: readonly string[]): readonly ModDef[] {
  if (!unlocked) return MODS;
  return MODS.filter((m) => isModUnlocked(m.id, unlocked));
}

export function yardDeposit(wave: number, leftover: number): number {
  return Math.max(0, Math.floor(leftover)) + Math.max(0, wave) * YARD_PER_WAVE;
}

export function startScrapBonus(level: number): number {
  const i = Math.max(0, Math.min(START_SCRAP_BONUS.length - 1, Math.floor(level)));
  return START_SCRAP_BONUS[i] ?? 0;
}

export function nextStartScrapCost(level: number): number | undefined {
  if (level < 0 || level >= START_SCRAP_COST.length) return undefined;
  return START_SCRAP_COST[level];
}

export function lockedUnlocks(unlocked: readonly string[]): YardUnlock[] {
  return YARD_UNLOCKS.filter((u) => !unlocked.includes(u.modId));
}

export function unlockLabel(modId: string): string {
  return getMod(modId).name;
}

export type YardGoal =
  | {
      kind: 'mod';
      id: string;
      cost: number;
      have: number;
      name: string;
      short: string;
      becomes: string;
      afford: boolean;
    }
  | {
      kind: 'pocket';
      cost: number;
      have: number;
      nextBonus: number;
      afford: boolean;
    }
  | { kind: 'done' };

/** 村里下一件该买的。货架和主页共用，玩家始终知道差多少。 */
export function nextYardGoal(
  have: number,
  unlocked: readonly string[],
  startLv: number,
): YardGoal {
  const locked = lockedUnlocks(unlocked);
  if (locked.length > 0) {
    const u = locked.reduce((a, b) => (a.cost <= b.cost ? a : b));
    const m = getMod(u.modId);
    return {
      kind: 'mod',
      id: m.id,
      cost: u.cost,
      have,
      name: m.name,
      short: shortModName(m.name),
      becomes: m.becomes,
      afford: have >= u.cost,
    };
  }
  const cost = nextStartScrapCost(startLv);
  if (cost !== undefined) {
    const nextBonus = startScrapBonus(startLv + 1);
    return {
      kind: 'pocket',
      cost,
      have,
      nextBonus,
      afford: have >= cost,
    };
  }
  return { kind: 'done' };
}

export function goalLine(goal: YardGoal): string {
  if (goal.kind === 'done') return '池子齐了，出村开焊';
  if (goal.kind === 'mod') {
    return goal.afford ? `${goal.short}能买了` : `还差 ${goal.cost - goal.have} · ${goal.short}`;
  }
  return goal.afford
    ? `口袋能加到 +${goal.nextBonus}`
    : `还差 ${goal.cost - goal.have} · 开局口袋 +${goal.nextBonus}`;
}

/** 村子里看广告白送：从已解锁的改定位里翻一件 */
export function rollVillageGift(
  unlocked: readonly string[],
  except: readonly string[] = [],
): ModDef | undefined {
  const blocked = new Set(except);
  const pivots = availableMods(unlocked).filter((m) => m.kind === 'pivot' && !blocked.has(m.id));
  return pivots[Math.floor(Math.random() * pivots.length)];
}
