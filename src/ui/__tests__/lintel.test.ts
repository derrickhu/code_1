import { describe, expect, it } from 'vitest';

import { battleHudLay, lintelLay } from '@/ui/lintel';

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
    expect(battle.infoY).toBeGreaterThan(battle.title.cy);
  });
});
