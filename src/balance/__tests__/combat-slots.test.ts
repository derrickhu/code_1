import { describe, expect, it } from 'vitest';
import { slotHitBox, slotScreenX, slotScreenY } from '@/balance/combat';

type Box = { x: number; y: number; w: number; h: number };

function absBox(slot: number, frontY = 400): Box {
  const x = slotScreenX(slot);
  const y = slotScreenY(slot, frontY);
  const b = slotHitBox(slot);
  return { x: x + b.x, y: y + b.y, w: b.w, h: b.h };
}

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function contains(box: Box, px: number, py: number): boolean {
  return px >= box.x && px < box.x + box.w && py >= box.y && py < box.y + box.h;
}

describe('村里点人热区', () => {
  it('三块互不重叠，点身子能点到自己', () => {
    const boxes = [0, 1, 2].map((s) => absBox(s));
    expect(overlap(boxes[0]!, boxes[1]!)).toBe(false);
    expect(overlap(boxes[0]!, boxes[2]!)).toBe(false);
    expect(overlap(boxes[1]!, boxes[2]!)).toBe(false);

    for (const slot of [0, 1, 2]) {
      const x = slotScreenX(slot);
      const feet = slotScreenY(slot, 400);
      const chest = { x, y: feet - 40 };
      const own = absBox(slot);
      expect(contains(own, chest.x, chest.y)).toBe(true);
      for (const other of [0, 1, 2].filter((s) => s !== slot)) {
        expect(contains(absBox(other), chest.x, chest.y)).toBe(false);
      }
    }
  });
});
