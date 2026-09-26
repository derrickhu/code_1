import { describe, expect, it } from 'vitest';

import { VIS_ENGAGE_POS, cellPos } from '@/balance/combat';
import { getEnemy, getStage } from '@/balance/stages';
import { resolveAttackFx } from '@/balance/fx';
import { evoKindOf, getVillager } from '@/balance/villagers';
import { createBattle, foeOf, pickFoe, startFight, tick } from '@/game/BattleEngine';

describe('弹弓叔打击', () => {
  it('整条土路都是战场，只认半径，不另画一条开火线', () => {
    const uncle = getVillager('laoyanqiang');
    const state = createBattle(
      getStage(1),
      [{ villager: uncle, evoStage: 1, stars: 1 }],
      1,
      1,
      [{ villager: uncle, lane: 1, cell: 2, evoStage: 1, stars: 1 }],
    );
    startFight(state);
    state.schedule = [];
    const grunt = getEnemy('grunt');
    const spawn = { ...foeOf(grunt, 1, 1, 0), hp: 400, maxHp: 400, atk: 1, armor: 0, cd: 99 };
    const door = { ...foeOf(grunt, 2, 1, VIS_ENGAGE_POS), hp: 400, maxHp: 400, atk: 1, armor: 0, cd: 99 };
    expect(pickFoe(state.team[0]!, [spawn])).toBeUndefined();
    expect(pickFoe(state.team[0]!, [door])?.id).toBe(2);
    state.foes = [spawn];
    state.team[0]!.cd = 0;
    state.events.length = 0;
    tick(state);
    expect(state.events.filter((e) => e.kind === 'hit')).toHaveLength(0);
    expect(spawn.hp).toBe(400);
  });

  it('三阶一发穿两个，不是只开花不结算', () => {
    const uncle = getVillager('laoyanqiang');
    expect(evoKindOf(uncle, 1)).toBe('plain');
    expect(resolveAttackFx(uncle, 1)).toBe('sniper');
    expect(evoKindOf(uncle, 2)).toBe('pierce');
    expect(resolveAttackFx(uncle, 2)).toBe('pierce');
    expect(evoKindOf(uncle, 3)).toBe('pierce');
    expect(resolveAttackFx(uncle, 3)).toBe('pierce');
    const state = createBattle(
      getStage(1),
      [{ villager: uncle, evoStage: 3, stars: 1 }],
      1,
      1,
      [{ villager: uncle, lane: 1, cell: 2, evoStage: 3, stars: 1 }],
    );
    startFight(state);
    state.schedule = [];
    const grunt = getEnemy('grunt');
    state.foes = [cellPos(0), cellPos(0) - 0.8].map((pos, i) => ({
      ...foeOf(grunt, i + 1, 1, pos),
      hp: 400, maxHp: 400, atk: 1, armor: 0, cd: 99,
    }));
    state.nextFoeId = 3;
    state.team[0]!.cd = 0;
    state.events.length = 0;
    tick(state);
    const hits = state.events.filter((e) => e.kind === 'hit');
    expect(hits).toHaveLength(2);
    expect(hits.map((e) => (e.kind === 'hit' ? e.foeId : 0))).toEqual([1, 2]);
    expect(state.foes[0]!.hp).toBeLessThan(400);
    expect(state.foes[1]!.hp).toBeLessThan(400);
    expect(state.foes[0]!.hp).toBeLessThan(state.foes[1]!.hp);
  });
});
