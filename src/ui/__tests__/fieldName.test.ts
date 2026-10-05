import { describe, expect, it } from 'vitest';

import {
  battleFieldLay, fieldFightUnitH, laneScreenX,
} from '@/balance/combat';
import {
  FIELD_NAME_H, formationGrid, formationNameTop, formationPitch, hitFormationCell,
} from '@/ui/fieldName';

describe('编队格子', () => {
  const phones = [
    { height: 1334, safeBottom: 0, chromeBottom: 240 },
    { height: 1624, safeBottom: 34, chromeBottom: 233 },
    { height: 1200, safeBottom: 0, chromeBottom: 220 },
  ];

  it('同一排脚底相同，名字居中落在脚底，不压到下一排的头', () => {
    for (const phone of phones) {
      const args = { ...phone, benchH: 330 };
      const place = battleFieldLay({ ...args, placing: true });
      const h = fieldFightUnitH(args);
      const grid = formationGrid({
        unitH: h,
        top: place.spawnY + 12,
        bottom: place.goalY - 8,
      });
      expect(grid.feetY).toHaveLength(4);
      expect(grid.pitch).toBeGreaterThanOrEqual(formationPitch(h) - 0.01);
      for (let cell = 0; cell < 3; cell += 1) {
        const feet = grid.feetY[cell]!;
        const nextHead = grid.feetY[cell + 1]! - h;
        const nameBottom = formationNameTop(feet) + FIELD_NAME_H;
        expect(nameBottom).toBeLessThanOrEqual(nextHead);
        expect(grid.feetY[cell + 1]! - feet).toBeCloseTo(grid.pitch, 5);
      }
      const top = place.spawnY + 12;
      const bottom = place.goalY - 8;
      const head0 = grid.feetY[0]! - h;
      const name3 = formationNameTop(grid.feetY[3]!) + FIELD_NAME_H;
      expect(head0).toBeGreaterThanOrEqual(top);
      expect(name3).toBeLessThanOrEqual(bottom);
      const twoMid = (head0 + formationNameTop(grid.feetY[1]!) + FIELD_NAME_H) / 2;
      expect(Math.abs(twoMid - (top + bottom) / 2)).toBeLessThan(40);
      // 三路用同一个脚底，牌子在一条横线上，水平对准路中线
      expect(laneScreenX(0)).toBeLessThan(laneScreenX(1));
      expect(laneScreenX(1)).toBeLessThan(laneScreenX(2));
    }
  });

  it('点在人身上落到对应的排，路外点不中', () => {
    const grid = formationGrid({ unitH: 70, top: 300, bottom: 1000 });
    const mid = laneScreenX(1);
    const head = grid.feetY[1]! - 40;
    expect(hitFormationCell(mid, head, grid.feetY, 70)).toEqual({ lane: 1, cell: 1 });
    expect(hitFormationCell(laneScreenX(0), grid.feetY[0]! - 10, grid.feetY, 70)?.cell).toBe(0);
    expect(hitFormationCell(20, head, grid.feetY, 70)).toBeNull();
  });
});
