import { describe, expect, it } from 'vitest';
import { MODS, MOD_STAR_MAX } from '@/balance/mods';
import {
  MOD_STAR_COSTS,
  YARD_GROWTH,
  clampGrowth,
  emptyGrowth,
  goalLine,
  nextGrowthCost,
  nextYardGoal,
  pickNeed,
  resolveRunGrowth,
} from '@/balance/yard';

function maxStars(): Record<string, number> {
  return Object.fromEntries(MODS.map((m) => [m.id, MOD_STAR_MAX]));
}

describe('废品站下一档', () => {
  it('没升星时先指最便宜的那件星', () => {
    const g = nextYardGoal(MOD_STAR_COSTS[0]! - 5, emptyGrowth(), {});
    expect(g.kind).toBe('star');
    if (g.kind !== 'star') return;
    expect(g.cost).toBe(MOD_STAR_COSTS[0]);
    expect(g.afford).toBe(false);
    expect(goalLine(g)).toContain('还差 5');
  });

  it('星满了才买最便宜的成长', () => {
    const first = YARD_GROWTH.reduce((a, b) => {
      const ca = a.costs[0] ?? 999;
      const cb = b.costs[0] ?? 999;
      return ca <= cb ? a : b;
    });
    const g = nextYardGoal((first.costs[0] ?? 0) - 5, emptyGrowth(), maxStars());
    expect(g.kind).toBe('growth');
    if (g.kind !== 'growth') return;
    expect(g.id).toBe(first.id);
    expect(g.afford).toBe(false);
    expect(goalLine(g)).toContain('还差 5');
  });

  it('够钱就说能买了', () => {
    const first = YARD_GROWTH[0]!;
    const g = nextYardGoal(first.costs[0]!, emptyGrowth(), maxStars());
    expect(g.kind).toBe('growth');
    if (g.kind !== 'growth') return;
    expect(g.afford).toBe(true);
    expect(goalLine(g)).toContain('能买了');
  });

  it('都买完就齐了', () => {
    const maxed = clampGrowth({
      hands: 99,
      reroll: 99,
      luck: 99,
      starter: 99,
      pocket: 99,
      breath: 99,
    });
    const g = nextYardGoal(99, maxed, maxStars());
    expect(g).toEqual({ kind: 'done' });
    expect(goalLine(g)).toContain('齐了');
  });
});

describe('下手更快', () => {
  it('门槛随成长往下压，第一件来得更早', () => {
    expect(pickNeed(0, 0)).toBe(5);
    expect(pickNeed(0, 20)!).toBeLessThan(5);
    expect(pickNeed(0, 100)!).toBeLessThan(pickNeed(0, 20)!);
  });
});

describe('成长换算', () => {
  it('买的是肉鸽规则，不是某件破烂', () => {
    const g = resolveRunGrowth({
      ...emptyGrowth(),
      hands: 2,
      reroll: 1,
      luck: 1,
      starter: 1,
      breath: 1,
    });
    expect(g.expPct).toBe(40);
    expect(g.freeRerolls).toBe(1);
    expect(g.luckPicks).toBe(1);
    expect(g.startWelds).toBe(1);
    expect(g.freeRevives).toBe(1);
  });

  it('每条自己的价格一路往上', () => {
    for (const def of YARD_GROWTH) {
      for (let i = 1; i < def.costs.length; i += 1) {
        expect(def.costs[i]!).toBeGreaterThanOrEqual(def.costs[i - 1]!);
      }
      expect(nextGrowthCost(def.id, def.costs.length)).toBeUndefined();
    }
  });
});
