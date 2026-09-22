import { describe, expect, it } from 'vitest';

import { getStage } from '@/balance/stages';
import { getVillager } from '@/balance/villagers';
import { createBattle, fieldHeroBinds, startFight } from '@/game/BattleEngine';

describe('fieldHeroBinds', () => {
  it('布阵阶段按 pre:id 重绑，不扫空的 team', () => {
    const sanshen = getVillager('sanshen');
    const dachui = getVillager('dachui');
    const state = createBattle(
      getStage(1),
      [
        { villager: sanshen, evoStage: 1, stars: 0 },
        { villager: dachui, evoStage: 2, stars: 0 },
      ],
      5,
      1,
      [
        { villager: sanshen, lane: 1, cell: 1, evoStage: 1, stars: 0 },
        { villager: dachui, lane: 2, cell: 1, evoStage: 2, stars: 0 },
      ],
    );
    expect(state.phase).toBe('placing');
    expect(state.team).toEqual([]);
    expect(fieldHeroBinds(state)).toEqual([
      { uid: 'pre:sanshen', id: 'sanshen', lane: sanshen.lane, evo: 1 },
      { uid: 'pre:dachui', id: 'dachui', lane: dachui.lane, evo: 2 },
    ]);
  });

  it('开打后改绑 team 的 uid', () => {
    const sanshen = getVillager('sanshen');
    const state = createBattle(
      getStage(1),
      [{ villager: sanshen, evoStage: 1, stars: 0 }],
      5,
      1,
      [{ villager: sanshen, lane: 1, cell: 1, evoStage: 1, stars: 0 }],
    );
    startFight(state);
    const binds = fieldHeroBinds(state);
    expect(binds).toHaveLength(1);
    expect(binds[0]?.id).toBe('sanshen');
    expect(binds[0]?.uid.startsWith('pre:')).toBe(false);
    expect(binds[0]?.uid).toContain('sanshen');
  });
});
