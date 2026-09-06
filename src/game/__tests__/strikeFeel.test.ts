import { describe, expect, it } from 'vitest';

import { cellPos } from '@/balance/combat';
import { getEnemy, getStage } from '@/balance/stages';
import { resolveAttackFx } from '@/balance/fx';
import { evoKindOf, getVillager } from '@/balance/villagers';
import { createBattle, startFight, tick } from '@/game/BattleEngine';

describe('弹弓叔打击', () => {
  it('三阶一发穿两个，不是只开花不结算', () => {
    const uncle = getVillager('laoyanqiang');
    expect(evoKindOf(uncle, 2)).toBe('plain');
    expect(resolveAttackFx(uncle, 2)).toBe('sniper');
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
    state.foes = [
      {
        id: 1, def: grunt, lane: 1, pos: cellPos(0),
        hp: 400, maxHp: 400, atk: 1, armor: 0, cd: 99, slowMs: 0, alive: true,
      },
      {
        id: 2, def: grunt, lane: 1, pos: cellPos(0) - 0.8,
        hp: 400, maxHp: 400, atk: 1, armor: 0, cd: 99, slowMs: 0, alive: true,
      },
    ];
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
