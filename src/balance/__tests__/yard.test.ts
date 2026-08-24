import { describe, expect, it } from 'vitest';
import { goalLine, nextYardGoal, startScrapBonus } from '@/balance/yard';

describe('废品站下一件', () => {
  it('先买最便宜的锁着破烂', () => {
    const g = nextYardGoal(10, [], 0);
    expect(g.kind).toBe('mod');
    if (g.kind !== 'mod') return;
    expect(g.id).toBe('weight');
    expect(g.cost).toBe(40);
    expect(g.afford).toBe(false);
    expect(goalLine(g)).toContain('还差 30');
  });

  it('够钱就说能买了', () => {
    const g = nextYardGoal(40, [], 0);
    expect(g.kind).toBe('mod');
    if (g.kind !== 'mod') return;
    expect(g.afford).toBe(true);
    expect(goalLine(g)).toContain('能买了');
  });

  it('破烂买完才轮到开局口袋', () => {
    const g = nextYardGoal(20, ['weight', 'blower', 'wire', 'chainsaw'], 0);
    expect(g.kind).toBe('pocket');
    if (g.kind !== 'pocket') return;
    expect(g.nextBonus).toBe(startScrapBonus(1));
    expect(g.afford).toBe(false);
  });

  it('都买完就齐了', () => {
    const g = nextYardGoal(99, ['weight', 'blower', 'wire', 'chainsaw'], 3);
    expect(g).toEqual({ kind: 'done' });
    expect(goalLine(g)).toContain('齐了');
  });
});
