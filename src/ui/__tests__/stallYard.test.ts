import { describe, expect, it } from 'vitest';

import { stallHudLay } from '@/ui/lintel';
import { STALL_SLOT, slingFires, stallYardLay } from '@/ui/StallYard';

describe('弹弓要拉够才出弹', () => {
  /**
   * 上一版 `dy >= 18 || dy <= 10` 让点一下（dy=0）也发射，
   * 而 dy 夹过 0 下限，往上拨同样是 0 —— 摊子退化成一个按钮。
   */
  it('点一下、往上拨都不算发射', () => {
    expect(slingFires(0)).toBe(false);
    expect(slingFires(-40)).toBe(false);
    expect(slingFires(6)).toBe(false);
  });

  it('往下拉过门槛才出弹', () => {
    expect(slingFires(17)).toBe(false);
    expect(slingFires(18)).toBe(true);
    expect(slingFires(88)).toBe(true);
  });
});

describe('弹弓摊货架', () => {
  /** 物品脚底到这一格最底：板 + 名牌 + 产出行 */
  const foot = STALL_SLOT.shelf + STALL_SLOT.plateH + STALL_SLOT.payH;

  it('标准屏：物品放得大，两排名牌都在柜台之上', () => {
    const chrome = stallHudLay(47, 1334);
    const lay = stallYardLay(chrome.barBottom - 16, 1334, 1334 - 34 - 168);
    expect(lay.itemH).toBeGreaterThanOrEqual(150);
    expect(lay.shelves[0] - lay.itemH).toBeGreaterThan(chrome.barBottom);
    expect(lay.shelves[1] - lay.shelves[0]).toBeGreaterThan(lay.itemH + foot);
    expect(lay.shelves[1] + foot).toBeLessThan(lay.counterY);
    expect(lay.counterY).toBeLessThan(lay.slingY - 60);
  });

  it('矮屏缩物品不缩字，仍不压柜台', () => {
    const chrome = stallHudLay(20, 1100);
    const lay = stallYardLay(chrome.barBottom - 16, 1100, 1100 - 168);
    expect(lay.itemH).toBeGreaterThanOrEqual(STALL_SLOT.itemMin);
    expect(lay.shelves[0] - lay.itemH).toBeGreaterThan(chrome.barBottom);
    expect(lay.shelves[1] + foot).toBeLessThan(lay.counterY + 4);
  });

  it('三列不出屏，物品不互相压', () => {
    const lay = stallYardLay(217, 1334, 1132);
    expect(lay.cellW).toBeGreaterThan(STALL_SLOT.w);
    expect(lay.originX - STALL_SLOT.w / 2).toBeGreaterThan(60);
    expect(lay.originX + lay.cellW * 2 + STALL_SLOT.w / 2).toBeLessThan(690);
  });
});
