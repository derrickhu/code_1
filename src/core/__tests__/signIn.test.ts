import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { SIGN_GIFTS, signClaim, signState } from '@/core/SignIn';
import { CALL_COST, CRAFT_COST } from '@/balance/village';
import { grantLoot, loadMemory } from '@/core/RunMemory';
import { adCanShow, adRecord, adRemaining } from '@/core/AdDay';

describe('村口每日礼包（签到）', () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 10));
  });
  afterEach(() => vi.useRealTimers());

  it('一天只能白领一次，第二天接着往下领', () => {
    expect(signState()).toMatchObject({ open: true, slot: 0, done: 0 });
    expect(signClaim()?.slot).toBe(0);
    expect(signClaim()).toBeNull();
    expect(signState()).toMatchObject({ open: false, slot: 0, done: 1 });
    vi.setSystemTime(new Date(2026, 9, 9, 10));
    expect(signState()).toMatchObject({ open: true, slot: 1, done: 1 });
    expect(signClaim()?.slot).toBe(1);
  });

  it('断签不清零，领满七天从头再来', () => {
    for (let d = 0; d < SIGN_GIFTS.length; d += 1) {
      vi.setSystemTime(new Date(2026, 9, 8 + d * 2, 10));
      expect(signClaim()?.slot).toBe(d);
    }
    vi.setSystemTime(new Date(2026, 9, 30, 10));
    expect(signClaim()?.slot).toBe(0);
  });

  it('第七天给得最多', () => {
    const worth = (g: (typeof SIGN_GIFTS)[number]): number =>
      g.pellets * 10 + g.scrap + g.parts * 60 + g.credits * 50;
    const last = worth(SIGN_GIFTS[SIGN_GIFTS.length - 1]!);
    for (const g of SIGN_GIFTS.slice(0, -1)) expect(worth(g)).toBeLessThan(last);
  });

  it('第 2 天够升一级手艺，第 7 天的工分够喊一次人', () => {
    expect(SIGN_GIFTS[1]!.scrap).toBeGreaterThanOrEqual(CRAFT_COST[0]!.scrap);
    expect(SIGN_GIFTS[1]!.parts).toBeGreaterThanOrEqual(CRAFT_COST[0]!.parts);
    expect(SIGN_GIFTS[6]!.credits).toBeGreaterThanOrEqual(CALL_COST);
  });

  it('grantLoot 几样一起加，负数不扣', () => {
    const before = loadMemory();
    const mem = grantLoot({ pellets: 3, scrap: 20, parts: -5, credits: 2 });
    expect(mem.credits).toBe(before.credits + 2);
    expect(mem.pellets).toBe(before.pellets + 3);
    expect(mem.scrap).toBe(before.scrap + 20);
    expect(mem.parts).toBe(before.parts);
  });

  it('新广告位有日限：补给 3 次、零件 2 次、签到翻倍 1 次', () => {
    expect(adRemaining('loseBonus')).toBe(3);
    expect(adRemaining('craftParts')).toBe(2);
    adRecord('craftParts');
    adRecord('craftParts');
    expect(adCanShow('craftParts')).toBe(false);
    adRecord('dailyGift');
    expect(adCanShow('dailyGift')).toBe(false);
    vi.setSystemTime(new Date(2026, 9, 9, 10));
    expect(adCanShow('craftParts')).toBe(true);
  });
});
