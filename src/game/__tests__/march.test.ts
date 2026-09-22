import { describe, expect, it } from 'vitest';

import {
  COMBAT_POS, VIS_ENGAGE_POS, combatCellPx, posScreenY, posVisualFrac,
} from '@/balance/combat';
import {
  approachWalkSec, marchLerp, marchScreenVel, marchScreenVelWant, marchStep,
} from '@/game/march';

describe('怪物行军：全程视觉匀速，不换挡', () => {
  const top = 0;
  const goal = 1000;
  const samples = [0.05, 0.4, COMBAT_POS, VIS_ENGAGE_POS - 0.02, VIS_ENGAGE_POS, 2, 4];

  it('小灰、装甲在任何位置屏幕速度都一样，过线不换挡', () => {
    for (const spd of [0.72, 0.24, 1.05]) {
      const want = marchScreenVelWant(spd, top, goal);
      for (const pos of samples) {
        expect(marchScreenVel(spd, pos, top, goal), `spd=${spd} pos=${pos}`)
          .toBeCloseTo(want, 4);
      }
    }
  });

  it('屏幕速度就是 spd × 一格像素', () => {
    expect(marchScreenVelWant(0.72, top, goal)).toBeCloseTo(0.72 * combatCellPx(top, goal), 8);
  });

  it('快的先到，慢的就是慢，不另换一套速度', () => {
    expect(approachWalkSec(1.05)).toBeLessThan(approachWalkSec(0.72));
    expect(approachWalkSec(0.72)).toBeLessThan(approachWalkSec(0.24));
    expect(approachWalkSec(0.72)).toBeGreaterThan(8);
    expect(approachWalkSec(0.72)).toBeLessThan(12);
  });

  it('减速只乘一个倍率，不另换一套速度', () => {
    const dt = 0.1;
    const full = marchStep(0.2, 0.72, dt, 1);
    const slow = marchStep(0.2, 0.72, dt, 0.65);
    expect(posVisualFrac(slow) - posVisualFrac(0.2))
      .toBeCloseTo((posVisualFrac(full) - posVisualFrac(0.2)) * 0.65, 8);
  });

  it('两拍之间按视觉比例抹，不按轴 pos 抹', () => {
    const a = 0.4;
    const b = 2.2;
    const mid = marchLerp(a, b, 0.5);
    expect(posVisualFrac(mid)).toBeCloseTo((posVisualFrac(a) + posVisualFrac(b)) / 2, 8);
    expect(mid).not.toBeCloseTo((a + b) / 2, 1);
    const y = (t: number) => posScreenY(marchLerp(a, b, t), top, goal);
    expect(y(0.5) - y(0)).toBeCloseTo(y(1) - y(0.5), 4);
  });
});
