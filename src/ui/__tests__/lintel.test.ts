import { describe, expect, it } from 'vitest';

import { battleHudLay, lintelLay, stallHudLay } from '@/ui/lintel';

describe('门楣槽位', () => {
  it('村子楣带经验槽和四枚章', () => {
    const lay = lintelLay(47, 1334);
    expect(lay.titleH).toBeGreaterThan(200);
    expect(lay.titleH).toBeLessThanOrEqual(Math.round(1334 * 0.34));
    expect(lay.title.cy + lay.titleGlyphH / 2).toBeLessThan(lay.exp.y);
    expect(lay.stamp.cxs).toHaveLength(4);
    expect(lay.barBottom).toBe(lay.titleH);
  });

  it('编队顶板更矮，没有四格和经验槽', () => {
    const battle = battleHudLay(47, 1334);
    const home = lintelLay(47, 1334);
    expect(battle.titleH).toBeLessThan(home.titleH);
    expect(battle.hintY).toBeLessThan(battle.barBottom);
    expect(battle.stamp.cxs).toHaveLength(3);
    expect(battle.stamp.y).toBeGreaterThan(battle.title.cy);
    expect(battle.hintY).toBeGreaterThan(battle.stamp.y);
  });

  it('摊顶跟战斗同一张底板，但更矮，腾给货架', () => {
    const stall = stallHudLay(47, 1334);
    const battle = battleHudLay(47, 1334);
    const home = lintelLay(47, 1334);
    expect(stall.titleH).toBeLessThan(home.titleH);
    expect(stall.titleH).toBeLessThanOrEqual(battle.titleH);
    expect(stall.hintY).toBeLessThan(stall.barBottom);
    expect(stall.title.cy + stall.titleGlyphH / 2).toBeLessThan(stall.hintY);
    expect(stall.pocket.y).toBeGreaterThan(stall.hintY);
    expect(stall.pocket.y + stall.pocket.h / 2).toBeLessThan(stall.barBottom);
    expect(stall.pocket.cxs).toHaveLength(3);
    expect(stall.barBottom).toBe(stall.titleH);
  });

  it('摊顶弹子、保底句、三枚口袋分层，刘海高也叠不上', () => {
    for (const safe of [16, 47, 88]) {
      const stall = stallHudLay(safe, 1334);
      const titleBottom = stall.title.cy + stall.titleGlyphH / 2;
      const hintHalf = 11;
      const pocketTop = stall.pocket.y - stall.pocket.h / 2;
      const pocketBottom = stall.pocket.y + stall.pocket.h / 2;
      expect(titleBottom + 4).toBeLessThan(stall.hintY - hintHalf);
      expect(stall.hintY + hintHalf + 4).toBeLessThan(pocketTop);
      expect(pocketBottom + 8).toBeLessThanOrEqual(stall.barBottom);
      expect(stall.pocket.h).toBeGreaterThanOrEqual(40);
      expect(stall.pocket.w).toBeLessThan(180);
    }
  });

  it('弹子在底牌上下居中，刘海高也不把字往下推', () => {
    const midOf = (s: ReturnType<typeof stallHudLay>): number => {
      const plateTop = s.titleH * 0.10;
      const pocketTop = s.pocket.y - s.pocket.h / 2;
      return (plateTop + pocketTop) / 2;
    };
    const low = stallHudLay(16, 1334);
    const high = stallHudLay(88, 1334);
    expect(Math.abs(low.title.cy - midOf(low))).toBeLessThan(12);
    expect(high.title.cy).toBeCloseTo(low.title.cy, 0);
    expect(low.title.cy).toBeGreaterThan(low.titleH * 0.32);
    expect(low.title.cy).toBeLessThan(low.titleH * 0.50);
  });
});
