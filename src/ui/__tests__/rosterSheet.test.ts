import { describe, expect, it } from 'vitest';
import { HEROES } from '@/balance/heroes';
import { rosterCardAt, rosterSheetHeight, type RosterCell } from '@/ui/RosterSheet';

const CARD_W = 338;
const CARD_H = 118;
const GAP = 10;
const COLS = 2;

function cells(sheetW = 710): RosterCell[] {
  const total = COLS * CARD_W + (COLS - 1) * GAP;
  const x0 = (sheetW - total) / 2;
  return HEROES.map((hero, i) => ({
    id: hero.id,
    x: x0 + (i % COLS) * (CARD_W + GAP),
    y: Math.floor(i / COLS) * (CARD_H + GAP),
  }));
}

describe('花名册点中', () => {
  it('六个人刚好三行，三婶在左下', () => {
    expect(HEROES[4]?.id).toBe('sanshen');
    expect(rosterSheetHeight()).toBe(3 * CARD_H + 2 * GAP);
    const list = cells();
    const sanshen = list[4]!;
    expect(rosterCardAt(sanshen.x + 20, sanshen.y + 20, 0, list)).toBe('sanshen');
    expect(rosterCardAt(sanshen.x + 20, sanshen.y + CARD_H - 8, 0, list)).toBe('sanshen');
    expect(rosterCardAt(sanshen.x + CARD_W - 8, sanshen.y + 80, 0, list)).toBe('sanshen');
  });

  it('点空白或滚出视口的格子不算', () => {
    const list = cells();
    expect(rosterCardAt(-4, 20, 0, list)).toBeNull();
    expect(rosterCardAt(20, rosterSheetHeight() + 8, 0, list)).toBeNull();
  });
});
