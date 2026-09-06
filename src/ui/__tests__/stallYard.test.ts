import { describe, expect, it } from 'vitest';

import { stallYardLay } from '@/ui/StallYard';

describe('弹弓摊货架', () => {
  it('两排脚落在底图木梁上，中间留得开名字', () => {
    const lay = stallYardLay(217, 1152, 1132);
    expect(lay.shelves[1] - lay.shelves[0]).toBeGreaterThan(140);
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
});
