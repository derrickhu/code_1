/**
 * 星星宝箱：一章 5 关最多 15 颗星，攒到 5 / 10 / 15 各开一个，每个只开一次。
 *
 * 星评以前只记不发，一星和三星拿的东西一样，重打没有理由。
 * 宝箱挂在「这一章一共几颗星」上而不是每关的星上：刷同一关拿不到第二次，
 * 只有把没打满的关补到三星才能往前走。过关的弹子、废铁一个不动。
 */
import { CHAPTER_COUNT, stagesOfChapter } from '@/balance/stages';

/** 开第几个宝箱要这一章攒到几颗星 */
export const CHEST_STARS: readonly number[] = [5, 10, 15];
export const CHEST_COUNT = CHEST_STARS.length;

export interface ChestLoot {
  scrap: number;
  parts: number;
  credits: number;
}

/**
 * 给零件和工分：前期卡人的是升手艺的零件和喊人的工分，不是废铁。
 * 第三个宝箱的工分正好够喊一嗓子（CALL_COST）。
 */
const CHEST_LOOT: readonly ChestLoot[] = [
  { scrap: 60, parts: 1, credits: 0 },
  { scrap: 0, parts: 2, credits: 3 },
  { scrap: 100, parts: 3, credits: 6 },
];

export function chestLoot(tier: number): ChestLoot {
  return CHEST_LOOT[Math.max(0, Math.min(CHEST_COUNT - 1, tier))]!;
}

/** 这一章一共拿了几颗星 */
export function chapterStars(stageStars: Readonly<Record<number, number>>, chapter: number): number {
  return stagesOfChapter(chapter).reduce((n, s) => n + Math.max(0, Math.min(3, stageStars[s.id] ?? 0)), 0);
}

/** 这么多星够开几个宝箱 */
export function chestsReached(stars: number): number {
  return CHEST_STARS.filter((n) => stars >= n).length;
}

/** 离下一个宝箱还差几颗。全开了是 undefined */
export function nextChestNeed(stars: number): number | undefined {
  const at = CHEST_STARS.find((n) => stars < n);
  return at === undefined ? undefined : at - stars;
}

export interface ChestOpen {
  chapter: number;
  tier: number;
  loot: ChestLoot;
}

/** 星够了、还没开的宝箱，按章、按档排好 */
export function pendingChests(
  stageStars: Readonly<Record<number, number>>,
  opened: Readonly<Record<number, number>>,
): ChestOpen[] {
  const out: ChestOpen[] = [];
  for (let ch = 1; ch <= CHAPTER_COUNT; ch += 1) {
    const reach = chestsReached(chapterStars(stageStars, ch));
    for (let tier = Math.max(0, opened[ch] ?? 0); tier < reach; tier += 1) {
      out.push({ chapter: ch, tier, loot: chestLoot(tier) });
    }
  }
  return out;
}

export function sumLoot(list: readonly ChestOpen[]): ChestLoot {
  return list.reduce(
    (a, c) => ({ scrap: a.scrap + c.loot.scrap, parts: a.parts + c.loot.parts, credits: a.credits + c.loot.credits }),
    { scrap: 0, parts: 0, credits: 0 },
  );
}

/** 宝箱里的东西写成一行 */
export function lootLine(l: ChestLoot): string {
  return [
    l.parts > 0 ? `零件 +${l.parts}` : '',
    l.credits > 0 ? `工分 +${l.credits}` : '',
    l.scrap > 0 ? `废铁 +${l.scrap}` : '',
  ].filter(Boolean).join('  ');
}
