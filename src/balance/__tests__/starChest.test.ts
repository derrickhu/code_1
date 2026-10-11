import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHEST_STARS, chapterStars, chestLoot, chestsReached, nextChestNeed, pendingChests,
} from '@/balance/starChest';
import { CALL_COST } from '@/balance/village';

import { loadMemory, openStarChests, settleStage } from '@/core/RunMemory';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@/core/PlatformService', () => ({
  Platform: {
    getStorageSync: (k: string) => store.get(k) ?? null,
    setStorageSync: (k: string, v: string) => {
      store.set(k, v);
    },
    removeStorageSync: (k: string) => {
      store.delete(k);
    },
  },
}));
const KEY = 'cunkou_run_memory';

describe('星星宝箱的账', () => {
  it('一章 5 关 15 颗星，5 / 10 / 15 各一个', () => {
    expect(CHEST_STARS).toEqual([5, 10, 15]);
    expect(chapterStars({ 1: 3, 2: 2, 3: 3, 6: 3 }, 1)).toBe(8);
    expect(chestsReached(4)).toBe(0);
    expect(chestsReached(10)).toBe(2);
    expect(nextChestNeed(8)).toBe(2);
    expect(nextChestNeed(15)).toBeUndefined();
  });

  it('越往后的箱子越值，最后一个够喊一嗓子', () => {
    const worth = (t: number) => {
      const l = chestLoot(t);
      return l.scrap + l.parts * 60 + l.credits * 50;
    };
    expect(worth(1)).toBeGreaterThan(worth(0));
    expect(worth(2)).toBeGreaterThan(worth(1));
    expect(chestLoot(2).credits).toBeGreaterThanOrEqual(CALL_COST);
  });

  it('开过的不再给，没开的按章按档排', () => {
    const stars = { 1: 3, 2: 3, 3: 3, 4: 1, 6: 3, 7: 2 };
    expect(pendingChests(stars, {}).map((c) => [c.chapter, c.tier])).toEqual([[1, 0], [1, 1], [2, 0]]);
    expect(pendingChests(stars, { 1: 2 }).map((c) => [c.chapter, c.tier])).toEqual([[2, 0]]);
  });
});

describe('宝箱结算只亮、路线图自己领', () => {
  beforeEach(() => store.clear());

  it('同一章补到够数：结算报一口能领，东西不进账；路线图点开才进，刷同一关不会再亮', () => {
    settleStage(1, true, 1);
    const a = settleStage(2, true, 3);
    expect(a.chestsReady).toBe(0);
    // 1-1 从一星补到三星，这一章凑够 6 颗
    const before = loadMemory();
    const b = settleStage(1, true, 3);
    expect(b.chestsNew).toBe(1);
    expect(b.chestsReady).toBe(1);
    expect(b.mem.starChests[1] ?? 0).toBe(0);
    expect(b.mem.parts - before.parts).toBe(0);
    const again = settleStage(1, true, 3);
    expect(again.chestsNew).toBe(0);
    expect(again.chestsReady).toBe(1);

    const got = openStarChests();
    expect(got.chests.map((c) => c.tier)).toEqual([0]);
    expect(got.mem.parts - again.mem.parts).toBe(chestLoot(0).parts);
    expect(got.mem.starChests[1]).toBe(1);
    expect(openStarChests().chests).toHaveLength(0);
    expect(settleStage(1, true, 3).chestsReady).toBe(0);
  });

  it('加宝箱前就攒够星的老档，路线图点开补上', () => {
    settleStage(1, true, 3);
    settleStage(2, true, 3);
    const raw = JSON.parse(store.get(KEY)!);
    delete raw.starChests;
    store.set(KEY, JSON.stringify(raw));
    expect(loadMemory().starChests).toEqual({});
    const got = openStarChests();
    expect(got.chests).toHaveLength(1);
    expect(openStarChests().chests).toHaveLength(0);
  });
});
