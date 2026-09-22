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
  it('两排格子等高，下排还能放下图和字', () => {
    const lay = stallYardLay(217, 1152, 1132);
    const slot = STALL_SLOT.pad + STALL_SLOT.h + 22;
    expect(lay.shelves[1] - lay.shelves[0]).toBeGreaterThan(slot);
    expect(lay.shelves[0]).toBeGreaterThan(400);
    expect(lay.shelves[1]).toBeLessThan(lay.slingY - 200);
    expect(lay.originX).toBeGreaterThan(180);
    expect(lay.originX + lay.cellW * 2).toBeLessThan(570);
  });

  it('门楣变矮货架跟着底图上移，不挤弹弓', () => {
    const tall = stallYardLay(400, 1152, 1132);
    const short = stallYardLay(217, 1152, 1132);
    expect(short.shelves[0]).toBeLessThan(tall.shelves[0]);
    expect(short.shelves[1] + 90).toBeLessThan(short.slingY);
  });

  it('口袋叠在门楣里，货架不用往下让', () => {
    const chrome = stallHudLay(47, 1334);
    const lay = stallYardLay(chrome.barBottom - 16, 1152, 1132);
    expect(chrome.pocket.y + chrome.pocket.h / 2).toBeLessThan(chrome.barBottom);
    expect(lay.shelves[0]).toBeGreaterThan(chrome.barBottom + 80);
  });
});
