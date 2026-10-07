import { describe, expect, it } from 'vitest';

import { autoPlace, runBattle } from '@/game/BattleEngine';
import { getStage } from '@/balance/stages';
import { DEFAULT_SQUAD, getVillager } from '@/balance/villagers';

function pool(craft: number | Record<string, number>) {
  return DEFAULT_SQUAD.map((id) => ({
    villager: getVillager(id),
    evoStage: 1 as const,
    stars: 0,
    craft: typeof craft === 'number' ? craft : (craft[id] ?? 1),
  }));
}

function fight(stageId: number, craft: number | Record<string, number>) {
  const stage = getStage(stageId);
  return runBattle(stage, autoPlace(pool(craft), stage, 3), 1, true);
}

describe('开局三人打第 1 章', () => {
  it('手艺 1 能打完 1-1 到 1-4，而且不会倒光', () => {
    for (let id = 1; id <= 4; id += 1) {
      const r = fight(id, 1);
      expect(r.won, `${id} fallen=${r.fallen} leaked=${r.leaked}`).toBe(true);
      expect(r.fallen, `${id}`).toBeLessThan(3);
    }
  });

  it('1-5 手艺全是 1 倒光不算过，铁柱升到 2 就不漏', () => {
    const green = fight(5, 1);
    expect(green.won, `reason=${green.reason} fallen=${green.fallen} leaked=${green.leaked}`).toBe(false);
    expect(green.reason).toBe('wipe');
    expect(green.fallen).toBe(3);
    expect(green.stars).toBe(0);

    const fed = fight(5, { tiezhu: 2 });
    expect(fed.won).toBe(true);
    expect(fed.leaked).toBe(0);
    expect(fed.fallen).toBeLessThan(3);
  });
});
