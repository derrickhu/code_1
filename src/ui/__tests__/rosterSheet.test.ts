import { describe, expect, it } from 'vitest';
import { HEROES } from '@/balance/heroes';
import {
  ROSTER_CARD_H,
  ROSTER_CARD_W,
  ROSTER_COLS,
  ROSTER_GAP,
  rosterCardAt,
  rosterSheetHeight,
  type RosterCell,
} from '@/ui/RosterSheet';

function cells(sheetW = 718): RosterCell[] {
  const total = ROSTER_COLS * ROSTER_CARD_W + (ROSTER_COLS - 1) * ROSTER_GAP;
  const x0 = (sheetW - total) / 2;
  return HEROES.map((hero, i) => ({
    id: hero.id,
    x: x0 + (i % ROSTER_COLS) * (ROSTER_CARD_W + ROSTER_GAP),
    y: Math.floor(i / ROSTER_COLS) * (ROSTER_CARD_H + ROSTER_GAP),
  }));
}

describe('花名册点中', () => {
  it('六个人两行，三婶在第二行左边', () => {
    expect(HEROES[4]?.id).toBe('sanshen');
    expect(rosterSheetHeight()).toBe(2 * ROSTER_CARD_H + ROSTER_GAP);
    const list = cells();
    const sanshen = list[4]!;
    expect(rosterCardAt(sanshen.x + 20, sanshen.y + 20, 0, list)).toBe('sanshen');
    expect(rosterCardAt(sanshen.x + 20, sanshen.y + ROSTER_CARD_H - 8, 0, list)).toBe('sanshen');
  });

  it('点空白或滚出视口的格子不算', () => {
    const list = cells();
    expect(rosterCardAt(-4, 20, 0, list)).toBeNull();
    expect(rosterCardAt(20, rosterSheetHeight() + 8, 0, list)).toBeNull();
  });
});
