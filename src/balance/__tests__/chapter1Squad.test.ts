import { describe, expect, it } from 'vitest';

import { autoPlace, bumpFor, createBattle, runBattle } from '@/game/BattleEngine';
import { OPENING_CALL_ID } from '@/balance/opening';
import { getStage } from '@/balance/stages';
import { DEFAULT_SQUAD, OPENING_SQUAD, getVillager } from '@/balance/villagers';

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

describe('新档两人开局', () => {
  const cand = (id: string) => ({ villager: getVillager(id), evoStage: 1 as const, stars: 0, craft: 1 });
  const play = (stageId: number, ids: readonly string[]) => {
    const stage = getStage(stageId);
    return runBattle(stage, autoPlace(ids.map(cand), stage, ids.length), 1, true);
  };

  it('两个人手艺 1 能过 1-1、1-2，不倒人', () => {
    for (const id of [1, 2]) {
      const r = play(id, OPENING_SQUAD);
      expect(r.won, `${id} leaked=${r.leaked}`).toBe(true);
      expect(r.fallen).toBe(0);
    }
  });

  it('1-2 喊来的人补上第三格，1-3 三个人过得去', () => {
    const r = play(3, [...OPENING_SQUAD, OPENING_CALL_ID]);
    expect(r.won, `fallen=${r.fallen} leaked=${r.leaked}`).toBe(true);
  });
});

describe('满员往空格拖人', () => {
  it('换下同一路离得最近的那个，这一路没人才挑别路', () => {
    const stage = getStage(4);
    const ids = ['tiezhu', 'dachui', 'laoyanqiang'];
    const s = createBattle(stage, ids.map((id) => ({
      villager: getVillager(id), evoStage: 1 as const, stars: 0, craft: 1,
    })), 3, 1, [
      { villager: getVillager('tiezhu'), lane: 0, cell: 0, evoStage: 1, stars: 0, craft: 1 },
      { villager: getVillager('dachui'), lane: 1, cell: 3, evoStage: 1, stars: 0, craft: 1 },
      { villager: getVillager('laoyanqiang'), lane: 1, cell: 0, evoStage: 1, stars: 0, craft: 1 },
    ]);
    expect(bumpFor(s, 1, 1)?.villager.id).toBe('laoyanqiang');
    expect(bumpFor(s, 2, 0)?.villager.id).toBe('laoyanqiang');
    expect(bumpFor(s, 0, 3)?.villager.id).toBe('tiezhu');
  });
});
