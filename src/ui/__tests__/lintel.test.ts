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
    expect(stall.barBottom).toBe(stall.titleH);
  });
});
