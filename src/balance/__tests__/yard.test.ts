import { describe, expect, it } from 'vitest';
import { LANE_LV_MAX, emptyLanes } from '@/balance/lanes';
import {
  YARD_GROWTH,
  clampGrowth,
  emptyGrowth,
  goalLine,
  growthTag,
  nextGrowthCost,
  nextYardGoal,
  pickNeed,
  resolveRunGrowth,
} from '@/balance/yard';

function maxLanes() {
  return {
    reach: LANE_LV_MAX,
    heavy: LANE_LV_MAX,
    stand: LANE_LV_MAX,
    rage: LANE_LV_MAX,
    band: LANE_LV_MAX,
  };
}

describe('废品站下一档', () => {
  it('先指最便宜的成长或门路', () => {
    const first = YARD_GROWTH.reduce((a, b) => {
      const ca = a.costs[0] ?? 999;
      const cb = b.costs[0] ?? 999;
      return ca <= cb ? a : b;
    });
    const g = nextYardGoal((first.costs[0] ?? 0) - 5, emptyGrowth(), emptyLanes());
    expect(g.kind).not.toBe('done');
    if (g.kind === 'done') return;
    expect(g.afford).toBe(false);
    expect(goalLine(g)).toContain('还差');
  });

  it('门路满了才买最便宜的成长', () => {
    const first = YARD_GROWTH.reduce((a, b) => {
      const ca = a.costs[0] ?? 999;
      const cb = b.costs[0] ?? 999;
      return ca <= cb ? a : b;
    });
    const g = nextYardGoal((first.costs[0] ?? 0) - 5, emptyGrowth(), maxLanes());
    expect(g.kind).toBe('growth');
    if (g.kind !== 'growth') return;
    expect(g.id).toBe(first.id);
    expect(g.afford).toBe(false);
    expect(goalLine(g)).toContain('还差 5');
  });

  it('够钱就说能买了', () => {
    const first = YARD_GROWTH[0]!;
    const g = nextYardGoal(first.costs[0]!, emptyGrowth(), maxLanes());
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
      carry: 99,
      scav: 99,
    });
    const g = nextYardGoal(99, maxed, maxLanes());
    expect(g).toEqual({ kind: 'done' });
    expect(goalLine(g)).toContain('齐了');
  });
});

describe('废品站卡面一句', () => {
  it('没满级写点下去得到的那档', () => {
    expect(growthTag('hands', 0, false)).toBe('门槛 -20%');
    expect(growthTag('reroll', 0, false)).toBe('白翻 1');
    expect(growthTag('pocket', 0, false)).toBe('口袋 +8');
    expect(growthTag('breath', 0, false)).toBe('跪了白站1次');
  });

  it('满级写已经买到的那档', () => {
    expect(growthTag('hands', 5, true)).toBe('门槛 -100%');
    expect(growthTag('pocket', 3, true)).toBe('口袋 +24');
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
